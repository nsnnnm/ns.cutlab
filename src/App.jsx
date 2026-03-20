import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'

// ── Constants ────────────────────────────────────────────────
const TABS = [
  { id:'clips', label:'クリップ', icon:'🎬' },
  { id:'text',  label:'テキスト', icon:'T'  },
  { id:'image', label:'画像',     icon:'🖼' },
  { id:'filters',label:'フィルター',icon:'◑'},
  { id:'audio', label:'音声',     icon:'♪' },
  { id:'export',label:'出力',     icon:'⚙' },
]
const PRESETS = [
  { name:'なし',   f:{brightness:1,   contrast:1,    saturation:1,   blur:0} },
  { name:'Vivid',  f:{brightness:1.1, contrast:1.2,  saturation:1.5, blur:0} },
  { name:'Cinema', f:{brightness:0.9, contrast:1.3,  saturation:0.7, blur:0} },
  { name:'B&W',    f:{brightness:1,   contrast:1.1,  saturation:0,   blur:0} },
  { name:'Fade',   f:{brightness:1.1, contrast:0.85, saturation:0.6, blur:0} },
  { name:'Warm',   f:{brightness:1.05,contrast:1.1,  saturation:1.3, blur:0} },
  { name:'Cool',   f:{brightness:0.95,contrast:1.05, saturation:0.8, blur:0} },
  { name:'Dreamy', f:{brightness:1.1, contrast:0.9,  saturation:1.1, blur:1.5}},
]
const TH = 44       // track height
const LW = 60       // label width
const DEF_FILTERS = {brightness:1,contrast:1,saturation:1,blur:0}
const DEF_AUDIO   = {mute:false,volume:1}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const [clips,       setClips]       = useState([])
  const [texts,       setTexts]       = useState([])
  const [images,      setImages]      = useState([])
  const [audioTracks, setAudioTracks] = useState([])
  const [filters,     setFilters]     = useState(DEF_FILTERS)
  const [audioSettings,setAudioSettings]=useState(DEF_AUDIO)
  const [activeClipId,setActiveClipId]= useState(null)
  const [selItem,     setSelItem]     = useState(null)
  const [activeTab,   setActiveTab]   = useState('clips')
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [outputBlob,  setOutputBlob]  = useState(null)
  const [processing,  setProcessing]  = useState(false)
  const [zoom,        setZoom]        = useState(80)
  const [volume,      setVolume]      = useState(1)
  const [isMuted,     setIsMuted]     = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [history,     setHistory]     = useState([])
  const [future,      setFuture]      = useState([])
  const [ctxMenu,     setCtxMenu]     = useState(null)
  const [exportSettings, setExportSettings] = useState({
    preset: 'ultrafast', crf: 23, scale: 1, audioBitrate: '128k'
  })

  const videoRef  = useRef(null)
  const audioRefs = useRef({})
  const { load, loaded, loading, progress, eta, processVideo } = useFFmpeg()

  const activeClip    = clips.find(c=>c.id===activeClipId)||clips[0]
  const totalDuration = useMemo(()=>clips.reduce((s,c)=>s+(c.trimEnd-c.trimStart),0),[clips])

  // ── History ───────────────────────────────────────────────
  const snap = useCallback(()=>{
    setHistory(h=>[...h.slice(-30),{clips,texts,images,audioTracks}])
    setFuture([])
  },[clips,texts,images,audioTracks])

  const undo = useCallback(()=>{
    if(!history.length) return
    const p=history[history.length-1]
    setFuture(f=>[{clips,texts,images,audioTracks},...f])
    setHistory(h=>h.slice(0,-1))
    setClips(p.clips);setTexts(p.texts);setImages(p.images);setAudioTracks(p.audioTracks)
  },[history,clips,texts,images,audioTracks])

  const redo = useCallback(()=>{
    if(!future.length) return
    const n=future[0]
    setHistory(h=>[...h,{clips,texts,images,audioTracks}])
    setFuture(f=>f.slice(1))
    setClips(n.clips);setTexts(n.texts);setImages(n.images);setAudioTracks(n.audioTracks)
  },[future,clips,texts,images,audioTracks])

  // ── Keyboard ──────────────────────────────────────────────
  useEffect(()=>{
    const h=(e)=>{
      const tag=document.activeElement?.tagName
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return
      if(ctxMenu && e.key==='Escape'){ setCtxMenu(null); return }
      switch(e.code){
        case 'Space': e.preventDefault(); togglePlay(); break
        case 'ArrowLeft':  e.preventDefault(); seekDelta(e.shiftKey?-5:-1/30); break
        case 'ArrowRight': e.preventDefault(); seekDelta(e.shiftKey?5:1/30);  break
        case 'KeyZ': if(e.metaKey||e.ctrlKey){e.preventDefault();e.shiftKey?redo():undo()} break
        case 'KeyY': if(e.metaKey||e.ctrlKey){e.preventDefault();redo()} break
        case 'Delete': case 'Backspace': delSel(); break
        case 'KeyM': setIsMuted(m=>!m); break
        case 'KeyS': if(!e.metaKey&&!e.ctrlKey) splitClip(); break
        case 'Equal': if(e.metaKey||e.ctrlKey){e.preventDefault();setZoom(z=>Math.min(z*1.4,400))} break
        case 'Minus': if(e.metaKey||e.ctrlKey){e.preventDefault();setZoom(z=>Math.max(z/1.4,20))} break
      }
    }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[isPlaying,totalDuration,selItem,ctxMenu])

  const seekDelta=(d)=>{
    const v=videoRef.current; if(!v) return
    seekTo(Math.max(0,Math.min(totalDuration,(v.currentTime||0)+d)))
  }
  const delSel=()=>{
    if(!selItem) return; snap()
    if(selItem.type==='clip')  setClips(p=>p.filter(c=>c.id!==selItem.id))
    if(selItem.type==='text')  setTexts(p=>p.filter(t=>t.id!==selItem.id))
    if(selItem.type==='image') setImages(p=>p.filter(i=>i.id!==selItem.id))
    if(selItem.type==='audio') setAudioTracks(p=>p.filter(a=>a.id!==selItem.id))
    setSelItem(null)
  }

  // ── BGM sync ──────────────────────────────────────────────
  useEffect(()=>{
    audioTracks.forEach(t=>{
      if(!audioRefs.current[t.id]){
        const a=new Audio(t.url); a.volume=t.volume??0.8
        audioRefs.current[t.id]=a
      } else audioRefs.current[t.id].volume=t.volume??0.8
    })
    Object.keys(audioRefs.current).forEach(id=>{
      if(!audioTracks.find(t=>t.id===id)){
        audioRefs.current[id].pause(); delete audioRefs.current[id]
      }
    })
  },[audioTracks])

  const syncBGM=useCallback((time,playing)=>{
    audioTracks.forEach(t=>{
      const el=audioRefs.current[t.id]; if(!el) return
      const rel=time-(t.startTime||0)
      if(rel>=0&&rel<(t.duration||999)){
        el.currentTime=rel
        if(playing) el.play().catch(()=>{})
        else el.pause()
      } else el.pause()
    })
  },[audioTracks])

  // ── Video events ──────────────────────────────────────────
  useEffect(()=>{
    const v=videoRef.current; if(!v) return
    v.volume=isMuted?0:volume; v.playbackRate=speed
  },[volume,isMuted,speed])

  useEffect(()=>{
    const v=videoRef.current; if(!v||!activeClip) return
    const onTime=()=>{
      setCurrentTime(v.currentTime)
      if(v.currentTime>=activeClip.trimEnd){
        v.pause(); v.currentTime=activeClip.trimStart
        setIsPlaying(false); syncBGM(activeClip.trimStart,false)
      }
    }
    v.addEventListener('timeupdate',onTime)
    return ()=>v.removeEventListener('timeupdate',onTime)
  },[activeClip,syncBGM])

  useEffect(()=>{
    const v=videoRef.current; if(!v||!activeClip) return
    v.src=activeClip.url; v.currentTime=activeClip.trimStart
    setCurrentTime(activeClip.trimStart); setIsPlaying(false)
    syncBGM(activeClip.trimStart,false)
  },[activeClipId])

  // ── Playback ──────────────────────────────────────────────
  const togglePlay=useCallback(()=>{
    const v=videoRef.current; if(!v||!activeClip) return
    if(isPlaying){ v.pause(); setIsPlaying(false); syncBGM(v.currentTime,false) }
    else{
      if(v.currentTime>=activeClip.trimEnd) v.currentTime=activeClip.trimStart
      v.play(); setIsPlaying(true); syncBGM(v.currentTime,true)
    }
  },[isPlaying,activeClip,syncBGM])

  const seekTo=useCallback((t)=>{
    const v=videoRef.current; if(!v) return
    const c=Math.max(0,Math.min(totalDuration,t))
    v.currentTime=c; setCurrentTime(c); syncBGM(c,isPlaying)
  },[totalDuration,isPlaying,syncBGM])

  // ── Import ────────────────────────────────────────────────
  const addVideoFiles=useCallback(async(files)=>{
    snap(); const nc=[]
    for(const f of files){
      if(!f.type.startsWith('video/')) continue
      const url=URL.createObjectURL(f)
      const ext=f.name.split('.').pop().toLowerCase()||'mp4'
      const id=crypto.randomUUID()
      const dur=await getVideoDuration(url)
      const thumb=await getVideoThumbnail(url)
      if(dur<=0) continue
      nc.push({id,file:f,ext,name:f.name,url,duration:dur,trimStart:0,trimEnd:dur,startTime:0,thumbnail:thumb,speed:1})
    }
    setClips(p=>{
      const n=[...p,...nc]
      if(!activeClipId&&n.length) setActiveClipId(n[0].id)
      return n
    })
  },[snap,activeClipId])

  const addAudioFiles=useCallback(async(files)=>{
    snap()
    for(const f of files){
      if(!f.type.startsWith('audio/')) continue
      const url=URL.createObjectURL(f)
      const ext=f.name.split('.').pop().toLowerCase()||'mp3'
      const id=crypto.randomUUID()
      const dur=await getAudioDuration(url)
      setAudioTracks(p=>[...p,{id,file:f,ext,name:f.name,url,duration:dur,startTime:0,volume:0.8}])
    }
  },[snap])

  const addImageFiles=useCallback(async(files)=>{
    snap()
    for(const f of files){
      if(!f.type.startsWith('image/')) continue
      const url=URL.createObjectURL(f)
      const id=crypto.randomUUID()
      setImages(p=>[...p,{id,file:f,name:f.name,url,startTime:0,endTime:5,x:50,y:50,scale:40,opacity:1}])
    }
  },[snap])

  const handleDrop=useCallback((e)=>{
    e.preventDefault()
    const fs=Array.from(e.dataTransfer.files)
    addVideoFiles(fs.filter(f=>f.type.startsWith('video/')))
    addAudioFiles(fs.filter(f=>f.type.startsWith('audio/')))
    addImageFiles(fs.filter(f=>f.type.startsWith('image/')))
  },[addVideoFiles,addAudioFiles,addImageFiles])

  // ── Split ─────────────────────────────────────────────────
  const splitClip=useCallback(()=>{
    if(!activeClip) return
    const t=currentTime
    if(t<=activeClip.trimStart+0.05||t>=activeClip.trimEnd-0.05) return
    snap()
    const nid=crypto.randomUUID()
    setClips(p=>{
      const i=p.findIndex(c=>c.id===activeClip.id)
      const u=p.map(c=>c.id===activeClip.id?{...c,trimEnd:t}:c)
      u.splice(i+1,0,{...activeClip,id:nid,trimStart:t})
      return u
    })
  },[activeClip,currentTime,snap])

  // ── Export ────────────────────────────────────────────────
  const handleExport=async()=>{
    if(!loaded||!clips.length) return
    setProcessing(true); setOutputBlob(null)
    try{
      const blob=await processVideo({clips,texts,filters,audioSettings,audioTracks,exportSettings})
      setOutputBlob(blob); setActiveTab('export')
    }catch(e){ console.error(e); alert('エクスポートエラー: '+e.message) }
    finally{ setProcessing(false) }
  }

  const selClip=selItem?.type==='clip'?clips.find(c=>c.id===selItem.id):null

  // ── Context menu builder ──────────────────────────────────
  const openCtxMenu=(e,items)=>{ e.preventDefault(); setCtxMenu({x:e.clientX,y:e.clientY,items}) }

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}
      onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
      onClick={()=>setCtxMenu(null)}
    >
      <AppHeader
        loaded={loaded} loading={loading} onLoad={load}
        processing={processing} progress={progress}
        onExport={handleExport} clipsCount={clips.length}
        onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
        onUndo={undo} onRedo={redo} canUndo={history.length>0} canRedo={future.length>0}
        zoom={zoom} onZoom={setZoom}
      />

      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
        {/* Left */}
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,borderRight:'1px solid var(--border)'}}>

          {/* Preview */}
          <div style={{flex:1,background:'#000',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',minHeight:0}}>
            {activeClip ? (
              <>
                <video ref={videoRef} style={{maxWidth:'100%',maxHeight:'100%'}} />
                <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
                  {texts.map(t=>{
                    if(!t.content||currentTime<t.startTime||currentTime>t.endTime) return null
                    return <div key={t.id} style={{position:'absolute',left:`${t.x}%`,top:`${t.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,t.fontSize*0.38),color:t.color,fontFamily:'var(--font)',fontWeight:700,textShadow:'1px 1px 4px rgba(0,0,0,0.9)',whiteSpace:'pre-wrap',textAlign:'center',maxWidth:'90%'}}>{t.content}</div>
                  })}
                  {images.map(img=>{
                    if(currentTime<img.startTime||currentTime>img.endTime) return null
                    return <img key={img.id} src={img.url} alt="" style={{position:'absolute',left:`${img.x}%`,top:`${img.y}%`,transform:'translate(-50%,-50%)',width:`${img.scale}%`,objectFit:'contain',opacity:img.opacity}} />
                  })}
                </div>
                <div style={{position:'absolute',bottom:8,right:10,fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,0.6)',background:'rgba(0,0,0,0.5)',padding:'2px 7px',borderRadius:3}}>{fmt(currentTime)} / {fmt(totalDuration)}</div>
              </>
            ):(
              <label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,cursor:'pointer',opacity:0.5}}>
                <input type="file" accept="video/*,audio/*,image/*" multiple style={{display:'none'}} onChange={e=>{const f=Array.from(e.target.files);addVideoFiles(f);addAudioFiles(f);addImageFiles(f)}} />
                <div style={{fontSize:52}}>🎬</div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontWeight:700,marginBottom:4}}>動画・音声・画像をドロップ</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text-2)'}}>MP4 · MOV · MP3 · JPG · PNG</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',marginTop:6}}>Space=再生　←→=移動　S=分割　Ctrl+Z=Undo</div>
                </div>
              </label>
            )}
          </div>

          {/* Playback bar */}
          <PlaybackBar
            isPlaying={isPlaying} onTogglePlay={togglePlay}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} onSplit={splitClip}
            volume={volume} onVolume={setVolume}
            isMuted={isMuted} onToggleMute={()=>setIsMuted(m=>!m)}
            speed={speed} onSpeed={setSpeed}
            hasClip={!!activeClip}
          />

          {/* Timeline */}
          <Timeline
            clips={clips} setClips={setClips}
            texts={texts} setTexts={setTexts}
            images={images} setImages={setImages}
            audioTracks={audioTracks} setAudioTracks={setAudioTracks}
            activeClipId={activeClipId} setActiveClipId={setActiveClipId}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} zoom={zoom}
            selItem={selItem} setSelItem={setSelItem}
            onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
            snap={snap} splitClip={splitClip}
            ctxMenu={ctxMenu} setCtxMenu={setCtxMenu}
            openCtxMenu={openCtxMenu}
            isPlaying={isPlaying}
          />
        </div>

        {/* Right panel */}
        <div style={{width:300,display:'flex',flexDirection:'column',background:'var(--bg-1)',flexShrink:0}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0}}>
            {TABS.map(tab=>(
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{flex:1,padding:'7px 2px',background:'transparent',color:activeTab===tab.id?'var(--accent)':'var(--text-2)',borderBottom:`2px solid ${activeTab===tab.id?'var(--accent)':'transparent'}`,fontSize:9,fontWeight:700,letterSpacing:'0.03em',textTransform:'uppercase',display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                <span style={{fontSize:12}}>{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            {activeTab==='clips'   && <ClipsPanel clips={clips} activeClipId={activeClipId} onSelect={id=>{setActiveClipId(id);setSelItem({type:'clip',id})}} onRemove={id=>{snap();setClips(p=>p.filter(c=>c.id!==id))}} onAdd={addVideoFiles} onUpdate={(id,k,v)=>setClips(p=>p.map(c=>c.id===id?{...c,[k]:v}:c))} selClip={selClip} />}
            {activeTab==='text'    && <TextPanel texts={texts} setTexts={setTexts} selectedId={selItem?.type==='text'?selItem.id:null} setSelectedId={id=>setSelItem(id?{type:'text',id}:null)} currentTime={currentTime} snap={snap} />}
            {activeTab==='image'   && <ImagePanel images={images} setImages={setImages} selectedId={selItem?.type==='image'?selItem.id:null} setSelectedId={id=>setSelItem(id?{type:'image',id}:null)} currentTime={currentTime} snap={snap} />}
            {activeTab==='filters' && <FiltersPanel filters={filters} onChange={setFilters} />}
            {activeTab==='audio'   && <AudioPanel audio={audioSettings} onChange={setAudioSettings} audioTracks={audioTracks} setAudioTracks={setAudioTracks} onAdd={addAudioFiles} snap={snap} />}
            {activeTab==='export'  && <ExportPanel loaded={loaded} loading={loading} onLoad={load} processing={processing} progress={progress} eta={eta} onExport={handleExport} outputBlob={outputBlob} onDownload={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(outputBlob);a.download=`cutlab_${Date.now()}.mp4`;a.click()}} clipsCount={clips.length} exportSettings={exportSettings} setExportSettings={setExportSettings} />}
          </div>
        </div>
      </div>

      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={()=>setCtxMenu(null)} />}
    </div>
  )
}

// ── AppHeader ─────────────────────────────────────────────────
function AppHeader({loaded,loading,onLoad,processing,progress,onExport,clipsCount,onAddVideo,onAddAudio,onAddImage,onUndo,onRedo,canUndo,canRedo,zoom,onZoom}){
  return(
    <div style={{height:46,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 14px',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',flexShrink:0,gap:8}}>
      <div style={{fontWeight:800,fontSize:17,letterSpacing:'-0.02em',flexShrink:0}}>
        <span style={{color:'var(--accent)'}}>CUT</span>LAB
      </div>
      <div style={{display:'flex',gap:4,alignItems:'center'}}>
        <button className="btn-icon" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z" style={{opacity:canUndo?1:0.3}}>↩</button>
        <button className="btn-icon" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y" style={{opacity:canRedo?1:0.3}}>↪</button>
        <div style={{width:1,height:20,background:'var(--border)',margin:'0 4px'}}/>
        <label className="btn-icon" title="動画追加" style={{cursor:'pointer'}}><input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAddVideo(Array.from(e.target.files))}/>🎬</label>
        <label className="btn-icon" title="音声追加" style={{cursor:'pointer'}}><input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAddAudio(Array.from(e.target.files))}/>♪</label>
        <label className="btn-icon" title="画像追加" style={{cursor:'pointer'}}><input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>onAddImage(Array.from(e.target.files))}/>🖼</label>
        <div style={{width:1,height:20,background:'var(--border)',margin:'0 4px'}}/>
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.max(z/1.4,20))} title="Ctrl-">−</button>
        <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',minWidth:36,textAlign:'center'}}>{Math.round(zoom)}px</span>
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.min(z*1.4,400))} title="Ctrl+">+</button>
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {loaded&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--green)',background:'rgba(46,204,113,0.1)',border:'1px solid rgba(46,204,113,0.2)',borderRadius:2,padding:'2px 6px',flexShrink:0}}>WASM</span>}
        {!loaded&&<button className="btn btn-ghost" onClick={onLoad} disabled={loading} style={{fontSize:11}}>{loading?<><span className="anim-spin">⟳</span>読込中</>:'⚡ FFmpeg'}</button>}
        {loaded&&clipsCount>0&&<button className="btn btn-accent" onClick={onExport} disabled={processing} style={{fontSize:11}}>{processing?<><span className="anim-spin">⟳</span>{progress}%</>:'⚙ 出力'}</button>}
      </div>
    </div>
  )
}

// ── PlaybackBar ───────────────────────────────────────────────
function PlaybackBar({isPlaying,onTogglePlay,currentTime,totalDuration,onSeek,onSplit,volume,onVolume,isMuted,onToggleMute,speed,onSpeed,hasClip}){
  const pct=totalDuration>0?(currentTime/totalDuration)*100:0
  const seekBarRef=useRef(null)

  const startSeekDrag=(e)=>{
    e.preventDefault()
    const seek=(ev)=>{
      const r=seekBarRef.current?.getBoundingClientRect(); if(!r) return
      const ratio=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))
      onSeek(ratio*totalDuration)
    }
    seek(e)
    const up=()=>{ window.removeEventListener('mousemove',seek); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',seek)
    window.addEventListener('mouseup',up)
  }

  return(
    <div style={{padding:'6px 12px',background:'var(--bg-1)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
      <button onClick={onTogglePlay} disabled={!hasClip} style={{width:30,height:30,borderRadius:'50%',background:hasClip?'var(--accent)':'var(--bg-3)',color:hasClip?'#000':'var(--text-2)',fontSize:11,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        {isPlaying?'⏸':'▶'}
      </button>
      <button className="btn-icon" onClick={onSplit} title="分割 (S)" disabled={!hasClip} style={{opacity:hasClip?1:0.4}}>✂</button>

      {/* Seekbar - draggable */}
      <div ref={seekBarRef} onMouseDown={startSeekDrag}
        style={{flex:1,height:6,background:'var(--bg-4)',borderRadius:3,cursor:'pointer',position:'relative',userSelect:'none'}}>
        <div style={{height:'100%',width:`${pct}%`,background:'var(--accent)',borderRadius:3,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'50%',left:`${pct}%`,transform:'translate(-50%,-50%)',width:12,height:12,borderRadius:'50%',background:'var(--accent)',pointerEvents:'none',boxShadow:'0 0 6px rgba(232,255,71,0.5)'}}/>
      </div>

      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-1)',flexShrink:0,minWidth:80}}>{fmt(currentTime)} / {fmt(totalDuration)}</span>
      <button className="btn-icon" onClick={onToggleMute} style={{fontSize:12}}>{isMuted?'🔇':'🔊'}</button>
      <input type="range" min={0} max={1} step={0.05} value={isMuted?0:volume} onChange={e=>onVolume(+e.target.value)} style={{width:56}}/>
      <select value={speed} onChange={e=>onSpeed(+e.target.value)} style={{fontSize:11,padding:'2px 4px',width:58}}>
        {[0.25,0.5,0.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}x</option>)}
      </select>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────
function Timeline({clips,setClips,texts,setTexts,images,setImages,audioTracks,setAudioTracks,activeClipId,setActiveClipId,currentTime,totalDuration,onSeek,zoom,selItem,setSelItem,onAddVideo,onAddAudio,onAddImage,snap,splitClip,ctxMenu,setCtxMenu,openCtxMenu,isPlaying}){
  const scrollRef=useRef(null)
  const isDraggingPlayhead=useRef(false)
  const rulerTicks=Math.ceil(totalDuration)+3
  const playheadX=LW+currentTime*zoom
  const canvasW=Math.max((totalDuration+5)*zoom+LW+100,800)

  // Wheel → horizontal scroll
  useEffect(()=>{
    const el=scrollRef.current; if(!el) return
    const fn=(e)=>{ e.preventDefault(); el.scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY }
    el.addEventListener('wheel',fn,{passive:false})
    return ()=>el.removeEventListener('wheel',fn)
  },[])

  // Auto-scroll playhead into view
  useEffect(()=>{
    const el=scrollRef.current; if(!el) return
    const x=LW+currentTime*zoom
    const vl=el.scrollLeft, vr=vl+el.clientWidth
    if(x>vr-60) el.scrollLeft=x-el.clientWidth+120
    else if(x<vl+LW+10) el.scrollLeft=Math.max(0,x-LW-20)
  },[currentTime,zoom])

  // Playhead drag
  const startPlayheadDrag=(e)=>{
    e.preventDefault(); e.stopPropagation()
    isDraggingPlayhead.current=true
    const el=scrollRef.current
    const seek=(ev)=>{
      const rect=el.getBoundingClientRect()
      const x=ev.clientX-rect.left+el.scrollLeft-LW
      onSeek(Math.max(0,x/zoom))
    }
    seek(e)
    const up=()=>{ isDraggingPlayhead.current=false; window.removeEventListener('mousemove',seek); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',seek)
    window.addEventListener('mouseup',up)
  }

  // Ruler click/drag → seek
  const onRulerDown=(e)=>{
    if(e.button!==0) return
    e.preventDefault()
    const el=scrollRef.current
    const seek=(ev)=>{
      const rect=el.getBoundingClientRect()
      const x=ev.clientX-rect.left+el.scrollLeft-LW
      onSeek(Math.max(0,x/zoom))
    }
    seek(e)
    const up=()=>{ window.removeEventListener('mousemove',seek); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',seek)
    window.addEventListener('mouseup',up)
  }

  // Timeline right-click (empty area)
  const onTimelineCtx=(e)=>{
    e.preventDefault()
    const el=scrollRef.current; if(!el) return
    const rect=el.getBoundingClientRect()
    const x=e.clientX-rect.left+el.scrollLeft-LW
    const t=Math.max(0,x/zoom)
    openCtxMenu(e,[
      {icon:'▶', label:'ここから再生',    action:()=>onSeek(t)},
      {icon:'✂', label:'ここで分割',      action:()=>{ onSeek(t); setTimeout(splitClip,50) }},
      '---',
      {icon:'T', label:'字幕をここに追加', action:()=>setTexts(p=>[...p,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:t,endTime:t+3}])},
      {icon:'🖼',label:'画像をここに追加', action:()=>document.getElementById('tl-add-img')?.click()},
      {icon:'♪', label:'音声をここに追加', action:()=>document.getElementById('tl-add-aud')?.click()},
      '---',
      {icon:'🎬',label:'動画を追加',       action:()=>document.getElementById('tl-add-vid')?.click()},
    ])
  }

  // Item drag (grab offset)
  const startDrag=(e,type,id,field,itemStart)=>{
    e.stopPropagation(); e.preventDefault()
    const el=scrollRef.current
    const rect=el?.getBoundingClientRect()
    const clickX=e.clientX-(rect?.left||0)+el.scrollLeft-LW
    const grabOff=clickX-itemStart*zoom
    const move=(me)=>{
      const mx=me.clientX-(rect?.left||0)+el.scrollLeft-LW
      const v=Math.max(0,(mx-grabOff)/zoom)
      const upd=(s)=>s(p=>p.map(i=>i.id===id?{...i,[field]:v}:i))
      if(type==='clip')  upd(setClips)
      if(type==='text')  upd(setTexts)
      if(type==='image') upd(setImages)
      if(type==='audio') upd(setAudioTracks)
    }
    const up=()=>{ snap(); window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',move)
    window.addEventListener('mouseup',up)
  }

  // Right-edge resize
  const startResize=(e,type,id,field)=>{
    e.stopPropagation(); e.preventDefault()
    const sx=e.clientX
    const get=()=>{
      if(type==='clip')  return clips.find(c=>c.id===id)
      if(type==='text')  return texts.find(t=>t.id===id)
      if(type==='image') return images.find(i=>i.id===id)
      if(type==='audio') return audioTracks.find(a=>a.id===id)
    }
    const orig=get()?.[field]||0
    const move=(me)=>{
      const v=Math.max(0.1,orig+(me.clientX-sx)/zoom)
      const upd=(s)=>s(p=>p.map(i=>i.id===id?{...i,[field]:v}:i))
      if(type==='clip')  upd(setClips)
      if(type==='text')  upd(setTexts)
      if(type==='image') upd(setImages)
      if(type==='audio') upd(setAudioTracks)
    }
    const up=()=>{ snap(); window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up) }
    window.addEventListener('mousemove',move)
    window.addEventListener('mouseup',up)
  }

  // Context menu for clip
  const clipCtx=(e,clip)=>{
    openCtxMenu(e,[
      {icon:'✂', label:'ここで分割',          shortcut:'S',   action:()=>{ onSeek(currentTime); splitClip() }},
      {icon:'⬅', label:'IN点を現在地に',                       action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,trimStart:currentTime}:c))},
      {icon:'➡', label:'OUT点を現在地に',                      action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,trimEnd:currentTime}:c))},
      '---',
      {icon:'📋', label:'複製',                                action:()=>{ snap(); setClips(p=>{const i=p.findIndex(c=>c.id===clip.id);const n=[...p];n.splice(i+1,0,{...clip,id:crypto.randomUUID()});return n}) }},
      {icon:'🔇', label:clip.muted?'ミュート解除':'ミュート',   action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,muted:!c.muted}:c))},
      '---',
      {icon:'🗑', label:'削除', shortcut:'Del', danger:true,   action:()=>{ snap(); setClips(p=>p.filter(c=>c.id!==clip.id)) }},
    ])
  }
  const textCtx=(e,t)=>{
    openCtxMenu(e,[
      {icon:'⏱', label:'開始点を現在地に', action:()=>setTexts(p=>p.map(x=>x.id===t.id?{...x,startTime:currentTime}:x))},
      {icon:'⏱', label:'終了点を現在地に', action:()=>setTexts(p=>p.map(x=>x.id===t.id?{...x,endTime:currentTime}:x))},
      {icon:'📋', label:'複製',            action:()=>{ snap(); setTexts(p=>[...p,{...t,id:crypto.randomUUID(),startTime:t.startTime+0.5}]) }},
      '---',
      {icon:'🗑', label:'削除', danger:true, action:()=>{ snap(); setTexts(p=>p.filter(x=>x.id!==t.id)) }},
    ])
  }
  const imgCtx=(e,img)=>{
    openCtxMenu(e,[
      {icon:'⏱', label:'開始点を現在地に', action:()=>setImages(p=>p.map(x=>x.id===img.id?{...x,startTime:currentTime}:x))},
      {icon:'⏱', label:'終了点を現在地に', action:()=>setImages(p=>p.map(x=>x.id===img.id?{...x,endTime:currentTime}:x))},
      {icon:'📋', label:'複製',            action:()=>{ snap(); setImages(p=>[...p,{...img,id:crypto.randomUUID()}]) }},
      '---',
      {icon:'🗑', label:'削除', danger:true, action:()=>{ snap(); setImages(p=>p.filter(x=>x.id!==img.id)) }},
    ])
  }
  const audCtx=(e,track)=>{
    openCtxMenu(e,[
      {icon:'⏱', label:'開始点を現在地に', action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,startTime:currentTime}:x))},
      {icon:'🔊', label:'音量 +10%',       action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,volume:Math.min(1,(x.volume||0.8)+0.1)}:x))},
      {icon:'🔉', label:'音量 -10%',       action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,volume:Math.max(0,(x.volume||0.8)-0.1)}:x))},
      {icon:'📋', label:'複製',            action:()=>{ snap(); setAudioTracks(p=>[...p,{...track,id:crypto.randomUUID()}]) }},
      '---',
      {icon:'🗑', label:'削除', danger:true, action:()=>{ snap(); setAudioTracks(p=>p.filter(x=>x.id!==track.id)) }},
    ])
  }

  return(
    <div style={{background:'var(--bg-0)',borderTop:'1px solid var(--border)',flexShrink:0,height:230,display:'flex',flexDirection:'column'}}>
      {/* Hidden file inputs for timeline right-click */}
      <label style={{display:'none'}}><input id="tl-add-vid" type="file" accept="video/*" multiple onChange={e=>onAddVideo(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-add-aud" type="file" accept="audio/*" multiple onChange={e=>onAddAudio(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-add-img" type="file" accept="image/*" multiple onChange={e=>onAddImage(Array.from(e.target.files))}/></label>

      <div ref={scrollRef} style={{overflowX:'auto',overflowY:'auto',flex:1,position:'relative'}}
        onContextMenu={onTimelineCtx}>
        <div style={{width:canvasW,minHeight:'100%',position:'relative'}}>

          {/* Ruler */}
          <div style={{height:22,position:'sticky',top:0,zIndex:20,display:'flex',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',userSelect:'none'}}>
            <div style={{width:LW,flexShrink:0,borderRight:'1px solid var(--border)',position:'sticky',left:0,background:'var(--bg-1)',zIndex:21,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--text-2)'}}>TIME</span>
            </div>
            <div style={{position:'relative',flex:1,cursor:'pointer'}} onMouseDown={onRulerDown}>
              {Array.from({length:rulerTicks}).map((_,i)=>(
                <div key={i} style={{position:'absolute',left:i*zoom,top:0,bottom:0,borderLeft:`1px solid ${i%5===0?'var(--border-hi)':'rgba(255,255,255,0.06)'}`,paddingLeft:3,display:'flex',alignItems:'center'}}>
                  {i%2===0&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:i%5===0?'var(--text-1)':'var(--text-2)'}}>{fmt(i)}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Track: Video */}
          <TRow label="動画" color="var(--blue)" onAdd={onAddVideo} accept="video/*">
            {clips.map((clip,idx)=>{
              const off=clips.slice(0,idx).reduce((s,c)=>s+(c.trimEnd-c.trimStart),0)
              const left=off*zoom, w=Math.max((clip.trimEnd-clip.trimStart)*zoom,4)
              return(
                <TItem key={clip.id} left={left} width={w} color="var(--blue)" selected={selItem?.id===clip.id}
                  label={clip.name} thumb={clip.thumbnail} muted={clip.muted}
                  onMouseDown={e=>{setSelItem({type:'clip',id:clip.id});setActiveClipId(clip.id);startDrag(e,'clip',clip.id,'startTime',off)}}
                  onResizeLeft={e=>startResize(e,'clip',clip.id,'trimStart')}
                  onResizeRight={e=>startResize(e,'clip',clip.id,'trimEnd')}
                  onDelete={()=>{snap();setClips(p=>p.filter(c=>c.id!==clip.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'clip',id:clip.id});setActiveClipId(clip.id);clipCtx(e,clip)}}
                />
              )
            })}
          </TRow>

          {/* Track: Text */}
          <TRow label="字幕" color="var(--accent)" onAdd={()=>{snap();setTexts(p=>[...p,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+3}])}}>
            {texts.map(t=>{
              const left=t.startTime*zoom, w=Math.max((t.endTime-t.startTime)*zoom,20)
              return(
                <TItem key={t.id} left={left} width={w} color="var(--accent)" selected={selItem?.id===t.id}
                  label={t.content||'(空)'}
                  onMouseDown={e=>{setSelItem({type:'text',id:t.id});startDrag(e,'text',t.id,'startTime',t.startTime)}}
                  onResizeRight={e=>startResize(e,'text',t.id,'endTime')}
                  onDelete={()=>{snap();setTexts(p=>p.filter(x=>x.id!==t.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'text',id:t.id});textCtx(e,t)}}
                />
              )
            })}
          </TRow>

          {/* Track: Image */}
          <TRow label="画像" color="var(--orange)" onAdd={onAddImage} accept="image/*">
            {images.map(img=>{
              const left=img.startTime*zoom, w=Math.max((img.endTime-img.startTime)*zoom,20)
              return(
                <TItem key={img.id} left={left} width={w} color="var(--orange)" selected={selItem?.id===img.id}
                  label={img.name} thumb={img.url}
                  onMouseDown={e=>{setSelItem({type:'image',id:img.id});startDrag(e,'image',img.id,'startTime',img.startTime)}}
                  onResizeRight={e=>startResize(e,'image',img.id,'endTime')}
                  onDelete={()=>{snap();setImages(p=>p.filter(x=>x.id!==img.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'image',id:img.id});imgCtx(e,img)}}
                />
              )
            })}
          </TRow>

          {/* Track: Audio */}
          <TRow label="音声" color="var(--green)" onAdd={onAddAudio} accept="audio/*">
            {audioTracks.map(track=>{
              const left=(track.startTime||0)*zoom, w=Math.max((track.duration||10)*zoom,40)
              return(
                <TItem key={track.id} left={left} width={w} color="var(--green)" selected={selItem?.id===track.id}
                  label={'♪ '+track.name}
                  onMouseDown={e=>{setSelItem({type:'audio',id:track.id});startDrag(e,'audio',track.id,'startTime',track.startTime||0)}}
                  onResizeRight={e=>startResize(e,'audio',track.id,'duration')}
                  onDelete={()=>{snap();setAudioTracks(p=>p.filter(x=>x.id!==track.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'audio',id:track.id});audCtx(e,track)}}
                />
              )
            })}
          </TRow>

          {/* Playhead */}
          <div style={{position:'absolute',top:0,bottom:0,left:playheadX,width:2,background:'var(--accent)',zIndex:25,borderRadius:1,pointerEvents:'none'}}>
            {/* Draggable head */}
            <div onMouseDown={startPlayheadDrag}
              style={{position:'absolute',top:22,left:'50%',transform:'translateX(-50%)',width:14,height:14,background:'var(--accent)',borderRadius:'50%',cursor:'ew-resize',pointerEvents:'all',boxShadow:'0 0 8px rgba(232,255,71,0.6)',zIndex:26}}
            />
            {/* Top arrow */}
            <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'8px solid var(--accent)'}}/>
          </div>

        </div>
      </div>
    </div>
  )
}

function TRow({label,color,children,onAdd,accept}){
  return(
    <div style={{display:'flex',height:TH,borderBottom:'1px solid var(--border)'}}>
      <div style={{width:LW,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',paddingLeft:8,paddingRight:4,borderRight:'1px solid var(--border)',background:'var(--bg-1)',position:'sticky',left:0,zIndex:10}}>
        <span style={{fontSize:10,color,fontWeight:700}}>{label}</span>
        {accept?(
          <label style={{cursor:'pointer',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:3,background:'rgba(255,255,255,0.06)',color:'var(--text-2)',fontSize:12}}>
            <input type="file" accept={accept} multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>+
          </label>
        ):(
          <button onClick={onAdd} style={{width:16,height:16,borderRadius:3,background:'rgba(255,255,255,0.06)',color:'var(--text-2)',fontSize:12,display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
        )}
      </div>
      <div style={{position:'relative',flex:1,background:'repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(255,255,255,0.02) 79px,rgba(255,255,255,0.02) 80px)'}}>{children}</div>
    </div>
  )
}

function TItem({left,width,color,selected,label,thumb,muted,onMouseDown,onResizeLeft,onResizeRight,onDelete,onContextMenu}){
  return(
    <div onMouseDown={onMouseDown} onContextMenu={onContextMenu}
      style={{position:'absolute',left,top:3,height:TH-6,width,borderRadius:4,border:`1.5px solid ${selected?color:'rgba(255,255,255,0.12)'}`,background:selected?`${color}22`:'rgba(255,255,255,0.04)',cursor:'grab',overflow:'hidden',display:'flex',alignItems:'center',userSelect:'none',opacity:muted?0.5:1}}>
      {thumb&&<img src={thumb} alt="" draggable={false} style={{height:'100%',width:'auto',opacity:0.4,flexShrink:0,pointerEvents:'none'}}/>}
      <span style={{fontFamily:'var(--mono)',fontSize:9,color,padding:'0 5px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,pointerEvents:'none'}}>{muted?'🔇 ':''}{label}</span>
      {onResizeLeft&&<div onMouseDown={onResizeLeft} style={{position:'absolute',left:0,top:0,bottom:0,width:6,cursor:'ew-resize',background:'rgba(255,255,255,0.1)',borderRadius:'4px 0 0 4px'}}/>}
      <div onMouseDown={onResizeRight} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'ew-resize',background:'rgba(255,255,255,0.1)',borderRadius:'0 4px 4px 0'}}/>
      <button onMouseDown={e=>e.stopPropagation()} onClick={onDelete}
        style={{position:'absolute',top:2,right:8,width:13,height:13,borderRadius:'50%',background:'rgba(255,69,96,0.8)',color:'#fff',fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',zIndex:5}}>×</button>
    </div>
  )
}

// ── ContextMenu ───────────────────────────────────────────────
function ContextMenu({x,y,items,onClose}){
  useEffect(()=>{
    const h=()=>onClose()
    // Small delay so the click that opened it doesn't close it
    const t=setTimeout(()=>window.addEventListener('mousedown',h),50)
    return ()=>{ clearTimeout(t); window.removeEventListener('mousedown',h) }
  },[onClose])

  // Clamp to viewport
  const vw=window.innerWidth, vh=window.innerHeight
  const menuW=180, menuH=items.length*32
  const cx=x+menuW>vw?x-menuW:x
  const cy=y+menuH>vh?y-menuH:y

  return(
    <div onMouseDown={e=>e.stopPropagation()} style={{position:'fixed',left:cx,top:cy,zIndex:9999,background:'var(--bg-2)',border:'1px solid var(--border-hi)',borderRadius:7,padding:'4px 0',minWidth:menuW,boxShadow:'0 10px 40px rgba(0,0,0,0.6)',animation:'fadeIn 0.1s ease'}}>
      {items.map((item,i)=>
        item==='---'
          ? <div key={i} style={{height:1,background:'var(--border)',margin:'3px 0'}}/>
          : <button key={i} onClick={()=>{item.action();onClose()}}
              style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'7px 14px',background:'transparent',color:item.danger?'var(--red)':'var(--text-0)',fontSize:12,fontWeight:500,textAlign:'left',transition:'background 0.1s'}}
              onMouseOver={e=>e.currentTarget.style.background='var(--bg-3)'}
              onMouseOut={e=>e.currentTarget.style.background='transparent'}
            >
              <span style={{fontSize:13,width:18,flexShrink:0}}>{item.icon}</span>
              <span style={{flex:1}}>{item.label}</span>
              {item.shortcut&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)'}}>{item.shortcut}</span>}
            </button>
      )}
    </div>
  )
}

// ── Panels ────────────────────────────────────────────────────
function ClipsPanel({clips,activeClipId,onSelect,onRemove,onAdd,onUpdate,selClip}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`動画クリップ (${clips.length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'3px 8px',fontSize:11}}><input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>+ 追加</label>
      </PHead>
      {clips.length===0&&<Empty text="動画を追加してください"/>}
      {clips.map(clip=>(
        <div key={clip.id} onClick={()=>onSelect(clip.id)} style={{display:'flex',gap:8,alignItems:'center',padding:'7px 9px',borderRadius:'var(--r)',background:activeClipId===clip.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${activeClipId===clip.id?'var(--accent)':'var(--border)'}`,cursor:'pointer'}}>
          {clip.thumbnail?<img src={clip.thumbnail} alt="" style={{width:46,height:26,objectFit:'cover',borderRadius:2,flexShrink:0}}/>:<div style={{width:46,height:26,background:'var(--bg-4)',borderRadius:2,flexShrink:0}}/>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{clip.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--blue)'}}>{fmt(clip.trimEnd-clip.trimStart)} / {fmt(clip.duration)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();onRemove(clip.id)}} style={{color:'var(--red)'}}>✕</button>
        </div>
      ))}
      {selClip&&(
        <div style={{borderTop:'1px solid var(--border)',paddingTop:10}}>
          <span className="label">IN / OUT</span>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={selClip.trimStart.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimStart',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={selClip.trimEnd.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimEnd',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
        </div>
      )}
    </div>
  )
}

function TextPanel({texts,setTexts,selectedId,setSelectedId,currentTime,snap}){
  const sel=texts.find(t=>t.id===selectedId)
  const upd=(k,v)=>setTexts(p=>p.map(t=>t.id===selectedId?{...t,[k]:v}:t))
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`テキスト (${texts.length})`}>
        <button className="btn btn-ghost" style={{padding:'3px 8px',fontSize:11}} onClick={()=>{snap();const id=crypto.randomUUID();setTexts(p=>[...p,{id,content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+5}]);setSelectedId(id)}}>+ 追加</button>
      </PHead>
      {texts.map(t=>(
        <div key={t.id} onClick={()=>setSelectedId(t.id)} style={{padding:'7px 9px',borderRadius:'var(--r)',background:selectedId===t.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selectedId===t.id?'var(--accent)':'var(--border)'}`,cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
          <span style={{flex:1,fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.content||'(空)'}</span>
          <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--text-2)',flexShrink:0}}>{fmt(t.startTime)}→{fmt(t.endTime)}</span>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();setTexts(p=>p.filter(x=>x.id!==t.id));if(selectedId===t.id)setSelectedId(null)}} style={{color:'var(--red)'}}>✕</button>
        </div>
      ))}
      {sel&&(
        <div style={{borderTop:'1px solid var(--border)',paddingTop:10,display:'flex',flexDirection:'column',gap:9}}>
          <textarea value={sel.content} onChange={e=>upd('content',e.target.value)} rows={2} style={{width:'100%',resize:'none',fontFamily:'var(--font)',fontSize:12}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">サイズ</span><input type="number" min={8} max={200} value={sel.fontSize} onChange={e=>upd('fontSize',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">カラー</span><div style={{display:'flex',gap:4}}><input type="color" value={sel.color} onChange={e=>upd('color',e.target.value)} style={{width:28,height:26,padding:2}}/><input value={sel.color} onChange={e=>upd('color',e.target.value)} style={{flex:1,fontSize:11}}/></div></div>
          </div>
          <Sld label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)}/>
          <Sld label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
          <div style={{position:'relative',background:'#000',borderRadius:4,aspectRatio:'16/9',overflow:'hidden',border:'1px solid var(--border)'}}>
            <div style={{position:'absolute',left:`${sel.x}%`,top:`${sel.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,sel.fontSize*0.22),color:sel.color,fontWeight:700,textShadow:'1px 1px 3px rgba(0,0,0,0.9)',maxWidth:'90%',textAlign:'center'}}>{sel.content||'テキスト'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImagePanel({images,setImages,selectedId,setSelectedId,currentTime,snap}){
  const sel=images.find(i=>i.id===selectedId)
  const upd=(k,v)=>setImages(p=>p.map(i=>i.id===selectedId?{...i,[k]:v}:i))
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`画像 (${images.length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'3px 8px',fontSize:11}}>
          <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{snap();Array.from(e.target.files).forEach(async f=>{const url=URL.createObjectURL(f);const id=crypto.randomUUID();setImages(p=>[...p,{id,file:f,name:f.name,url,startTime:currentTime,endTime:currentTime+5,x:50,y:50,scale:40,opacity:1}])})}}/>+ 追加
        </label>
      </PHead>
      {images.length===0&&<Empty text="画像を追加してください"/>}
      {images.map(img=>(
        <div key={img.id} onClick={()=>setSelectedId(img.id)} style={{display:'flex',gap:8,alignItems:'center',padding:'7px 9px',borderRadius:'var(--r)',background:selectedId===img.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selectedId===img.id?'var(--accent)':'var(--border)'}`,cursor:'pointer'}}>
          <img src={img.url} alt="" style={{width:46,height:26,objectFit:'cover',borderRadius:2,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--orange)'}}>{fmt(img.startTime)}→{fmt(img.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();setImages(p=>p.filter(x=>x.id!==img.id));if(selectedId===img.id)setSelectedId(null)}} style={{color:'var(--red)'}}>✕</button>
        </div>
      ))}
      {sel&&(
        <div style={{borderTop:'1px solid var(--border)',paddingTop:10,display:'flex',flexDirection:'column',gap:9}}>
          <Sld label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)}/>
          <Sld label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)}/>
          <Sld label={`サイズ: ${sel.scale}%`} value={sel.scale} min={5} max={100} onChange={v=>upd('scale',v)}/>
          <Sld label={`不透明度: ${Math.round(sel.opacity*100)}%`} value={sel.opacity} min={0} max={1} step={0.05} onChange={v=>upd('opacity',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始(秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了(秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
        </div>
      )}
    </div>
  )
}

function FiltersPanel({filters,onChange}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5}}>
        {PRESETS.map(p=>{const act=JSON.stringify(p.f)===JSON.stringify(filters);return<button key={p.name} onClick={()=>onChange(p.f)} style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:'var(--r)',background:act?'var(--accent-bg)':'var(--bg-3)',color:act?'var(--accent)':'var(--text-1)',border:`1px solid ${act?'var(--accent)':'var(--border)'}`}}>{p.name}</button>})}
      </div>
      <div className="divider"/>
      <Sld label={`明るさ ${sd(filters.brightness)}%`} value={filters.brightness} min={0} max={2} step={0.05} onChange={v=>onChange({...filters,brightness:v})}/>
      <Sld label={`コントラスト ${sd(filters.contrast)}%`} value={filters.contrast} min={0} max={3} step={0.05} onChange={v=>onChange({...filters,contrast:v})}/>
      <Sld label={`彩度 ${sd(filters.saturation)}%`} value={filters.saturation} min={0} max={3} step={0.05} onChange={v=>onChange({...filters,saturation:v})}/>
      <Sld label={`ブラー ${filters.blur}px`} value={filters.blur} min={0} max={10} step={0.5} onChange={v=>onChange({...filters,blur:v})}/>
      <div style={{height:18,borderRadius:3,background:'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)',filter:`brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`,border:'1px solid var(--border)'}}/>
    </div>
  )
}

function AudioPanel({audio,onChange,audioTracks,setAudioTracks,onAdd,snap}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      <div style={{padding:'10px 12px',background:'var(--bg-2)',borderRadius:'var(--r)',border:`1px solid ${audio.mute?'var(--red)':'var(--border)'}`}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span style={{fontWeight:600,fontSize:12}}>元音声ミュート</span>
          <Tog value={audio.mute} onChange={v=>onChange({...audio,mute:v})} color="var(--red)"/>
        </div>
        <Sld label={`元音量: ${Math.round(audio.volume*100)}%`} value={audio.volume} min={0} max={2} step={0.05} onChange={v=>onChange({...audio,volume:v})}/>
      </div>
      <PHead title={`BGMトラック (${audioTracks.length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'3px 8px',fontSize:11}}><input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>+ 追加</label>
      </PHead>
      {audioTracks.length===0&&<Empty text="音声を追加してください"/>}
      {audioTracks.map(t=>(
        <div key={t.id} style={{padding:'8px 10px',background:'var(--bg-2)',borderRadius:'var(--r)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <span style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,color:'var(--green)'}}>♪ {t.name}</span>
            <button className="btn-icon" onClick={()=>{snap();setAudioTracks(p=>p.filter(x=>x.id!==t.id))}} style={{color:'var(--red)'}}>✕</button>
          </div>
          <Sld label={`音量: ${Math.round((t.volume||0.8)*100)}%`} value={t.volume||0.8} min={0} max={1} step={0.05} onChange={v=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,volume:v}:x))}/>
          <div style={{marginTop:6}}><span className="label">開始位置(秒)</span><input type="number" min={0} step={0.1} value={t.startTime||0} onChange={e=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,startTime:+e.target.value}:x))} style={{width:'100%'}}/></div>
        </div>
      ))}
    </div>
  )
}

function ExportPanel({loaded,loading,onLoad,processing,progress,eta,onExport,outputBlob,onDownload,clipsCount,exportSettings,setExportSettings}){
  const upd=(k,v)=>setExportSettings(s=>({...s,[k]:v}))

  const presets=[
    {value:'ultrafast', label:'超高速',   desc:'最速・ファイル大'},
    {value:'superfast', label:'高速',     desc:'速い・やや小さい'},
    {value:'veryfast',  label:'やや速い', desc:'バランス良'},
    {value:'faster',    label:'標準',     desc:'品質重視'},
    {value:'medium',    label:'高品質',   desc:'遅い・小さい'},
  ]
  const scales=[
    {value:1,    label:'オリジナル'},
    {value:0.75, label:'75%'},
    {value:0.5,  label:'50%'},
    {value:0.25, label:'25%'},
  ]

  // Estimate speed mode
  const isCopyMode = exportSettings.crf===0

  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      {/* FFmpeg status */}
      <div style={{padding:'10px 12px',background:'var(--bg-2)',borderRadius:'var(--r)',border:`1px solid ${loaded?'var(--green)':'var(--border)'}`}}>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:4}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:loaded?'var(--green)':loading?'#ffcc00':'var(--text-2)',boxShadow:loaded?'0 0 6px var(--green)':'none'}}/>
          <span style={{fontSize:12,fontWeight:600}}>{loaded?'FFmpeg 準備完了':loading?'読み込み中...':'FFmpeg 未読込'}</span>
        </div>
        {!loaded&&!loading&&<button className="btn btn-ghost" style={{width:'100%',justifyContent:'center',marginTop:6}} onClick={onLoad}>⚡ 読み込む</button>}
        {loading&&<div style={{height:3,background:'var(--bg-4)',borderRadius:2,marginTop:8,overflow:'hidden'}}><div style={{height:'100%',width:'50%',background:'#ffcc00',animation:'indeterminate 1.5s ease-in-out infinite'}}/></div>}
      </div>

      {/* ── Speed / Quality settings ── */}
      <div style={{padding:'12px',background:'var(--bg-2)',borderRadius:'var(--r)',border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:2}}>出力設定</div>

        {/* Preset */}
        <div>
          <span className="label">エンコード速度</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
            {presets.map(p=>(
              <button key={p.value} onClick={()=>upd('preset',p.value)}
                title={p.desc}
                style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:'var(--r)',background:exportSettings.preset===p.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.preset===p.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.preset===p.value?'var(--accent)':'var(--border)'}`}}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* CRF slider */}
        <div>
          <div style={{display:'flex',justifyContent:'space-between'}}>
            <span className="label">画質 (CRF)</span>
            <span style={{fontFamily:'var(--mono)',fontSize:10,color:exportSettings.crf<=18?'var(--green)':exportSettings.crf>=28?'var(--red)':'var(--accent)'}}>
              {exportSettings.crf} — {exportSettings.crf<=18?'高品質':exportSettings.crf>=28?'低品質':'標準'}
            </span>
          </div>
          <input type="range" min={12} max={35} step={1} value={exportSettings.crf} onChange={e=>upd('crf',+e.target.value)}/>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
            <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--green)'}}>高品質</span>
            <span style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--red)'}}>軽量</span>
          </div>
        </div>

        {/* Resolution */}
        <div>
          <span className="label">解像度</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
            {scales.map(s=>(
              <button key={s.value} onClick={()=>upd('scale',s.value)}
                style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:'var(--r)',background:exportSettings.scale===s.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.scale===s.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.scale===s.value?'var(--accent)':'var(--border)'}`}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Audio bitrate */}
        <div>
          <span className="label">音声ビットレート</span>
          <select value={exportSettings.audioBitrate} onChange={e=>upd('audioBitrate',e.target.value)} style={{width:'100%',fontSize:12}}>
            {['64k','96k','128k','192k','256k','320k'].map(b=><option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Speed estimate badge */}
        <div style={{padding:'7px 10px',background:'var(--bg-3)',borderRadius:'var(--r)',fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',lineHeight:1.7}}>
          <span style={{color:'var(--text-1)'}}>出力モード: </span>
          {exportSettings.scale===1&&exportSettings.crf===23&&exportSettings.preset==='ultrafast'
            ? <span style={{color:'var(--accent)'}}>⚡ 最速モード</span>
            : <span style={{color:'var(--blue)'}}>🎬 高品質モード</span>
          }
          <br/>フォーマット: MP4 / H.264 + AAC {exportSettings.audioBitrate}
        </div>
      </div>

      {/* GPU note */}
      <div style={{padding:'8px 10px',background:'rgba(74,143,255,0.07)',border:'1px solid rgba(74,143,255,0.2)',borderRadius:'var(--r)',fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',lineHeight:1.7}}>
        ℹ️ ブラウザのWASMはCPU処理のみです。<br/>
        GPUエンコードはネイティブアプリが必要です。<br/>
        高速化には <span style={{color:'var(--accent)'}}>超高速 + CRF高め + 解像度↓</span> が有効です。
      </div>

      {/* Progress */}
      {processing&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
            <span style={{fontSize:11}}>処理中...</span>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)'}}>
              {progress}%{eta!=null?` · 残り約${eta}秒`:''}
            </span>
          </div>
          <div style={{height:5,background:'var(--bg-4)',borderRadius:3,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,var(--accent),#b8ff00)',transition:'width 0.3s',boxShadow:'0 0 8px rgba(232,255,71,0.4)'}}/>
          </div>
        </div>
      )}

      <button className="btn btn-accent" style={{width:'100%',justifyContent:'center',padding:'11px',fontSize:13}} onClick={onExport} disabled={!loaded||processing||clipsCount===0}>
        {processing?<><span className="anim-spin">⟳</span>{progress}%</>:'⚙ エクスポート開始'}
      </button>

      {outputBlob&&!processing&&(
        <div className="anim-fade">
          <div style={{padding:'10px 12px',background:'rgba(46,204,113,0.08)',border:'1px solid var(--green)',borderRadius:'var(--r)',marginBottom:8}}>
            <div style={{color:'var(--green)',fontWeight:600,fontSize:12}}>✓ 完了 — {(outputBlob.size/1024/1024).toFixed(2)} MB</div>
          </div>
          <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center'}} onClick={onDownload}>↓ ダウンロード (.mp4)</button>
        </div>
      )}
      <style>{`@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────
function PHead({title,children}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
      <span style={{fontWeight:700,fontSize:11,color:'var(--text-1)',textTransform:'uppercase',letterSpacing:'0.04em'}}>{title}</span>
      {children}
    </div>
  )
}
function Sld({label,value,min,max,step=0.01,onChange}){
  return<div><span className="label">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}/></div>
}
function Tog({value,onChange,color='var(--accent)'}){
  return<button onClick={()=>onChange(!value)} style={{width:38,height:20,borderRadius:10,background:value?color:'var(--bg-4)',border:`1px solid ${value?color:'var(--border)'}`,position:'relative',cursor:'pointer'}}><div style={{position:'absolute',top:2,left:value?20:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left 0.15s'}}/></button>
}
function Empty({text}){
  return<div style={{textAlign:'center',color:'var(--text-2)',fontFamily:'var(--mono)',fontSize:10,padding:'6px 0'}}>{text}</div>
}

// ── Utils ─────────────────────────────────────────────────────
function fmt(s){
  if(!s||isNaN(s)) return '0:00'
  const m=Math.floor(s/60),sec=Math.floor(s%60)
  return `${m}:${sec.toString().padStart(2,'0')}`
}
function sd(v){const d=Math.round((v-1)*100);return d>=0?`+${d}`:`${d}`}

function getVideoDuration(url){
  return new Promise(r=>{
    const v=document.createElement('video'); v.preload='metadata'
    v.onloadedmetadata=()=>{r(v.duration);v.src=''}; v.onerror=()=>r(0); v.src=url
  })
}
function getAudioDuration(url){
  return new Promise(r=>{
    const a=new Audio(); a.onloadedmetadata=()=>r(a.duration); a.onerror=()=>r(60); a.src=url
  })
}
function getVideoThumbnail(url){
  return new Promise(r=>{
    const v=document.createElement('video'),c=document.createElement('canvas')
    c.width=80;c.height=45; v.preload='auto'; v.muted=true
    v.onloadeddata=()=>{v.currentTime=Math.min(1,v.duration*0.1)}
    v.onseeked=()=>{try{c.getContext('2d').drawImage(v,0,0,80,45);r(c.toDataURL('image/jpeg',0.6))}catch{r(null)};v.src=''}
    v.onerror=()=>r(null); v.src=url
  })
}
