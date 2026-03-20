import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'cutlab_visited_v1'

export default function WelcomeGate({ children }) {
  const [show, setShow] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const visited = localStorage.getItem(STORAGE_KEY)
    if (!visited) setShow(true)
  }, [])

  const dismiss = () => {
    setClosing(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setShow(false)
    }, 500)
  }

  if (!show) return children

  return (
    <>
      {children}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(10,10,12,0.96)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: closing ? 0 : 1,
        transition: 'opacity 0.5s ease',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{
          maxWidth: 560, width: '90%',
          transform: closing ? 'scale(0.96) translateY(10px)' : 'scale(1)',
          transition: 'transform 0.5s ease',
        }}>
          {/* Logo */}
          <div style={{ marginBottom: 32, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font)', fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em', lineHeight: 1 }}>
              <span style={{ color: 'var(--accent)' }}>CUT</span>
              <span style={{ color: '#fff' }}>LAB</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', marginTop: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Browser-Native Video Editor
            </div>
          </div>

          {/* Main card */}
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '36px 40px',
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12, lineHeight: 1.3 }}>
              動画編集、ブラウザだけで。<br />
              <span style={{ color: 'var(--accent)' }}>完全無料・インストール不要。</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.8, marginBottom: 28 }}>
              CUTLABはFFmpeg WebAssemblyを使ったブラウザ完結の動画編集ツールです。
              ファイルはサーバーに送信されず、すべてあなたのPC上で処理されます。
            </p>

            {/* Feature grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 32 }}>
              {[
                { icon: '✂', title: 'カット & トリミング', desc: 'タイムラインで直感的に編集' },
                { icon: 'T', title: 'テキスト & 字幕', desc: 'フォント・色・位置を自由に' },
                { icon: '◑', title: 'フィルター', desc: '8種のプリセット＋細かい調整' },
                { icon: '♪', title: 'BGM追加', desc: '音声トラックを重ねられる' },
                { icon: '🖼', title: '画像オーバーレイ', desc: 'ロゴや透かしを合成' },
                { icon: '🔒', title: 'プライバシー保護', desc: 'ファイルは外部送信なし' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{f.icon}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{f.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Shortcut hints */}
            <div style={{ padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.9, marginBottom: 28 }}>
              <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>ショートカット: </span>
              Space=再生/停止　←→=フレーム移動　✂=分割　Ctrl+Z=Undo　M=ミュート
            </div>

            <button
              onClick={dismiss}
              style={{
                width: '100%', padding: '14px',
                background: 'var(--accent)', color: '#000',
                fontFamily: 'var(--font)', fontWeight: 800, fontSize: 15,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s',
              }}
              onMouseOver={e => e.target.style.background = 'var(--accent-dim)'}
              onMouseOut={e => e.target.style.background = 'var(--accent)'}
            >
              編集を始める →
            </button>
          </div>

          <div style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>
            次回からこの画面は表示されません
          </div>
        </div>
      </div>
    </>
  )
}
