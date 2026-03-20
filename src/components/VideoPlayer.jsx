import React, { useRef, useEffect, useState, useCallback } from 'react'

export default function VideoPlayer({ src, currentTime, duration, trimStart, trimEnd, onTimeUpdate, onDurationChange, onTrimChange }) {
  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDragging, setIsDragging] = useState(null) // 'start' | 'end' | 'playhead'
  const [thumbnails, setThumbnails] = useState([])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    video.src = src

    const handleTimeUpdate = () => onTimeUpdate?.(video.currentTime)
    const handleLoaded = () => {
      onDurationChange?.(video.duration)
      generateThumbnails(video)
    }
    const handleEnded = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoaded)
    video.addEventListener('ended', handleEnded)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoaded)
      video.removeEventListener('ended', handleEnded)
    }
  }, [src])

  const generateThumbnails = async (video) => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 45
    const ctx = canvas.getContext('2d')
    const count = 8
    const thumbs = []

    for (let i = 0; i < count; i++) {
      const time = (video.duration / count) * i
      await new Promise(resolve => {
        video.currentTime = time
        video.addEventListener('seeked', () => {
          ctx.drawImage(video, 0, 0, 80, 45)
          thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
          resolve()
        }, { once: true })
      })
    }
    setThumbnails(thumbs)
    video.currentTime = 0
  }

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      if (currentTime < trimStart || currentTime > trimEnd) {
        video.currentTime = trimStart
      }
      video.play()
      setIsPlaying(true)
    }
  }

  const handleTimelineClick = useCallback((e) => {
    if (!timelineRef.current || !duration) return
    const rect = timelineRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    if (videoRef.current) videoRef.current.currentTime = time
    onTimeUpdate?.(time)
  }, [duration])

  const handleMouseDown = (e, type) => {
    e.stopPropagation()
    setIsDragging(type)
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e) => {
      if (!timelineRef.current || !duration) return
      const rect = timelineRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const time = ratio * duration
      if (isDragging === 'start') {
        onTrimChange?.(Math.min(time, trimEnd - 0.5), trimEnd)
      } else if (isDragging === 'end') {
        onTrimChange?.(trimStart, Math.max(time, trimStart + 0.5))
      }
    }
    const handleUp = () => setIsDragging(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging, duration, trimStart, trimEnd])

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const startPct = duration ? (trimStart / duration) * 100 : 0
  const endPct = duration ? (trimEnd / duration) * 100 : 100
  const playPct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {/* Video */}
      <div style={{
        flex: 1,
        background: '#000',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid var(--border)',
      }}>
        {src ? (
          <video
            ref={videoRef}
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
          />
        ) : (
          <div style={{ color: 'var(--text-2)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>▶</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>NO INPUT</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={togglePlay}
          disabled={!src}
          style={{
            width: 40, height: 40,
            borderRadius: '50%',
            background: src ? 'var(--accent)' : 'var(--bg-3)',
            color: src ? '#000' : 'var(--text-2)',
            fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: src ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-1)', flexShrink: 0 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', userSelect: 'none' }}>
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          style={{
            position: 'relative',
            height: 48,
            background: 'var(--bg-2)',
            borderRadius: 'var(--radius)',
            overflow: 'visible',
            cursor: 'pointer',
            border: '1px solid var(--border)',
          }}
        >
          {/* Thumbnail strip */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', overflow: 'hidden',
            borderRadius: 'var(--radius)',
            opacity: 0.5,
          }}>
            {thumbnails.length > 0
              ? thumbnails.map((t, i) => (
                  <img key={i} src={t} alt="" style={{ height: '100%', flex: 1, objectFit: 'cover' }} />
                ))
              : Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: i % 2 === 0 ? 'var(--bg-3)' : 'var(--bg-2)' }} />
                ))
            }
          </div>

          {/* Trim mask - left */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: 0,
            width: `${startPct}%`,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 'var(--radius) 0 0 var(--radius)',
          }} />
          {/* Trim mask - right */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: `${100 - endPct}%`,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: '0 var(--radius) var(--radius) 0',
          }} />

          {/* Active trim region border */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            border: '2px solid var(--accent)',
            borderRadius: 2,
            pointerEvents: 'none',
          }} />

          {/* Trim handles */}
          {[
            { pct: startPct, type: 'start', side: 'left' },
            { pct: endPct, type: 'end', side: 'right' },
          ].map(({ pct, type, side }) => (
            <div
              key={type}
              onMouseDown={(e) => handleMouseDown(e, type)}
              style={{
                position: 'absolute',
                top: 0, bottom: 0,
                left: `${pct}%`,
                transform: 'translateX(-50%)',
                width: 12,
                background: 'var(--accent)',
                borderRadius: 2,
                cursor: 'ew-resize',
                zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ width: 2, height: 16, background: 'rgba(0,0,0,0.5)', borderRadius: 1 }} />
            </div>
          ))}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              top: -4, bottom: -4,
              left: `${playPct}%`,
              width: 2,
              background: '#fff',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
              zIndex: 20,
              borderRadius: 1,
            }}
          >
            <div style={{
              position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
              width: 10, height: 10,
              background: '#fff',
              borderRadius: '50%',
            }} />
          </div>
        </div>

        {/* Time labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>
            IN {formatTime(trimStart)}
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)' }}>
            OUT {formatTime(trimEnd)}
          </span>
        </div>
      </div>
    </div>
  )
}
