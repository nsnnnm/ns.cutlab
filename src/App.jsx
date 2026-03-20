import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'

// ─── Constants ───────────────────────────────────────────────
const TABS = [
  { id: 'clips', label: 'クリップ', icon: '🎬' },
  { id: 'text', label: 'テキスト', icon: 'T' },
  { id: 'filters', label: 'フィルター', icon: '◑' },
  { id: 'audio', label: '音声', icon: '♪' },
  { id: 'export', label: '出力', icon: '⚙' },
]
const PRESETS = [
  { name: 'なし', f: { brightness: 1, contrast: 1, saturation: 1, blur: 0 } },
  { name: 'Vivid', f: { brightness: 1.1, contrast: 1.2, saturation: 1.5, blur: 0 } },
  { name: 'Cinema', f: { brightness: 0.9, contrast: 1.3, saturation: 0.7, blur: 0 } },
  { name: 'B&W', f: { brightness: 1, contrast: 1.1, saturation: 0, blur: 0 } },
  { name: 'Fade', f: { brightness: 1.1, contrast: 0.85, saturation: 0.6, blur: 0 } },
  { name: 'Warm', f: { brightness: 1.05, contrast: 1.1, saturation: 1.3, blur: 0 } },
]
const DEFAULT_FILTERS = { brightness: 1, contrast: 1, saturation: 1, blur: 0 }
const DEFAULT_AUDIO_SETTINGS = { mute: false, volume: 1 }

// ─── App ─────────────────────────────────────────────────────
export default function App() {
  const [clips, setClips] = useState([])
  const [activeClipId, setActiveClipId] = useState(null)
  const [textOverlays, setTextOverlays] = useState([])
  const [audioTracks, setAudioTracks] = useState([]) // {id,file,name,url,ext,duration,startTime,volume}
  const [imageOverlays, setImageOverlays] = useState([]) // {id,file,name,url,startTime,endTime,x,y,scale}
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [audioSettings, setAudioSettings] = useState(DEFAULT_AUDIO_SETTINGS)
  const [activeTab, setActiveTab] = useState('clips')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [outputBlob, setOutputBlob] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [draggingOver, setDraggingOver] = useState(false)

  const videoRef = useRef(null)
  const audioRefs = useRef({}) // id -> HTMLAudioElement
  const { load, loaded, loading, progress, processVideo } = useFFmpeg()

  const activeClip = clips.find(c => c.id === activeClipId) || clips[0]
  const totalDuration = clips.reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)

  // Sync audio tracks with video playback
  useEffect(() => {
    // Create/update audio elements for each track
    audioTracks.forEach(track => {
      if (!audioRefs.current[track.id]) {
        const audio = new Audio(track.url)
        audio.volume = track.volume ?? 1
        audioRefs.current[track.id] = audio
      } else {
        audioRefs.current[track.id].volume = track.volume ?? 1
      }
    })
    // Remove old ones
    Object.keys(audioRefs.current).forEach(id => {
      if (!audioTracks.find(t => t.id === id)) {
        audioRefs.current[id].pause()
        delete audioRefs.current[id]
      }
    })
  }, [audioTracks])

  // Sync audio on play/pause/seek
  const syncAudio = useCallback((time, playing) => {
    audioTracks.forEach(track => {
      const el = audioRefs.current[track.id]
      if (!el) return
      const relTime = time - (track.startTime || 0)
      if (relTime >= 0 && relTime < (track.duration || 9999)) {
        el.currentTime = relTime
        if (playing) el.play().catch(() => {})
        else el.pause()
      } else {
        el.pause()
      }
    })
  }, [audioTracks])

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.currentTime >= (activeClip.trimEnd || video.duration)) {
        video.pause()
        video.currentTime = activeClip.trimStart || 0
        setIsPlaying(false)
        syncAudio(activeClip.trimStart || 0, false)
      }
    }
    const onEnded = () => { setIsPlaying(false); syncAudio(0, false) }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('ended', onEnded)
    }
  }, [activeClip, syncAudio])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.src = activeClip.url
    video.currentTime = activeClip.trimStart || 0
    setCurrentTime(activeClip.trimStart || 0)
    setIsPlaying(false)
  }, [activeClipId])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video || !activeClip) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
      syncAudio(video.currentTime, false)
    } else {
      if (video.currentTime >= (activeClip.trimEnd || video.duration)) {
        video.currentTime = activeClip.trimStart || 0
      }
      video.play()
      setIsPlaying(true)
      syncAudio(video.currentTime, true)
    }
  }

  const seekTo = (time) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = time
    setCurrentTime(time)
    syncAudio(time, isPlaying)
  }

  const addVideoFiles = useCallback(async (files) => {
    const newClips = []
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue
      const url = URL.createObjectURL(file)
      const ext = file.name.split('.').pop().toLowerCase() || 'mp4'
      const id = crypto.randomUUID()
      const duration = await getVideoDuration(url)
      const thumbnail = await getVideoThumbnail(url)
      newClips.push({ id, file, ext, name: file.name, url, duration, trimStart: 0, trimEnd: duration, thumbnail })
    }
    setClips(prev => {
      const next = [...prev, ...newClips]
      if (prev.length === 0 && newClips.length > 0) setActiveClipId(newClips[0].id)
      return next
    })
  }, [])

  const addAudioFiles = useCallback(async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('audio/')) continue
      const url = URL.createObjectURL(file)
      const ext = file.name.split('.').pop().toLowerCase() || 'mp3'
      const id = crypto.randomUUID()
      const duration = await getAudioDuration(url)
      setAudioTracks(prev => [...prev, { id, file, ext, name: file.name, url, duration, startTime: 0, volume: 0.8 }])
    }
  }, [])

  const addImageFiles = useCallback(async (files) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      const id = crypto.randomUUID()
      setImageOverlays(prev => [...prev, { id, file, name: file.name, url, startTime: 0, endTime: 5, x: 50, y: 50, scale: 30 }])
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDraggingOver(false)
    const files = Array.from(e.dataTransfer.files)
    addVideoFiles(files.filter(f => f.type.startsWith('video/')))
    addAudioFiles(files.filter(f => f.type.startsWith('audio/')))
    addImageFiles(files.filter(f => f.type.startsWith('image/')))
  }, [addVideoFiles, addAudioFiles, addImageFiles])

  const splitClip = () => {
    if (!activeClip) return
    const split = currentTime
    if (split <= activeClip.trimStart + 0.1 || split >= activeClip.trimEnd - 0.1) return
    const newId = crypto.randomUUID()
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === activeClip.id)
      const updated = prev.map(c => c.id === activeClip.id ? { ...c, trimEnd: split } : c)
      updated.splice(idx + 1, 0, { ...activeClip, id: newId, trimStart: split })
      return updated
    })
  }

  const handleExport = async () => {
    if (!loaded || clips.length === 0) return
    setProcessing(true)
    setOutputBlob(null)
    try {
      const blob = await processVideo(clips, textOverlays, filters, audioSettings)
      setOutputBlob(blob)
      setActiveTab('export')
    } catch (e) {
      console.error(e)
      alert('エクスポートエラー: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Header
        loaded={loaded} loading={loading} onLoad={load} processing={processing} progress={progress}
        onExport={handleExport} clipsCount={clips.length}
        onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
      />

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Preview + Timeline */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
          {/* Preview */}
          <div
            style={{ flex: 1, background: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}
            onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDraggingOver(true) }} onDragLeave={() => setDraggingOver(false)}
          >
            {activeClip ? (
              <>
                <video ref={videoRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                {/* Text overlays */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {textOverlays.map(t => {
                    if (!t.content || currentTime < t.startTime || currentTime > t.endTime) return null
                    return (
                      <div key={t.id} style={{
                        position: 'absolute', left: `${t.x}%`, top: `${t.y}%`,
                        transform: 'translate(-50%,-50%)', fontSize: Math.max(10, t.fontSize * 0.4),
                        color: t.color, fontFamily: 'var(--font)', fontWeight: 700,
                        textShadow: '1px 1px 4px rgba(0,0,0,0.9)', whiteSpace: 'pre-wrap',
                        textAlign: 'center', maxWidth: '90%',
                      }}>{t.content}</div>
                    )
                  })}
                  {/* Image overlays */}
                  {imageOverlays.map(img => {
                    if (currentTime < img.startTime || currentTime > img.endTime) return null
                    return (
                      <img key={img.id} src={img.url} alt="" style={{
                        position: 'absolute', left: `${img.x}%`, top: `${img.y}%`,
                        transform: 'translate(-50%,-50%)', width: `${img.scale}%`,
                        objectFit: 'contain', pointerEvents: 'none',
                      }} />
                    )
                  })}
                </div>
              </>
            ) : (
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer', opacity: draggingOver ? 1 : 0.5 }}>
                <input type="file" accept="video/*,audio/*,image/*" multiple style={{ display: 'none' }} onChange={e => {
                  const files = Array.from(e.target.files)
                  addVideoFiles(files); addAudioFiles(files); addImageFiles(files)
                }} />
                <div style={{ fontSize: 48 }}>🎬</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>動画・音声・画像をドロップ</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-2)' }}>MP4, MOV, MP3, JPG, PNG など</div>
                </div>
              </label>
            )}
          </div>

          {/* Playback bar */}
          {clips.length > 0 && (
            <div style={{ padding: '6px 12px', background: 'var(--bg-1)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <button onClick={togglePlay} style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button className="btn-icon" onClick={splitClip} title="現在地で分割" style={{ flexShrink: 0 }}>✂</button>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-1)', flexShrink: 0 }}>{fmt(currentTime)} / {fmt(totalDuration)}</span>
            </div>
          )}

          {/* Multi-track Timeline */}
          <MultiTrackTimeline
            clips={clips} setClips={setClips}
            textOverlays={textOverlays} setTextOverlays={setTextOverlays}
            audioTracks={audioTracks} setAudioTracks={setAudioTracks}
            imageOverlays={imageOverlays} setImageOverlays={setImageOverlays}
            activeClipId={activeClipId} setActiveClipId={setActiveClipId}
            currentTime={currentTime} onSeek={seekTo}
            totalDuration={totalDuration}
            onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
          />
        </div>

        {/* Right panel */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex: 1, padding: '8px 2px', background: 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-2)',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 13 }}>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {activeTab === 'clips' && <ClipsPanel clips={clips} activeClipId={activeClipId} onSelect={setActiveClipId} onRemove={id => setClips(p => p.filter(c => c.id !== id))} onAdd={addVideoFiles} audioTracks={audioTracks} onRemoveAudio={id => setAudioTracks(p => p.filter(t => t.id !== id))} onUpdateAudio={(id, k, v) => setAudioTracks(p => p.map(t => t.id === id ? { ...t, [k]: v } : t))} imageOverlays={imageOverlays} onRemoveImage={id => setImageOverlays(p => p.filter(i => i.id !== id))} onAddAudio={addAudioFiles} onAddImage={addImageFiles} />}
            {activeTab === 'text' && <TextPanel overlays={textOverlays} setOverlays={setTextOverlays} selectedId={selectedTextId} setSelectedId={setSelectedTextId} currentTime={currentTime} />}
            {activeTab === 'filters' && <FiltersPanel filters={filters} onChange={setFilters} />}
            {activeTab === 'audio' && <AudioPanel audio={audioSettings} onChange={setAudioSettings} />}
            {activeTab === 'export' && <ExportPanel loaded={loaded} loading={loading} onLoad={load} processing={processing} progress={progress} onExport={handleExport} outputBlob={outputBlob} onDownload={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(outputBlob); a.download = `cutlab_${Date.now()}.mp4`; a.click() }} clipsCount={clips.length} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────
function Header({ loaded, loading, onLoad, processing, progress, onExport, clipsCount, onAddVideo, onAddAudio, onAddImage }) {
  return (
    <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em' }}>
        <span style={{ color: 'var(--accent)' }}>CUT</span>LAB
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', marginLeft: 10, fontWeight: 400 }}>v2</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {loaded && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)', background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: 2, padding: '2px 7px' }}>WASM</span>}
        <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 11 }}>
          <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => onAddVideo(Array.from(e.target.files))} />🎬
        </label>
        <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 11 }}>
          <input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => onAddAudio(Array.from(e.target.files))} />♪
        </label>
        <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 11 }}>
          <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => onAddImage(Array.from(e.target.files))} />🖼
        </label>
        {!loaded && <button className="btn btn-accent" onClick={onLoad} disabled={loading}>{loading ? <span className="anim-spin">⟳</span> : '⚡'}{loading ? '読込中' : 'FFmpeg'}</button>}
        {loaded && clipsCount > 0 && (
          <button className="btn btn-accent" onClick={onExport} disabled={processing}>
            {processing ? <><span className="anim-spin">⟳</span>{progress}%</> : '⚙ 出力'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Multi-track Timeline ────────────────────────────────────
function MultiTrackTimeline({ clips, setClips, textOverlays, setTextOverlays, audioTracks, setAudioTracks, imageOverlays, setImageOverlays, activeClipId, setActiveClipId, currentTime, onSeek, totalDuration, onAddVideo, onAddAudio, onAddImage }) {
  const containerRef = useRef(null)
  const PX_PER_SEC = 80
  const totalWidth = Math.max(totalDuration * PX_PER_SEC + 200, 600)

  const handleTimelineClick = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const scrollLeft = containerRef.current.scrollLeft
    const x = e.clientX - rect.left + scrollLeft - 60 // 60px label offset
    const t = Math.max(0, x / PX_PER_SEC)
    onSeek(t)
  }

  const playheadLeft = 60 + currentTime * PX_PER_SEC

  const TRACK_H = 40
  const LABEL_W = 60

  return (
    <div style={{ background: 'var(--bg-0)', borderTop: '1px solid var(--border)', flexShrink: 0, maxHeight: 220, display: 'flex', flexDirection: 'column' }}>
      {/* Scrollable area */}
      <div ref={containerRef} style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, position: 'relative' }} onClick={handleTimelineClick}>
        <div style={{ width: totalWidth, position: 'relative', paddingBottom: 8 }}>
          {/* Time ruler */}
          <div style={{ height: 20, position: 'sticky', top: 0, background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', zIndex: 10, display: 'flex', alignItems: 'center' }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ flex: 1, position: 'relative', height: '100%' }}>
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: i * PX_PER_SEC, top: 0, bottom: 0, borderLeft: '1px solid var(--border)', display: 'flex', alignItems: 'center', paddingLeft: 3 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-2)' }}>{fmt(i)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Track: Video */}
          <TrackRow label="動画" color="var(--blue)" icon="🎬">
            {clips.map((clip, idx) => {
              const left = LABEL_W + clips.slice(0, idx).reduce((s, c) => s + (c.trimEnd - c.trimStart), 0) * PX_PER_SEC
              const w = (clip.trimEnd - clip.trimStart) * PX_PER_SEC
              return (
                <div key={clip.id} onClick={e => { e.stopPropagation(); setActiveClipId(clip.id) }} style={{
                  position: 'absolute', left, top: 2, height: TRACK_H - 4, width: Math.max(w, 4),
                  background: activeClipId === clip.id ? 'rgba(74,143,255,0.4)' : 'rgba(74,143,255,0.2)',
                  border: `1px solid ${activeClipId === clip.id ? 'var(--blue)' : 'rgba(74,143,255,0.4)'}`,
                  borderRadius: 3, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center',
                }}>
                  {clip.thumbnail && <img src={clip.thumbnail} alt="" style={{ height: '100%', width: 'auto', opacity: 0.5, flexShrink: 0 }} />}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: '#fff', padding: '0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip.name}</span>
                  <button onClick={e => { e.stopPropagation(); setClips(p => p.filter(c => c.id !== clip.id)) }} style={{ position: 'absolute', right: 2, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,69,96,0.8)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
              )
            })}
            <AddButton left={LABEL_W + totalDuration * PX_PER_SEC + 4} onAdd={onAddVideo} accept="video/*" />
          </TrackRow>

          {/* Track: Text */}
          <TrackRow label="字幕" color="var(--accent)" icon="T">
            {textOverlays.map(t => (
              <div key={t.id} style={{
                position: 'absolute',
                left: LABEL_W + t.startTime * PX_PER_SEC,
                top: 2, height: TRACK_H - 4,
                width: Math.max((t.endTime - t.startTime) * PX_PER_SEC, 20),
                background: 'rgba(232,255,71,0.15)', border: '1px solid rgba(232,255,71,0.5)',
                borderRadius: 3, display: 'flex', alignItems: 'center', overflow: 'hidden', cursor: 'pointer',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--accent)', padding: '0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.content || '(空)'}</span>
                <button onClick={e => { e.stopPropagation(); setTextOverlays(p => p.filter(x => x.id !== t.id)) }} style={{ position: 'absolute', right: 2, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,69,96,0.8)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
            <button onClick={() => {
              const id = crypto.randomUUID()
              setTextOverlays(p => [...p, { id, content: '', x: 50, y: 85, fontSize: 36, color: '#ffffff', startTime: currentTime, endTime: currentTime + 3 }])
            }} style={{ position: 'absolute', left: LABEL_W + 4, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, borderRadius: 3, background: 'rgba(232,255,71,0.2)', color: 'var(--accent)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5 }}>+</button>
          </TrackRow>

          {/* Track: Audio */}
          <TrackRow label="音声" color="var(--green)" icon="♪">
            {audioTracks.map(track => (
              <div key={track.id} style={{
                position: 'absolute',
                left: LABEL_W + (track.startTime || 0) * PX_PER_SEC,
                top: 2, height: TRACK_H - 4,
                width: Math.max((track.duration || 10) * PX_PER_SEC, 40),
                background: 'rgba(46,204,113,0.15)', border: '1px solid rgba(46,204,113,0.5)',
                borderRadius: 3, display: 'flex', alignItems: 'center', overflow: 'hidden',
              }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--green)', padding: '0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>♪ {track.name}</span>
                <button onClick={e => { e.stopPropagation(); setAudioTracks(p => p.filter(t => t.id !== track.id)) }} style={{ position: 'absolute', right: 2, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,69,96,0.8)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
            <AddButton left={LABEL_W + 4} onAdd={onAddAudio} accept="audio/*" topOffset />
          </TrackRow>

          {/* Track: Image */}
          <TrackRow label="画像" color="var(--orange)" icon="🖼">
            {imageOverlays.map(img => (
              <div key={img.id} style={{
                position: 'absolute',
                left: LABEL_W + img.startTime * PX_PER_SEC,
                top: 2, height: TRACK_H - 4,
                width: Math.max((img.endTime - img.startTime) * PX_PER_SEC, 20),
                background: 'rgba(255,159,67,0.15)', border: '1px solid rgba(255,159,67,0.5)',
                borderRadius: 3, display: 'flex', alignItems: 'center', overflow: 'hidden',
              }}>
                <img src={img.url} alt="" style={{ height: '100%', width: 'auto', opacity: 0.6 }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--orange)', padding: '0 5px', whiteSpace: 'nowrap' }}>{img.name}</span>
                <button onClick={e => { e.stopPropagation(); setImageOverlays(p => p.filter(i => i.id !== img.id)) }} style={{ position: 'absolute', right: 2, top: 2, width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,69,96,0.8)', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
            <AddButton left={LABEL_W + 4} onAdd={onAddImage} accept="image/*" topOffset />
          </TrackRow>

          {/* Playhead */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: playheadLeft, width: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 20 }}>
            <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', marginLeft: -3 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TrackRow({ label, color, icon, children }) {
  return (
    <div style={{ display: 'flex', height: 44, borderBottom: '1px solid var(--border)', position: 'relative' }}>
      <div style={{ width: 60, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', background: 'var(--bg-1)', position: 'sticky', left: 0, zIndex: 5 }}>
        <span style={{ fontSize: 10, color, fontWeight: 700 }}>{icon}</span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}

function AddButton({ left, onAdd, accept, topOffset }) {
  return (
    <label style={{ position: topOffset ? 'relative' : 'absolute', left: topOffset ? undefined : left, top: topOffset ? undefined : '50%', transform: topOffset ? undefined : 'translateY(-50%)', width: 18, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.1)', color: 'var(--text-1)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, margin: topOffset ? 'auto 4px' : undefined, zIndex: 3 }}>
      <input type="file" accept={accept} multiple style={{ display: 'none' }} onChange={e => onAdd(Array.from(e.target.files))} />
      +
    </label>
  )
}

// ─── Clips Panel ─────────────────────────────────────────────
function ClipsPanel({ clips, activeClipId, onSelect, onRemove, onAdd, audioTracks, onRemoveAudio, onUpdateAudio, imageOverlays, onRemoveImage, onAddAudio, onAddImage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <Section title="動画クリップ" action={<label className="btn btn-ghost" style={{ cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}><input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => onAdd(Array.from(e.target.files))} />+ 追加</label>}>
        {clips.length === 0 && <Empty text="動画を追加" />}
        {clips.map(clip => (
          <MediaItem key={clip.id} active={activeClipId === clip.id} onClick={() => onSelect(clip.id)} thumbnail={clip.thumbnail} name={clip.name} meta={fmt(clip.trimEnd - clip.trimStart)} onRemove={() => onRemove(clip.id)} color="var(--blue)" />
        ))}
      </Section>

      <Section title="音声トラック" action={<label className="btn btn-ghost" style={{ cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}><input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={e => onAddAudio(Array.from(e.target.files))} />+ 追加</label>}>
        {audioTracks.length === 0 && <Empty text="音声を追加" />}
        {audioTracks.map(track => (
          <div key={track.id} style={{ padding: '7px 9px', borderRadius: 'var(--r)', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>♪ {track.name}</span>
              <button className="btn-icon" onClick={() => onRemoveAudio(track.id)} style={{ color: 'var(--red)', flexShrink: 0 }}>✕</button>
            </div>
            <span className="label">音量: {Math.round((track.volume || 1) * 100)}%</span>
            <input type="range" min={0} max={1} step={0.05} value={track.volume || 1} onChange={e => onUpdateAudio(track.id, 'volume', +e.target.value)} />
            <div style={{ marginTop: 4 }}>
              <span className="label">開始位置 (秒)</span>
              <input type="number" min={0} step={0.1} value={track.startTime || 0} onChange={e => onUpdateAudio(track.id, 'startTime', +e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
        ))}
      </Section>

      <Section title="画像オーバーレイ" action={<label className="btn btn-ghost" style={{ cursor: 'pointer', padding: '3px 8px', fontSize: 11 }}><input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => onAddImage(Array.from(e.target.files))} />+ 追加</label>}>
        {imageOverlays.length === 0 && <Empty text="画像を追加" />}
        {imageOverlays.map(img => (
          <MediaItem key={img.id} thumbnail={img.url} name={img.name} meta={`${fmt(img.startTime)}→${fmt(img.endTime)}`} onRemove={() => onRemoveImage(img.id)} color="var(--orange)" />
        ))}
      </Section>
    </div>
  )
}

// ─── Text Panel ───────────────────────────────────────────────
function TextPanel({ overlays, setOverlays, selectedId, setSelectedId, currentTime }) {
  const selected = overlays.find(t => t.id === selectedId)
  const update = (id, k, v) => setOverlays(p => p.map(t => t.id === id ? { ...t, [k]: v } : t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>テキスト ({overlays.length})</span>
        <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => {
          const id = crypto.randomUUID()
          setOverlays(p => [...p, { id, content: '', x: 50, y: 85, fontSize: 36, color: '#ffffff', startTime: currentTime, endTime: currentTime + 5 }])
          setSelectedId(id)
        }}>+ 追加</button>
      </div>

      {overlays.map(t => (
        <div key={t.id} onClick={() => setSelectedId(t.id)} style={{ padding: '8px 10px', borderRadius: 'var(--r)', background: selectedId === t.id ? 'var(--accent-bg)' : 'var(--bg-2)', border: `1px solid ${selectedId === t.id ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.content || '(空)'}</span>
            <button className="btn-icon" onClick={e => { e.stopPropagation(); setOverlays(p => p.filter(x => x.id !== t.id)); if (selectedId === t.id) setSelectedId(null) }} style={{ color: 'var(--red)', marginLeft: 6 }}>✕</button>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-2)', marginTop: 2 }}>{fmt(t.startTime)} → {fmt(t.endTime)}</div>
        </div>
      ))}

      {selected && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="label">編集</span>
          <textarea value={selected.content} onChange={e => update(selected.id, 'content', e.target.value)} rows={2} style={{ width: '100%', resize: 'none', fontFamily: 'var(--font)', fontSize: 12 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span className="label">サイズ</span><input type="number" min={12} max={120} value={selected.fontSize} onChange={e => update(selected.id, 'fontSize', +e.target.value)} style={{ width: '100%' }} /></div>
            <div><span className="label">カラー</span><div style={{ display: 'flex', gap: 4 }}><input type="color" value={selected.color} onChange={e => update(selected.id, 'color', e.target.value)} style={{ width: 30, height: 26, padding: 2, cursor: 'pointer' }} /><input value={selected.color} onChange={e => update(selected.id, 'color', e.target.value)} style={{ flex: 1, fontSize: 11 }} /></div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <SliderField label={`X: ${selected.x}%`} value={selected.x} min={0} max={100} onChange={v => update(selected.id, 'x', v)} />
            <SliderField label={`Y: ${selected.y}%`} value={selected.y} min={0} max={100} onChange={v => update(selected.id, 'y', v)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={selected.startTime} onChange={e => update(selected.id, 'startTime', +e.target.value)} style={{ width: '100%' }} /></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={selected.endTime} onChange={e => update(selected.id, 'endTime', +e.target.value)} style={{ width: '100%' }} /></div>
          </div>
          <div style={{ position: 'relative', background: '#000', borderRadius: 4, aspectRatio: '16/9', overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ position: 'absolute', left: `${selected.x}%`, top: `${selected.y}%`, transform: 'translate(-50%,-50%)', fontSize: Math.max(8, selected.fontSize * 0.22), color: selected.color, fontWeight: 700, textShadow: '1px 1px 3px rgba(0,0,0,0.9)', maxWidth: '90%', textAlign: 'center' }}>{selected.content || 'テキスト'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Filters Panel ────────────────────────────────────────────
function FiltersPanel({ filters, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} className="anim-fade">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {PRESETS.map(p => { const active = JSON.stringify(p.f) === JSON.stringify(filters); return <button key={p.name} onClick={() => onChange(p.f)} style={{ padding: '6px 4px', fontSize: 11, fontWeight: 600, borderRadius: 'var(--r)', background: active ? 'var(--accent-bg)' : 'var(--bg-3)', color: active ? 'var(--accent)' : 'var(--text-1)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>{p.name}</button> })}
      </div>
      <div className="divider" />
      <SliderField label={`明るさ ${diff(filters.brightness)}%`} value={filters.brightness} min={0} max={2} step={0.05} onChange={v => onChange({ ...filters, brightness: v })} />
      <SliderField label={`コントラスト ${diff(filters.contrast)}%`} value={filters.contrast} min={0} max={3} step={0.05} onChange={v => onChange({ ...filters, contrast: v })} />
      <SliderField label={`彩度 ${diff(filters.saturation)}%`} value={filters.saturation} min={0} max={3} step={0.05} onChange={v => onChange({ ...filters, saturation: v })} />
      <SliderField label={`ブラー ${filters.blur}px`} value={filters.blur} min={0} max={10} step={0.5} onChange={v => onChange({ ...filters, blur: v })} />
      <div style={{ height: 20, borderRadius: 4, background: 'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)', filter: `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`, border: '1px solid var(--border)' }} />
    </div>
  )
}

// ─── Audio Panel ──────────────────────────────────────────────
function AudioPanel({ audio, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="anim-fade">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 'var(--r)', border: `1px solid ${audio.mute ? 'var(--red)' : 'var(--border)'}` }}>
        <div><div style={{ fontWeight: 600, fontSize: 12 }}>元音声ミュート</div><div style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>動画の音声を削除</div></div>
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
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: loaded ? 'var(--green)' : loading ? '#ffcc00' : 'var(--text-2)' }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{loaded ? 'FFmpeg 準備完了' : loading ? '読み込み中...' : 'FFmpeg 未読込'}</span>
        </div>
        {!loaded && !loading && <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={onLoad}>⚡ 読み込む</button>}
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
        {processing ? <><span className="anim-spin">⟳</span>{progress}%</> : '⚙ エクスポート'}
      </button>
      {outputBlob && !processing && (
        <div className="anim-fade">
          <div style={{ padding: '10px 12px', background: 'rgba(46,204,113,0.08)', border: '1px solid var(--green)', borderRadius: 'var(--r)', marginBottom: 8 }}>
            <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: 12 }}>✓ 完了 — {(outputBlob.size / 1024 / 1024).toFixed(2)} MB</div>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={onDownload}>↓ ダウンロード (.mp4)</button>
        </div>
      )}
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────
function Section({ title, action, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
        {action}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function MediaItem({ active, onClick, thumbnail, name, meta, onRemove, color }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 'var(--r)', background: active ? 'var(--accent-bg)' : 'var(--bg-2)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, cursor: onClick ? 'pointer' : 'default' }}>
      {thumbnail ? <img src={thumbnail} alt="" style={{ width: 44, height: 26, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} /> : <div style={{ width: 44, height: 26, background: 'var(--bg-4)', borderRadius: 2, flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: color || 'var(--text-2)' }}>{meta}</div>
      </div>
      {onRemove && <button className="btn-icon" onClick={e => { e.stopPropagation(); onRemove() }} style={{ color: 'var(--red)', flexShrink: 0 }}>✕</button>}
    </div>
  )
}

function Empty({ text }) {
  return <div style={{ textAlign: 'center', color: 'var(--text-2)', fontFamily: 'var(--mono)', fontSize: 10, padding: '8px 0' }}>{text}</div>
}

function SliderField({ label, value, min, max, step, onChange }) {
  return (
    <div><span className="label">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} /></div>
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
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
function diff(val) { const d = Math.round((val - 1) * 100); return d >= 0 ? `+${d}` : `${d}` }

function getVideoDuration(url) {
  return new Promise(resolve => { const v = document.createElement('video'); v.src = url; v.onloadedmetadata = () => resolve(v.duration); v.onerror = () => resolve(0) })
}
function getAudioDuration(url) {
  return new Promise(resolve => { const a = new Audio(); a.src = url; a.onloadedmetadata = () => resolve(a.duration); a.onerror = () => resolve(60) })
}
function getVideoThumbnail(url) {
  return new Promise(resolve => {
    const v = document.createElement('video'), c = document.createElement('canvas')
    c.width = 80; c.height = 45; v.src = url; v.currentTime = 0.5
    v.onseeked = () => { c.getContext('2d').drawImage(v, 0, 0, 80, 45); resolve(c.toDataURL('image/jpeg', 0.6)) }
    v.onerror = () => resolve(null)
  })
}
