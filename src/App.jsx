import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'

const TABS = [
  { id: 'clips', label: 'クリップ', icon: '🎬' },
  { id: 'text', label: 'テキスト', icon: 'T' },
  { id: 'filters', label: 'フィルター', icon: '◑' },
  { id: 'audio', label: '音声', icon: '♪' },
  { id: 'export', label: '出力', icon: '⚙' },
]

const DEFAULT_TEXT = { id: null, content: '', x: 50, y: 85, fontSize: 36, color: '#ffffff', startTime: 0, endTime: 5 }
const DEFAULT_FILTERS = { brightness: 1, contrast: 1, saturation: 1, blur: 0 }
const DEFAULT_AUDIO = { mute: false, volume: 1 }

export default function App() {
  const [clips, setClips] = useState([]) // {id, file, ext, name, url, duration, trimStart, trimEnd, thumbnail}
  const [activeClipId, setActiveClipId] = useState(null)
  const [textOverlays, setTextOverlays] = useState([])
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [audio, setAudio] = useState(DEFAULT_AUDIO)
  const [activeTab, setActiveTab] = useState('clips')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [outputBlob, setOutputBlob] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [draggingOver, setDraggingOver] = useState(false)

  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const { load, loaded, loading, progress, processVideo } = useFFmpeg()

  const activeClip = clips.find(c => c.id === activeClipId) || clips[0]

  // Load video into player when active clip changes
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.src = activeClip.url
    video.currentTime = activeClip.trimStart || 0
    setCurrentTime(activeClip.trimStart || 0)
    setIsPlaying(false)
  }, [activeClipId, activeClip?.url])

  // Enforce trim bounds during playback
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    const check = () => {
      if (video.currentTime >= (activeClip.trimEnd || video.duration)) {
        video.pause()
        video.currentTime = activeClip.trimStart || 0
        setIsPlaying(false)
      }
      setCurrentTime(video.currentTime)
    }
    video.addEventListener('timeupdate', check)
    return () => video.removeEventListener('timeupdate', check)
  }, [activeClip])

  const addFiles = useCallback(async (files) => {
    const newClips = []
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue
      const url = URL.createObjectURL(file)
      const ext = file.name.split('.').pop().toLowerCase() || 'mp4'
      const id = crypto.randomUUID()
      // Get duration
      const duration = await getVideoDuration(url)
      // Get thumbnail
      const thumbnail = await getVideoThumbnail(url)
      newClips.push({ id, file, ext, name: file.name, url, duration, trimStart: 0, trimEnd: duration, thumbnail })
    }
    setClips(prev => {
      const next = [...prev, ...newClips]
      if (prev.length === 0 && newClips.length > 0) setActiveClipId(newClips[0].id)
      return next
    })
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDraggingOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [addFiles])

  const removeClip = (id) => {
    setClips(prev => {
      const next = prev.filter(c => c.id !== id)
      if (activeClipId === id) setActiveClipId(next[0]?.id || null)
      return next
    })
  }

  const updateClipTrim = (id, trimStart, trimEnd) => {
    setClips(prev => prev.map(c => c.id === id ? { ...c, trimStart, trimEnd } : c))
  }

  const splitClip = () => {
    if (!activeClip) return
    const splitPoint = currentTime
    if (splitPoint <= activeClip.trimStart + 0.1 || splitPoint >= activeClip.trimEnd - 0.1) return
    const newId = crypto.randomUUID()
    const newClip = {
      ...activeClip,
      id: newId,
      trimStart: splitPoint,
      trimEnd: activeClip.trimEnd,
    }
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === activeClip.id)
      const updated = prev.map(c => c.id === activeClip.id ? { ...c, trimEnd: splitPoint } : c)
      updated.splice(idx + 1, 0, newClip)
      return updated
    })
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video || !activeClip) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      if (video.currentTime >= (activeClip.trimEnd || video.duration)) {
        video.currentTime = activeClip.trimStart || 0
      }
      video.play()
      setIsPlaying(true)
    }
  }

  const handleExport = async () => {
    if (!loaded || clips.length === 0) return
    setProcessing(true)
    setOutputBlob(null)
    try {
      const blob = await processVideo(clips, textOverlays, filters, audio)
      setOutputBlob(blob)
      setActiveTab('export')
    } catch (e) {
      console.error(e)
      alert('エクスポートエラー: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  const download = () => {
    if (!outputBlob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(outputBlob)
    a.download = `cutlab_${Date.now()}.mp4`
    a.click()
  }

  const totalDuration = clips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
          <span style={{ color: 'var(--accent)' }}>CUT</span>LAB
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', marginLeft: 10, fontWeight: 400 }}>v2</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {loaded && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 2, padding: '2px 7px' }}>WASM READY</span>}
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => addFiles(Array.from(e.target.files))} />
            + 動画追加
          </label>
          {!loaded && (
            <button className="btn btn-accent" onClick={load} disabled={loading}>
              {loading ? <span className="anim-spin">⟳</span> : '⚡'} {loading ? '読込中...' : 'FFmpeg読込'}
            </button>
          )}
          {loaded && clips.length > 0 && (
            <button className="btn btn-accent" onClick={handleExport} disabled={processing}>
              {processing ? <><span className="anim-spin">⟳</span> {progress}%</> : '⚙ エクスポート'}
            </button>
          )}
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
          {/* Video preview area */}
          <div
            style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
            onDragLeave={() => setDraggingOver(false)}
          >
            {activeClip ? (
              <>
                <video
                  ref={videoRef}
                  style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
                  onEnded={() => setIsPlaying(false)}
                />
                {/* Text overlays preview */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                  {textOverlays.map(t => {
                    if (!t.content) return null
                    const inRange = currentTime >= t.startTime && currentTime <= t.endTime
                    if (!inRange) return null
                    return (
                      <div key={t.id} style={{
                        position: 'absolute',
                        left: `${t.x}%`, top: `${t.y}%`,
                        transform: 'translate(-50%, -50%)',
                        fontSize: Math.max(10, t.fontSize * 0.4),
                        color: t.color,
                        fontFamily: 'var(--font)',
                        fontWeight: 700,
                        textShadow: '1px 1px 4px rgba(0,0,0,0.9)',
                        whiteSpace: 'pre-wrap',
                        textAlign: 'center',
                        maxWidth: '90%',
                      }}>{t.content}</div>
                    )
                  })}
                </div>
              </>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: draggingOver ? 1 : 0.6, transition: 'var(--t)' }}>
                <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => addFiles(Array.from(e.target.files))} />
                <div style={{ fontSize: 48 }}>🎬</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>動画をドロップ or クリック</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)' }}>MP4, MOV, AVI, WebM</div>
                </div>
              </label>
            )}
          </div>

          {/* Playback controls */}
          {activeClip && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-1)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button onClick={togglePlay} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="btn-icon" onClick={splitClip} title="現在地で分割" style={{ flexShrink: 0 }}>✂</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-1)', flexShrink: 0 }}>
                {fmt(currentTime)} / {fmt(activeClip.trimEnd - activeClip.trimStart)}
              </span>
              <div style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', textAlign: 'right' }}>
                合計 {fmt(totalDuration)}
              </div>
            </div>
          )}

          {/* Timeline */}
          {clips.length > 0 && (
            <Timeline
              clips={clips}
              activeClipId={activeClipId}
              currentTime={currentTime}
              onSelectClip={setActiveClipId}
              onTrimChange={updateClipTrim}
              onRemoveClip={removeClip}
              videoRef={videoRef}
              setCurrentTime={setCurrentTime}
            />
          )}
        </div>

        {/* Right panel */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', flexShrink: 0 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, padding: '8px 2px', background: 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-2)',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 13 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {activeTab === 'clips' && (
              <ClipsPanel clips={clips} activeClipId={activeClipId} onSelect={setActiveClipId} onRemove={removeClip} onAdd={addFiles} />
            )}
            {activeTab === 'text' && (
              <TextPanel overlays={textOverlays} setOverlays={setTextOverlays} selectedId={selectedTextId} setSelectedId={setSelectedTextId} currentTime={currentTime} />
            )}
            {activeTab === 'filters' && (
              <FiltersPanel filters={filters} onChange={setFilters} />
            )}
            {activeTab === 'audio' && (
              <AudioPanel audio={audio} onChange={setAudio} />
            )}
            {activeTab === 'export' && (
              <ExportPanel loaded={loaded} loading={loading} onLoad={load} processing={processing} progress={progress} onExport={handleExport} outputBlob={outputBlob} onDownload={download} clipsCount={clips.length} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Timeline ───────────────────────────────────────────────
function Timeline({ clips, activeClipId, currentTime, onSelectClip, onTrimChange, onRemoveClip, videoRef, setCurrentTime }) {
  const ref = useRef(null)
  const [dragging, setDragging] = useState(null) // {clipId, type: 'start'|'end'|'seek'}
  const totalDuration = clips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0) || 1
  const PX_PER_SEC = Math.min(120, Math.max(30, 600 / totalDuration))

  const clipOffset = (idx) => clips.slice(0, idx).reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)

  const handleSeek = (e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const t = x / PX_PER_SEC
    // Find which clip this falls in
    let accum = 0
    for (const clip of clips) {
      const dur = clip.trimEnd - clip.trimStart
      if (t <= accum + dur) {
        const clipTime = clip.trimStart + (t - accum)
        if (videoRef.current && activeClipId === clip.id) {
          videoRef.current.currentTime = clipTime
          setCurrentTime(clipTime)
        }
        onSelectClip(clip.id)
        break
      }
      accum += dur
    }
  }

  return (
    <div style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      <div style={{ padding: '8px 12px 10px', minWidth: totalDuration * PX_PER_SEC + 80, position: 'relative' }} ref={ref} onClick={handleSeek}>
        {/* Clip tracks */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
          {clips.map((clip, idx) => {
            const w = (clip.trimEnd - clip.trimStart) * PX_PER_SEC
            const isActive = clip.id === activeClipId
            return (
              <div key={clip.id} onClick={e => { e.stopPropagation(); onSelectClip(clip.id) }} style={{
                width: w, height: 48, borderRadius: 4, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'pointer',
                border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border-hi)'}`,
                background: 'var(--bg-3)',
              }}>
                {clip.thumbnail && <img src={clip.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', textShadow: '0 1px 3px #000', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>
                    {clip.name}
                  </span>
                </div>
                <button onClick={e => { e.stopPropagation(); onRemoveClip(clip.id) }} style={{
                  position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%',
                  background: 'rgba(255,69,96,0.8)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>×</button>
              </div>
            )
          })}
        </div>

        {/* Playhead */}
        {(() => {
          const active = clips.find(c => c.id === activeClipId)
          if (!active) return null
          const offset = clipOffset(clips.indexOf(active))
          const playheadX = (offset + (currentTime - active.trimStart)) * PX_PER_SEC
          return (
            <div style={{ position: 'absolute', top: 8, bottom: 0, left: 12 + playheadX, width: 2, background: 'var(--accent)', pointerEvents: 'none', borderRadius: 1 }}>
              <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', marginLeft: -3, marginTop: -4 }} />
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ─── Clips Panel ─────────────────────────────────────────────
function ClipsPanel({ clips, activeClipId, onSelect, onRemove, onAdd }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="anim-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>クリップ ({clips.length})</span>
        <label className="btn btn-ghost" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 11 }}>
          <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => onAdd(Array.from(e.target.files))} />
          + 追加
        </label>
      </div>
      {clips.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-2)', fontFamily: 'var(--mono)', fontSize: 11, padding: '20px 0' }}>動画を追加してください</div>
      )}
      {clips.map((clip, idx) => (
        <div key={clip.id} onClick={() => onSelect(clip.id)} style={{
          display: 'flex', gap: 8, alignItems: 'center', padding: '7px 9px', borderRadius: 'var(--r)',
          background: activeClipId === clip.id ? 'var(--accent-bg)' : 'var(--bg-2)',
          border: `1px solid ${activeClipId === clip.id ? 'var(--accent)' : 'var(--border)'}`,
          cursor: 'pointer', transition: 'var(--t)',
        }}>
          {clip.thumbnail ? (
            <img src={clip.thumbnail} alt="" style={{ width: 48, height: 28, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 48, height: 28, background: 'var(--bg-4)', borderRadius: 2, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clip.name}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>{fmt(clip.trimEnd - clip.trimStart)}</div>
          </div>
          <button className="btn-icon" onClick={e => { e.stopPropagation(); onRemove(clip.id) }} style={{ color: 'var(--red)', flexShrink: 0 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ─── Text Panel ───────────────────────────────────────────────
function TextPanel({ overlays, setOverlays, selectedId, setSelectedId, currentTime }) {
  const selected = overlays.find(t => t.id === selectedId)

  const addOverlay = () => {
    const id = crypto.randomUUID()
    const t = { ...DEFAULT_TEXT, id, startTime: currentTime, endTime: currentTime + 5 }
    setOverlays(prev => [...prev, t])
    setSelectedId(id)
  }

  const updateOverlay = (id, key, val) => {
    setOverlays(prev => prev.map(t => t.id === id ? { ...t, [key]: val } : t))
  }

  const removeOverlay = (id) => {
    setOverlays(prev => prev.filter(t => t.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>テキスト ({overlays.length})</span>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={addOverlay}>+ 追加</button>
      </div>

      {overlays.map(t => (
        <div key={t.id} onClick={() => setSelectedId(t.id)} style={{
          padding: '8px 10px', borderRadius: 'var(--r)', background: selectedId === t.id ? 'var(--accent-bg)' : 'var(--bg-2)',
          border: `1px solid ${selectedId === t.id ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {t.content || '(空)'}
            </span>
            <button className="btn-icon" onClick={e => { e.stopPropagation(); removeOverlay(t.id) }} style={{ color: 'var(--red)', marginLeft: 6 }}>✕</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{fmt(t.startTime)} → {fmt(t.endTime)}</div>
        </div>
      ))}

      {selected && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">編集中</span>
          <textarea value={selected.content} onChange={e => updateOverlay(selected.id, 'content', e.target.value)}
            placeholder="テキスト入力..." rows={2}
            style={{ width: '100%', resize: 'none', fontFamily: 'var(--font)', fontSize: 12 }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <span className="label">フォントサイズ</span>
              <input type="number" min={12} max={120} value={selected.fontSize} onChange={e => updateOverlay(selected.id, 'fontSize', +e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <span className="label">カラー</span>
              <div style={{ display: 'flex', gap: 5 }}>
                <input type="color" value={selected.color} onChange={e => updateOverlay(selected.id, 'color', e.target.value)} style={{ width: 34, height: 28, padding: 2, cursor: 'pointer' }} />
                <input value={selected.color} onChange={e => updateOverlay(selected.id, 'color', e.target.value)} style={{ flex: 1, fontSize: 11 }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SliderField label={`X: ${selected.x}%`} value={selected.x} min={0} max={100} onChange={v => updateOverlay(selected.id, 'x', v)} />
            <SliderField label={`Y: ${selected.y}%`} value={selected.y} min={0} max={100} onChange={v => updateOverlay(selected.id, 'y', v)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <span className="label">開始 (秒)</span>
              <input type="number" min={0} step={0.1} value={selected.startTime} onChange={e => updateOverlay(selected.id, 'startTime', +e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <span className="label">終了 (秒)</span>
              <input type="number" min={0} step={0.1} value={selected.endTime} onChange={e => updateOverlay(selected.id, 'endTime', +e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Preview */}
          <div style={{ position: 'relative', background: '#000', borderRadius: 4, aspectRatio: '16/9', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{
              position: 'absolute', left: `${selected.x}%`, top: `${selected.y}%`,
              transform: 'translate(-50%,-50%)', fontSize: Math.max(8, selected.fontSize * 0.25),
              color: selected.color, fontWeight: 700, textShadow: '1px 1px 3px rgba(0,0,0,0.9)',
              maxWidth: '90%', textAlign: 'center',
            }}>{selected.content || 'プレビュー'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filters Panel ────────────────────────────────────────────
const PRESETS = [
  { name: 'なし', f: { brightness: 1, contrast: 1, saturation: 1, blur: 0 } },
  { name: 'Vivid', f: { brightness: 1.1, contrast: 1.2, saturation: 1.5, blur: 0 } },
  { name: 'Cinema', f: { brightness: 0.9, contrast: 1.3, saturation: 0.7, blur: 0 } },
  { name: 'B&W', f: { brightness: 1, contrast: 1.1, saturation: 0, blur: 0 } },
  { name: 'Fade', f: { brightness: 1.1, contrast: 0.85, saturation: 0.6, blur: 0 } },
  { name: 'Warm', f: { brightness: 1.05, contrast: 1.1, saturation: 1.3, blur: 0 } },
]

function FiltersPanel({ filters, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {PRESETS.map(p => {
          const active = JSON.stringify(p.f) === JSON.stringify(filters)
          return (
            <button key={p.name} onClick={() => onChange(p.f)} style={{
              padding: '6px 4px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--r)',
              background: active ? 'var(--accent-bg)' : 'var(--bg-3)',
              color: active ? 'var(--accent)' : 'var(--text-1)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
            }}>{p.name}</button>
          )
        })}
      </div>
      <div className="divider" />
      <SliderField label={`明るさ ${showDiff(filters.brightness, 1)}%`} value={filters.brightness} min={0} max={2} step={0.05} onChange={v => onChange({ ...filters, brightness: v })} />
      <SliderField label={`コントラスト ${showDiff(filters.contrast, 1)}%`} value={filters.contrast} min={0} max={3} step={0.05} onChange={v => onChange({ ...filters, contrast: v })} />
      <SliderField label={`彩度 ${showDiff(filters.saturation, 1)}%`} value={filters.saturation} min={0} max={3} step={0.05} onChange={v => onChange({ ...filters, saturation: v })} />
      <SliderField label={`ブラー ${filters.blur}px`} value={filters.blur} min={0} max={10} step={0.5} onChange={v => onChange({ ...filters, blur: v })} />
      <div style={{ height: 24, borderRadius: 4, background: `linear-gradient(135deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)`, filter: `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`, border: '1px solid var(--border)' }} />
    </div>
  )
}

// ─── Audio Panel ──────────────────────────────────────────────
function AudioPanel({ audio, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="anim-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r)', border: `1px solid ${audio.mute ? 'var(--red)' : 'var(--border)'}` }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>ミュート</div>
          <div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>元の音声を削除</div>
        </div>
        <Toggle value={audio.mute} onChange={v => onChange({ ...audio, mute: v })} color="var(--red)" />
      </div>
      <div style={{ opacity: audio.mute ? 0.4 : 1, pointerEvents: audio.mute ? 'none' : 'auto' }}>
        <SliderField label={`音量: ${Math.round(audio.volume * 100)}%`} value={audio.volume} min={0} max={2} step={0.05} onChange={v => onChange({ ...audio, volume: v })} />
      </div>
    </div>
  )
}

// ─── Export Panel ─────────────────────────────────────────────
function ExportPanel({ loaded, loading, onLoad, processing, progress, onExport, outputBlob, onDownload, clipsCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <div style={{ padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r)', border: `1px solid ${loaded ? 'var(--green)' : 'var(--border)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: loaded ? 'var(--green)' : loading ? '#ffcc00' : 'var(--text-2)', boxShadow: loaded ? '0 0 6px var(--green)' : 'none' }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{loaded ? 'FFmpeg 準備完了' : loading ? '読み込み中...' : 'FFmpeg 未読込'}</span>
        </div>
        {!loaded && !loading && <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={onLoad}>⚡ 読み込む</button>}
        {loading && <div style={{ height: 3, background: 'var(--bg-4)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: '50%', background: '#ffcc00', animation: 'indeterminate 1.5s ease-in-out infinite' }} /></div>}
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.8, padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
        <div style={{ color: 'var(--text-1)', fontWeight: 500, marginBottom: 4 }}>出力仕様</div>
        <div>MP4 / H.264 + AAC 128k</div>
        <div>クリップ数: {clipsCount}</div>
      </div>

      {processing && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11 }}>処理中...</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>{progress}%</span>
          </div>
          <div style={{ height: 5, background: 'var(--bg-4)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      <button className="btn btn-accent" style={{ width: '100%', justifyContent: 'center', padding: '10px' }} onClick={onExport} disabled={!loaded || processing || clipsCount === 0}>
        {processing ? <><span className="anim-spin">⟳</span> {progress}%</> : '⚙ エクスポート'}
      </button>

      {outputBlob && !processing && (
        <div className="anim-fade">
          <div style={{ padding: '10px 12px', background: 'rgba(46,204,113,0.08)', border: '1px solid var(--green)', borderRadius: 'var(--r)', marginBottom: 8 }}>
            <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12, marginBottom: 2 }}>✓ 完了</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)' }}>{(outputBlob.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onDownload}>↓ ダウンロード (.mp4)</button>
        </div>
      )}
      <style>{`@keyframes indeterminate { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────
function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <div>
      <span className="label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
    </div>
  )
}

function Toggle({ value, onChange, color = 'var(--accent)' }) {
  return (
    <button onClick={() => onChange(!value)} style={{ width: 40, height: 22, borderRadius: 11, background: value ? color : 'var(--bg-4)', border: `1px solid ${value ? color : 'var(--border)'}`, position: 'relative', cursor: 'pointer' }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  )
}

// ─── Utils ────────────────────────────────────────────────────
function fmt(s) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function showDiff(val, base) {
  const d = Math.round((val - base) * 100)
  return d >= 0 ? `+${d}` : `${d}`
}

function getVideoDuration(url) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    v.src = url
    v.onloadedmetadata = () => resolve(v.duration)
    v.onerror = () => resolve(0)
  })
}

function getVideoThumbnail(url) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    const c = document.createElement('canvas')
    c.width = 80; c.height = 45
    v.src = url
    v.currentTime = 0.5
    v.onseeked = () => {
      c.getContext('2d').drawImage(v, 0, 0, 80, 45)
      resolve(c.toDataURL('image/jpeg', 0.6))
    }
    v.onerror = () => resolve(null)
  })
}
