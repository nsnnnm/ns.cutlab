/**
 * CutLab - Cloudflare Worker
 * 
 * 役割:
 * - R2へのプリサインURL発行 (アップロード / ダウンロード)
 * - 動画メタデータの一時保存 (KV)
 * - CORS対応
 * 
 * 注意: FFmpeg の重い処理はブラウザ側 (WASM) で行います。
 * Cloudflare Workers は CPU 制限があるため動画エンコードには不向きです。
 * Workers は「プリサイン URL ゲートウェイ」として使用します。
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Health check
      if (path === '/api/health') {
        return json({ status: 'ok', timestamp: Date.now() })
      }

      // Get presigned upload URL
      if (path === '/api/upload-url' && request.method === 'POST') {
        return handleUploadUrl(request, env)
      }

      // Get presigned download URL
      if (path === '/api/download-url' && request.method === 'GET') {
        return handleDownloadUrl(request, env)
      }

      // Save job metadata
      if (path === '/api/jobs' && request.method === 'POST') {
        return handleCreateJob(request, env)
      }

      // Get job status
      if (path.startsWith('/api/jobs/') && request.method === 'GET') {
        const jobId = path.replace('/api/jobs/', '')
        return handleGetJob(jobId, env)
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error('Worker error:', err)
      return json({ error: err.message }, 500)
    }
  }
}

/**
 * R2 プリサイン URL の生成 (アップロード用)
 */
async function handleUploadUrl(request, env) {
  if (!env.VIDEO_BUCKET) {
    return json({ error: 'R2 bucket not configured' }, 500)
  }

  const body = await request.json()
  const { filename, contentType } = body

  if (!filename || !contentType) {
    return json({ error: 'filename and contentType are required' }, 400)
  }

  const key = `uploads/${Date.now()}-${crypto.randomUUID()}-${filename}`

  // R2 のプリサイン URL (有効期限: 1時間)
  const signedUrl = await env.VIDEO_BUCKET.createMultipartUpload(key)

  // KV に一時保存
  if (env.JOB_KV) {
    await env.JOB_KV.put(`upload:${key}`, JSON.stringify({
      key, filename, contentType,
      createdAt: Date.now(),
    }), { expirationTtl: 3600 })
  }

  return json({ key, uploadUrl: signedUrl })
}

/**
 * R2 プリサイン URL の生成 (ダウンロード用)
 */
async function handleDownloadUrl(request, env) {
  if (!env.VIDEO_BUCKET) {
    return json({ error: 'R2 bucket not configured' }, 500)
  }

  const url = new URL(request.url)
  const key = url.searchParams.get('key')

  if (!key) {
    return json({ error: 'key is required' }, 400)
  }

  // オブジェクトの存在確認
  const obj = await env.VIDEO_BUCKET.head(key)
  if (!obj) {
    return json({ error: 'Object not found' }, 404)
  }

  // 直接ダウンロード (Workers 経由でストリーミング)
  const object = await env.VIDEO_BUCKET.get(key)
  if (!object) {
    return json({ error: 'Object not found' }, 404)
  }

  return new Response(object.body, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': object.httpMetadata?.contentType || 'video/mp4',
      'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
      'Cache-Control': 'private, max-age=3600',
    }
  })
}

/**
 * ジョブの作成
 */
async function handleCreateJob(request, env) {
  const body = await request.json()
  const jobId = crypto.randomUUID()

  const job = {
    id: jobId,
    status: 'pending',
    createdAt: Date.now(),
    ...body,
  }

  if (env.JOB_KV) {
    await env.JOB_KV.put(`job:${jobId}`, JSON.stringify(job), {
      expirationTtl: 86400 // 24時間
    })
  }

  return json({ jobId, ...job })
}

/**
 * ジョブの取得
 */
async function handleGetJob(jobId, env) {
  if (!env.JOB_KV) {
    return json({ error: 'KV not configured' }, 500)
  }

  const data = await env.JOB_KV.get(`job:${jobId}`)
  if (!data) {
    return json({ error: 'Job not found' }, 404)
  }

  return json(JSON.parse(data))
}

// ヘルパー
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
