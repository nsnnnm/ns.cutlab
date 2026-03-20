import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'

// ── Constants ────────────────────────────────────────────────
const TABS = [
  { id: 'clips', label: 'クリップ', icon: '🎬' },
  { id: 'text', label: 'テキスト', icon: 'T' },
  { id: 'image', label: '画像', icon: '🖼' },
  { id: 'filters', label: 'フィルター', icon: '◑' },
  { id: 'audio', label: '音声', icon: '♪' },
  { id: 'export', label: '出力', icon: '⚙' },
]
const PRESETS = [
  { name: 'なし', f: { brightness:1, contrast:1, saturation:1, blur:0 } },
  { name: 'Vivid', f: { brightness:1.1, contrast:1.2, saturation:1.5, blur:0 } },
  { name: 'Cinema', f: { brightness:0.9, contrast:1.3, saturation:0.7, blur:0 } },
  { name: 'B&W', f: { brightness:1, contrast:1.1, saturation:0, blur:0 } },
  { name: 'Fade', f: { brightness:1.1, contrast:0.85, saturation:0.6, blur:0 } },
  { name: 'Warm', f: { brightness:1.05, contrast:1.1, saturation:1.3, blur:0 } },
  { name: 'Cool', f: { brightness:0.95, contrast:1.05, saturation:0.8, blur:0 } },
  { name: 'Dreamy', f: { brightness:1.1, contrast:0.9, saturation:1.1, blur:1.5 } },
]
const TRACK_H = 44
const LABEL_W = 56
const DEF_FILTERS = { brightness:1, contrast:1, saturation:1, blur:0 }
const DEF_AUDIO = { mute:false, volume:1 }

// ── App ──────────────────────────────────────────────────────
export default function App() {
  // State
  const [clips, setClips] = useState([])         // video clips on main track
  const [texts, setTexts] = useState([])          // text overlays {id,content,x,y,fontSize,color,startTime,endTime}
  const [images, setImages] = useState([])        // image overlays {id,file,name,url,startTime,endTime,x,y,scale,opacity}
  const [audioTracks, setAudioTracks] = useState([]) // BGM {id,file,ext,name,url,duration,startTime,volume}
  const [filters, setFilters] = useState(DEF_FILTERS)
  const [audioSettings, setAudioSettings] = useState(DEF_AUDIO)
  const [activeClipId, setActiveClipId] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null) // {type:'text'|'image'|'audio'|'clip', id}
  const [activeTab, setActiveTab] = useState('clips')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [outputBlob, setOutputBlob] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [zoom, setZoom] = useState(80) // px per second
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [history, setHistory] = useState([]) // undo stack
  const [future, setFuture] = useState([])   // redo stack

  const videoRef = useRef(null)
  const audioRefs = useRef({})
  const animRef = useRef(null)
  const { load, loaded, loading, progress, processVideo } = useFFmpeg()

  // Computed total duration (all clips + black padding before first clip)
  const totalDuration = useMemo(() => {
    if (!clips.length) return 0
    const firstStart = clips[0]?.startTime || 0
    const videoEnd = clips.reduce((s,c) => s + (c.trimEnd - c.trimStart), 0)
    return firstStart + videoEnd
  }, [clips])

  const activeClip = clips.find(c => c.id === activeClipId) || clips[0]

  // ── Undo/Redo ──────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    setHistory(h => [...h.slice(-30), { clips, texts, images, audioTracks }])
    setFuture([])
  }, [clips, texts, images, audioTracks])

  const undo = useCallback(() => {
    if (!history.length) return
    const prev = history[history.length - 1]
    setFuture(f => [{ clips, texts, images, audioTracks }, ...f])
    setHistory(h => h.slice(0, -1))
    setClips(prev.clips); setTexts(prev.texts); setImages(prev.images); setAudioTracks(prev.audioTracks)
  }, [history, clips, texts, images, audioTracks])

  const redo = useCallback(() => {
    if (!future.length) return
    const next = future[0]
    setHistory(h => [...h, { clips, texts, images, audioTracks }])
    setFuture(f => f.slice(1))
    setClips(next.clips); setTexts(next.texts); setImages(next.images); setAudioTracks(next.audioTracks)
  }, [future, clips, texts, images, audioTracks])

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft': e.preventDefault(); seekDelta(e.shiftKey ? -5 : -1/30); break
        case 'ArrowRight': e.preventDefault(); seekDelta(e.shiftKey ? 5 : 1/30); break
        case 'KeyZ': if (e.metaKey || e.ctrlKey) { e.shiftKey ? redo() : undo(); } break
        case 'KeyY': if (e.metaKey || e.ctrlKey) redo(); break
        case 'Delete': case 'Backspace': deleteSelected(); break
        case 'KeyM': setIsMuted(m => !m); break
        case 'Equal': case 'NumpadAdd': if (e.metaKey||e.ctrlKey) { e.preventDefault(); setZoom(z => Math.min(z*1.5, 400)) } break
        case 'Minus': case 'NumpadSubtract': if (e.metaKey||e.ctrlKey) { e.preventDefault(); setZoom(z => Math.max(z/1.5, 20)) } break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPlaying, totalDuration, selectedItem])

  const seekDelta = (delta) => {
    const video = videoRef.current
    if (!video) return
    const t = Math.max(0, Math.min(totalDuration, (video.currentTime || 0) + delta))
    seekTo(t)
  }

  const deleteSelected = () => {
    if (!selectedItem) return
    saveHistory()
    if (selectedItem.type === 'clip') setClips(p => p.filter(c => c.id !== selectedItem.id))
    if (selectedItem.type === 'text') setTexts(p => p.filter(t => t.id !== selectedItem.id))
    if (selectedItem.type === 'image') setImages(p => p.filter(i => i.id !== selectedItem.id))
    if (selectedItem.type === 'audio') setAudioTracks(p => p.filter(a => a.id !== selectedItem.id))
    setSelectedItem(null)
  }

  // ── Audio sync ────────────────────────────────────────────
  useEffect(() => {
    audioTracks.forEach(track => {
      if (!audioRefs.current[track.id]) {
        const a = new Audio(track.url)
        a.volume = track.volume ?? 0.8
        audioRefs.current[track.id] = a
      } else {
        audioRefs.current[track.id].volume = track.volume ?? 0.8
      }
    })
    Object.keys(audioRefs.current).forEach(id => {
      if (!audioTracks.find(t => t.id === id)) {
        audioRefs.current[id].pause()
        delete audioRefs.current[id]
      }
    })
  }, [audioTracks])

  const syncBGM = useCallback((time, playing) => {
    audioTracks.forEach(track => {
      const el = audioRefs.current[track.id]
      if (!el) return
      const rel = time - (track.startTime || 0)
      if (rel >= 0 && rel < (track.duration || 999)) {
        el.currentTime = rel
        if (playing) el.play().catch(() => {})
        else el.pause()
      } else {
        el.pause()
      }
    })
  }, [audioTracks])

  // ── Video events ──────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = isMuted ? 0 : volume
    video.playbackRate = speed
  }, [volume, isMuted, speed])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    const onTime = () => {
      setCurrentTime(video.currentTime)
      if (video.currentTime >= activeClip.trimEnd) {
        video.pause(); video.currentTime = activeClip.trimStart
        setIsPlaying(false); syncBGM(activeClip.trimStart, false)
      }
    }
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [activeClip, syncBGM])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    video.src = activeClip.url
    video.currentTime = activeClip.trimStart
    setCurrentTime(activeClip.trimStart)
    setIsPlaying(false)
    syncBGM(activeClip.trimStart, false)
  }, [activeClipId])

  // ── Playback ──────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    if (isPlaying) {
      video.pause(); setIsPlaying(false); syncBGM(video.currentTime, false)
    } else {
      if (video.currentTime >= activeClip.trimEnd) video.currentTime = activeClip.trimStart
      video.play(); setIsPlaying(true); syncBGM(video.currentTime, true)
    }
  }, [isPlaying, activeClip, syncBGM])

  const seekTo = useCallback((t) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(totalDuration, t))
    video.currentTime = clamped; setCurrentTime(clamped)
    syncBGM(clamped, isPlaying)
  }, [totalDuration, isPlaying, syncBGM])

  // ── File import ───────────────────────────────────────────
  const addVideoFiles = useCallback(async (files) => {
    saveHistory()
    const newClips = []
    for (const file of files) {
      if (!file.type.startsWith('video/')) continue
      const url = URL.createObjectURL(file)
      const ext = file.name.split('.').pop().toLowerCase() || 'mp4'
      const id = crypto.randomUUID()
      const duration = await getVideoDuration(url)
      const thumbnail = await getVideoThumbnail(url)
      newClips.push({ id, file, ext, name: file.name, url, duration, trimStart:0, trimEnd:duration, startTime:0, thumbnail, speed:1 })
    }
    setClips(prev => {
      const next = [...prev, ...newClips]
      if (!activeClipId && next.length) setActiveClipId(next[0].id)
      return next
    })
  }, [saveHistory, activeClipId])

  const addAudioFiles = useCallback(async (files) => {
    saveHistory()
    for (const file of files) {
      if (!file.type.startsWith('audio/')) continue
      const url = URL.createObjectURL(file)
      const ext = file.name.split('.').pop().toLowerCase() || 'mp3'
      const id = crypto.randomUUID()
      const duration = await getAudioDuration(url)
      setAudioTracks(p => [...p, { id, file, ext, name:file.name, url, duration, startTime:0, volume:0.8 }])
    }
  }, [saveHistory])

  const addImageFiles = useCallback(async (files) => {
    saveHistory()
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      const id = crypto.randomUUID()
      setImages(p => [...p, { id, file, name:file.name, url, startTime:0, endTime:5, x:50, y:50, scale:40, opacity:1 }])
    }
  }, [saveHistory])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    addVideoFiles(files.filter(f => f.type.startsWith('video/')))
    addAudioFiles(files.filter(f => f.type.startsWith('audio/')))
    addImageFiles(files.filter(f => f.type.startsWith('image/')))
  }, [addVideoFiles, addAudioFiles, addImageFiles])

  // ── Split clip ────────────────────────────────────────────
  const splitClip = useCallback(() => {
    if (!activeClip) return
    const t = currentTime
    if (t <= activeClip.trimStart + 0.05 || t >= activeClip.trimEnd - 0.05) return
    saveHistory()
    const newId = crypto.randomUUID()
    setClips(prev => {
      const idx = prev.findIndex(c => c.id === activeClip.id)
      const updated = prev.map(c => c.id === activeClip.id ? { ...c, trimEnd:t } : c)
      updated.splice(idx+1, 0, { ...activeClip, id:newId, trimStart:t })
      return updated
    })
  }, [activeClip, currentTime, saveHistory])

  // ── Export ────────────────────────────────────────────────
  const handleExport = async () => {
    if (!loaded || !clips.length) return
    setProcessing(true); setOutputBlob(null)
    try {
      const blob = await processVideo({ clips, texts, filters, audioSettings, audioTracks })
      setOutputBlob(blob); setActiveTab('export')
    } catch (e) {
      console.error(e); alert('エクスポートエラー: ' + e.message)
    } finally { setProcessing(false) }
  }

  // ── Selected item props ───────────────────────────────────
  const selText = selectedItem?.type === 'text' ? texts.find(t => t.id === selectedItem.id) : null
  const selImage = selectedItem?.type === 'image' ? images.find(i => i.id === selectedItem.id) : null
  const selClip = selectedItem?.type === 'clip' ? clips.find(c => c.id === selectedItem.id) : null

  return (
    <div
      style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}
      onDrop={handleDrop} onDragOver={e => e.preventDefault()}
    >
      {/* Header */}
      <AppHeader
        loaded={loaded} loading={loading} onLoad={load}
        processing={processing} progress={progress}
        onExport={handleExport} clipsCount={clips.length}
        onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
        onUndo={undo} onRedo={redo} canUndo={history.length>0} canRedo={future.length>0}
        zoom={zoom} onZoom={setZoom}
      />

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* Left: Preview + Timeline */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, borderRight:'1px solid var(--border)' }}>

          {/* Preview */}
          <div style={{ flex:1, background:'#000', position:'relative', display:'flex', alignItems:'center', justifyContent:'center', minHeight:0 }}>
            {activeClip ? (
              <>
                <video ref={videoRef} style={{ maxWidth:'100%', maxHeight:'100%' }} />
                {/* Overlay layer */}
                <div style={{ position:'absolute', inset:0, pointerEvents:'none' }}>
                  {texts.map(t => {
                    if (!t.content || currentTime < t.startTime || currentTime > t.endTime) return null
                    return (
                      <div key={t.id} style={{ position:'absolute', left:`${t.x}%`, top:`${t.y}%`, transform:'translate(-50%,-50%)', fontSize:Math.max(8, t.fontSize*0.38), color:t.color, fontFamily:'var(--font)', fontWeight:700, textShadow:'1px 1px 4px rgba(0,0,0,0.9)', whiteSpace:'pre-wrap', textAlign:'center', maxWidth:'90%' }}>{t.content}</div>
                    )
                  })}
                  {images.map(img => {
                    if (currentTime < img.startTime || currentTime > img.endTime) return null
                    return <img key={img.id} src={img.url} alt="" style={{ position:'absolute', left:`${img.x}%`, top:`${img.y}%`, transform:'translate(-50%,-50%)', width:`${img.scale}%`, objectFit:'contain', opacity:img.opacity }} />
                  })}
                </div>
                {/* Time display */}
                <div style={{ position:'absolute', bottom:8, right:10, fontFamily:'var(--mono)', fontSize:11, color:'rgba(255,255,255,0.6)', background:'rgba(0,0,0,0.5)', padding:'2px 7px', borderRadius:3 }}>
                  {fmt(currentTime)} / {fmt(totalDuration)}
                </div>
              </>
            ) : (
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, cursor:'pointer', opacity:0.5 }}>
                <input type="file" accept="video/*,audio/*,image/*" multiple style={{ display:'none' }} onChange={e => { const f=Array.from(e.target.files); addVideoFiles(f); addAudioFiles(f); addImageFiles(f) }} />
                <div style={{ fontSize:52 }}>🎬</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontWeight:700, marginBottom:4 }}>動画・音声・画像をドロップ</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)' }}>MP4 · MOV · MP3 · JPG · PNG</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', marginTop:6 }}>Space=再生  ←→=フレーム移動  Ctrl+Z=Undo</div>
                </div>
              </label>
            )}
          </div>

          {/* Playback controls */}
          <PlaybackBar
            isPlaying={isPlaying} onTogglePlay={togglePlay}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} onSplit={splitClip}
            volume={volume} onVolume={setVolume}
            isMuted={isMuted} onToggleMute={() => setIsMuted(m=>!m)}
            speed={speed} onSpeed={setSpeed}
            hasClip={!!activeClip}
          />

          {/* Multi-track Timeline */}
          <MultiTrackTimeline
            clips={clips} setClips={setClips}
            texts={texts} setTexts={setTexts}
            images={images} setImages={setImages}
            audioTracks={audioTracks} setAudioTracks={setAudioTracks}
            activeClipId={activeClipId} setActiveClipId={setActiveClipId}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} zoom={zoom}
            selectedItem={selectedItem} setSelectedItem={setSelectedItem}
            onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
            saveHistory={saveHistory}
          />
        </div>

        {/* Right panel */}
        <div style={{ width:300, display:'flex', flexDirection:'column', background:'var(--bg-1)', flexShrink:0 }}>
          <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex:1, padding:'7px 2px', background:'transparent', color:activeTab===tab.id ? 'var(--accent)' : 'var(--text-2)', borderBottom:`2px solid ${activeTab===tab.id ? 'var(--accent)' : 'transparent'}`, fontSize:9, fontWeight:700, letterSpacing:'0.03em', textTransform:'uppercase', display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                <span style={{ fontSize:12 }}>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:14 }}>
            {activeTab === 'clips' && <ClipsPanel clips={clips} activeClipId={activeClipId} onSelect={id => { setActiveClipId(id); setSelectedItem({type:'clip',id}) }} onRemove={id => { saveHistory(); setClips(p=>p.filter(c=>c.id!==id)) }} onAdd={addVideoFiles} onUpdate={(id,k,v) => setClips(p=>p.map(c=>c.id===id?{...c,[k]:v}:c))} selClip={selClip} />}
            {activeTab === 'text' && <TextPanel texts={texts} setTexts={setTexts} selectedId={selectedItem?.type==='text'?selectedItem.id:null} setSelectedId={id => setSelectedItem(id?{type:'text',id}:null)} currentTime={currentTime} saveHistory={saveHistory} />}
            {activeTab === 'image' && <ImagePanel images={images} setImages={setImages} selectedId={selectedItem?.type==='image'?selectedItem.id:null} setSelectedId={id => setSelectedItem(id?{type:'image',id}:null)} currentTime={currentTime} saveHistory={saveHistory} />}
            {activeTab === 'filters' && <FiltersPanel filters={filters} onChange={setFilters} />}
            {activeTab === 'audio' && <AudioPanel audio={audioSettings} onChange={setAudioSettings} audioTracks={audioTracks} setAudioTracks={setAudioTracks} onAdd={addAudioFiles} saveHistory={saveHistory} />}
            {activeTab === 'export' && <ExportPanel loaded={loaded} loading={loading} onLoad={load} processing={processing} progress={progress} onExport={handleExport} outputBlob={outputBlob} onDownload={() => { const a=document.createElement('a'); a.href=URL.createObjectURL(outputBlob); a.download=`cutlab_${Date.now()}.mp4`; a.click() }} clipsCount={clips.length} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AppHeader ────────────────────────────────────────────────
function AppHeader({ loaded, loading, onLoad, processing, progress, onExport, clipsCount, onAddVideo, onAddAudio, onAddImage, onUndo, onRedo, canUndo, canRedo, zoom, onZoom }) {
  return (
    <div style={{ height:46, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px', background:'var(--bg-1)', borderBottom:'1px solid var(--border)', flexShrink:0, gap:8 }}>
      <div style={{ fontWeight:800, fontSize:17, letterSpacing:'-0.02em', flexShrink:0 }}>
        <span style={{ color:'var(--accent)' }}>CUT</span>LAB
      </div>

      {/* Center tools */}
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <button className={`btn-icon${canUndo?'':' '}`} onClick={onUndo} disabled={!canUndo} title="Ctrl+Z" style={{ opacity:canUndo?1:0.3 }}>↩</button>
        <button className="btn-icon" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y" style={{ opacity:canRedo?1:0.3 }}>↪</button>
        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 4px' }} />
        <label className="btn-icon" title="動画追加" style={{ cursor:'pointer' }}><input type="file" accept="video/*" multiple style={{ display:'none' }} onChange={e=>onAddVideo(Array.from(e.target.files))} />🎬</label>
        <label className="btn-icon" title="音声追加" style={{ cursor:'pointer' }}><input type="file" accept="audio/*" multiple style={{ display:'none' }} onChange={e=>onAddAudio(Array.from(e.target.files))} />♪</label>
        <label className="btn-icon" title="画像追加" style={{ cursor:'pointer' }}><input type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e=>onAddImage(Array.from(e.target.files))} />🖼</label>
        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 4px' }} />
        <button className="btn-icon" onClick={() => onZoom(z=>Math.max(z/1.4,20))} title="ズームアウト (Ctrl-)">−</button>
        <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-2)', minWidth:36, textAlign:'center' }}>{Math.round(zoom)}px</span>
        <button className="btn-icon" onClick={() => onZoom(z=>Math.min(z*1.4,400))} title="ズームイン (Ctrl+)">+</button>
      </div>

      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        {loaded && <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--green)', background:'rgba(46,204,113,0.1)', border:'1px solid rgba(46,204,113,0.2)', borderRadius:2, padding:'2px 6px', flexShrink:0 }}>WASM</span>}
        {!loaded && <button className="btn btn-ghost" onClick={onLoad} disabled={loading} style={{ fontSize:11 }}>{loading ? <><span className="anim-spin">⟳</span> 読込中</> : '⚡ FFmpeg'}</button>}
        {loaded && clipsCount > 0 && (
          <button className="btn btn-accent" onClick={onExport} disabled={processing} style={{ fontSize:11 }}>
            {processing ? <><span className="anim-spin">⟳</span>{progress}%</> : '⚙ 出力'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PlaybackBar ───────────────────────────────────────────────
function PlaybackBar({ isPlaying, onTogglePlay, currentTime, totalDuration, onSeek, onSplit, volume, onVolume, isMuted, onToggleMute, speed, onSpeed, hasClip }) {
  const pct = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0
  return (
    <div style={{ padding:'6px 12px', background:'var(--bg-1)', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
      {/* Play/pause */}
      <button onClick={onTogglePlay} disabled={!hasClip} style={{ width:30, height:30, borderRadius:'50%', background:hasClip?'var(--accent)':'var(--bg-3)', color:hasClip?'#000':'var(--text-2)', fontSize:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Split */}
      <button className="btn-icon" onClick={onSplit} title="分割 (S)" disabled={!hasClip} style={{ opacity:hasClip?1:0.4 }}>✂</button>

      {/* Seek bar */}
      <div style={{ flex:1, height:4, background:'var(--bg-4)', borderRadius:2, cursor:'pointer', position:'relative' }}
        onClick={e => { const r=e.currentTarget.getBoundingClientRect(); onSeek((e.clientX-r.left)/r.width*totalDuration) }}>
        <div style={{ height:'100%', width:`${pct}%`, background:'var(--accent)', borderRadius:2, pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'50%', left:`${pct}%`, transform:'translate(-50%,-50%)', width:10, height:10, borderRadius:'50%', background:'var(--accent)', pointerEvents:'none' }} />
      </div>

      {/* Time */}
      <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--text-1)', flexShrink:0, minWidth:80 }}>{fmt(currentTime)} / {fmt(totalDuration)}</span>

      {/* Mute + Volume */}
      <button className="btn-icon" onClick={onToggleMute} title="ミュート (M)" style={{ fontSize:12 }}>{isMuted ? '🔇' : '🔊'}</button>
      <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={e => onVolume(+e.target.value)} style={{ width:60 }} />

      {/* Speed */}
      <select value={speed} onChange={e => onSpeed(+e.target.value)} style={{ fontSize:11, padding:'2px 4px', width:62 }}>
        {[0.25,0.5,0.75,1,1.25,1.5,2].map(s => <option key={s} value={s}>{s}x</option>)}
      </select>
    </div>
  )
}

// ── MultiTrackTimeline ────────────────────────────────────────
function MultiTrackTimeline({ clips, setClips, texts, setTexts, images, setImages, audioTracks, setAudioTracks, activeClipId, setActiveClipId, currentTime, totalDuration, onSeek, zoom, selectedItem, setSelectedItem, onAddVideo, onAddAudio, onAddImage, saveHistory }) {
  const scrollRef = useRef(null)
  const rulerTicks = Math.ceil(totalDuration) + 2

  // ── Wheel → horizontal scroll ──────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e) => {
      e.preventDefault()
      el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── Auto-scroll playhead into view ────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const x = LABEL_W + currentTime * zoom
    const viewLeft = el.scrollLeft
    const viewRight = viewLeft + el.clientWidth
    if (x > viewRight - 60) el.scrollLeft = x - el.clientWidth + 120
    else if (x < viewLeft + LABEL_W + 10) el.scrollLeft = Math.max(0, x - LABEL_W - 20)
  }, [currentTime, zoom])

  // ── Seek on ruler/track click ──────────────────────────────
  const handleRulerClick = (e) => {
    if (!scrollRef.current) return
    const rect = scrollRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + scrollRef.current.scrollLeft - LABEL_W
    onSeek(Math.max(0, x / zoom))
  }

  // ── Drag item (grab from exact position) ──────────────────
  const startDrag = (e, type, id, field, itemStartTime) => {
    e.stopPropagation()
    e.preventDefault()
    const el = scrollRef.current
    const rect = el?.getBoundingClientRect()
    // How far into the item did the user click?
    const clickX = e.clientX - (rect?.left || 0) + (el?.scrollLeft || 0) - LABEL_W
    const grabOffset = clickX - itemStartTime * zoom

    const onMove = (me) => {
      const mx = me.clientX - (rect?.left || 0) + (el?.scrollLeft || 0) - LABEL_W
      const newVal = Math.max(0, (mx - grabOffset) / zoom)
      const upd = (setter) => setter(p => p.map(item => item.id===id ? {...item, [field]: newVal} : item))
      if (type==='clip') upd(setClips)
      if (type==='text') upd(setTexts)
      if (type==='image') upd(setImages)
      if (type==='audio') upd(setAudioTracks)
    }
    const onUp = () => { saveHistory(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Resize item (right edge) ───────────────────────────────
  const startResize = (e, type, id, field) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const getItem = () => {
      if (type==='text') return texts.find(t=>t.id===id)
      if (type==='image') return images.find(i=>i.id===id)
      if (type==='audio') return audioTracks.find(a=>a.id===id)
      if (type==='clip') return clips.find(c=>c.id===id)
    }
    const origVal = getItem()?.[field] || 0
    const onMove = (me) => {
      const newVal = Math.max(0.1, origVal + (me.clientX - startX) / zoom)
      const upd = (setter) => setter(p => p.map(item => item.id===id ? {...item, [field]: newVal} : item))
      if (type==='text') upd(setTexts)
      if (type==='image') upd(setImages)
      if (type==='audio') upd(setAudioTracks)
      if (type==='clip') upd(setClips)
    }
    const onUp = () => { saveHistory(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const playheadX = LABEL_W + currentTime * zoom
  const canvasW = Math.max((totalDuration + 5) * zoom + LABEL_W + 100, 800)

  return (
    <div style={{ background:'var(--bg-0)', borderTop:'1px solid var(--border)', flexShrink:0, height:220, display:'flex', flexDirection:'column' }}>
      <div ref={scrollRef} style={{ overflowX:'auto', overflowY:'auto', flex:1, position:'relative', cursor:'crosshair' }}>
        <div style={{ width:canvasW, minHeight:'100%', position:'relative' }}>

          {/* Time ruler */}
          <div onClick={handleRulerClick} style={{ height:20, position:'sticky', top:0, background:'var(--bg-1)', borderBottom:'1px solid var(--border)', zIndex:20, display:'flex', cursor:'pointer' }}>
            <div style={{ width:LABEL_W, flexShrink:0, borderRight:'1px solid var(--border)' }} />
            <div style={{ flex:1, position:'relative' }}>
              {Array.from({length:rulerTicks}).map((_,i) => (
                <div key={i} style={{ position:'absolute', left:i*zoom, top:0, bottom:0, borderLeft:'1px solid var(--border-hi)', paddingLeft:3, display:'flex', alignItems:'center' }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--text-2)', userSelect:'none' }}>{fmt(i)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Track: Video */}
          <TrackRow label="動画" color="var(--blue)" onAdd={onAddVideo} accept="video/*">
            {clips.map((clip, idx) => {
              const left = LABEL_W + clip.startTime * zoom + clips.slice(0,idx).reduce((s,c)=>s+(c.trimEnd-c.trimStart),0)*zoom
              const w = Math.max((clip.trimEnd - clip.trimStart) * zoom, 4)
              const isSel = selectedItem?.id === clip.id
              return (
                <TrackItem key={clip.id} left={left} width={w} color="var(--blue)" selected={isSel}
                  label={clip.name} thumbnail={clip.thumbnail}
                  onMouseDown={e => { setSelectedItem({type:'clip',id:clip.id}); setActiveClipId(clip.id); startDrag(e,'clip',clip.id,'startTime', clip.startTime) }}
                  onResizeRight={e => startResize(e,'clip',clip.id,'trimEnd')}
                  onDelete={() => { saveHistory(); setClips(p=>p.filter(c=>c.id!==clip.id)) }}
                />
              )
            })}
          </TrackRow>

          {/* Track: Text */}
          <TrackRow label="字幕" color="var(--accent)" onAdd={() => { saveHistory(); setTexts(p=>[...p,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+3}]) }}>
            {texts.map(t => {
              const left = LABEL_W + t.startTime * zoom
              const w = Math.max((t.endTime - t.startTime) * zoom, 20)
              return (
                <TrackItem key={t.id} left={left} width={w} color="var(--accent)" selected={selectedItem?.id===t.id}
                  label={t.content || '(空)'}
                  onMouseDown={e => { setSelectedItem({type:'text',id:t.id}); setActiveTab_cb('text'); startDrag(e,'text',t.id,'startTime', t.startTime) }}
                  onResizeRight={e => startResize(e,'text',t.id,'endTime')}
                  onDelete={() => { saveHistory(); setTexts(p=>p.filter(x=>x.id!==t.id)) }}
                />
              )
            })}
          </TrackRow>

          {/* Track: Image */}
          <TrackRow label="画像" color="var(--orange)" onAdd={onAddImage} accept="image/*">
            {images.map(img => {
              const left = LABEL_W + img.startTime * zoom
              const w = Math.max((img.endTime - img.startTime) * zoom, 20)
              return (
                <TrackItem key={img.id} left={left} width={w} color="var(--orange)" selected={selectedItem?.id===img.id}
                  label={img.name} thumbnail={img.url}
                  onMouseDown={e => { setSelectedItem({type:'image',id:img.id}); startDrag(e,'image',img.id,'startTime', img.startTime) }}
                  onResizeRight={e => startResize(e,'image',img.id,'endTime')}
                  onDelete={() => { saveHistory(); setImages(p=>p.filter(x=>x.id!==img.id)) }}
                />
              )
            })}
          </TrackRow>

          {/* Track: Audio */}
          <TrackRow label="音声" color="var(--green)" onAdd={onAddAudio} accept="audio/*">
            {audioTracks.map(track => {
              const left = LABEL_W + (track.startTime||0) * zoom
              const w = Math.max((track.duration||10) * zoom, 40)
              return (
                <TrackItem key={track.id} left={left} width={w} color="var(--green)" selected={selectedItem?.id===track.id}
                  label={'♪ '+track.name}
                  onMouseDown={e => { setSelectedItem({type:'audio',id:track.id}); startDrag(e,'audio',track.id,'startTime', track.startTime||0) }}
                  onResizeRight={e => startResize(e,'audio',track.id,'duration')}
                  onDelete={() => { saveHistory(); setAudioTracks(p=>p.filter(x=>x.id!==track.id)) }}
                />
              )
            })}
          </TrackRow>

          {/* Playhead */}
          <div style={{ position:'absolute', top:0, bottom:0, left:playheadX, width:2, background:'var(--accent)', pointerEvents:'none', zIndex:30, borderRadius:1 }}>
            <div style={{ width:10, height:10, background:'var(--accent)', borderRadius:'50%', marginLeft:-4, marginTop:20 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Dummy for tab switch from timeline (can't pass setActiveTab directly due to scope)
let setActiveTab_cb = () => {}

function TrackRow({ label, color, children, onAdd, accept }) {
  return (
    <div style={{ display:'flex', height:TRACK_H, borderBottom:'1px solid var(--border)', position:'relative' }}>
      <div style={{ width:LABEL_W, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:8, paddingRight:4, borderRight:'1px solid var(--border)', background:'var(--bg-1)', position:'sticky', left:0, zIndex:10 }}>
        <span style={{ fontSize:10, color, fontWeight:700 }}>{label}</span>
        {accept ? (
          <label style={{ cursor:'pointer', width:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:3, background:'rgba(255,255,255,0.06)', color:'var(--text-2)', fontSize:12 }}>
            <input type="file" accept={accept} multiple style={{ display:'none' }} onChange={e => onAdd(Array.from(e.target.files))} />+
          </label>
        ) : (
          <button onClick={onAdd} style={{ width:16, height:16, borderRadius:3, background:'rgba(255,255,255,0.06)', color:'var(--text-2)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
        )}
      </div>
      <div style={{ flex:1, position:'relative' }}>{children}</div>
    </div>
  )
}

function TrackItem({ left, width, color, selected, label, thumbnail, onMouseDown, onResizeRight, onDelete }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ position:'absolute', left, top:3, height:TRACK_H-6, width, borderRadius:4, border:`1.5px solid ${selected?color:'rgba(255,255,255,0.15)'}`, background:selected?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.05)', cursor:'grab', overflow:'hidden', display:'flex', alignItems:'center', userSelect:'none' }}
    >
      {thumbnail && <img src={thumbnail} alt="" draggable={false} style={{ height:'100%', width:'auto', opacity:0.4, flexShrink:0, pointerEvents:'none' }} />}
      <span style={{ fontFamily:'var(--mono)', fontSize:9, color, padding:'0 5px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1, pointerEvents:'none' }}>{label}</span>
      {/* Right resize handle */}
      <div onMouseDown={onResizeRight} style={{ position:'absolute', right:0, top:0, bottom:0, width:8, cursor:'ew-resize', background:'rgba(255,255,255,0.12)', borderRadius:'0 4px 4px 0' }} />
      {/* Delete */}
      <button onMouseDown={e=>e.stopPropagation()} onClick={onDelete} style={{ position:'absolute', top:2, right:10, width:13, height:13, borderRadius:'50%', background:'rgba(255,69,96,0.8)', color:'#fff', fontSize:8, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5 }}>×</button>
    </div>
  )
}

// ── ClipsPanel ────────────────────────────────────────────────
function ClipsPanel({ clips, activeClipId, onSelect, onRemove, onAdd, onUpdate, selClip }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="anim-fade">
      <SectionHeader title="動画クリップ">
        <label className="btn btn-ghost" style={{ cursor:'pointer', padding:'3px 8px', fontSize:11 }}>
          <input type="file" accept="video/*" multiple style={{ display:'none' }} onChange={e=>onAdd(Array.from(e.target.files))} />+ 追加
        </label>
      </SectionHeader>
      {clips.length===0 && <Empty text="動画を追加してください" />}
      {clips.map(clip => (
        <div key={clip.id} onClick={()=>onSelect(clip.id)} style={{ display:'flex', gap:8, alignItems:'center', padding:'7px 9px', borderRadius:'var(--r)', background:activeClipId===clip.id?'var(--accent-bg)':'var(--bg-2)', border:`1px solid ${activeClipId===clip.id?'var(--accent)':'var(--border)'}`, cursor:'pointer' }}>
          {clip.thumbnail ? <img src={clip.thumbnail} alt="" style={{ width:46, height:26, objectFit:'cover', borderRadius:2, flexShrink:0 }} /> : <div style={{ width:46, height:26, background:'var(--bg-4)', borderRadius:2, flexShrink:0 }} />}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{clip.name}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--blue)' }}>{fmt(clip.trimEnd-clip.trimStart)} · {fmt(clip.duration)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();onRemove(clip.id)}} style={{ color:'var(--red)' }}>✕</button>
        </div>
      ))}
      {selClip && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <span className="label">IN / OUT ポイント</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
            <div><span className="label">開始 (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimStart.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimStart',+e.target.value)} style={{ width:'100%' }} /></div>
            <div><span className="label">終了 (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimEnd.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimEnd',+e.target.value)} style={{ width:'100%' }} /></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TextPanel ─────────────────────────────────────────────────
function TextPanel({ texts, setTexts, selectedId, setSelectedId, currentTime, saveHistory }) {
  const sel = texts.find(t=>t.id===selectedId)
  const upd = (k,v) => setTexts(p=>p.map(t=>t.id===selectedId?{...t,[k]:v}:t))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="anim-fade">
      <SectionHeader title="テキスト">
        <button className="btn btn-ghost" style={{ padding:'3px 8px', fontSize:11 }} onClick={()=>{ saveHistory(); const id=crypto.randomUUID(); setTexts(p=>[...p,{id,content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+5}]); setSelectedId(id) }}>+ 追加</button>
      </SectionHeader>
      {texts.map(t => (
        <div key={t.id} onClick={()=>setSelectedId(t.id)} style={{ padding:'7px 9px', borderRadius:'var(--r)', background:selectedId===t.id?'var(--accent-bg)':'var(--bg-2)', border:`1px solid ${selectedId===t.id?'var(--accent)':'var(--border)'}`, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ flex:1, fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.content||'(空)'}</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--text-2)', flexShrink:0 }}>{fmt(t.startTime)}→{fmt(t.endTime)}</span>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();saveHistory();setTexts(p=>p.filter(x=>x.id!==t.id));if(selectedId===t.id)setSelectedId(null)}} style={{ color:'var(--red)' }}>✕</button>
        </div>
      ))}
      {sel && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', flexDirection:'column', gap:9 }}>
          <textarea value={sel.content} onChange={e=>upd('content',e.target.value)} rows={2} style={{ width:'100%', resize:'none', fontFamily:'var(--font)', fontSize:12 }} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><span className="label">サイズ</span><input type="number" min={8} max={200} value={sel.fontSize} onChange={e=>upd('fontSize',+e.target.value)} style={{ width:'100%' }} /></div>
            <div><span className="label">カラー</span><div style={{ display:'flex', gap:4 }}><input type="color" value={sel.color} onChange={e=>upd('color',e.target.value)} style={{ width:28,height:26,padding:2 }} /><input value={sel.color} onChange={e=>upd('color',e.target.value)} style={{ flex:1,fontSize:11 }} /></div></div>
          </div>
          <Slider label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)} />
          <Slider label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{ width:'100%' }} /></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{ width:'100%' }} /></div>
          </div>
          <div style={{ position:'relative', background:'#000', borderRadius:4, aspectRatio:'16/9', overflow:'hidden', border:'1px solid var(--border)' }}>
            <div style={{ position:'absolute', left:`${sel.x}%`, top:`${sel.y}%`, transform:'translate(-50%,-50%)', fontSize:Math.max(8,sel.fontSize*0.22), color:sel.color, fontWeight:700, textShadow:'1px 1px 3px rgba(0,0,0,0.9)', maxWidth:'90%', textAlign:'center' }}>{sel.content||'テキスト'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ImagePanel ────────────────────────────────────────────────
function ImagePanel({ images, setImages, selectedId, setSelectedId, currentTime, saveHistory }) {
  const sel = images.find(i=>i.id===selectedId)
  const upd = (k,v) => setImages(p=>p.map(i=>i.id===selectedId?{...i,[k]:v}:i))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="anim-fade">
      <SectionHeader title="画像オーバーレイ">
        <label className="btn btn-ghost" style={{ cursor:'pointer', padding:'3px 8px', fontSize:11 }}>
          <input type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e=>{ saveHistory(); Array.from(e.target.files).forEach(async f=>{ const url=URL.createObjectURL(f); const id=crypto.randomUUID(); setImages(p=>[...p,{id,file:f,name:f.name,url,startTime:currentTime,endTime:currentTime+5,x:50,y:50,scale:40,opacity:1}]) }) }} />+ 追加
        </label>
      </SectionHeader>
      {images.length===0 && <Empty text="画像を追加してください" />}
      {images.map(img => (
        <div key={img.id} onClick={()=>setSelectedId(img.id)} style={{ display:'flex', gap:8, alignItems:'center', padding:'7px 9px', borderRadius:'var(--r)', background:selectedId===img.id?'var(--accent-bg)':'var(--bg-2)', border:`1px solid ${selectedId===img.id?'var(--accent)':'var(--border)'}`, cursor:'pointer' }}>
          <img src={img.url} alt="" style={{ width:46, height:26, objectFit:'cover', borderRadius:2, flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{img.name}</div>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--orange)' }}>{fmt(img.startTime)}→{fmt(img.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();saveHistory();setImages(p=>p.filter(x=>x.id!==img.id));if(selectedId===img.id)setSelectedId(null)}} style={{ color:'var(--red)' }}>✕</button>
        </div>
      ))}
      {sel && (
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', flexDirection:'column', gap:9 }}>
          <Slider label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)} />
          <Slider label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)} />
          <Slider label={`サイズ: ${sel.scale}%`} value={sel.scale} min={5} max={100} onChange={v=>upd('scale',v)} />
          <Slider label={`不透明度: ${Math.round(sel.opacity*100)}%`} value={sel.opacity} min={0} max={1} step={0.05} onChange={v=>upd('opacity',v)} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{ width:'100%' }} /></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{ width:'100%' }} /></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── FiltersPanel ──────────────────────────────────────────────
function FiltersPanel({ filters, onChange }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }} className="anim-fade">
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5 }}>
        {PRESETS.map(p => { const act=JSON.stringify(p.f)===JSON.stringify(filters); return <button key={p.name} onClick={()=>onChange(p.f)} style={{ padding:'5px 2px', fontSize:10, fontWeight:600, borderRadius:'var(--r)', background:act?'var(--accent-bg)':'var(--bg-3)', color:act?'var(--accent)':'var(--text-1)', border:`1px solid ${act?'var(--accent)':'var(--border)'}` }}>{p.name}</button> })}
      </div>
      <div className="divider" />
      <Slider label={`明るさ ${sdiff(filters.brightness)}%`} value={filters.brightness} min={0} max={2} step={0.05} onChange={v=>onChange({...filters,brightness:v})} />
      <Slider label={`コントラスト ${sdiff(filters.contrast)}%`} value={filters.contrast} min={0} max={3} step={0.05} onChange={v=>onChange({...filters,contrast:v})} />
      <Slider label={`彩度 ${sdiff(filters.saturation)}%`} value={filters.saturation} min={0} max={3} step={0.05} onChange={v=>onChange({...filters,saturation:v})} />
      <Slider label={`ブラー ${filters.blur}px`} value={filters.blur} min={0} max={10} step={0.5} onChange={v=>onChange({...filters,blur:v})} />
      <Slider label={`シャープ（疑似）`} value={0} min={0} max={1} step={0.1} onChange={()=>{}} />
      <div style={{ height:18, borderRadius:3, background:'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)', filter:`brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`, border:'1px solid var(--border)' }} />
    </div>
  )
}

// ── AudioPanel ────────────────────────────────────────────────
function AudioPanel({ audio, onChange, audioTracks, setAudioTracks, onAdd, saveHistory }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="anim-fade">
      <div style={{ padding:'10px 12px', background:'var(--bg-2)', borderRadius:'var(--r)', border:`1px solid ${audio.mute?'var(--red)':'var(--border)'}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontWeight:600, fontSize:12 }}>元音声ミュート</span>
          <Toggle value={audio.mute} onChange={v=>onChange({...audio,mute:v})} color="var(--red)" />
        </div>
        <Slider label={`元音量: ${Math.round(audio.volume*100)}%`} value={audio.volume} min={0} max={2} step={0.05} onChange={v=>onChange({...audio,volume:v})} />
      </div>

      <SectionHeader title="BGMトラック">
        <label className="btn btn-ghost" style={{ cursor:'pointer', padding:'3px 8px', fontSize:11 }}>
          <input type="file" accept="audio/*" multiple style={{ display:'none' }} onChange={e=>onAdd(Array.from(e.target.files))} />+ 追加
        </label>
      </SectionHeader>

      {audioTracks.length===0 && <Empty text="音声ファイルを追加" />}
      {audioTracks.map(t => (
        <div key={t.id} style={{ padding:'8px 10px', background:'var(--bg-2)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <span style={{ fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, color:'var(--green)' }}>♪ {t.name}</span>
            <button className="btn-icon" onClick={()=>{saveHistory();setAudioTracks(p=>p.filter(x=>x.id!==t.id))}} style={{ color:'var(--red)' }}>✕</button>
          </div>
          <Slider label={`音量: ${Math.round((t.volume||0.8)*100)}%`} value={t.volume||0.8} min={0} max={1} step={0.05} onChange={v=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,volume:v}:x))} />
          <div style={{ marginTop:6 }}>
            <span className="label">開始位置 (秒)</span>
            <input type="number" min={0} step={0.1} value={t.startTime||0} onChange={e=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,startTime:+e.target.value}:x))} style={{ width:'100%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── ExportPanel ───────────────────────────────────────────────
function ExportPanel({ loaded, loading, onLoad, processing, progress, onExport, outputBlob, onDownload, clipsCount }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }} className="anim-fade">
      <div style={{ padding:'10px 12px', background:'var(--bg-2)', borderRadius:'var(--r)', border:`1px solid ${loaded?'var(--green)':'var(--border)'}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:loaded?'var(--green)':loading?'#ffcc00':'var(--text-2)', boxShadow:loaded?'0 0 6px var(--green)':'none' }} />
          <span style={{ fontSize:12, fontWeight:600 }}>{loaded?'FFmpeg 準備完了':loading?'読み込み中...':'FFmpeg 未読込'}</span>
        </div>
        {!loaded&&!loading&&<button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center', marginTop:6 }} onClick={onLoad}>⚡ 読み込む</button>}
        {loading&&<div style={{ height:3, background:'var(--bg-4)', borderRadius:2, marginTop:8, overflow:'hidden' }}><div style={{ height:'100%', width:'50%', background:'#ffcc00', animation:'indeterminate 1.5s ease-in-out infinite' }} /></div>}
      </div>

      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text-2)', lineHeight:1.8, padding:'8px 10px', background:'var(--bg-2)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
        <div style={{ color:'var(--text-1)', fontWeight:500, marginBottom:4 }}>出力仕様</div>
        <div>MP4 / H.264 + AAC 128k</div>
        <div>プリセット: ultrafast</div>
        <div>クリップ数: {clipsCount}</div>
      </div>

      {processing&&(
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:11 }}>処理中...</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--accent)' }}>{progress}%</span>
          </div>
          <div style={{ height:5, background:'var(--bg-4)', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${progress}%`, background:'var(--accent)', transition:'width 0.3s' }} />
          </div>
        </div>
      )}

      <button className="btn btn-accent" style={{ width:'100%', justifyContent:'center', padding:'10px' }} onClick={onExport} disabled={!loaded||processing||clipsCount===0}>
        {processing?<><span className="anim-spin">⟳</span>{progress}%</>:'⚙ エクスポート'}
      </button>

      {outputBlob&&!processing&&(
        <div className="anim-fade">
          <div style={{ padding:'10px 12px', background:'rgba(46,204,113,0.08)', border:'1px solid var(--green)', borderRadius:'var(--r)', marginBottom:8 }}>
            <div style={{ color:'var(--green)', fontWeight:600, fontSize:12 }}>✓ 完了 — {(outputBlob.size/1024/1024).toFixed(2)} MB</div>
          </div>
          <button className="btn btn-ghost" style={{ width:'100%', justifyContent:'center' }} onClick={onDownload}>↓ ダウンロード (.mp4)</button>
        </div>
      )}
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────
function SectionHeader({ title, children }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
      <span style={{ fontWeight:700, fontSize:11, color:'var(--text-1)', textTransform:'uppercase', letterSpacing:'0.04em' }}>{title}</span>
      {children}
    </div>
  )
}
function Slider({ label, value, min, max, step=0.01, onChange }) {
  return <div><span className="label">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} /></div>
}
function Toggle({ value, onChange, color='var(--accent)' }) {
  return <button onClick={()=>onChange(!value)} style={{ width:38, height:20, borderRadius:10, background:value?color:'var(--bg-4)', border:`1px solid ${value?color:'var(--border)'}`, position:'relative', cursor:'pointer' }}><div style={{ position:'absolute', top:2, left:value?20:2, width:14, height:14, borderRadius:'50%', background:'#fff', transition:'left 0.15s' }} /></button>
}
function Empty({ text }) {
  return <div style={{ textAlign:'center', color:'var(--text-2)', fontFamily:'var(--mono)', fontSize:10, padding:'6px 0' }}>{text}</div>
}

// ── Utils ─────────────────────────────────────────────────────
function fmt(s) {
  if (!s||isNaN(s)) return '0:00'
  const m=Math.floor(s/60), sec=Math.floor(s%60)
  return `${m}:${sec.toString().padStart(2,'0')}`
}
function sdiff(v) { const d=Math.round((v-1)*100); return d>=0?`+${d}`:`${d}` }

function getVideoDuration(url) {
  return new Promise(r=>{ const v=document.createElement('video'); v.src=url; v.onloadedmetadata=()=>r(v.duration); v.onerror=()=>r(0) })
}
function getAudioDuration(url) {
  return new Promise(r=>{ const a=new Audio(); a.src=url; a.onloadedmetadata=()=>r(a.duration); a.onerror=()=>r(60) })
}
function getVideoThumbnail(url) {
  return new Promise(r=>{
    const v=document.createElement('video'),c=document.createElement('canvas')
    c.width=80;c.height=45;v.src=url;v.currentTime=0.5
    v.onseeked=()=>{ c.getContext('2d').drawImage(v,0,0,80,45); r(c.toDataURL('image/jpeg',0.6)) }
    v.onerror=()=>r(null)
  })
}
