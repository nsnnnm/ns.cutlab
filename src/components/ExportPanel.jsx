import React from 'react'

export default function ExportPanel({ onExport, processing, progress, loaded, loading, onLoadFFmpeg, outputBlob }) {
  const handleDownload = () => {
    if (!outputBlob) return
    const url = URL.createObjectURL(outputBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cutlab_export_${Date.now()}.mp4`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* FFmpeg Status */}
      <div style={{
        padding: '12px 14px',
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: `1px solid ${loaded ? 'var(--green)' : 'var(--border)'}`,
        transition: 'var(--transition)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: loaded ? 'var(--green)' : loading ? '#ffcc00' : 'var(--text-2)',
            boxShadow: loaded ? '0 0 6px var(--green)' : 'none',
            ...(loading ? { animation: 'pulse 1s ease-in-out infinite' } : {}),
          }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {loaded ? 'FFmpeg 準備完了' : loading ? 'FFmpeg 読み込み中...' : 'FFmpeg 未読み込み'}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          {loaded ? 'ブラウザ内処理 / WebAssembly' : 'ローカル処理エンジン (WASM)'}
        </div>
        {!loaded && !loading && (
          <button
            onClick={onLoadFFmpeg}
            className="btn btn-ghost"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
          >
            ⚡ FFmpeg を読み込む
          </button>
        )}
        {loading && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: '60%',
                background: '#ffcc00',
                borderRadius: 2,
                animation: 'indeterminate 1.5s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Export settings info */}
      <div style={{
        padding: '12px 14px',
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.9,
      }}>
        <div style={{ color: 'var(--text-1)', fontWeight: 500, marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 12 }}>出力仕様</div>
        <div>フォーマット : MP4 (H.264)</div>
        <div>映像コーデック : libx264 / CRF 23</div>
        <div>音声コーデック : AAC 128k</div>
        <div>プリセット : fast</div>
      </div>

      {/* Progress */}
      {processing && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-1)' }}>処理中...</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>{progress}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--accent) 0%, #b8ff00 100%)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
              boxShadow: '0 0 12px rgba(232,255,71,0.5)',
            }} />
          </div>
        </div>
      )}

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={!loaded || processing}
        className="btn btn-primary"
        style={{ justifyContent: 'center', padding: '12px', fontSize: 14, letterSpacing: '0.04em' }}
      >
        {processing ? (
          <>
            <span className="animate-spin" style={{ display: 'inline-block' }}>⟳</span>
            処理中 ({progress}%)
          </>
        ) : (
          <>⚙ エクスポート開始</>
        )}
      </button>

      {/* Download */}
      {outputBlob && !processing && (
        <div style={{ animation: 'fadeIn 0.4s ease' }}>
          <div style={{
            padding: '14px',
            background: 'rgba(46, 204, 113, 0.08)',
            border: '1px solid var(--green)',
            borderRadius: 'var(--radius)',
            marginBottom: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>エクスポート完了</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              サイズ: {(outputBlob.size / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <button
            onClick={handleDownload}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
          >
            ↓ ダウンロード (.mp4)
          </button>
        </div>
      )}

      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
