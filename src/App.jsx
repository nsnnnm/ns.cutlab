import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useFFmpeg } from './hooks/useFFmpeg.js'
import { useExporter } from './hooks/useExporter.js'
import {
  CutLabLogo, IconPlay, IconPause, IconScissors, IconUndo, IconRedo,
  IconFilm, IconText, IconImage, IconSliders, IconMusic, IconSettings,
  IconDownload, IconPlus, IconX, IconZoomIn, IconZoomOut,
  IconVolume, IconVolumeMute, IconCopy, IconTrash, IconCheckCircle,
  IconInfo, IconCpu, IconClock,
} from './components/Icons.jsx'

// ── Constants ─────────────────────────────────────────────────
const TABS = [
  { id:'clips',   label:'クリップ',   Icon: IconFilm    },
  { id:'text',    label:'テキスト',   Icon: IconText    },
  { id:'image',   label:'画像',       Icon: IconImage   },
  { id:'filters', label:'フィルター', Icon: IconSliders },
  { id:'audio',   label:'音声',       Icon: IconMusic   },
  { id:'export',  label:'出力',       Icon: IconSettings},
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
const TH = 44
const LW = 64
const DEF_FILTERS = {brightness:1,contrast:1,saturation:1,blur:0}
const DEF_AUDIO   = {mute:false,volume:1}
const var_r  = 'var(--r)'
const var_r2 = 'var(--r2)'

// track factory helpers
const mkTrack = (type) => ({ id: crypto.randomUUID(), type, items: [] })

// ── App ───────────────────────────────────────────────────────
export default function App() {
  // Multi-track: each track row holds items[]
  // videoTracks: items = clips, textTracks: items = text overlays, etc.
  const [videoTracks, setVideoTracks] = useState([{ id: crypto.randomUUID(), type:'video', items:[] }])
  const [textTracks,  setTextTracks]  = useState([{ id: crypto.randomUUID(), type:'text',  items:[] }])
  const [imageTracks, setImageTracks] = useState([{ id: crypto.randomUUID(), type:'image', items:[] }])
  const [audioTracks, setAudioTracks] = useState([{ id: crypto.randomUUID(), type:'audio', items:[] }])

  const [filters,        setFilters]        = useState(DEF_FILTERS)
  const [audioSettings,  setAudioSettings]  = useState(DEF_AUDIO)
  const [activeClipId,   setActiveClipId]   = useState(null)
  const [selItem,        setSelItem]        = useState(null) // {type, trackId, itemId}
  const [activeTab,      setActiveTab]      = useState('clips')
  const [currentTime,    setCurrentTime]    = useState(0)
  const [isPlaying,      setIsPlaying]      = useState(false)
  const [outputBlob,     setOutputBlob]     = useState(null)
  const [exportExt,      setExportExt]      = useState('webm')
  const [processing,     setProcessing]     = useState(false)
  const [zoom,           setZoom]           = useState(80)
  const [volume,         setVolume]         = useState(1)
  const [isMuted,        setIsMuted]        = useState(false)
  const [speed,          setSpeed]          = useState(1)
  const [history,        setHistory]        = useState([])
  const [future,         setFuture]         = useState([])
  const [ctxMenu,        setCtxMenu]        = useState(null)
  const [exportSettings, setExportSettings] = useState({fps:30,quality:0.85,scale:1,audioBitrate:128000})
  const [dragging,       setDragging]       = useState(false)

  const videoRef  = useRef(null)
  const audioRefs = useRef({})
  const { load, loaded, loading } = useFFmpeg()
  const { exportVideo, exporting, progress, eta } = useExporter()

  // Flatten helpers
  const allClips      = useMemo(()=>videoTracks.flatMap(t=>t.items),[videoTracks])
  const allTexts      = useMemo(()=>textTracks.flatMap(t=>t.items),[textTracks])
  const allImages     = useMemo(()=>imageTracks.flatMap(t=>t.items),[imageTracks])
  const allAudioItems = useMemo(()=>audioTracks.flatMap(t=>t.items),[audioTracks])
  const activeClip    = allClips.find(c=>c.id===activeClipId)||allClips[0]
  const totalDuration = useMemo(()=>allClips.reduce((s,c)=>s+(c.trimEnd-c.trimStart),0),[allClips])

  // ── History ───────────────────────────────────────────────
  const snap=useCallback(()=>{
    setHistory(h=>[...h.slice(-30),{videoTracks,textTracks,imageTracks,audioTracks}])
    setFuture([])
  },[videoTracks,textTracks,imageTracks,audioTracks])

  const undo=useCallback(()=>{
    if(!history.length) return
    const p=history[history.length-1]
    setFuture(f=>[{videoTracks,textTracks,imageTracks,audioTracks},...f])
    setHistory(h=>h.slice(0,-1))
    setVideoTracks(p.videoTracks);setTextTracks(p.textTracks)
    setImageTracks(p.imageTracks);setAudioTracks(p.audioTracks)
  },[history,videoTracks,textTracks,imageTracks,audioTracks])

  const redo=useCallback(()=>{
    if(!future.length) return
    const n=future[0]
    setHistory(h=>[...h,{videoTracks,textTracks,imageTracks,audioTracks}])
    setFuture(f=>f.slice(1))
    setVideoTracks(n.videoTracks);setTextTracks(n.textTracks)
    setImageTracks(n.imageTracks);setAudioTracks(n.audioTracks)
  },[future,videoTracks,textTracks,imageTracks,audioTracks])

  // Track updaters
  const updVideoTrack=(trackId,fn)=>setVideoTracks(p=>p.map(t=>t.id===trackId?{...t,items:fn(t.items)}:t))
  const updTextTrack =(trackId,fn)=>setTextTracks(p=>p.map(t=>t.id===trackId?{...t,items:fn(t.items)}:t))
  const updImgTrack  =(trackId,fn)=>setImageTracks(p=>p.map(t=>t.id===trackId?{...t,items:fn(t.items)}:t))
  const updAudTrack  =(trackId,fn)=>setAudioTracks(p=>p.map(t=>t.id===trackId?{...t,items:fn(t.items)}:t))

  // Add track rows
  const addVideoTrackRow=()=>setVideoTracks(p=>[...p,{...mkTrack('video')}])
  const addTextTrackRow =()=>setTextTracks(p=>[...p,{...mkTrack('text')}])
  const addImgTrackRow  =()=>setImageTracks(p=>[...p,{...mkTrack('image')}])
  const addAudTrackRow  =()=>setAudioTracks(p=>[...p,{...mkTrack('audio')}])

  const removeTrackRow=(setter,trackId)=>setter(p=>{if(p.length<=1) return p; return p.filter(t=>t.id!==trackId)})

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

  const seekDelta=(d)=>{const v=videoRef.current;if(!v) return;seekTo(Math.max(0,Math.min(totalDuration,(v.currentTime||0)+d)))}
  const delSel=()=>{
    if(!selItem) return;snap()
    if(selItem.type==='clip')  updVideoTrack(selItem.trackId,items=>items.filter(i=>i.id!==selItem.itemId))
    if(selItem.type==='text')  updTextTrack(selItem.trackId,items=>items.filter(i=>i.id!==selItem.itemId))
    if(selItem.type==='image') updImgTrack(selItem.trackId,items=>items.filter(i=>i.id!==selItem.itemId))
    if(selItem.type==='audio') updAudTrack(selItem.trackId,items=>items.filter(i=>i.id!==selItem.itemId))
    setSelItem(null)
  }

  // ── BGM sync ──────────────────────────────────────────────
  useEffect(()=>{
    allAudioItems.forEach(t=>{
      if(!audioRefs.current[t.id]){
        const a=new Audio(t.url);a.volume=t.volume??0.8
        audioRefs.current[t.id]=a
      } else audioRefs.current[t.id].volume=t.volume??0.8
    })
    Object.keys(audioRefs.current).forEach(id=>{
      if(!allAudioItems.find(t=>t.id===id)){audioRefs.current[id].pause();delete audioRefs.current[id]}
    })
  },[allAudioItems])

  const syncBGM=useCallback((time,playing)=>{
    allAudioItems.forEach(t=>{
      const el=audioRefs.current[t.id];if(!el) return
      const rel=time-(t.startTime||0)
      if(rel>=0&&rel<(t.duration||999)){el.currentTime=rel;if(playing) el.play().catch(()=>{});else el.pause()}
      else el.pause()
    })
  },[allAudioItems])

  useEffect(()=>{const v=videoRef.current;if(!v) return;v.volume=isMuted?0:volume;v.playbackRate=speed},[volume,isMuted,speed])

  useEffect(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    const onTime=()=>{
      setCurrentTime(v.currentTime)
      if(v.currentTime>=activeClip.trimEnd){v.pause();v.currentTime=activeClip.trimStart;setIsPlaying(false);syncBGM(activeClip.trimStart,false)}
    }
    v.addEventListener('timeupdate',onTime)
    return ()=>v.removeEventListener('timeupdate',onTime)
  },[activeClip,syncBGM])

  useEffect(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    v.src=activeClip.url;v.currentTime=activeClip.trimStart
    setCurrentTime(activeClip.trimStart);setIsPlaying(false);syncBGM(activeClip.trimStart,false)
  },[activeClipId])

  const togglePlay=useCallback(()=>{
    const v=videoRef.current;if(!v||!activeClip) return
    if(isPlaying){v.pause();setIsPlaying(false);syncBGM(v.currentTime,false)}
    else{if(v.currentTime>=activeClip.trimEnd) v.currentTime=activeClip.trimStart;v.play();setIsPlaying(true);syncBGM(v.currentTime,true)}
  },[isPlaying,activeClip,syncBGM])

  const seekTo=useCallback((t)=>{
    const v=videoRef.current;if(!v) return
    const c=Math.max(0,Math.min(totalDuration,t));v.currentTime=c;setCurrentTime(c);syncBGM(c,isPlaying)
  },[totalDuration,isPlaying,syncBGM])

  // ── Import ────────────────────────────────────────────────
  const addVideoFiles=useCallback(async(files,trackId)=>{
    snap()
    const nc=[]
    for(const f of files){
      if(!f.type.startsWith('video/')) continue
      const url=URL.createObjectURL(f)
      const ext=f.name.split('.').pop().toLowerCase()||'mp4'
      const id=crypto.randomUUID()
      const dur=await getVideoDuration(url)
      const thumb=await getVideoThumbnail(url)
      if(dur<=0) continue
      nc.push({id,file:f,ext,name:f.name,url,duration:dur,trimStart:0,trimEnd:dur,startTime:0,thumbnail:thumb})
    }
    if(!nc.length) return
    const tid=trackId||videoTracks[0].id
    updVideoTrack(tid,items=>[...items,...nc])
    if(!activeClipId) setActiveClipId(nc[0].id)
  },[snap,videoTracks,activeClipId])

  const addAudioFiles=useCallback(async(files,trackId)=>{
    snap()
    for(const f of files){
      if(!f.type.startsWith('audio/')) continue
      const url=URL.createObjectURL(f)
      const ext=f.name.split('.').pop().toLowerCase()||'mp3'
      const id=crypto.randomUUID()
      const dur=await getAudioDuration(url)
      const tid=trackId||audioTracks[0].id
      updAudTrack(tid,items=>[...items,{id,file:f,ext,name:f.name,url,duration:dur,startTime:0,volume:0.8}])
    }
  },[snap,audioTracks])

  const addImageFiles=useCallback(async(files,trackId)=>{
    snap()
    for(const f of files){
      if(!f.type.startsWith('image/')) continue
      const url=URL.createObjectURL(f)
      const id=crypto.randomUUID()
      const tid=trackId||imageTracks[0].id
      updImgTrack(tid,items=>[...items,{id,file:f,name:f.name,url,startTime:0,endTime:5,x:50,y:50,scale:40,opacity:1}])
    }
  },[snap,imageTracks])

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
    // find which track contains activeClip
    const trackId=videoTracks.find(tr=>tr.items.find(c=>c.id===activeClip.id))?.id
    if(!trackId) return
    updVideoTrack(trackId,items=>{
      const idx=items.findIndex(c=>c.id===activeClip.id)
      const upd=items.map(c=>c.id===activeClip.id?{...c,trimEnd:t}:c)
      upd.splice(idx+1,0,{...activeClip,id:nid,trimStart:t})
      return upd
    })
  },[activeClip,currentTime,snap,videoTracks])

  const handleExport=async()=>{
    if(!allClips.length) return
    setProcessing(true);setOutputBlob(null)
    try{
      const result=await exportVideo({
        clips:allClips,
        textTracks:allTexts,
        imageTracks:allImages,
        audioTracks:allAudioItems,
        filters,audioSettings,exportSettings,
      })
      setOutputBlob(result.blob);setExportExt(result.ext);setActiveTab('export')
    }catch(e){console.error(e);alert('エクスポートエラー: '+e.message)}
    finally{setProcessing(false)}
  }

  const isProcessing=processing||exporting
  const openCtxMenu=(e,items)=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,items})}
  const selClip=selItem?.type==='clip'?allClips.find(c=>c.id===selItem.itemId):null

  return(
    <div style={{height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--bg-0)'}}
      onDrop={handleDrop} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
      onClick={()=>ctxMenu&&setCtxMenu(null)}
    >
      {dragging&&(
        <div style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(212,255,62,0.06)',border:'2px dashed var(--accent)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:8}}>📂</div>
            <div style={{fontSize:18,fontWeight:700,color:'var(--accent)'}}>ここにドロップ</div>
          </div>
        </div>
      )}

      <AppHeader
        processing={isProcessing} progress={progress}
        onExport={handleExport} clipsCount={allClips.length}
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
                  {allTexts.map(t=>{
                    if(!t.content||currentTime<t.startTime||currentTime>t.endTime) return null
                    return <div key={t.id} style={{position:'absolute',left:`${t.x}%`,top:`${t.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,t.fontSize*0.38),color:t.color,fontFamily:'var(--font)',fontWeight:700,textShadow:'1px 1px 4px rgba(0,0,0,0.9)',whiteSpace:'pre-wrap',textAlign:'center',maxWidth:'90%'}}>{t.content}</div>
                  })}
                  {allImages.map(img=>{
                    if(currentTime<img.startTime||currentTime>img.endTime) return null
                    return <img key={img.id} src={img.url} alt="" style={{position:'absolute',left:`${img.x}%`,top:`${img.y}%`,transform:'translate(-50%,-50%)',width:`${img.scale}%`,objectFit:'contain',opacity:img.opacity}}/>
                  })}
                </div>
                <div style={{position:'absolute',bottom:10,right:12,fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,0.55)',background:'rgba(0,0,0,0.6)',padding:'3px 8px',borderRadius:4}}>
                  {fmt(currentTime)} / {fmt(totalDuration)}
                </div>
              </>
            ):(
              <label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,cursor:'pointer',opacity:0.45}}>
                <input type="file" accept="video/*,audio/*,image/*" multiple style={{display:'none'}} onChange={e=>{const f=Array.from(e.target.files);addVideoFiles(f);addAudioFiles(f);addImageFiles(f)}}/>
                <div style={{width:72,height:72,borderRadius:'50%',background:'var(--bg-3)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <IconFilm size={28} style={{color:'var(--text-2)'}}/>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontWeight:600,fontSize:14,marginBottom:6,color:'var(--text-1)'}}>動画・音声・画像をドロップ</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text-2)',lineHeight:1.8}}>MP4 · MOV · MP3 · JPG · PNG<br/><span style={{fontSize:10}}>Space=再生　←→=移動　S=分割　Ctrl+Z=Undo</span></div>
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
            videoTracks={videoTracks} setVideoTracks={setVideoTracks}
            textTracks={textTracks}   setTextTracks={setTextTracks}
            imageTracks={imageTracks} setImageTracks={setImageTracks}
            audioTracks={audioTracks} setAudioTracks={setAudioTracks}
            activeClipId={activeClipId} setActiveClipId={setActiveClipId}
            currentTime={currentTime} totalDuration={totalDuration}
            onSeek={seekTo} zoom={zoom}
            selItem={selItem} setSelItem={setSelItem}
            addVideoFiles={addVideoFiles} addAudioFiles={addAudioFiles} addImageFiles={addImageFiles}
            addVideoTrackRow={addVideoTrackRow} addTextTrackRow={addTextTrackRow}
            addImgTrackRow={addImgTrackRow} addAudTrackRow={addAudTrackRow}
            removeTrackRow={removeTrackRow}
            snap={snap} splitClip={splitClip}
            openCtxMenu={openCtxMenu}
          />
        </div>

        {/* Right panel */}
        <div style={{width:304,display:'flex',flexDirection:'column',background:'var(--bg-1)',flexShrink:0}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0,padding:'0 4px'}}>
            {TABS.map(({id,label,Icon:TabIcon})=>(
              <button key={id} onClick={()=>setActiveTab(id)} style={{flex:1,padding:'10px 2px 8px',background:'transparent',color:activeTab===id?'var(--accent)':'var(--text-2)',borderBottom:`2px solid ${activeTab===id?'var(--accent)':'transparent'}`,display:'flex',flexDirection:'column',alignItems:'center',gap:3,transition:'var(--t)'}}>
                <TabIcon size={14} style={{color:activeTab===id?'var(--accent)':'var(--text-2)',transition:'var(--t)'}}/>
                <span style={{fontSize:9,fontWeight:600,letterSpacing:'0.04em',textTransform:'uppercase'}}>{label}</span>
              </button>
            ))}
          </div>
          <div style={{flex:1,overflowY:'auto',padding:14}}>
            {activeTab==='clips'   && <ClipsPanel videoTracks={videoTracks} activeClipId={activeClipId} onSelect={id=>{setActiveClipId(id);const t=videoTracks.find(tr=>tr.items.find(c=>c.id===id));setSelItem(t?{type:'clip',trackId:t.id,itemId:id}:null)}} onRemove={(trackId,id)=>{snap();updVideoTrack(trackId,items=>items.filter(c=>c.id!==id))}} onAdd={addVideoFiles} onUpdate={(trackId,id,k,v)=>updVideoTrack(trackId,items=>items.map(c=>c.id===id?{...c,[k]:v}:c))} selClip={selClip} selItem={selItem}/>}
            {activeTab==='text'    && <TextPanel textTracks={textTracks} setTextTracks={setTextTracks} selItem={selItem} setSelItem={setSelItem} currentTime={currentTime} snap={snap} updTextTrack={updTextTrack} addTextTrackRow={addTextTrackRow}/>}
            {activeTab==='image'   && <ImagePanel imageTracks={imageTracks} setImageTracks={setImageTracks} selItem={selItem} setSelItem={setSelItem} currentTime={currentTime} snap={snap} updImgTrack={updImgTrack} addImgTrackRow={addImgTrackRow}/>}
            {activeTab==='filters' && <FiltersPanel filters={filters} onChange={setFilters}/>}
            {activeTab==='audio'   && <AudioPanel audio={audioSettings} onChange={setAudioSettings} audioTracks={audioTracks} setAudioTracks={setAudioTracks} onAdd={addAudioFiles} snap={snap} updAudTrack={updAudTrack} addAudTrackRow={addAudTrackRow}/>}
            {activeTab==='export'  && <ExportPanel processing={isProcessing} progress={progress} eta={eta} onExport={handleExport} outputBlob={outputBlob} exportExt={exportExt} onDownload={()=>{const a=document.createElement('a');a.href=URL.createObjectURL(outputBlob);a.download=`cutlab_${Date.now()}.${exportExt}`;a.click()}} clipsCount={allClips.length} exportSettings={exportSettings} setExportSettings={setExportSettings}/>}
          </div>
        </div>
      </div>

      {ctxMenu&&<ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={()=>setCtxMenu(null)}/>}
    </div>
  )
}

// ── AppHeader ─────────────────────────────────────────────────
function AppHeader({processing,progress,onExport,clipsCount,onAddVideo,onAddAudio,onAddImage,onUndo,onRedo,canUndo,canRedo,zoom,onZoom}){
  return(
    <div style={{height:48,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 16px',background:'var(--bg-1)',borderBottom:'1px solid var(--border)',flexShrink:0,gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:9,flexShrink:0}}>
        <CutLabLogo size={26}/>
        <div style={{fontFamily:'var(--font)',fontWeight:800,fontSize:16,letterSpacing:'-0.03em'}}>
          <span style={{color:'var(--accent)'}}>Cut</span><span style={{color:'var(--text-0)'}}>Lab</span>
        </div>
      </div>
      <div style={{display:'flex',gap:3,alignItems:'center'}}>
        <button className="btn-icon" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z" style={{opacity:canUndo?1:0.3}}><IconUndo size={14}/></button>
        <button className="btn-icon" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y" style={{opacity:canRedo?1:0.3}}><IconRedo size={14}/></button>
        <div style={{width:1,height:18,background:'var(--border)',margin:'0 6px'}}/>
        <label className="btn-icon" title="動画追加" style={{cursor:'pointer'}}><input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAddVideo(Array.from(e.target.files))}/><IconFilm size={14}/></label>
        <label className="btn-icon" title="音声追加" style={{cursor:'pointer'}}><input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAddAudio(Array.from(e.target.files))}/><IconMusic size={14}/></label>
        <label className="btn-icon" title="画像追加" style={{cursor:'pointer'}}><input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>onAddImage(Array.from(e.target.files))}/><IconImage size={14}/></label>
        <div style={{width:1,height:18,background:'var(--border)',margin:'0 6px'}}/>
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.max(z/1.4,20))} title="ズームアウト"><IconZoomOut size={14}/></button>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',minWidth:34,textAlign:'center'}}>{Math.round(zoom)}</div>
        <button className="btn-icon" onClick={()=>onZoom(z=>Math.min(z*1.4,400))} title="ズームイン"><IconZoomIn size={14}/></button>
      </div>
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
    const seek=(ev)=>{const r=seekRef.current?.getBoundingClientRect();if(!r) return;onSeek(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*totalDuration)}
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek);window.addEventListener('mouseup',up)
  }
  return(
    <div style={{padding:'8px 14px',background:'var(--bg-1)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
      <button onClick={onTogglePlay} disabled={!hasClip} style={{width:32,height:32,borderRadius:'50%',background:hasClip?'var(--accent)':'var(--bg-3)',color:hasClip?'#0a0a0a':'var(--text-2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:hasClip?'0 2px 12px rgba(212,255,62,0.3)':'none',border:'none',cursor:hasClip?'pointer':'not-allowed',transition:'var(--t)'}}>
        {isPlaying?<IconPause size={13}/>:<IconPlay size={13} style={{marginLeft:1}}/>}
      </button>
      <button className="btn-icon" onClick={onSplit} disabled={!hasClip} title="分割 (S)" style={{opacity:hasClip?1:0.35}}><IconScissors size={13}/></button>
      <div ref={seekRef} onMouseDown={startSeek} style={{flex:1,height:4,background:'var(--bg-5)',borderRadius:2,cursor:'pointer',position:'relative',userSelect:'none'}}>
        <div style={{position:'absolute',inset:0,width:`${pct}%`,background:'linear-gradient(90deg,var(--accent),#a8ff00)',borderRadius:2,pointerEvents:'none'}}/>
        <div style={{position:'absolute',top:'50%',left:`${pct}%`,transform:'translate(-50%,-50%)',width:12,height:12,borderRadius:'50%',background:'var(--accent)',pointerEvents:'none',boxShadow:'0 0 8px rgba(212,255,62,0.6)',border:'2px solid rgba(255,255,255,0.3)'}}/>
      </div>
      <span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-1)',flexShrink:0,minWidth:88,textAlign:'center'}}>{fmt(currentTime)} / {fmt(totalDuration)}</span>
      <button className="btn-icon" onClick={onToggleMute}>{isMuted?<IconVolumeMute size={13}/>:<IconVolume size={13}/>}</button>
      <input type="range" min={0} max={1} step={0.05} value={isMuted?0:volume} onChange={e=>onVolume(+e.target.value)} style={{width:54}}/>
      <select value={speed} onChange={e=>onSpeed(+e.target.value)} style={{fontSize:11,padding:'3px 20px 3px 6px',width:58,color:'var(--text-1)'}}>
        {[0.25,0.5,0.75,1,1.25,1.5,2].map(s=><option key={s} value={s}>{s}x</option>)}
      </select>
    </div>
  )
}

// ── Timeline ──────────────────────────────────────────────────
function Timeline({videoTracks,setVideoTracks,textTracks,setTextTracks,imageTracks,setImageTracks,audioTracks,setAudioTracks,activeClipId,setActiveClipId,currentTime,totalDuration,onSeek,zoom,selItem,setSelItem,addVideoFiles,addAudioFiles,addImageFiles,addVideoTrackRow,addTextTrackRow,addImgTrackRow,addAudTrackRow,removeTrackRow,snap,splitClip,openCtxMenu}){
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
    const seek=(ev)=>{const rect=el.getBoundingClientRect();onSeek(Math.max(0,(ev.clientX-rect.left+el.scrollLeft-LW)/zoom))}
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek);window.addEventListener('mouseup',up)
  }

  const onRulerDown=(e)=>{
    if(e.button!==0) return;e.preventDefault()
    const el=scrollRef.current
    const seek=(ev)=>{const rect=el.getBoundingClientRect();onSeek(Math.max(0,(ev.clientX-rect.left+el.scrollLeft-LW)/zoom))}
    seek(e)
    const up=()=>{window.removeEventListener('mousemove',seek);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',seek);window.addEventListener('mouseup',up)
  }

  const onTimelineCtx=(e)=>{
    e.preventDefault()
    const el=scrollRef.current;if(!el) return
    const t=Math.max(0,(e.clientX-el.getBoundingClientRect().left+el.scrollLeft-LW)/zoom)
    openCtxMenu(e,[
      {icon:<IconPlay size={13}/>,   label:'ここから再生',    action:()=>onSeek(t)},
      {icon:<IconScissors size={13}/>,label:'ここで分割',     action:()=>{onSeek(t);setTimeout(splitClip,50)}},
      '---',
      {icon:<IconText size={13}/>,   label:'字幕をここに追加', action:()=>setTextTracks(p=>{const t2=[...p];t2[0]={...t2[0],items:[...t2[0].items,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:t,endTime:t+3}]};return t2})},
      {icon:<IconFilm size={13}/>,   label:'動画を追加',       action:()=>document.getElementById('tl-vid')?.click()},
      {icon:<IconMusic size={13}/>,  label:'音声を追加',       action:()=>document.getElementById('tl-aud')?.click()},
      {icon:<IconImage size={13}/>,  label:'画像を追加',       action:()=>document.getElementById('tl-img')?.click()},
    ])
  }

  const startDrag=(e,setter,trackId,itemId,field,itemStart)=>{
    e.stopPropagation();e.preventDefault()
    const el=scrollRef.current
    const rect=el?.getBoundingClientRect()
    const grabOff=(e.clientX-(rect?.left||0)+el.scrollLeft-LW)-itemStart*zoom
    const move=(me)=>{
      const v=Math.max(0,(me.clientX-(rect?.left||0)+el.scrollLeft-LW-grabOff)/zoom)
      setter(p=>p.map(t=>t.id===trackId?{...t,items:t.items.map(i=>i.id===itemId?{...i,[field]:v}:i)}:t))
    }
    const up=()=>{snap();window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)
  }

  const startResize=(e,setter,trackId,itemId,field)=>{
    e.stopPropagation();e.preventDefault()
    const sx=e.clientX
    const orig=videoTracks.concat(textTracks).concat(imageTracks).concat(audioTracks)
      .flatMap(t=>t.items).find(i=>i.id===itemId)?.[field]||0
    const move=(me)=>{
      const v=Math.max(0.1,orig+(me.clientX-sx)/zoom)
      setter(p=>p.map(t=>t.id===trackId?{...t,items:t.items.map(i=>i.id===itemId?{...i,[field]:v}:i)}:t))
    }
    const up=()=>{snap();window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}
    window.addEventListener('mousemove',move);window.addEventListener('mouseup',up)
  }

  // Context menus
  const clipCtx=(e,trackId,clip)=>openCtxMenu(e,[
    {icon:<IconScissors size={13}/>,label:'分割',shortcut:'S',action:splitClip},
    {icon:<IconCopy size={13}/>,    label:'複製',action:()=>{snap();setVideoTracks(p=>p.map(t=>t.id===trackId?{...t,items:[...t.items,{...clip,id:crypto.randomUUID()}]}:t))}},
    {icon:<IconVolumeMute size={13}/>,label:clip.muted?'ミュート解除':'ミュート',action:()=>setVideoTracks(p=>p.map(t=>t.id===trackId?{...t,items:t.items.map(c=>c.id===clip.id?{...c,muted:!c.muted}:c)}:t))},
    '---',
    {icon:<IconTrash size={13}/>,   label:'削除',danger:true,action:()=>{snap();setVideoTracks(p=>p.map(t=>t.id===trackId?{...t,items:t.items.filter(c=>c.id!==clip.id)}:t))}},
  ])
  const textCtx=(e,trackId,t)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>,label:'開始点を現在地に',action:()=>setTextTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.map(i=>i.id===t.id?{...i,startTime:currentTime}:i)}:tr))},
    {icon:<IconClock size={13}/>,label:'終了点を現在地に',action:()=>setTextTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.map(i=>i.id===t.id?{...i,endTime:currentTime}:i)}:tr))},
    {icon:<IconCopy size={13}/>, label:'複製',action:()=>{snap();setTextTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:[...tr.items,{...t,id:crypto.randomUUID()}]}:tr))}},
    '---',
    {icon:<IconTrash size={13}/>,label:'削除',danger:true,action:()=>{snap();setTextTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.filter(i=>i.id!==t.id)}:tr))}},
  ])
  const imgCtx=(e,trackId,img)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>,label:'開始点を現在地に',action:()=>setImageTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.map(i=>i.id===img.id?{...i,startTime:currentTime}:i)}:tr))},
    {icon:<IconClock size={13}/>,label:'終了点を現在地に',action:()=>setImageTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.map(i=>i.id===img.id?{...i,endTime:currentTime}:i)}:tr))},
    {icon:<IconCopy size={13}/>, label:'複製',action:()=>{snap();setImageTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:[...tr.items,{...img,id:crypto.randomUUID()}]}:tr))}},
    '---',
    {icon:<IconTrash size={13}/>,label:'削除',danger:true,action:()=>{snap();setImageTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.filter(i=>i.id!==img.id)}:tr))}},
  ])
  const audCtx=(e,trackId,track)=>openCtxMenu(e,[
    {icon:<IconClock size={13}/>,label:'開始点を現在地に',action:()=>setAudioTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.map(i=>i.id===track.id?{...i,startTime:currentTime}:i)}:tr))},
    {icon:<IconCopy size={13}/>, label:'複製',action:()=>{snap();setAudioTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:[...tr.items,{...track,id:crypto.randomUUID()}]}:tr))}},
    '---',
    {icon:<IconTrash size={13}/>,label:'削除',danger:true,action:()=>{snap();setAudioTracks(p=>p.map(tr=>tr.id===trackId?{...tr,items:tr.items.filter(i=>i.id!==track.id)}:tr))}},
  ])

  return(
    <div style={{background:'var(--bg-0)',borderTop:'1px solid var(--border)',flexShrink:0,height:240,display:'flex',flexDirection:'column'}}>
      <label style={{display:'none'}}><input id="tl-vid" type="file" accept="video/*" multiple onChange={e=>addVideoFiles(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-aud" type="file" accept="audio/*" multiple onChange={e=>addAudioFiles(Array.from(e.target.files))}/></label>
      <label style={{display:'none'}}><input id="tl-img" type="file" accept="image/*" multiple onChange={e=>addImageFiles(Array.from(e.target.files))}/></label>

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

          {/* Video tracks (multiple rows) */}
          {videoTracks.map((track,tidx)=>(
            <TRow key={track.id} label={videoTracks.length>1?`映像${tidx+1}`:'映像'} color="var(--blue)" icon={<IconFilm size={11}/>}
              onAdd={()=>addVideoFiles([],track.id)} accept="video/*" onAddTrack={addVideoTrackRow}
              onRemoveTrack={videoTracks.length>1?()=>removeTrackRow(setVideoTracks,track.id):null}>
              {track.items.map((clip,idx)=>{
                const off=track.items.slice(0,idx).reduce((s,c)=>s+(c.trimEnd-c.trimStart),0)
                const left=off*zoom, w=Math.max((clip.trimEnd-clip.trimStart)*zoom,4)
                return(
                  <TItem key={clip.id} left={left} width={w} color="var(--blue)" selected={selItem?.itemId===clip.id}
                    label={clip.name} thumb={clip.thumbnail} muted={clip.muted}
                    onMouseDown={e=>{setSelItem({type:'clip',trackId:track.id,itemId:clip.id});setActiveClipId(clip.id);startDrag(e,setVideoTracks,track.id,clip.id,'startTime',off)}}
                    onResizeRight={e=>startResize(e,setVideoTracks,track.id,clip.id,'trimEnd')}
                    onDelete={()=>{snap();setVideoTracks(p=>p.map(t=>t.id===track.id?{...t,items:t.items.filter(c=>c.id!==clip.id)}:t))}}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'clip',trackId:track.id,itemId:clip.id});setActiveClipId(clip.id);clipCtx(e,track.id,clip)}}
                  />
                )
              })}
            </TRow>
          ))}

          {/* Text tracks (multiple rows) */}
          {textTracks.map((track,tidx)=>(
            <TRow key={track.id} label={textTracks.length>1?`字幕${tidx+1}`:'字幕'} color="var(--accent)" icon={<IconText size={11}/>}
              onAdd={()=>setTextTracks(p=>p.map(t=>t.id===track.id?{...t,items:[...t.items,{id:crypto.randomUUID(),content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+3}]}:t))}
              onAddTrack={addTextTrackRow}
              onRemoveTrack={textTracks.length>1?()=>removeTrackRow(setTextTracks,track.id):null}>
              {track.items.map(t=>{
                const left=t.startTime*zoom, w=Math.max((t.endTime-t.startTime)*zoom,20)
                return(
                  <TItem key={t.id} left={left} width={w} color="var(--accent)" selected={selItem?.itemId===t.id}
                    label={t.content||'(空)'}
                    onMouseDown={e=>{setSelItem({type:'text',trackId:track.id,itemId:t.id});startDrag(e,setTextTracks,track.id,t.id,'startTime',t.startTime)}}
                    onResizeRight={e=>startResize(e,setTextTracks,track.id,t.id,'endTime')}
                    onDelete={()=>{snap();setTextTracks(p=>p.map(tr=>tr.id===track.id?{...tr,items:tr.items.filter(i=>i.id!==t.id)}:tr))}}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'text',trackId:track.id,itemId:t.id});textCtx(e,track.id,t)}}
                  />
                )
              })}
            </TRow>
          ))}

          {/* Image tracks (multiple rows) */}
          {imageTracks.map((track,tidx)=>(
            <TRow key={track.id} label={imageTracks.length>1?`画像${tidx+1}`:'画像'} color="var(--orange)" icon={<IconImage size={11}/>}
              onAdd={()=>addImageFiles([],track.id)} accept="image/*" onAddTrack={addImgTrackRow}
              onRemoveTrack={imageTracks.length>1?()=>removeTrackRow(setImageTracks,track.id):null}>
              {track.items.map(img=>{
                const left=img.startTime*zoom, w=Math.max((img.endTime-img.startTime)*zoom,20)
                return(
                  <TItem key={img.id} left={left} width={w} color="var(--orange)" selected={selItem?.itemId===img.id}
                    label={img.name} thumb={img.url}
                    onMouseDown={e=>{setSelItem({type:'image',trackId:track.id,itemId:img.id});startDrag(e,setImageTracks,track.id,img.id,'startTime',img.startTime)}}
                    onResizeRight={e=>startResize(e,setImageTracks,track.id,img.id,'endTime')}
                    onDelete={()=>{snap();setImageTracks(p=>p.map(tr=>tr.id===track.id?{...tr,items:tr.items.filter(i=>i.id!==img.id)}:tr))}}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'image',trackId:track.id,itemId:img.id});imgCtx(e,track.id,img)}}
                  />
                )
              })}
            </TRow>
          ))}

          {/* Audio tracks (multiple rows) */}
          {audioTracks.map((track,tidx)=>(
            <TRow key={track.id} label={audioTracks.length>1?`音声${tidx+1}`:'音声'} color="var(--green)" icon={<IconMusic size={11}/>}
              onAdd={()=>addAudioFiles([],track.id)} accept="audio/*" onAddTrack={addAudTrackRow}
              onRemoveTrack={audioTracks.length>1?()=>removeTrackRow(setAudioTracks,track.id):null}>
              {track.items.map(item=>{
                const left=(item.startTime||0)*zoom, w=Math.max((item.duration||10)*zoom,40)
                return(
                  <TItem key={item.id} left={left} width={w} color="var(--green)" selected={selItem?.itemId===item.id}
                    label={item.name}
                    onMouseDown={e=>{setSelItem({type:'audio',trackId:track.id,itemId:item.id});startDrag(e,setAudioTracks,track.id,item.id,'startTime',item.startTime||0)}}
                    onResizeRight={e=>startResize(e,setAudioTracks,track.id,item.id,'duration')}
                    onDelete={()=>{snap();setAudioTracks(p=>p.map(tr=>tr.id===track.id?{...tr,items:tr.items.filter(i=>i.id!==item.id)}:tr))}}
                    onContextMenu={e=>{e.preventDefault();e.stopPropagation();setSelItem({type:'audio',trackId:track.id,itemId:item.id});audCtx(e,track.id,item)}}
                  />
                )
              })}
            </TRow>
          ))}

          {/* Playhead */}
          <div style={{position:'absolute',top:0,bottom:0,left:playheadX,width:1.5,background:'var(--accent)',zIndex:25,pointerEvents:'none',boxShadow:'0 0 6px rgba(212,255,62,0.4)'}}>
            <div onMouseDown={startPlayheadDrag} style={{position:'absolute',top:24,left:'50%',transform:'translateX(-50%)',width:14,height:14,background:'var(--accent)',borderRadius:'50%',cursor:'ew-resize',pointerEvents:'all',boxShadow:'0 0 10px rgba(212,255,62,0.7)',border:'2px solid rgba(255,255,255,0.4)',zIndex:26}}/>
            <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:0,height:0,borderLeft:'5px solid transparent',borderRight:'5px solid transparent',borderTop:'7px solid var(--accent)'}}/>
          </div>
        </div>
      </div>
    </div>
  )
}

function TRow({label,color,icon,children,onAdd,accept,onAddTrack,onRemoveTrack}){
  return(
    <div style={{display:'flex',height:TH,borderBottom:'1px solid var(--border)'}}>
      <div style={{width:LW,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between',paddingLeft:8,paddingRight:4,borderRight:'1px solid var(--border)',background:'var(--bg-1)',position:'sticky',left:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{color}}>{icon}</span>
          <span style={{fontSize:8,color:'var(--text-2)',fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase',maxWidth:28,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</span>
        </div>
        <div style={{display:'flex',gap:2}}>
          {accept?(
            <label style={{cursor:'pointer',width:14,height:14,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:3,background:'rgba(255,255,255,0.05)',color:'var(--text-2)'}}>
              <input type="file" accept={accept} multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>
              <IconPlus size={9}/>
            </label>
          ):(
            <button onClick={onAdd} style={{width:14,height:14,borderRadius:3,background:'rgba(255,255,255,0.05)',color:'var(--text-2)',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer'}}>
              <IconPlus size={9}/>
            </button>
          )}
          {onAddTrack&&(
            <button onClick={onAddTrack} title="トラック追加" style={{width:14,height:14,borderRadius:3,background:'rgba(255,255,255,0.05)',color:'var(--text-2)',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer',fontSize:9,fontWeight:700}}>≡</button>
          )}
          {onRemoveTrack&&(
            <button onClick={onRemoveTrack} title="トラック削除" style={{width:14,height:14,borderRadius:3,background:'rgba(255,61,90,0.15)',color:'var(--red)',display:'flex',alignItems:'center',justifyContent:'center',border:'none',cursor:'pointer'}}>
              <IconX size={8}/>
            </button>
          )}
        </div>
      </div>
      <div style={{position:'relative',flex:1,background:'repeating-linear-gradient(90deg,transparent,transparent 79px,rgba(255,255,255,0.015) 79px,rgba(255,255,255,0.015) 80px)'}}>{children}</div>
    </div>
  )
}

function TItem({left,width,color,selected,label,thumb,muted,onMouseDown,onResizeRight,onDelete,onContextMenu}){
  return(
    <div onMouseDown={onMouseDown} onContextMenu={onContextMenu}
      style={{position:'absolute',left,top:3,height:TH-6,width,borderRadius:4,border:`1.5px solid ${selected?color:'rgba(255,255,255,0.08)'}`,background:selected?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.03)',cursor:'grab',overflow:'hidden',display:'flex',alignItems:'center',userSelect:'none',opacity:muted?0.45:1,transition:'border-color 0.1s'}}>
      {thumb&&<img src={thumb} alt="" draggable={false} style={{height:'100%',width:'auto',opacity:0.35,flexShrink:0,pointerEvents:'none'}}/>}
      <span style={{fontFamily:'var(--mono)',fontSize:9,color,padding:'0 5px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',flex:1,pointerEvents:'none',fontWeight:500}}>{muted?'🔇 ':''}{label}</span>
      <div onMouseDown={onResizeRight} style={{position:'absolute',right:0,top:0,bottom:0,width:6,cursor:'ew-resize',background:`linear-gradient(to left,${color}44,transparent)`,borderRadius:'0 4px 4px 0'}}/>
      <button onMouseDown={e=>e.stopPropagation()} onClick={onDelete} style={{position:'absolute',top:2,right:8,width:13,height:13,borderRadius:'50%',background:'rgba(255,61,90,0.8)',color:'#fff',fontSize:8,display:'flex',alignItems:'center',justifyContent:'center',zIndex:5,border:'none',cursor:'pointer'}}><IconX size={7}/></button>
    </div>
  )
}

// ── ContextMenu ───────────────────────────────────────────────
function ContextMenu({x,y,items,onClose}){
  useEffect(()=>{
    const t=setTimeout(()=>{const h=()=>onClose();window.addEventListener('mousedown',h);return ()=>window.removeEventListener('mousedown',h)},50)
    return ()=>clearTimeout(t)
  },[onClose])
  const vw=window.innerWidth,vh=window.innerHeight
  const mw=190,mh=items.length*34
  const cx=x+mw>vw?x-mw:x, cy=y+mh>vh?y-mh:y
  return(
    <div onMouseDown={e=>e.stopPropagation()} style={{position:'fixed',left:cx,top:cy,zIndex:9999,background:'var(--bg-2)',border:'1px solid var(--border-hi)',borderRadius:8,padding:'5px 0',minWidth:mw,boxShadow:'0 12px 48px rgba(0,0,0,0.6)',animation:'fadeInScale 0.12s ease'}}>
      {items.map((item,i)=>item==='---'
        ?<div key={i} style={{height:1,background:'var(--border)',margin:'4px 0'}}/>
        :<button key={i} onClick={()=>{item.action();onClose()}} style={{display:'flex',alignItems:'center',gap:9,width:'100%',padding:'7px 14px',background:'transparent',color:item.danger?'var(--red)':'var(--text-0)',fontSize:12,fontWeight:450,textAlign:'left',border:'none',cursor:'pointer',transition:'background 0.1s'}} onMouseOver={e=>e.currentTarget.style.background='var(--bg-3)'} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
          <span style={{color:item.danger?'var(--red)':'var(--text-2)',flexShrink:0}}>{item.icon}</span>
          <span style={{flex:1}}>{item.label}</span>
          {item.shortcut&&<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',background:'var(--bg-4)',padding:'1px 5px',borderRadius:3}}>{item.shortcut}</span>}
        </button>
      )}
    </div>
  )
}

// ── Panels ────────────────────────────────────────────────────
function ClipsPanel({videoTracks,activeClipId,onSelect,onRemove,onAdd,onUpdate,selClip,selItem}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`映像クリップ (${videoTracks.flatMap(t=>t.items).length})`}>
        <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 10px',fontSize:11,gap:5}}>
          <input type="file" accept="video/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/>
          <IconPlus size={11}/>追加
        </label>
      </PHead>
      {videoTracks.every(t=>t.items.length===0)&&<EmptyState icon={<IconFilm size={22}/>} text="動画をドロップして追加"/>}
      {videoTracks.flatMap(t=>t.items).map(clip=>(
        <div key={clip.id} onClick={()=>onSelect(clip.id)} style={{display:'flex',gap:9,alignItems:'center',padding:'8px 10px',borderRadius:var_r2,background:activeClipId===clip.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${activeClipId===clip.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',transition:'var(--t)'}}>
          {clip.thumbnail?<img src={clip.thumbnail} alt="" style={{width:48,height:27,objectFit:'cover',borderRadius:4,flexShrink:0,border:'1px solid var(--border)'}}/>:<div style={{width:48,height:27,background:'var(--bg-4)',borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}><IconFilm size={14} style={{color:'var(--text-3)'}}/></div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{clip.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--blue)',marginTop:1}}>{fmt(clip.trimEnd-clip.trimStart)} · {fmt(clip.duration)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();const t=videoTracks.find(tr=>tr.items.find(c=>c.id===clip.id));if(t) onRemove(t.id,clip.id)}} style={{color:'var(--red)',background:'transparent',border:'none'}}><IconX size={12}/></button>
        </div>
      ))}
      {selClip&&(
        <div style={{borderTop:'1px solid var(--border)',paddingTop:12,display:'flex',flexDirection:'column',gap:8}}>
          <span className="label">トリム設定</span>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7}}>
            <div><span className="label">IN (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimStart.toFixed(2)} onChange={e=>{const t=videoTracks.find(tr=>tr.items.find(c=>c.id===selClip.id));if(t) onUpdate(t.id,selClip.id,'trimStart',+e.target.value)}} style={{width:'100%'}}/></div>
            <div><span className="label">OUT (秒)</span><input type="number" min={0} step={0.1} value={selClip.trimEnd.toFixed(2)} onChange={e=>{const t=videoTracks.find(tr=>tr.items.find(c=>c.id===selClip.id));if(t) onUpdate(t.id,selClip.id,'trimEnd',+e.target.value)}} style={{width:'100%'}}/></div>
          </div>
        </div>
      )}
    </div>
  )
}

function TextPanel({textTracks,setTextTracks,selItem,setSelItem,currentTime,snap,updTextTrack,addTextTrackRow}){
  const selText=textTracks.flatMap(t=>t.items).find(i=>i.id===selItem?.itemId)
  const updSel=(k,v)=>{if(!selItem) return;updTextTrack(selItem.trackId,items=>items.map(i=>i.id===selItem.itemId?{...i,[k]:v}:i))}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`テキスト (${textTracks.flatMap(t=>t.items).length})`}>
        <div style={{display:'flex',gap:4}}>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:11,gap:4}} onClick={()=>{snap();const id=crypto.randomUUID();updTextTrack(textTracks[0].id,items=>[...items,{id,content:'テキスト',x:50,y:85,fontSize:36,color:'#ffffff',startTime:currentTime,endTime:currentTime+5}]);setSelItem({type:'text',trackId:textTracks[0].id,itemId:id})}}><IconPlus size={11}/>追加</button>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:11,gap:4}} onClick={()=>{snap();addTextTrackRow()}} title="トラックを追加"><IconPlus size={11}/>行</button>
        </div>
      </PHead>
      {textTracks.flatMap(t=>t.items).length===0&&<EmptyState icon={<IconText size={22}/>} text="テキストを追加"/>}
      {textTracks.flatMap(t=>t.items).map(item=>(
        <div key={item.id} onClick={()=>{const t=textTracks.find(tr=>tr.items.find(i=>i.id===item.id));if(t) setSelItem({type:'text',trackId:t.id,itemId:item.id})}}
          style={{padding:'8px 10px',borderRadius:var_r2,background:selItem?.itemId===item.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selItem?.itemId===item.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',display:'flex',alignItems:'center',gap:9,transition:'var(--t)'}}>
          <div style={{width:24,height:24,borderRadius:4,background:'var(--bg-4)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><IconText size={12} style={{color:'var(--accent)'}}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.content||'(空)'}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',marginTop:1}}>{fmt(item.startTime)} → {fmt(item.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();const t=textTracks.find(tr=>tr.items.find(i=>i.id===item.id));if(t) updTextTrack(t.id,items=>items.filter(i=>i.id!==item.id))}} style={{color:'var(--red)',background:'transparent',border:'none'}}><IconX size={12}/></button>
        </div>
      ))}
      {selText&&(
        <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:12,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          <span className="label">編集中</span>
          <textarea value={selText.content} onChange={e=>updSel('content',e.target.value)} rows={2} style={{width:'100%',resize:'none',fontFamily:'var(--font)',fontSize:12,borderRadius:var_r,lineHeight:1.6}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">フォントサイズ</span><input type="number" min={8} max={200} value={selText.fontSize} onChange={e=>updSel('fontSize',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">カラー</span><div style={{display:'flex',gap:5}}><input type="color" value={selText.color} onChange={e=>updSel('color',e.target.value)} style={{width:32,height:28,padding:2}}/><input value={selText.color} onChange={e=>updSel('color',e.target.value)} style={{flex:1,fontSize:11}}/></div></div>
          </div>
          <Sld label={`X: ${selText.x}%`} value={selText.x} min={0} max={100} onChange={v=>updSel('x',v)}/>
          <Sld label={`Y: ${selText.y}%`} value={selText.y} min={0} max={100} onChange={v=>updSel('y',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始 (秒)</span><input type="number" min={0} step={0.1} value={selText.startTime} onChange={e=>updSel('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了 (秒)</span><input type="number" min={0} step={0.1} value={selText.endTime} onChange={e=>updSel('endTime',+e.target.value)} style={{width:'100%'}}/></div>
          </div>
          <div style={{position:'relative',background:'#000',borderRadius:6,aspectRatio:'16/9',overflow:'hidden',border:'1px solid var(--border)'}}>
            <div style={{position:'absolute',left:`${selText.x}%`,top:`${selText.y}%`,transform:'translate(-50%,-50%)',fontSize:Math.max(8,selText.fontSize*0.22),color:selText.color,fontWeight:700,textShadow:'1px 1px 4px rgba(0,0,0,0.9)',maxWidth:'90%',textAlign:'center'}}>{selText.content||'テキスト'}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImagePanel({imageTracks,setImageTracks,selItem,setSelItem,currentTime,snap,updImgTrack,addImgTrackRow}){
  const selImg=imageTracks.flatMap(t=>t.items).find(i=>i.id===selItem?.itemId)
  const updSel=(k,v)=>{if(!selItem) return;updImgTrack(selItem.trackId,items=>items.map(i=>i.id===selItem.itemId?{...i,[k]:v}:i))}
  return(
    <div style={{display:'flex',flexDirection:'column',gap:10}} className="anim-fade">
      <PHead title={`画像 (${imageTracks.flatMap(t=>t.items).length})`}>
        <div style={{display:'flex',gap:4}}>
          <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 8px',fontSize:11,gap:4}}>
            <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>{snap();Array.from(e.target.files).forEach(async f=>{const url=URL.createObjectURL(f);const id=crypto.randomUUID();updImgTrack(imageTracks[0].id,items=>[...items,{id,file:f,name:f.name,url,startTime:currentTime,endTime:currentTime+5,x:50,y:50,scale:40,opacity:1}])})}}/>
            <IconPlus size={11}/>追加
          </label>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:11,gap:4}} onClick={()=>{snap();addImgTrackRow()}} title="トラックを追加"><IconPlus size={11}/>行</button>
        </div>
      </PHead>
      {imageTracks.flatMap(t=>t.items).length===0&&<EmptyState icon={<IconImage size={22}/>} text="画像をドロップして追加"/>}
      {imageTracks.flatMap(t=>t.items).map(img=>(
        <div key={img.id} onClick={()=>{const t=imageTracks.find(tr=>tr.items.find(i=>i.id===img.id));if(t) setSelItem({type:'image',trackId:t.id,itemId:img.id})}}
          style={{display:'flex',gap:9,alignItems:'center',padding:'8px 10px',borderRadius:var_r2,background:selItem?.itemId===img.id?'var(--accent-bg)':'var(--bg-2)',border:`1px solid ${selItem?.itemId===img.id?'rgba(212,255,62,0.25)':'var(--border)'}`,cursor:'pointer',transition:'var(--t)'}}>
          <img src={img.url} alt="" style={{width:48,height:27,objectFit:'cover',borderRadius:4,flexShrink:0,border:'1px solid var(--border)'}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{img.name}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--orange)',marginTop:1}}>{fmt(img.startTime)} → {fmt(img.endTime)}</div>
          </div>
          <button className="btn-icon" onClick={e=>{e.stopPropagation();snap();const t=imageTracks.find(tr=>tr.items.find(i=>i.id===img.id));if(t) updImgTrack(t.id,items=>items.filter(i=>i.id!==img.id))}} style={{color:'var(--red)',background:'transparent',border:'none'}}><IconX size={12}/></button>
        </div>
      ))}
      {selImg&&(
        <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:12,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          <span className="label">配置設定</span>
          <Sld label={`X: ${selImg.x}%`} value={selImg.x} min={0} max={100} onChange={v=>updSel('x',v)}/>
          <Sld label={`Y: ${selImg.y}%`} value={selImg.y} min={0} max={100} onChange={v=>updSel('y',v)}/>
          <Sld label={`サイズ: ${selImg.scale}%`} value={selImg.scale} min={5} max={100} onChange={v=>updSel('scale',v)}/>
          <Sld label={`不透明度: ${Math.round(selImg.opacity*100)}%`} value={selImg.opacity} min={0} max={1} step={0.05} onChange={v=>updSel('opacity',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div><span className="label">開始 (秒)</span><input type="number" min={0} step={0.1} value={selImg.startTime} onChange={e=>updSel('startTime',+e.target.value)} style={{width:'100%'}}/></div>
            <div><span className="label">終了 (秒)</span><input type="number" min={0} step={0.1} value={selImg.endTime} onChange={e=>updSel('endTime',+e.target.value)} style={{width:'100%'}}/></div>
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
        {PRESETS.map(p=>{const act=JSON.stringify(p.f)===JSON.stringify(filters);return<button key={p.name} onClick={()=>onChange(p.f)} style={{padding:'6px 3px',fontSize:10,fontWeight:600,borderRadius:var_r,background:act?'var(--accent-bg)':'var(--bg-3)',color:act?'var(--accent)':'var(--text-1)',border:`1px solid ${act?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>{p.name}</button>})}
      </div>
      <div className="divider"/>
      <Sld label={`明るさ ${sd(filters.brightness)}%`}     value={filters.brightness} min={0} max={2}  step={0.05} onChange={v=>onChange({...filters,brightness:v})}/>
      <Sld label={`コントラスト ${sd(filters.contrast)}%`} value={filters.contrast}   min={0} max={3}  step={0.05} onChange={v=>onChange({...filters,contrast:v})}/>
      <Sld label={`彩度 ${sd(filters.saturation)}%`}       value={filters.saturation} min={0} max={3}  step={0.05} onChange={v=>onChange({...filters,saturation:v})}/>
      <Sld label={`ブラー ${filters.blur}px`}              value={filters.blur}       min={0} max={10} step={0.5}  onChange={v=>onChange({...filters,blur:v})}/>
      <div style={{height:20,borderRadius:6,background:'linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff)',filter:`brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation}) blur(${filters.blur}px)`,border:'1px solid var(--border)'}}/>
    </div>
  )
}

function AudioPanel({audio,onChange,audioTracks,setAudioTracks,onAdd,snap,updAudTrack,addAudTrackRow}){
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      <div style={{padding:'12px 13px',background:'var(--bg-2)',borderRadius:var_r2,border:`1px solid ${audio.mute?'rgba(255,61,90,0.3)':'var(--border)'}`,transition:'var(--t)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div><div style={{fontSize:12,fontWeight:600}}>元音声ミュート</div><div style={{fontSize:10,color:'var(--text-2)',fontFamily:'var(--mono)',marginTop:1}}>動画の音声を無効化</div></div>
          <Tog value={audio.mute} onChange={v=>onChange({...audio,mute:v})} color="var(--red)"/>
        </div>
        <div style={{opacity:audio.mute?0.35:1,transition:'var(--t)',pointerEvents:audio.mute?'none':'auto'}}>
          <Sld label={`音量: ${Math.round(audio.volume*100)}%`} value={audio.volume} min={0} max={2} step={0.05} onChange={v=>onChange({...audio,volume:v})}/>
        </div>
      </div>

      <PHead title={`BGMトラック (${audioTracks.flatMap(t=>t.items).length})`}>
        <div style={{display:'flex',gap:4}}>
          <label className="btn btn-ghost" style={{cursor:'pointer',padding:'4px 8px',fontSize:11,gap:4}}><input type="file" accept="audio/*" multiple style={{display:'none'}} onChange={e=>onAdd(Array.from(e.target.files))}/><IconPlus size={11}/>追加</label>
          <button className="btn btn-ghost" style={{padding:'4px 8px',fontSize:11,gap:4}} onClick={()=>{snap();addAudTrackRow()}} title="トラックを追加"><IconPlus size={11}/>行</button>
        </div>
      </PHead>
      {audioTracks.flatMap(t=>t.items).length===0&&<EmptyState icon={<IconMusic size={22}/>} text="音声ファイルを追加"/>}
      {audioTracks.flatMap(t=>t.items).map(item=>(
        <div key={item.id} style={{padding:'10px 12px',background:'var(--bg-2)',borderRadius:var_r2,border:'1px solid var(--border)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:22,height:22,borderRadius:4,background:'rgba(39,201,106,0.15)',display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid rgba(39,201,106,0.2)'}}><IconMusic size={11} style={{color:'var(--green)'}}/></div>
              <span style={{fontSize:11,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{item.name}</span>
            </div>
            <button className="btn-icon" onClick={()=>{snap();const t=audioTracks.find(tr=>tr.items.find(i=>i.id===item.id));if(t) updAudTrack(t.id,items=>items.filter(i=>i.id!==item.id))}} style={{color:'var(--red)',background:'transparent',border:'none'}}><IconX size={12}/></button>
          </div>
          <Sld label={`音量: ${Math.round((item.volume||0.8)*100)}%`} value={item.volume||0.8} min={0} max={1} step={0.05} onChange={v=>{const t=audioTracks.find(tr=>tr.items.find(i=>i.id===item.id));if(t) updAudTrack(t.id,items=>items.map(i=>i.id===item.id?{...i,volume:v}:i))}}/>
          <div style={{marginTop:8}}><span className="label">開始位置 (秒)</span><input type="number" min={0} step={0.1} value={item.startTime||0} onChange={e=>{const t=audioTracks.find(tr=>tr.items.find(i=>i.id===item.id));if(t) updAudTrack(t.id,items=>items.map(i=>i.id===item.id?{...i,startTime:+e.target.value}:i))}} style={{width:'100%'}}/></div>
        </div>
      ))}
    </div>
  )
}

function ExportPanel({processing,progress,eta,onExport,outputBlob,exportExt,onDownload,clipsCount,exportSettings,setExportSettings}){
  const upd=(k,v)=>setExportSettings(s=>({...s,[k]:v}))
  const scaleOpts=[{value:1,label:'100%'},{value:0.75,label:'75%'},{value:0.5,label:'50%'},{value:0.25,label:'25%'}]
  const qualityOpts=[{value:0.95,label:'最高'},{value:0.85,label:'高'},{value:0.7,label:'標準'},{value:0.5,label:'軽量'}]
  return(
    <div style={{display:'flex',flexDirection:'column',gap:12}} className="anim-fade">
      <div style={{display:'flex',gap:8,padding:'10px 12px',background:'rgba(39,201,106,0.08)',border:'1px solid rgba(39,201,106,0.2)',borderRadius:var_r2}}>
        <IconCheckCircle size={15} style={{color:'var(--green)',flexShrink:0,marginTop:1}}/>
        <div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-1)',lineHeight:1.7}}>
          <span style={{color:'var(--green)',fontWeight:600}}>Canvas + MediaRecorder</span><br/>
          テキスト/画像を完全反映 · 出力: <span style={{color:'var(--accent)'}}>WebM (VP9)</span>
        </div>
      </div>
      <div style={{background:'var(--bg-2)',borderRadius:var_r2,padding:13,border:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:12}}>
        <PHead title="設定"/>
        <div><span className="label">品質</span><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>{qualityOpts.map(q=><button key={q.value} onClick={()=>upd('quality',q.value)} style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:var_r,background:exportSettings.quality===q.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.quality===q.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.quality===q.value?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>{q.label}</button>)}</div></div>
        <div><span className="label">解像度</span><div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>{scaleOpts.map(s=><button key={s.value} onClick={()=>upd('scale',s.value)} style={{padding:'5px 2px',fontSize:10,fontWeight:600,borderRadius:var_r,background:exportSettings.scale===s.value?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.scale===s.value?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.scale===s.value?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>{s.label}</button>)}</div></div>
        <div><span className="label">FPS</span><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:4}}>{[24,30,60].map(f=><button key={f} onClick={()=>upd('fps',f)} style={{padding:'5px 2px',fontSize:11,fontWeight:600,borderRadius:var_r,background:exportSettings.fps===f?'var(--accent-bg)':'var(--bg-3)',color:exportSettings.fps===f?'var(--accent)':'var(--text-1)',border:`1px solid ${exportSettings.fps===f?'rgba(212,255,62,0.3)':'var(--border)'}`,transition:'var(--t)'}}>{f}fps</button>)}</div></div>
      </div>
      {processing&&(
        <div className="anim-fade">
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:11,color:'var(--text-1)'}}>録画中...</span>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--accent)',fontWeight:500}}>{progress}%{eta!=null?` · 残り${eta}秒`:''}</span>
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
            <div><div style={{fontSize:12,fontWeight:600,color:'var(--green)'}}>完了</div><div style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)',marginTop:1}}>{(outputBlob.size/1024/1024).toFixed(2)} MB · .{exportExt}</div></div>
          </div>
          <button className="btn btn-ghost" style={{width:'100%',justifyContent:'center',gap:7}} onClick={onDownload}><IconDownload size={14}/>ダウンロード (.{exportExt})</button>
        </div>
      )}
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────
function PHead({title,children}){
  return(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}><span style={{fontSize:11,fontWeight:600,color:'var(--text-2)',textTransform:'uppercase',letterSpacing:'0.07em'}}>{title}</span>{children}</div>)
}
function Sld({label,value,min,max,step=0.01,onChange}){
  return(<div><span className="label">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))}/></div>)
}
function Tog({value,onChange,color='var(--accent)'}){
  return(<button onClick={()=>onChange(!value)} style={{width:36,height:20,borderRadius:10,background:value?color:'var(--bg-5)',border:`1px solid ${value?color:'var(--border-hi)'}`,position:'relative',cursor:'pointer',transition:'background 0.2s,border-color 0.2s',flexShrink:0}}><div style={{position:'absolute',top:2,left:value?18:2,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left 0.18s cubic-bezier(0.34,1.56,0.64,1)',boxShadow:'0 1px 4px rgba(0,0,0,0.3)'}}/></button>)
}
function EmptyState({icon,text}){
  return(<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'20px 0',color:'var(--text-3)'}}>{React.cloneElement(icon,{style:{color:'var(--text-3)'}})}<span style={{fontFamily:'var(--mono)',fontSize:10,color:'var(--text-2)'}}>{text}</span></div>)
}

// ── Utils ─────────────────────────────────────────────────────
function fmt(s){if(!s||isNaN(s)) return '0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return `${m}:${sec.toString().padStart(2,'0')}`}
function sd(v){const d=Math.round((v-1)*100);return d>=0?`+${d}`:`${d}`}
function getVideoDuration(url){return new Promise(r=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>{r(v.duration);v.src=''};v.onerror=()=>r(0);v.src=url})}
function getAudioDuration(url){return new Promise(r=>{const a=new Audio();a.onloadedmetadata=()=>r(a.duration);a.onerror=()=>r(60);a.src=url})}
function getVideoThumbnail(url){
  return new Promise(r=>{
    const v=document.createElement('video'),c=document.createElement('canvas')
    c.width=80;c.height=45;v.preload='auto';v.muted=true
    v.onloadeddata=()=>{v.currentTime=Math.min(1,v.duration*0.1)}
    v.onseeked=()=>{try{c.getContext('2d').drawImage(v,0,0,80,45);r(c.toDataURL('image/jpeg',0.6))}catch{r(null)};v.src=''}
    v.onerror=()=>r(null);v.src=url
  })
}
