import React from 'react'

export default function AudioPanel({ audio, onChange }) {
  const update = (key, val) => onChange({ ...audio, [key]: val })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Mute toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: `1px solid ${audio.mute ? 'var(--red)' : 'var(--border)'}`,
        transition: 'var(--transition)',
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>音声をミュート</div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            元の音声を削除
          </div>
        </div>
        <Toggle value={audio.mute} onChange={v => update('mute', v)} color="var(--red)" />
      </div>

      {/* Volume */}
      <div style={{ opacity: audio.mute ? 0.4 : 1, pointerEvents: audio.mute ? 'none' : 'auto', transition: 'var(--transition)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-1)' }}>音量</label>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>
            {Math.round(audio.volume * 100)}%
          </span>
        </div>
        <input type="range" min={0} max={2} step={0.05} value={audio.volume}
          onChange={e => update('volume', parseFloat(e.target.value))}
          style={{ width: '100%' }}
          disabled={audio.mute}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>0%</span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>100%</span>
          <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>200%</span>
        </div>
      </div>

      {/* Visual volume meter */}
      <div style={{
        display: 'flex', gap: 2, height: 24,
        opacity: audio.mute ? 0.2 : 1,
        transition: 'var(--transition)',
      }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const active = i < Math.round(audio.volume * 10)
          const isHigh = i >= 14
          const isMid = i >= 10
          return (
            <div
              key={i}
              style={{
                flex: 1,
                background: active
                  ? isHigh ? 'var(--red)' : isMid ? '#ffcc00' : 'var(--green)'
                  : 'var(--bg-3)',
                borderRadius: 2,
                transition: 'background 0.1s',
              }}
            />
          )
        })}
      </div>

      {/* Info box */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-2)',
        lineHeight: 1.7,
      }}>
        <div style={{ color: 'var(--text-1)', fontWeight: 500, marginBottom: 4 }}>出力設定</div>
        <div>コーデック: AAC</div>
        <div>ビットレート: 128k</div>
        <div>状態: {audio.mute ? <span style={{ color: 'var(--red)' }}>ミュート</span> : <span style={{ color: 'var(--green)' }}>有効</span>}</div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange, color = 'var(--accent)' }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24,
        borderRadius: 12,
        background: value ? color : 'var(--bg-3)',
        border: `1px solid ${value ? color : 'var(--border)'}`,
        position: 'relative',
        transition: 'var(--transition)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 2, left: value ? 22 : 2,
        width: 18, height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.15s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}
