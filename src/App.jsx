import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'
import { useExporter } from './hooks/useExporter.js'
import {
  CutLabLogo, IconPlay, IconPause, IconScissors, IconUndo, IconRedo,
  IconFilm, IconText, IconImage, IconSliders, IconMusic, IconSettings,
  IconDownload, IconUpload, IconPlus, IconX, IconZoomIn, IconZoomOut,
  IconVolume, IconVolumeMute, IconCopy, IconTrash, IconCheckCircle,
  IconInfo, IconCpu, IconWand, IconClock,
} from './components/Icons.jsx'

// ── Constants ─────────────────────────────────────────────────
const TABS = [
  { id:'clips',   label:'クリップ',    Icon: IconFilm    },
  { id:'text',    label:'テキスト',    Icon: IconText    },
  { id:'image',   label:'画像',        Icon: IconImage   },
  { id:'filters', label:'フィルター',  Icon: IconSliders },
  { id:'audio',   label:'音声',        Icon: IconMusic   },
  { id:'export',  label:'出力',        Icon: IconSettings},
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

const TH = 46
const LW = 64
const DEF_FILTERS = {brightness:1,contrast:1,saturation:1,blur:0}
const DEF_AUDIO   = {mute:false,volume:1}

// ── App ───────────────────────────────────────────────────────
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
  const [exportExt,   setExportExt]   = useState('webm')
  const [processing,  setProcessing]  = useState(false)
  const [zoom,        setZoom]        = useState(80)
  const [volume,      setVolume]      = useState(1)
  const [isMuted,     setIsMuted]     = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [history,     setHistory]     = useState([])
  const [future,      setFuture]      = useState([])
  const [ctxMenu,     setCtxMenu]     = useState(null)
  const [exportSettings,setExportSettings]=useState({fps:30,quality:0.85,scale:1,audioBitrate:128000})
  const [dragging,    setDragging]    = useState(false)

  const videoRef  = useRef(null)
  const audioRefs = useRef({})
  const { load, loaded, loading } = useFFmpeg()
  const { exportVideo, exporting, progress, eta } = useExporter()

  const activeClip    = clips.find(c=>c.id===activeClipId)||clips[0]
  const totalDuration = useMemo(()=>clips.reduce((s,c)=>s+(c.trimEnd-c.trimStart),0),[clips])

  // ── History ───────────────────────────────────────────────
  const snap=useCallback(()=>{
    setHistory(h=>[...h.slice(-30),{clips,texts,images,audioTracks}])
    setFuture([])
  },[clips,texts,images,audioTracks])

  const undo=useCallback(()=>{
    if(!history.length) return
    const p=history[history.length-1]
    setFuture(f=>[{clips,texts,images,audioTracks},...f])
    setHistory(h=>h.slice(0,-1))
    setClips(p.clips);setTexts(p.texts);setImages(p.images);setAudioTracks(p.audioTracks)
  },[history,clips,texts,images,audioTracks])

  const redo=useCallback(()=>{
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
      if(ctxMenu&&e.key==='Escape'){setCtxMenu(null);return}
      switch(e.code){
        case 'Space': e.preventDefault();togglePlay();break
        case 'ArrowLeft':  e.preventDefault();seekDelta(e.shiftKey?-5:-1/30);break
        case 'ArrowRight': e.preventDefault();seekDelta(e.shiftKey?5:1/30);break
        case 'KeyZ': if(e.metaKey||e.ctrlKey){e.preventDefault();e.shiftKey?redo():undo()}break
        case 'KeyY': if(e.metaKey||e.ctrlKey){e.preventDefault();redo()}break
        case 'Delete': case 'Backspace': delSel();break
        case 'KeyM': setIsMuted(m=>!m);break
        case 'KeyS': if(!e.metaKey&&!e.ctrlKey) splitClip();break
      }
    }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[isPlaying,totalDuration,selItem,ctxMenu])

  const seekDelta=(d)=>{
    const v=videoRef.current;if(!v) return
    seekTo(Math.max(0,Math.min(totalDuration,(v.currentTime||0)+d)))
  }
  const delSel=()=>{
    if(!selItem) return;snap()
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
        const a=new Audio(t.url);a.volume=t.volume??0.8
        audioRefs.current[t.id]=a
      } else audioRefs.current[t.id].volume=t.volume??0.8
    })
    Object.keys(audioRefs.current).forEach(id=>{
      if(!audioTracks.find(t=>t.id===id)){
        audioRefs.current[id].pause();delete audioRefs.current[id]
      }
    })
  },[audioTracks])

  const syncBGM=useCallback((time,playing)=>{
    audioTracks.forEach(t=>{
      const el=audioRefs.current[t.id];if(!el) return
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
    const v=videoRef.current;if(!v) return
    v.volume=isMuted?0:volume;v.playbackRate=speed
  },[volume,isMuted,speed])

  useEffect(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    const onTime=()=>{
      setCurrentTime(v.currentTime)
      if(v.currentTime>=activeClip.trimEnd){
        v.pause();v.currentTime=activeClip.trimStart
        setIsPlaying(false);syncBGM(activeClip.trimStart,false)
      }
    }
    v.addEventListener('timeupdate',onTime)
    return ()=>v.removeEventListener('timeupdate',onTime)
  },[activeClip,syncBGM])

  useEffect(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    v.src=activeClip.url;v.currentTime=activeClip.trimStart
    setCurrentTime(activeClip.trimStart);setIsPlaying(false)
    syncBGM(activeClip.trimStart,false)
  },[activeClipId])

  const togglePlay=useCallback(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    if(isPlaying){v.pause();setIsPlaying(false);syncBGM(v.currentTime,false)}
    else{
      if(v.currentTime>=activeClip.trimEnd) v.currentTime=activeClip.trimStart
      v.play();setIsPlaying(true);syncBGM(v.currentTime,true)
    }
  },[isPlaying,activeClip,syncBGM])

  const seekTo=useCallback((t)=>{
    const v=videoRef.current;if(!v) return
    const c=Math.max(0,Math.min(totalDuration,t))
    v.currentTime=c;setCurrentTime(c);syncBGM(c,isPlaying)
  },[totalDuration,isPlaying,syncBGM])

  // ── Import ────────────────────────────────────────────────
  const addVideoFiles=useCallback(async(files)=>{
    snap();const nc=[]
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
    e.preventDefault();setDragging(false)
    const fs=Array.from(e.dataTransfer.files)
    addVideoFiles(fs.filter(f=>f.type.startsWith('video/')))
    addAudioFiles(fs.filter(f=>f.type.startsWith('audio/')))
    addImageFiles(fs.filter(f=>f.type.startsWith('image/')))
  },[addVideoFiles,addAudioFiles,addImageFiles])

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

  const handleExport=async()=>{
    if(!clips.length) return
    setProcessing(true);setOutputBlob(null)
    try{
      const result = await exportVideo({
        clips,
        textTracks: texts,
        imageTracks: images,
        audioTracks,
        filters,
        audioSettings,
        exportSettings,
      })
      setOutputBlob(result.blob)
      setExportExt(result.ext)
      setActiveTab('export')
    }catch(e){console.error(e);alert('エクスポートエラー: '+e.message)}
    finally{setProcessing(false)}
  }

  const isProcessing = processing || exporting
  const openCtxMenu=(e,items)=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,items})}
  const selClip=selItem?.type==='clip'?clips.find(c=>c.id===selItem.id):null

  return(
    <div
      style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg-0)'}}
      onDrop={handleDrop}
      onDragOver={e=>{e.preventDefault();setDragging(true)}}
      onDragLeave={()=>setDragging(false)}
      onClick={()=>ctxMenu&&setCtxMenu(null)}
    >
      {dragging&&(
        <div style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(212,255,62,0.06)',border:'2px dashed var(--accent)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
          <div style={{textAlign:'center'}}>
            <IconUpload size={48} style={{color:'var(--accent)',margin:'0 auto 12px'}}/>
            <div style={{fontSize:18,fontWeight:700,color:'var(--accent)'}}>ここにドロップ</div>
          </div>
        </div>
      )}

      <AppHeader
        loaded={loaded} loading={loading} onLoad={load}
        processing={isProcessing} progress={progress}
        onExport={handleExport} clipsCount={clips.length}
        onAddVideo={addVideoFiles} onAddAudio={addAudioFiles} onAddImage={addImageFiles}
        onUndo={undo} onRedo={redo} canUndo={history.length>0} canRedo={future.length>0}
        zoom={zoom} onZoom={setZoom}
      />

      <div style={{flex:1,display:'flex',overflow:'hidden',minHeight:0}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,borderRight:'1px solid var(--border)'}}>
          {/* Preview */}
          <div style={{flex:1,background:'#000',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',minHeight:0}}>
            {activeClip?(
              <>
                <video ref={videoRef} style={{maxWidth:'100%',maxHeight:'100%'}}/>
                <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>
                  {texts.map(t=>{
                    if(!t.content||currentTime<t.startTime||currentTime>t.endTime) return null
                    return(
                      <div key={t.id} style={{position:'absolute',left:`${t.x}%`,top:`${t.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,t.fontSize*0.38),color:t.color,fontFamily:'var(--font)',fontWeight:700,textShadow:'1px 1px 4px rgba(0,0,0,0.9)',whiteSpace:'pre-wrap',textAlign:'center',maxWidth:'90%'}}>{t.content}</div>
                    )
                  })}
                  {images.map(img=>{
                    if(currentTime<img.startTime||currentTime>img.endTime) return null
                    return <img key={img.id} src={img.url} alt="" style={{position:'absolute',left:`${img.x}%`,top:`${img.y}%`,transform:'translate(-50%,-50%)',width:`${img.scale}%`,objectFit:'contain',opacity:img.opacity}}/>
                  })}
                </div>
                {/* Time overlay */}
                <div style={{position:'absolute',bottom:10,right:12,fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,0.55)',background:'rgba(0,0,0,0.6)',padding:'3px 8px',borderRadius:4,backdropFilter:'blur(4px)'}}>
                  {fmt(currentTime)} / {fmt(totalDuration)}
                </div>
              </>
            ):(
              <label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,cursor:'pointer',opacity:0.45,transition:'opacity 0.2s'}}>
                <input type="file" accept="video/*,audio/*,image/*" multiple style={{display:'none'}} onChange={e=>{const f=Array.from(e.target.files);addVideoFiles(f);addAudioFiles(f);addImageFiles(f)}}/>
                <div style={{width:72,height:72,borderRadius:'50%',background:'var(--bg-3)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <IconFilm size={28} style={{color:'var(--text-2)'}}/>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:6,color:'var(--text-1)'}}>動画・音声・画像をドロップ</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text-2)',lineHeight:1.8}}>
                    MP4 · MOV · MP3 · JPG · PNG<br/>
                    <span style={{fontSize:10}}>Space=再生　←→=移動　S=分割　Ctrl+Z=Undo</span>
                  </div>
                </div>
              </label>
            )}
          </div>

          <PlaybackBar
            isPlaying={isPlaying} onTogglePlay={togglePlay}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} onSplit={splitClip}
            volume={volume} onVolume={setVolume}
            isMuted={isMuted} onToggleMute={()=>setIsMuted(m=>!m)}
            speed={speed} onSpeed={setSpeed}
            hasClip={!!activeClip}
          />

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
            openCtxMenu={openCtxMenu}
          />
        </div>

        {/* Right panel */}
        <div style={{width:304,display:'flex',flexDirection:'column',background:'var(--bg-1)',flexShrink:0}}>
          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0,padding:'0 4px'}}>
            {TABS.map(({id,label,Icon:TabIcon})=>(
              <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:'10px 2px 8px',background:'transparent',color:activeTab===id?'var(--accent)':'var(--text-2)',borderBottom:`2px solid ${activeTab===id?'var(--accent)':'transparent'}`,display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'var(--t)'}}>
                <TabIcon size={14} style={{color:activeTab===id?'var(--accent)':'var(--text-2)',transition:'var(--t)'}}/>
                <span style={{fontSize:9,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>{label}</span>
              </button>
            ))}
          </div>

          <div style={{flex:1,overflowY:'auto',padding:14}}>
            {activeTab==='clips'   && <ClipsPanel clips={clips} activeClipId={activeClipId} onSelect={id=>{setActiveClipId(id);setSelItem({type:'clip',id})}} onRemove={id=>{snap();setClips(p=>p.filter(c=>c.id!==id))}} onAdd={addVideoFiles} onUpdate={(id,k,v)=>setClips(p=>p.map(c=>c.id===id?{...c,[k]:v}:c))} selClip={selClip}/>}
            {activeTab==='text'    && <TextPanel texts={texts} setTexts={setTexts} selectedId={selItem?.type==='text'?selItem.id:null} setSelectedId={id=>setSelItem(id?{type:'text',id}:null)} currentTime={currentTime} snap={snap}/>}
            {activeTab==='image'   && <ImagePanel images={images} setImages={setImages} selectedId={selItem?.type==='image'?selItem.id:null} setSelectedId={id=>setSelItem(id?{type:'image',id}:null)} currentTime={currentTime} snap={snap}/>}
            {activeTab==='filters' && <FiltersPanel filters={filters} onChange={setFilters}/>}
            {activeTab==='audio'   && <AudioPanel audio={audioSettings} onChange={setAudioSettings} audioTracks={audioTracks} setAudioTracks={setAudioTracks} onAdd={addAudioFiles} snap={snap}/>}
            {activeTab==='export'  && <ExportPanel processing={isProcessing} progress={progress} eta={eta} onExport={handleExport} outputBlob={outputBlob} exportExt={exportExt} onDownload={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(outputBlob);a.download=`cutlab_${Date.now()}.${exportExt}`;a.click()}} clipsCount={clips.length} exportSettings={exportSettings} setExportSettings={setExportSettings}/>}
          </div>
        </div>
      </div>

      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={()=>setCtxMenu(null)}/>}
    </div>
  )
}

// ── AppHeader ─────────────────────────────────────────────────
function AppHeader({loaded,loading,onLoad,processing,progress,onExport,clipsCount,onAddVideo,onAddAudio,onAddImage,onUndo,onRedo,canUndo,canRedo,zoom,onZoom}){
  return(
    <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',flexShrink:0,gap:8}}>
      {/* Logo */}
      <div style={{display:'flex',alignItems:'center',gap:9,flexShrink:0}}>
        <CutLabLogo size={26}/>
        <div style={{fontFamily:'var(--font)',fontWeight:800,fontSize:16,letterSpacing:'-0.03em',lineHeight:1}}>
          <span style={{color:'var(--accent)'}}>Cut</span>
          <span style={{color:'var(--text-0)'}}>Lab</span>
        </div>
      </div>

      {/* Center tools */}
      <div style={{display:'flex',gap:3,alignItems:'center'}}>
        {/* History */}
        <button className="btn-icon" onClick={onUndo} disabled={!canUndo} title="元に戻す (Ctrl+Z)" style={{opacity:canUndo?1:0.3}}>
          <IconUndo size={14}/>
        </button>
        <button className="btn-icon" onClick={onRedo} disabled={!canRedo} title="やり直し (Ctrl+Y)" style={{opacity:canRedo?1:0.3}}>
          <IconRedo size={14}/>
        </button>

        <div style={{width:1,height:18,background:'var(--border)',margin:'0 6px'}}/>

        {/* Add media */}
        <label className="btn-icon" title="動画を追加" style={{cursor:'pointer'}}>
          <input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAddVideo(Array.from(e.target.files))}/>
          <IconFilm size={14}/>
        </label>
        <label className="btn-icon" title="音声を追加" style={{cursor:'pointer'}}>
          <input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAddAudio(Array.from(e.target.files))}/>
          <IconMusic size={14}/>
        </label>
        <label className="btn-icon" title="画像を追加" style={{cursor:'pointer'}}>
          <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>onAddImage(Array.from(e.target.files))}/>
          <IconImage size={14}/>
        </label>

        <div style={{width:1,height:18,background:'var(--border)',margin:'0 6px'}}/>

        {/* Zoom */}
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.max(z/1.4,20))} title="ズームアウト">
          <IconZoomOut size={14}/>
        </button>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',minWidth:34,textAlign:'center'}}>{Math.round(zoom)}</div>
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.min(z*1.4,400))} title="ズームイン">
          <IconZoomIn size={14}/>
        </button>
      </div>

      {/* Right: export */}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {clipsCount>0&&(
          <button className="btn btn-accent" onClick={onExport} disabled={processing} style={{gap:6}}>
            {processing?<span className="anim-spin"><IconSettings size={12}/></span>:<IconSettings size={12}/>}
            {processing?`${progress}%`:'出力'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── PlaybackBar ───────────────────────────────────────────────
function PlaybackBar({isPlaying,onTogglePlay,currentTime,totalDuration,onSeek,onSplit,volume,onVolume,isMuted,onToggleMute,speed,onSpeed,hasClip}){
  const pct=totalDuration>0?(currentTime/totalDuration)*100:0
  const seekRef=useRef(null)

  const startSeek=(e)=>{
    e.preventDefault()
    const seek=(ev)=>{
      const r=seekRef.current?.getBoundingClientRect();if(!r) return
      onSeek(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*totalDuration)
    }
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek)
    window.addEventListener('mouseup',up)
  }

  return(
    <div style={{padding:'8px 14px',background:'var(--bg-1)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
      {/* Play */}
      <button onClick={onTogglePlay} disabled={!hasClip}
        style={{width:32,height:32,borderRadius:'50%',background:hasClip?'var(--accent)':'var(--bg-3)',color:hasClip?'#0a0a0a':'var(--text-2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:hasClip?'0 2px 12px rgba(212,255,62,0.3)':'none',border:'none',cursor:hasClip?'pointer':'not-allowed',transition:'var(--t)'}}>
        {isPlaying?<IconPause size={13}/>:<IconPlay size={13} style={{marginLeft:1}}/>}
      </button>

      {/* Split */}
      <button className="btn-icon" onClick={onSplit} disabled={!hasClip} title="ここで分割 (S)" style={{opacity:hasClip?1:0.35}}>
        <IconScissors size={13}/>
      </button>

      {/* Seek bar */}
      <div ref={seekRef} onMouseDown={startSeek}
        style={{flex:1,height:4,background:'var(--bg-5)',borderRadius:2,cursor:'pointer',position:'relative',userSelect:'none'}}>
        <div style={{position:'absolute',inset:0,width:`${pct}%`,background:'linear-gradient(90deg,var(--accent),#a8ff00)',borderRadius:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'50%',left:`${pct}%`,transform:'translate(-50%,-50%)',width:12,height:12,borderRadius:'50%',background:'var(--accent)',pointerEvents:'none',boxShadow:'0 0 8px rgba(212,255,62,0.6)',border:'2px solid rgba(255,255,255,0.3)'}}/>
      </div>

      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-1)',flexShrink:0,minWidth:88,textAlign:'center'}}>
        {fmt(currentTime)} / {fmt(totalDuration)}
      </span>

      {/* Volume */}
      <button className="btn-icon" onClick={onToggleMute} title={isMuted?'ミュート解除 (M)':'ミュート (M)'}>
        {isMuted?<IconVolumeMute size={13}/>:<IconVolume size={13}/>}
      </button>
      <input type="range" min={0} max={1} step={0.05} value={isMuted?0:volume} onChange={e=>onVolume(+e.target.value)} style={{width:54}}/>

      {/* Speed */}
      <select value={speed} onChange={e=>onSpeed(+e.target.value)} style={{fontSize:11,padding:'3px 20px 3px 6px',width:58,color:'var(--text-1)'}}>
        {[0.25,0.5,0.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}x</option>)}
      </select>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────
function Timeline({clips,setClips,texts,setTexts,images,setImages,audioTracks,setAudioTracks,activeClipId,setActiveClipId,currentTime,totalDuration,onSeek,zoom,selItem,setSelItem,onAddVideo,onAddAudio,onAddImage,snap,splitClip,openCtxMenu}){
  const scrollRef=useRef(null)
  const rulerTicks=Math.ceil(totalDuration)+3
  const playheadX=LW+currentTime*zoom
  const canvasW=Math.max((totalDuration+5)*zoom+LW+120,900)

  useEffect(()=>{
    const el=scrollRef.current;if(!el) return
    const fn=(e)=>{e.preventDefault();el.scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY}
    el.addEventListener('wheel',fn,{passive:false})
    return ()=>el.removeEventListener('wheel',fn)
  },[])

  useEffect(()=>{
    const el=scrollRef.current;if(!el) return
    const x=LW+currentTime*zoom
    const vl=el.scrollLeft,vr=vl+el.clientWidth
    if(x>vr-60) el.scrollLeft=x-el.clientWidth+120
    else if(x<vl+LW+10) el.scrollLeft=Math.max(0,x-LW-20)
  },[currentTime,zoom])

  const startPlayheadDrag=(e)=>{
    e.preventDefault();e.stopPropagation()
    const el=scrollRef.current
    const seek=(ev)=>{
      const rect=el.getBoundingClientRect()
      const x=ev.clientX-rect.left+el.scrollLeft-LW
      onSeek(Math.max(0,x/zoom))
    }
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek);window.addEventListener('mouseup',up)
  }

  const onRulerDown=(e)=>{
    if(e.button!==0) return;e.preventDefault()
    const el=scrollRef.current
    const seek=(ev)=>{
      const rect=el.getBoundingClientRect()
      const x=ev.clientX-rect.left+el.scrollLeft-LW
      onSeek(Math.max(0,x/zoom))
    }
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek);window.addEventListener('mouseup',up)
  }

  const onTimelineCtx=(e)=>{
    e.preventDefault()
    const el=scrollRef.current;if(!el) return
    const rect=el.getBoundingClientRect()
    const x=e.clientX-rect.left+el.scrollLeft-LW
    const t=Math.max(0,x/zoom)
    openCtxMenu(e,[
      {icon:<IconPlay size={13}/>,  label:'ここから再生',    action:()=>onSeek(t)},
      {icon:<IconScissors size={13}/>,label:'ここで分割',   action:()=>{onSeek(t);setTimeout(splitClip,50)}},
      '---',
      {icon:<IconText size={13}/>,  label:'字幕をここに追加', action:()=>setTexts(p=>[...p,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:t,endTime:t+3}])},
      {icon:<IconImage size={13}/>, label:'画像をここに追加', action:()=>document.getElementById('tl-img')?.click()},
      {icon:<IconMusic size={13}/>, label:'音声をここに追加', action:()=>document.getElementById('tl-aud')?.click()},
      '---',
      {icon:<IconFilm size={13}/>,  label:'動画を追加',       action:()=>document.getElementById('tl-vid')?.click()},
    ])
  }

  const startDrag=(e,type,id,field,itemStart)=>{
    e.stopPropagation();e.preventDefault()
    const el=scrollRef.current
    const rect=el?.getBoundingClientRect()
    const grabOff=(e.clientX-(rect?.left||0)+el.scrollLeft-LW)-itemStart*zoom
    const move=(me)=>{
      const mx=me.clientX-(rect?.left||0)+el.scrollLeft-LW
      const v=Math.max(0,(mx-grabOff)/zoom)
      const upd=(s)=>s(p=>p.map(i=>i.id===id?{...i,[field]:v}:i))
      if(type==='clip')  upd(setClips)
      if(type==='text')  upd(setTexts)
      if(type==='image') upd(setImages)
      if(type==='audio') upd(setAudioTracks)
    }
    const up=()=>{snap();window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)
  }

  const startResize=(e,type,id,field)=>{
    e.stopPropagation();e.preventDefault()
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
    const up=()=>{snap();window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)
  }

  // Context menus
  const clipCtx=(e,clip)=>openCtxMenu(e,[
    {icon:<IconScissors size={13}/>, label:'ここで分割',      shortcut:'S',  action:splitClip},
    {icon:<IconPlay size={13}/>,     label:'IN点を現在地に',               action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,trimStart:currentTime}:c))},
    {icon:<IconPlay size={13}/>,     label:'OUT点を現在地に',              action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,trimEnd:currentTime}:c))},
    '---',
    {icon:<IconCopy size={13}/>,     label:'複製',                         action:()=>{snap();setClips(p=>{const i=p.findIndex(c=>c.id===clip.id);const n=[...p];n.splice(i+1,0,{...clip,id:crypto.randomUUID()});return n})}},
    {icon:<IconVolumeMute size={13}/>,label:clip.muted?'ミュート解除':'ミュート', action:()=>setClips(p=>p.map(c=>c.id===clip.id?{...c,muted:!c.muted}:c))},
    '---',
    {icon:<IconTrash size={13}/>,    label:'削除', shortcut:'Del', danger:true, action:()=>{snap();setClips(p=>p.filter(c=>c.id!==clip.id))}},
  ])
  const textCtx=(e,t)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>, label:'開始点を現在地に', action:()=>setTexts(p=>p.map(x=>x.id===t.id?{...x,startTime:currentTime}:x))},
    {icon:<IconClock size={13}/>, label:'終了点を現在地に', action:()=>setTexts(p=>p.map(x=>x.id===t.id?{...x,endTime:currentTime}:x))},
    {icon:<IconCopy size={13}/>,  label:'複製',            action:()=>{snap();setTexts(p=>[...p,{...t,id:crypto.randomUUID(),startTime:t.startTime+0.5}])}},
    '---',
    {icon:<IconTrash size={13}/>, label:'削除', danger:true, action:()=>{snap();setTexts(p=>p.filter(x=>x.id!==t.id))}},
  ])
  const imgCtx=(e,img)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>, label:'開始点を現在地に', action:()=>setImages(p=>p.map(x=>x.id===img.id?{...x,startTime:currentTime}:x))},
    {icon:<IconClock size={13}/>, label:'終了点を現在地に', action:()=>setImages(p=>p.map(x=>x.id===img.id?{...x,endTime:currentTime}:x))},
    {icon:<IconCopy size={13}/>,  label:'複製',            action:()=>{snap();setImages(p=>[...p,{...img,id:crypto.randomUUID()}])}},
    '---',
    {icon:<IconTrash size={13}/>, label:'削除', danger:true, action:()=>{snap();setImages(p=>p.filter(x=>x.id!==img.id))}},
  ])
  const audCtx=(e,track)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>,  label:'開始点を現在地に', action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,startTime:currentTime}:x))},
    {icon:<IconVolume size={13}/>, label:'音量 +10%',       action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,volume:Math.min(1,(x.volume||0.8)+0.1)}:x))},
    {icon:<IconVolumeMute size={13}/>,label:'音量 -10%',    action:()=>setAudioTracks(p=>p.map(x=>x.id===track.id?{...x,volume:Math.max(0,(x.volume||0.8)-0.1)}:x))},
    {icon:<IconCopy size={13}/>,   label:'複製',            action:()=>{snap();setAudioTracks(p=>[...p,{...track,id:crypto.randomUUID()}])}},
    '---',
    {icon:<IconTrash size={13}/>,  label:'削除', danger:true, action:()=>{snap();setAudioTracks(p=>p.filter(x=>x.id!==track.id))}},
  ])

  const TRACK_COLORS={clip:'var(--blue)',text:'var(--accent)',image:'var(--orange)',audio:'var(--green)'}

  return(
    <div style={{background:'var(--bg-0)',borderTop:'1px solid var(--border)',flexShrink:0,height:234,display:'flex',flexDirection:'column'}}>
      <label style={{display:'none'}}><input id="tl-vid" type="file" accept="video/*" multiple onChange={e=>onAddVideo(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-aud" type="file" accept="audio/*" multiple onChange={e=>onAddAudio(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-img" type="file" accept="image/*" multiple onChange={e=>onAddImage(Array.from(e.target.files))}/></label>

      <div ref={scrollRef} style={{overflowX:'auto',overflowY:'auto',flex:1,position:'relative'}} onContextMenu={onTimelineCtx}>
        <div style={{width:canvasW,minHeight:'100%',position:'relative'}}>

          {/* Ruler */}
          <div style={{height:24,position:'sticky',top:0,zIndex:20,display:'flex',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',userSelect:'none'}}>
            <div style={{width:LW,flexShrink:0,borderRight:'1px solid var(--border)',position:'sticky',left:0,background:'var(--bg-1)',zIndex:21,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <span style={{fontFamily:'var(--mono)',fontSize:8,color:'var(--text-3)',letterSpacing:'0.1em',textTransform:'uppercase'}}>TIME</span>
            </div>
            <div style={{position:'relative',flex:1,cursor:'pointer'}} onMouseDown={onRulerDown}>
              {Array.from({length:rulerTicks}).map((_,i)=>(
                <div key={i} style={{position:'absolute',left:i*zoom,top:0,bottom:0,borderLeft:`1px solid ${i%5===0?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.04)'}`,paddingLeft:4,display:'flex',alignItems:'center'}}>
                  {i%2===0&&<span style={{fontFamily:'var(--mono)',fontSize:9,color:i%5===0?'var(--text-1)':'var(--text-3)',fontWeight:i%5===0?500:400}}>{fmt(i)}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Video track */}
          <TRow label="映像" color={TRACK_COLORS.clip} icon={<IconFilm size={11}/>} onAdd={onAddVideo} accept="video/*">
            {clips.map((clip,idx)=>{
              const off=clips.slice(0,idx).reduce((s,c)=>s+(c.trimEnd-c.trimStart),0)
              const left=off*zoom, w=Math.max((clip.trimEnd-clip.trimStart)*zoom,4)
              return(
                <TItem key={clip.id} left={left} width={w} color={TRACK_COLORS.clip} selected={selItem?.id===clip.id}
                  label={clip.name} thumb={clip.thumbnail} muted={clip.muted}
                  onMouseDown={e=>{setSelItem({type:'clip',id:clip.id});setActiveClipId(clip.id);startDrag(e,'clip',clip.id,'startTime',off)}}
                  onResizeRight={e=>startResize(e,'clip',clip.id,'trimEnd')}
                  onDelete={()=>{snap();setClips(p=>p.filter(c=>c.id!==clip.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'clip',id:clip.id});setActiveClipId(clip.id);clipCtx(e,clip)}}
                />
              )
            })}
          </TRow>

          {/* Text track */}
          <TRow label="字幕" color={TRACK_COLORS.text} icon={<IconText size={11}/>} onAdd={()=>{snap();setTexts(p=>[...p,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+3}])}}>
            {texts.map(t=>{
              const left=t.startTime*zoom, w=Math.max((t.endTime-t.startTime)*zoom,20)
              return(
                <TItem key={t.id} left={left} width={w} color={TRACK_COLORS.text} selected={selItem?.id===t.id}
                  label={t.content||'(空)'}
                  onMouseDown={e=>{setSelItem({type:'text',id:t.id});startDrag(e,'text',t.id,'startTime',t.startTime)}}
                  onResizeRight={e=>startResize(e,'text',t.id,'endTime')}
                  onDelete={()=>{snap();setTexts(p=>p.filter(x=>x.id!==t.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'text',id:t.id});textCtx(e,t)}}
                />
              )
            })}
          </TRow>

          {/* Image track */}
          <TRow label="画像" color={TRACK_COLORS.image} icon={<IconImage size={11}/>} onAdd={onAddImage} accept="image/*">
            {images.map(img=>{
              const left=img.startTime*zoom, w=Math.max((img.endTime-img.startTime)*zoom,20)
              return(
                <TItem key={img.id} left={left} width={w} color={TRACK_COLORS.image} selected={selItem?.id===img.id}
                  label={img.name} thumb={img.url}
                  onMouseDown={e=>{setSelItem({type:'image',id:img.id});startDrag(e,'image',img.id,'startTime',img.startTime)}}
                  onResizeRight={e=>startResize(e,'image',img.id,'endTime')}
                  onDelete={()=>{snap();setImages(p=>p.filter(x=>x.id!==img.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'image',id:img.id});imgCtx(e,img)}}
                />
              )
            })}
          </TRow>

          {/* Audio track */}
          <TRow label="音声" color={TRACK_COLORS.audio} icon={<IconMusic size={11}/>} onAdd={onAddAudio} accept="audio/*">
            {audioTracks.map(track=>{
              const left=(track.startTime||0)*zoom, w=Math.max((track.duration||10)*zoom,40)
              return(
                <TItem key={track.id} left={left} width={w} color={TRACK_COLORS.audio} selected={selItem?.id===track.id}
                  label={track.name}
                  onMouseDown={e=>{setSelItem({type:'audio',id:track.id});startDrag(e,'audio',track.id,'startTime',track.startTime||0)}}
                  onResizeRight={e=>startResize(e,'audio',track.id,'duration')}
                  onDelete={()=>{snap();setAudioTracks(p=>p.filter(x=>x.id!==track.id))}}
                  onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'audio',id:track.id});audCtx(e,track)}}
                />
              )
            })}
          </TRow>

          {/* Playhead */}
          <div style={{position:'absolute',top:0,bottom:0,left:playheadX,width:1.5,background:'var(--accent)',zIndex:25,pointerEvents:'none',boxShadow:'0 0 6px rgba(212,255,62,0.4)'}}>
            {/* Draggable knob */}
            <div onMouseDown={startPlayheadDrag}
              style={{position:'absolute',top:24,left:'50%',transform:'translateX(-50%)',width:14,height:14,background:'var(--accent)',borderRadius:'50%',cursor:'ew-resize',pointerEvents:'all',boxShadow:'0 0 10px rgba(212,255,62,0.7)',border:'2px solid rgba(255,255,255,0.4)',zIndex:26}}
            />
            <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'7px solid var(--accent)'}}/>
          </div>
        </div>
      </div>
    </div>
  )
}

function TRow({label,color,icon,children,onAdd,accept}){
  return(
    <div style={{display:'flex',height:TH,borderBottom:'1px solid var(--border)'}}>
      <div style={{width:LW,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',paddingLeft:10,paddingRight:6,borderRight:'1px solid var(--border)',background:'var(--bg-1)',position:'sticky',left:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <span style={{color}}>{icon}</span>
          <span style={{fontSize:9,color:'var(--text-2)',fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase'}}>{label}</span>
        </div>
        {accept?(
          <label style={{cursor:'pointer',width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:3,background:'rgba(255,255,255,0.05)',color:'var(--text-2)',transition:'var(--t)'}}>
            <input type="file" accept={accept} multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>
            <IconPlus size={10}/>
          </label>
        ):(
          <button onClick={onAdd} style={{width:16,height:16,borderRadius:3,background:'rgba(255,255,255,0.05)',color:'var(--text-2)',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',transition:'var(--t)'}}>
            <IconPlus size={10}/>
          </button>
        )}
      </div>
      <div style={{position:'relative',flex:1,background:'repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(255,255,255,0.015) 79px,rgba(255,255,255,0.015) 80px)'}}>{children}</div>
    </div>
  )
}

function TItem({left,width,color,selected,label,thumb,muted,onMouseDown,onResizeRight,onDelete,onContextMenu}){
  return(
    <div onMouseDown={onMouseDown} onContextMenu={onContextMenu}
      style={{position:'absolute',left,top:4,height:TH-8,width,borderRadius:5,border:`1.5px solid ${selected?color:'rgba(255,255,255,0.08)'}`,background:selected?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.03)',cursor:'grab',overflow:'hidden',display:'flex',alignItems:'center',userSelect:'none',opacity:muted?0.45:1,transition:'border-color 0.1s,background 0.1s'}}>
      {thumb&&<img src={thumb} alt="" draggable={false} style={{height:'100%',width:'auto',opacity:0.35,flexShrink:0,pointerEvents:'none'}}/>}
      <span style={{fontFamily:'var(--mono)',fontSize:9,color,padding:'0 6px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,pointerEvents:'none',fontWeight:500}}>
        {muted?'🔇 ':''}{label}
      </span>
      <div onMouseDown={onResizeRight} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'ew-resize',background:`linear-gradient(to left, ${color}33, transparent)`,borderRadius:'0 5px 5px 0'}}/>
      <button onMouseDown={e=>e.stopPropagation()} onClick={onDelete}
        style={{position:'absolute',top:3,right:8,width:13,height:13,borderRadius:'50%',background:'rgba(255,61,90,0.75)',color:'#fff',fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',zIndex:5,border:'none',cursor:'pointer',opacity:0,transition:'opacity 0.1s'}}
        className="track-delete"
      >
        <IconX size={7}/>
      </button>
      <style>{`.track-delete{opacity:0!important} div:hover>.track-delete,.track-item:hover .track-delete{opacity:1!important}`}</style>
    </div>
  )
}

// ── ContextMenu ───────────────────────────────────────────────
function ContextMenu({x,y,items,onClose}){
  useEffect(()=>{
    const t=setTimeout(()=>{
      const h=()=>onClose()
      window.addEventListener('mousedown',h)
      return ()=>window.removeEventListener('mousedown',h)
    },50)
    return ()=>clearTimeout(t)
  },[onClose])

  const vw=window.innerWidth,vh=window.innerHeight
  const mw=190,mh=items.length*34
  const cx=x+mw>vw?x-mw:x
  const cy=y+mh>vh?y-mh:y

  return(
    <div onMouseDown={e=>e.stopPropagation()}
      style={{position:'fixed',left:cx,top:cy,zIndex:9999,background:'var(--bg-2)',border:'1px solid var(--border-hi)',borderRadius:8,padding:'5px 0',minWidth:mw,boxShadow:'0 12px 48px rgba(0,0,0,0.6),0 2px 8px rgba(0,0,0,0.3)',animation:'fadeInScale 0.12s ease',backdropFilter:'blur(12px)'}}>
      {items.map((item,i)=>
        item==='---'
          ?<div key={i} style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
          :<button key={i} onClick={()=>{item.action();onClose()}}
            style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'7px 14px',background:'transparent',color:item.danger?'var(--red)':'var(--text-0)',fontSize:12,fontWeight:450,textAlign:'left',border:'none',cursor:'pointer',transition:'background 0.1s'}}
            onMouseOver={e=>e.currentTarget.style.background='var(--bg-3)'}
            onMouseOut={e=>e.currentTarget.style.background='transparent'}
          >
            <span style={{color:item.danger?'var(--red)':'var(--text-2)',flexShrink:0}}>{item.icon}</span>
            <span style={{flex:1}}>{item.label}</span>
            {item.shortcut&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',background:'var(--bg-4)',padding:'1px 5px',borderRadius:3}}>{item.shortcut}</span>}
          </button>
      )}
    </div>
  )
}

// ── Panels ────────────────────────────────────────────────────
function ClipsPanel({clips,activeClipId,onSelect,onRemove,onAdd,onUpdate,selClip}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`映像クリップ (${clips.length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 10px',fontSize:11,gap:5}}>
          <input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>
          <IconPlus size={11}/>追加
        </label>
      </PHead>
      {clips.length===0&&<EmptyState icon={<IconFilm size={22}/>} text="動画をドロップして追加"/>}
      {clips.map(clip=>(
        <div key={clip.id} onClick={()=>onSelect(clip.id)}
          style={{display:'flex',gap:9,alignItems:'center',padding:'8px 10px',borderRadius:var_r2,background:activeClipId===clip.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${activeClipId===clip.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',transition:'var(--t)'}}>
          {clip.thumbnail
            ?<img src={clip.thumbnail} alt="" style={{width:48,height:27,objectFit:'cover',borderRadius:4,flexShrink:0,border:'1px solid var(--border)'}}/>
            :<div style={{width:48,height:27,background:'var(--bg-4)',borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}><IconFilm size={14} style={{color:'var(--text-3)'}}/></div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-0)'}}>{clip.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--blue)',marginTop:1}}>{fmt(clip.trimEnd-clip.trimStart)} · {fmt(clip.duration)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();onRemove(clip.id)}} style={{color:'var(--red)',background:'transparent',border:'none'}}>
            <IconX size={12}/>
          </button>
        </div>
      ))}
      {selClip&&(
        <div style={{borderTop:'1px solid var(--border)',paddingTop:12,display:'flex',flexDirection:'column',gap:8}}>
          <span className="label">トリム設定</span>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
            <div><span className="label">IN (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimStart.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimStart',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">OUT (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimEnd.toFixed(2)} onChange={e=>onUpdate(selClip.id,'trimEnd',+e.target.value)} style={{width:'100%'}}/></div>
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
        <button className="btn btn-ghost" style={{padding:'4px 10px',fontSize:11,gap:5}} onClick={()=>{snap();const id=crypto.randomUUID();setTexts(p=>[...p,{id,content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+5}]);setSelectedId(id)}}>
          <IconPlus size={11}/>追加
        </button>
      </PHead>
      {texts.length===0&&<EmptyState icon={<IconText size={22}/>} text="テキストを追加"/>}
      {texts.map(t=>(
        <div key={t.id} onClick={()=>setSelectedId(t.id)}
          style={{padding:'8px 10px',borderRadius:var_r2,background:selectedId===t.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selectedId===t.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',display:'flex',alignItems:'center',gap:9,transition:'var(--t)'}}>
          <div style={{width:24,height:24,borderRadius:4,background:'var(--bg-4)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <IconText size={12} style={{color:'var(--accent)'}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.content||'(空)'}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',marginTop:1}}>{fmt(t.startTime)} → {fmt(t.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();setTexts(p=>p.filter(x=>x.id!==t.id));if(selectedId===t.id)setSelectedId(null)}} style={{color:'var(--red)',background:'transparent',border:'none'}}>
            <IconX size={12}/>
          </button>
        </div>
      ))}
      {sel&&(
        <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:12,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          <span className="label">編集中</span>
          <textarea value={sel.content} onChange={e=>upd('content',e.target.value)} rows={2} style={{width:'100%',resize:'none',fontFamily:'var(--font)',fontSize:12,borderRadius:var_r,lineHeight:1.6}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">フォントサイズ</span><input type="number" min={8} max={200} value={sel.fontSize} onChange={e=>upd('fontSize',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">カラー</span><div style={{display:'flex',gap:5}}><input type="color" value={sel.color} onChange={e=>upd('color',e.target.value)} style={{width:32,height:28,padding:2}}/><input value={sel.color} onChange={e=>upd('color',e.target.value)} style={{flex:1,fontSize:11}}/></div></div>
          </div>
          <Sld label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)}/>
          <Sld label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始 (秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了 (秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
          {/* Preview */}
          <div style={{position:'relative',background:'#000',borderRadius:6,aspectRatio:'16/9',overflow:'hidden',border:'1px solid var(--border)'}}>
            <div style={{position:'absolute',left:`${sel.x}%`,top:`${sel.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,sel.fontSize*0.22),color:sel.color,fontWeight:700,textShadow:'1px 1px 4px rgba(0,0,0,0.9)',maxWidth:'90%',textAlign:'center'}}>{sel.content||'テキスト'}</div>
            <div style={{position:'absolute',bottom:4,right:6,fontFamily:'var(--mono)',fontSize:8,color:'rgba(255,255,255,0.2)'}}>PREVIEW</div>
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
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 10px',fontSize:11,gap:5}}>
          <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{snap();Array.from(e.target.files).forEach(async f=>{const url=URL.createObjectURL(f);const id=crypto.randomUUID();setImages(p=>[...p,{id,file:f,name:f.name,url,startTime:currentTime,endTime:currentTime+5,x:50,y:50,scale:40,opacity:1}])})}}/>
          <IconPlus size={11}/>追加
        </label>
      </PHead>
      {images.length===0&&<EmptyState icon={<IconImage size={22}/>} text="画像をドロップして追加"/>}
      {images.map(img=>(
        <div key={img.id} onClick={()=>setSelectedId(img.id)}
          style={{display:'flex',gap:9,alignItems:'center',padding:'8px 10px',borderRadius:var_r2,background:selectedId===img.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selectedId===img.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',transition:'var(--t)'}}>
          <img src={img.url} alt="" style={{width:48,height:27,objectFit:'cover',borderRadius:4,flexShrink:0,border:'1px solid var(--border)'}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--orange)',marginTop:1}}>{fmt(img.startTime)} → {fmt(img.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();setImages(p=>p.filter(x=>x.id!==img.id));if(selectedId===img.id)setSelectedId(null)}} style={{color:'var(--red)',background:'transparent',border:'none'}}>
            <IconX size={12}/>
          </button>
        </div>
      ))}
      {sel&&(
        <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:12,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          <span className="label">配置設定</span>
          <Sld label={`X: ${sel.x}%`} value={sel.x} min={0} max={100} onChange={v=>upd('x',v)}/>
          <Sld label={`Y: ${sel.y}%`} value={sel.y} min={0} max={100} onChange={v=>upd('y',v)}/>
          <Sld label={`サイズ: ${sel.scale}%`} value={sel.scale} min={5} max={100} onChange={v=>upd('scale',v)}/>
          <Sld label={`不透明度: ${Math.round(sel.opacity*100)}%`} value={sel.opacity} min={0} max={1} step={0.05} onChange={v=>upd('opacity',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始 (秒)</span><input type="number" min={0} step={0.1} value={sel.startTime} onChange={e=>upd('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了 (秒)</span><input type="number" min={0} step={0.1} value={sel.endTime} onChange={e=>upd('endTime',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
        </div>
      )}
    </div>
  )
}

function FiltersPanel({filters,onChange}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title="フィルタープリセット"/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:5}}>
        {PRESETS.map(p=>{
          const act=JSON.stringify(p.f)===JSON.stringify(filters)
          return(
            <button key={p.name} onClick={()=>onChange(p.f)}
              style={{padding:'6px 3px',fontSize:10,fontWeight:600,borderRadius:var_r,background:act?'var(--accent-bg)':'var(--bg-3)',color:act?'var(--accent)':'var(--text-1)',border:`1px solid ${act?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
              {p.name}
            </button>
          )
        })}
      </div>
      <div className="divider"/>
      <PHead title="詳細調整"/>
      <Sld label={`明るさ ${sd(filters.brightness)}%`}    value={filters.brightness} min={0} max={2}  step={0.05} onChange={v=>onChange({...filters,brightness:v})}/>
      <Sld label={`コントラスト ${sd(filters.contrast)}%`} value={filters.contrast}  min={0} max={3}  step={0.05} onChange={v=>onChange({...filters,contrast:v})}/>
      <Sld label={`彩度 ${sd(filters.saturation)}%`}       value={filters.saturation} min={0} max={3}  step={0.05} onChange={v=>onChange({...filters,saturation:v})}/>
      <Sld label={`ブラー ${filters.blur}px`}              value={filters.blur}       min={0} max={10} step={0.5}  onChange={v=>onChange({...filters,blur:v})}/>
      {/* Preview swatch */}
      <div style={{height:20,borderRadius:6,background:'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)',filter:`brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`,border:'1px solid var(--border)',marginTop:4}}/>
    </div>
  )
}

function AudioPanel({audio,onChange,audioTracks,setAudioTracks,onAdd,snap}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      <div style={{padding:'12px 13px',background:'var(--bg-2)',borderRadius:var_r2,border:`1px solid ${audio.mute?'rgba(255,61,90,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontSize:12,fontWeight:600}}>元音声ミュート</div>
            <div style={{fontSize:10,color:'var(--text-2)',fontFamily:'var(--mono)',marginTop:1}}>動画の音声を無効化</div>
          </div>
          <Tog value={audio.mute} onChange={v=>onChange({...audio,mute:v})} color="var(--red)"/>
        </div>
        <div style={{opacity:audio.mute?0.35:1,transition:'var(--t)',pointerEvents:audio.mute?'none':'auto'}}>
          <Sld label={`音量: ${Math.round(audio.volume*100)}%`} value={audio.volume} min={0} max={2} step={0.05} onChange={v=>onChange({...audio,volume:v})}/>
        </div>
      </div>

      <PHead title={`BGMトラック (${audioTracks.length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 10px',fontSize:11,gap:5}}>
          <input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>
          <IconPlus size={11}/>追加
        </label>
      </PHead>
      {audioTracks.length===0&&<EmptyState icon={<IconMusic size={22}/>} text="音声ファイルを追加"/>}
      {audioTracks.map(t=>(
        <div key={t.id} style={{padding:'10px 12px',background:'var(--bg-2)',borderRadius:var_r2,border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:22,height:22,borderRadius:4,background:'rgba(39,201,106,0.15)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(39,201,106,0.2)'}}>
                <IconMusic size={11} style={{color:'var(--green)'}}/>
              </div>
              <span style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{t.name}</span>
            </div>
            <button className="btn-icon" onClick={()=>{snap();setAudioTracks(p=>p.filter(x=>x.id!==t.id))}} style={{color:'var(--red)',background:'transparent',border:'none'}}>
              <IconX size={12}/>
            </button>
          </div>
          <Sld label={`音量: ${Math.round((t.volume||0.8)*100)}%`} value={t.volume||0.8} min={0} max={1} step={0.05} onChange={v=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,volume:v}:x))}/>
          <div style={{marginTop:8}}><span className="label">開始位置 (秒)</span><input type="number" min={0} step={0.1} value={t.startTime||0} onChange={e=>setAudioTracks(p=>p.map(x=>x.id===t.id?{...x,startTime:+e.target.value}:x))} style={{width:'100%'}}/></div>
        </div>
      ))}
    </div>
  )
}

function ExportPanel({processing,progress,eta,onExport,outputBlob,exportExt,onDownload,clipsCount,exportSettings,setExportSettings}){
  const upd=(k,v)=>setExportSettings(s=>({...s,[k]:v}))
  const scaleOpts=[{value:1,label:'100%'},{value:0.75,label:'75%'},{value:0.5,label:'50%'},{value:0.25,label:'25%'}]
  const qualityOpts=[{value:0.95,label:'最高品質'},{value:0.85,label:'高品質'},{value:0.7,label:'標準'},{value:0.5,label:'軽量'}]

  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      {/* Engine info */}
      <div style={{display:'flex',gap:8,padding:'10px 12px',background:'rgba(39,201,106,0.08)',border:'1px solid rgba(39,201,106,0.2)',borderRadius:var_r2}}>
        <IconCheckCircle size={15} style={{color:'var(--green)',flexShrink:0,marginTop:1}}/>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-1)',lineHeight:1.7}}>
          <span style={{color:'var(--green)',fontWeight:600}}>Canvas + MediaRecorder</span><br/>
          インストール不要・テキスト/画像を完全反映<br/>
          出力形式: <span style={{color:'var(--accent)'}}>WebM（VP9）</span>
        </div>
      </div>

      {/* Settings */}
      <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:13,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:12}}>
        <PHead title="エクスポート設定"/>

        {/* Quality */}
        <div>
          <span className="label">品質</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
            {qualityOpts.map(q=>(
              <button key={q.value} onClick={()=>upd('quality',q.value)}
                style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:var_r,background:exportSettings.quality===q.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.quality===q.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.quality===q.value?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scale */}
        <div>
          <span className="label">解像度スケール</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
            {scaleOpts.map(s=>(
              <button key={s.value} onClick={()=>upd('scale',s.value)}
                style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:var_r,background:exportSettings.scale===s.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.scale===s.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.scale===s.value?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* FPS */}
        <div>
          <span className="label">フレームレート</span>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>
            {[24,30,60].map(f=>(
              <button key={f} onClick={()=>upd('fps',f)}
                style={{padding:'5px 2px',fontSize:11,fontWeight:600,borderRadius:var_r,background:exportSettings.fps===f?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.fps===f?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.fps===f?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
                {f}fps
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'flex',gap:7,padding:'8px 10px',background:'var(--bg-3)',borderRadius:var_r,border:'1px solid var(--border)'}}>
          <IconInfo size={13} style={{color:'var(--text-2)',flexShrink:0,marginTop:1}}/>
          <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',lineHeight:1.7}}>
            WebMをMP4に変換したい場合は<br/>
            HandBrakeなどで変換できます
          </span>
        </div>
      </div>

      {/* Progress */}
      {processing&&(
        <div className="anim-fade">
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:11,color:'var(--text-1)'}}>録画中...</span>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:500}}>
              {progress}%{eta!=null?` · 残り${eta}秒`:''}
            </span>
          </div>
          <div style={{height:4,background:'var(--bg-4)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${progress}%`,background:'linear-gradient(90deg,var(--accent),#a8ff00)',transition:'width 0.3s',boxShadow:'0 0 10px rgba(212,255,62,0.4)'}}/>
          </div>
        </div>
      )}

      <button className="btn btn-accent" style={{width:'100%',justifyContent:'center',padding:'11px',fontSize:13,gap:7}} onClick={onExport} disabled={processing||clipsCount===0}>
        {processing?<><span className="anim-spin"><IconSettings size={14}/></span>{progress}%</>:<><IconSettings size={14}/>エクスポート開始</>}
      </button>

      {outputBlob&&!processing&&(
        <div className="anim-fade">
          <div style={{display:'flex',alignItems:'center',gap:9,padding:'10px 13px',background:'rgba(39,201,106,0.08)',border:'1px solid rgba(39,201,106,0.2)',borderRadius:var_r2,marginBottom:8}}>
            <IconCheckCircle size={16} style={{color:'var(--green)',flexShrink:0}}/>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'var(--green)'}}>エクスポート完了</div>
              <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',marginTop:1}}>{(outputBlob.size/1024/1024).toFixed(2)} MB · .{exportExt}</div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center',gap:7}} onClick={onDownload}>
            <IconDownload size={14}/>ダウンロード (.{exportExt})
          </button>
        </div>
      )}
    </div>
  )
}
// ── Shared UI ─────────────────────────────────────────────────
const var_r  = 'var(--r)'
const var_r2 = 'var(--r2)'

// ── Shared UI ─────────────────────────────────────────────────
const var_r  = 'var(--r)'
const var_r2 = 'var(--r2)'

function PHead({title,children}){
  return(
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
      <span style={{fontSize:11,fontWeight:600,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{title}</span>
      {children}
    </div>
  )
}
function Sld({label,value,min,max,step=0.01,onChange}){
  return(
    <div>
      <span className="label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}/>
    </div>
  )
}
function Tog({value,onChange,color='var(--accent)'}){
  return(
    <button onClick={()=>onChange(!value)}
      style={{width:36,height:20,borderRadius:10,background:value?color:'var(--bg-5)',border:`1px solid ${value?color:'var(--border-hi)'}`,position:'relative',cursor:'pointer',transition:'background 0.2s,border-color 0.2s',flexShrink:0}}>
      <div style={{position:'absolute',top:2,left:value?18:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/>
    </button>
  )
}
function EmptyState({icon,text}){
  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'20px 0',color:'var(--text-3)'}}>
      {React.cloneElement(icon,{style:{color:'var(--text-3)'}})}
      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)'}}>{text}</span>
    </div>
  )
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
    const v=document.createElement('video');v.preload='metadata'
    v.onloadedmetadata=()=>{r(v.duration);v.src=''};v.onerror=()=>r(0);v.src=url
  })
}
function getAudioDuration(url){
  return new Promise(r=>{const a=new Audio();a.onloadedmetadata=()=>r(a.duration);a.onerror=()=>r(60);a.src=url})
}
function getVideoThumbnail(url){
  return new Promise(r=>{
    const v=document.createElement('video'),c=document.createElement('canvas')
    c.width=80;c.height=45;v.preload='auto';v.muted=true
    v.onloadeddata=()=>{v.currentTime=Math.min(1,v.duration*0.1)}
    v.onseeked=()=>{try{c.getContext('2d').drawImage(v,0,0,80,45);r(c.toDataURL('image/jpeg',0.6))}catch{r(null)};v.src=''}
    v.onerror=()=>r(null);v.src=url
  })
}
