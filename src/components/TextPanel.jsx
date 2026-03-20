import React from 'react'

export default function TextPanel({ text, onChange }) {
  const update = (key, val) => onChange({ ...text, [key]: val })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          テキスト内容
        </label>
        <textarea
          value={text.content}
          onChange={e => update('content', e.target.value)}
          placeholder="字幕・テキストを入力..."
          rows={3}
          style={{
            resize: 'none',
            width: '100%',
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-0)',
            borderRadius: 'var(--radius)',
            padding: '8px 10px',
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Knob label="フォントサイズ" value={text.fontSize} min={12} max={96} step={2}
          onChange={v => update('fontSize', v)} unit="px" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            カラー
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color"
              value={text.color}
              onChange={e => update('color', e.target.value)}
              style={{
                width: 40, height: 34,
                padding: 2,
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}
            />
            <input
              value={text.color}
              onChange={e => update('color', e.target.value)}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Knob label="X 位置 (%)" value={text.x} min={0} max={100} step={1}
          onChange={v => update('x', v)} unit="%" />
        <Knob label="Y 位置 (%)" value={text.y} min={0} max={100} step={1}
          onChange={v => update('y', v)} unit="%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            開始時間 (秒)
          </label>
          <input
            type="number" min="0" step="0.1"
            value={text.startTime}
            onChange={e => update('startTime', parseFloat(e.target.value) || 0)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            終了時間 (秒)
          </label>
          <input
            type="number" min="0" step="0.1"
            value={text.endTime}
            onChange={e => update('endTime', parseFloat(e.target.value) || 0)}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Preview */}
      {text.content && (
        <div style={{
          position: 'relative',
          background: '#000',
          borderRadius: 'var(--radius)',
          aspectRatio: '16/9',
          overflow: 'hidden',
          border: '1px solid var(--border)',
        }}>
          <div style={{
            position: 'absolute',
            left: `${text.x}%`,
            top: `${text.y}%`,
            fontSize: Math.max(10, text.fontSize * 0.3),
            color: text.color,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            textShadow: '1px 1px 4px rgba(0,0,0,0.8)',
            transform: 'translate(-50%, -50%)',
            whiteSpace: 'pre-wrap',
            maxWidth: '80%',
            textAlign: 'center',
            lineHeight: 1.3,
          }}>
            {text.content}
          </div>
          <div style={{
            position: 'absolute', bottom: 6, right: 8,
            fontSize: 9, color: 'rgba(255,255,255,0.3)',
            fontFamily: 'var(--font-mono)',
          }}>PREVIEW</div>
        </div>
      )}
    </div>
  )
}

function Knob({ label, value, min, max, step, onChange, unit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </label>
        <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
          {value}{unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}
