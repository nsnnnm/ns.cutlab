import React from 'react'

const PRESETS = [
  { name: 'なし', filters: { brightness: 1, contrast: 1, saturation: 1, blur: 0 } },
  { name: 'Vivid', filters: { brightness: 1.1, contrast: 1.2, saturation: 1.5, blur: 0 } },
  { name: 'Cinema', filters: { brightness: 0.9, contrast: 1.3, saturation: 0.7, blur: 0 } },
  { name: 'Fade', filters: { brightness: 1.1, contrast: 0.85, saturation: 0.6, blur: 0 } },
  { name: 'B&W', filters: { brightness: 1, contrast: 1.1, saturation: 0, blur: 0 } },
  { name: 'Warm', filters: { brightness: 1.05, contrast: 1.1, saturation: 1.3, blur: 0 } },
  { name: 'Cool', filters: { brightness: 0.95, contrast: 1.1, saturation: 0.8, blur: 0 } },
  { name: 'Dreamy', filters: { brightness: 1.1, contrast: 0.9, saturation: 1.1, blur: 2 } },
]

export default function FiltersPanel({ filters, onChange }) {
  const update = (key, val) => onChange({ ...filters, [key]: val })

  const applyPreset = (preset) => onChange(preset.filters)

  const isPreset = (preset) =>
    Math.abs(filters.brightness - preset.filters.brightness) < 0.01 &&
    Math.abs(filters.contrast - preset.filters.contrast) < 0.01 &&
    Math.abs(filters.saturation - preset.filters.saturation) < 0.01 &&
    filters.blur === preset.filters.blur

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Presets */}
      <div>
        <label style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
          プリセット
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              style={{
                padding: '7px 4px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 'var(--radius)',
                background: isPreset(preset) ? 'var(--accent-bg)' : 'var(--bg-3)',
                color: isPreset(preset) ? 'var(--accent)' : 'var(--text-1)',
                border: `1px solid ${isPreset(preset) ? 'var(--accent)' : 'var(--border)'}`,
                transition: 'var(--transition)',
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Manual controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FilterKnob
          label="明るさ" value={filters.brightness} min={0} max={2} step={0.05}
          onChange={v => update('brightness', v)}
          display={Math.round((filters.brightness - 1) * 100)}
          displayUnit="%"
        />
        <FilterKnob
          label="コントラスト" value={filters.contrast} min={0} max={3} step={0.05}
          onChange={v => update('contrast', v)}
          display={Math.round((filters.contrast - 1) * 100)}
          displayUnit="%"
        />
        <FilterKnob
          label="彩度" value={filters.saturation} min={0} max={3} step={0.05}
          onChange={v => update('saturation', v)}
          display={Math.round((filters.saturation - 1) * 100)}
          displayUnit="%"
        />
        <FilterKnob
          label="ブラー" value={filters.blur} min={0} max={10} step={0.5}
          onChange={v => update('blur', v)}
          display={filters.blur}
          displayUnit="px"
        />
      </div>

      {/* Preview swatch */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '10px 12px',
        background: 'var(--bg-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          width: 48, height: 32,
          borderRadius: 'var(--radius)',
          background: 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff)',
          filter: `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`,
          flexShrink: 0,
          border: '1px solid var(--border)',
        }} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
          <div>bright: {filters.brightness.toFixed(2)}</div>
          <div>contrast: {filters.contrast.toFixed(2)} · sat: {filters.saturation.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

function FilterKnob({ label, value, min, max, step, onChange, display, displayUnit }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: 'var(--text-1)', fontFamily: 'var(--font-display)' }}>
          {label}
        </label>
        <span style={{
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: display !== 0 ? 'var(--accent)' : 'var(--text-2)',
          minWidth: 50,
          textAlign: 'right',
        }}>
          {display >= 0 ? '+' : ''}{display}{displayUnit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}
