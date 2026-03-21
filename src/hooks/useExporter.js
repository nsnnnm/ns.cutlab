import { useState, useRef, useCallback } from 'react'

export function useExporter() {
  const [exporting, setExporting] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [eta,       setEta]       = useState(null)
  const cancelRef = useRef(false)

  const exportVideo = useCallback(async ({
    clips,
    textTracks,   // [{id, content, x, y, fontSize, color, startTime, endTime}]
    imageTracks,  // [{id, url, x, y, scale, opacity, startTime, endTime}]
    audioTracks,  // [{id, url, startTime, volume}]
    filters,
    audioSettings,
    exportSettings = {},
  }) => {
    if (!clips.length) throw new Error('クリップがありません')
    setExporting(true)
    setProgress(0)
    setEta(null)
    cancelRef.current = false

    const {
      fps       = 30,
      quality   = 0.85,
      scale     = 1,
      audioBitrate = 128000,
    } = exportSettings

    try {
      // ── 1. Preload all image overlays ──────────────────────
      const loadedImages = await Promise.all(
        (imageTracks || []).map(img => new Promise(res => {
          const el = new Image()
          el.crossOrigin = 'anonymous'
          el.onload = () => res({ ...img, el })
          el.onerror = () => res({ ...img, el: null })
          el.src = img.url
        }))
      )

      // ── 2. Set up canvas ───────────────────────────────────
      const firstVideo = document.createElement('video')
      firstVideo.src = clips[0].url
      await new Promise(r => { firstVideo.onloadedmetadata = r })

      const W = Math.round(firstVideo.videoWidth  * scale) || 1280
      const H = Math.round(firstVideo.videoHeight * scale) || 720
      firstVideo.src = ''

      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')

      // ── 3. Set up AudioContext ─────────────────────────────
      const audioCtx = new AudioContext()
      const dest = audioCtx.createMediaStreamDestination()

      // ── 4. MediaRecorder ──────────────────────────────────
      const canvasStream = canvas.captureStream(fps)
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ])

      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ]
      const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm'

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: quality > 0.9 ? 8_000_000 : quality > 0.7 ? 4_000_000 : 2_000_000,
        audioBitsPerSecond: audioBitrate,
      })

      const chunks = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      recorder.start(100) // collect every 100ms

      // ── 5. Render each clip sequentially ──────────────────
      const totalDur = clips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)
      let renderedTime = 0
      const startWall = performance.now()

      for (const clip of clips) {
        if (cancelRef.current) break

        const clipDur = clip.trimEnd - clip.trimStart
        const video = document.createElement('video')
        video.src = clip.url
        video.muted = !!(clip.muted || audioSettings.mute)
        video.playbackRate = 1

        // Connect clip audio to AudioContext
        let sourceNode = null
        if (!clip.muted && !audioSettings.mute) {
          const src = audioCtx.createMediaElementSource(video)
          const gainNode = audioCtx.createGain()
          gainNode.gain.value = audioSettings.volume ?? 1
          src.connect(gainNode)
          gainNode.connect(dest)
          sourceNode = src
        }

        await new Promise(r => { video.onloadedmetadata = r })
        video.currentTime = clip.trimStart
        await new Promise(r => { video.onseeked = r })
        await video.play()

        const clipStart = performance.now()

        await new Promise((resolve) => {
          const draw = () => {
            if (cancelRef.current) { resolve(); return }

            const elapsed = (performance.now() - clipStart) / 1000
            const clipTime = clip.trimStart + elapsed
            const globalTime = renderedTime + elapsed

            if (clipTime >= clip.trimEnd || elapsed >= clipDur) {
              resolve(); return
            }

            // Progress
            const pct = Math.round(((renderedTime + elapsed) / totalDur) * 100)
            setProgress(pct)
            const wallElapsed = (performance.now() - startWall) / 1000
            if (pct > 2) setEta(Math.round(wallElapsed / (pct / 100) * (1 - pct / 100)))

            // Draw video frame
            ctx.save()
            applyFilters(ctx, filters, W, H)
            ctx.drawImage(video, 0, 0, W, H)
            ctx.restore()

            // Draw image overlays
            for (const img of loadedImages) {
              if (!img.el) continue
              if (globalTime < img.startTime || globalTime > img.endTime) continue
              const iw = W * img.scale / 100
              const ih = iw * (img.el.naturalHeight / img.el.naturalWidth)
              const ix = W * img.x / 100 - iw / 2
              const iy = H * img.y / 100 - ih / 2
              ctx.save()
              ctx.globalAlpha = img.opacity ?? 1
              ctx.drawImage(img.el, ix, iy, iw, ih)
              ctx.restore()
            }

            // Draw text overlays
            for (const t of (textTracks || [])) {
              if (!t.content) continue
              if (globalTime < t.startTime || globalTime > t.endTime) continue
              drawText(ctx, t, W, H, scale)
            }

            requestAnimationFrame(draw)
          }
          requestAnimationFrame(draw)
        })

        video.pause()
        if (sourceNode) try { sourceNode.disconnect() } catch {}
        renderedTime += clipDur
      }

      // Connect BGM tracks
      for (const track of (audioTracks || [])) {
        const el = new Audio(track.url)
        el.currentTime = 0
        const src = audioCtx.createMediaElementSource(el)
        const gain = audioCtx.createGain()
        gain.gain.value = track.volume ?? 0.8
        src.connect(gain)
        gain.connect(dest)
        el.play().catch(() => {})
        // Note: BGM plays from start of recording, startTime offset handled via currentTime
        if (track.startTime > 0) el.currentTime = 0 // starts at track start
      }

      // ── 6. Stop recording ─────────────────────────────────
      await new Promise(r => {
        recorder.onstop = r
        recorder.stop()
      })

      await audioCtx.close()
      setProgress(100)

      const blob = new Blob(chunks, { type: mimeType })
      return { blob, mimeType, ext: mimeType.includes('mp4') ? 'mp4' : 'webm' }

    } finally {
      setExporting(false)
      setEta(null)
    }
  }, [])

  const cancel = () => { cancelRef.current = true }

  return { exportVideo, exporting, progress, eta, cancel }
}

// ── Apply CSS-like filters to canvas context ──────────────────
function applyFilters(ctx, filters, W, H) {
  if (!filters) return
  const { brightness = 1, contrast = 1, saturation = 1, blur = 0 } = filters
  const parts = []
  if (brightness !== 1) parts.push(`brightness(${brightness})`)
  if (contrast    !== 1) parts.push(`contrast(${contrast})`)
  if (saturation  !== 1) parts.push(`saturate(${saturation})`)
  if (blur        > 0)   parts.push(`blur(${blur}px)`)
  if (parts.length) ctx.filter = parts.join(' ')
  else ctx.filter = 'none'
}

// ── Draw text overlay ──────────────────────────────────────────
function drawText(ctx, t, W, H, scale = 1) {
  const fs = Math.max(8, (t.fontSize || 36) * scale)
  ctx.save()
  ctx.font = `bold ${fs}px 'Inter', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const x = W * (t.x || 50) / 100
  const y = H * (t.y || 85) / 100

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.85)'
  ctx.shadowBlur = fs * 0.15
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 1

  ctx.fillStyle = t.color || '#ffffff'

  // Multi-line support
  const lines = t.content.split('\n')
  const lineH = fs * 1.25
  const totalH = lines.length * lineH
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y - totalH / 2 + i * lineH + lineH / 2)
  })

  ctx.restore()
}
