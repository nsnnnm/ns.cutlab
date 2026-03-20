import { useState, useCallback } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

let ffmpegInstance = null

export function useFFmpeg() {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async () => {
    if (loaded || loading) return
    setLoading(true)
    try {
      if (!ffmpegInstance) {
        ffmpegInstance = createFFmpeg({
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
          progress: ({ ratio }) => setProgress(Math.round(ratio * 100)),
          log: false,
        })
      }
      if (!ffmpegInstance.isLoaded()) {
        await ffmpegInstance.load()
      }
      setLoaded(true)
    } catch (e) {
      console.error('FFmpeg load error:', e)
    } finally {
      setLoading(false)
    }
  }, [loaded, loading])

  const processVideo = useCallback(async (clips, textOverlays, globalFilters, globalAudio) => {
    const ffmpeg = ffmpegInstance
    if (!ffmpeg || !ffmpeg.isLoaded()) throw new Error('FFmpeg not loaded')

    setProgress(0)

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      ffmpeg.FS('writeFile', `clip${i}.${clip.ext}`, await fetchFile(clip.file))
    }

    if (clips.length === 1) {
      const clip = clips[0]
      const args = []
      if (clip.trimStart > 0) args.push('-ss', String(clip.trimStart))
      args.push('-i', `clip0.${clip.ext}`)
      if (clip.trimEnd > clip.trimStart) args.push('-t', String(clip.trimEnd - clip.trimStart))

      const vf = buildVfFilters(globalFilters, textOverlays)
      if (vf) args.push('-vf', vf)
      if (globalAudio.mute) {
        args.push('-an')
      } else if (globalAudio.volume !== 1) {
        args.push('-af', `volume=${globalAudio.volume}`)
      }
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
      args.push('-c:a', 'aac', '-b:a', '128k', '-y', 'output.mp4')
      await ffmpeg.run(...args)
    } else {
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i]
        const args = []
        if (clip.trimStart > 0) args.push('-ss', String(clip.trimStart))
        args.push('-i', `clip${i}.${clip.ext}`)
        if (clip.trimEnd > clip.trimStart) args.push('-t', String(clip.trimEnd - clip.trimStart))
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', `trimmed${i}.mp4`)
        await ffmpeg.run(...args)
      }

      const concatList = clips.map((_, i) => `file trimmed${i}.mp4`).join('\n')
      ffmpeg.FS('writeFile', 'concat.txt', new TextEncoder().encode(concatList))

      const args = ['-f', 'concat', '-safe', '0', '-i', 'concat.txt']
      const vf = buildVfFilters(globalFilters, textOverlays)
      if (vf) args.push('-vf', vf)
      if (globalAudio.mute) {
        args.push('-an')
      } else if (globalAudio.volume !== 1) {
        args.push('-af', `volume=${globalAudio.volume}`)
      }
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', 'output.mp4')
      await ffmpeg.run(...args)
    }

    const data = ffmpeg.FS('readFile', 'output.mp4')
    const blob = new Blob([data.buffer], { type: 'video/mp4' })

    for (let i = 0; i < clips.length; i++) {
      try { ffmpeg.FS('unlink', `clip${i}.${clips[i].ext}`) } catch {}
      try { ffmpeg.FS('unlink', `trimmed${i}.mp4`) } catch {}
    }
    try { ffmpeg.FS('unlink', 'concat.txt') } catch {}
    try { ffmpeg.FS('unlink', 'output.mp4') } catch {}

    return blob
  }, [loaded])

  return { load, loaded, loading, progress, processVideo }
}

function buildVfFilters(filters, textOverlays) {
  const parts = []

  if (filters) {
    const { brightness, contrast, saturation, blur } = filters
    if (brightness !== 1 || contrast !== 1 || saturation !== 1) {
      parts.push(`eq=brightness=${(brightness - 1).toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`)
    }
    if (blur > 0) parts.push(`boxblur=${blur}:${blur}`)
  }

  if (textOverlays && textOverlays.length > 0) {
    for (const t of textOverlays) {
      if (!t.content) continue
      const safeText = t.content
        .replace(/\\/g, '\\\\')
        .replace(/'/g, '\u2019')
        .replace(/:/g, '\\:')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/,/g, '\\,')
      const colorHex = (t.color || '#ffffff').replace('#', '0x')
      const xPos = `(w*${((t.x || 50) / 100).toFixed(3)}-tw/2)`
      const yPos = `(h*${((t.y || 85) / 100).toFixed(3)}-th/2)`
      let dt = `drawtext=text='${safeText}':fontsize=${t.fontSize || 36}:fontcolor=${colorHex}:x=${xPos}:y=${yPos}:shadowx=2:shadowy=2:shadowcolor=0x000000`
      if (t.startTime !== undefined && t.endTime !== undefined && t.endTime > t.startTime) {
        dt += `:enable='between(t,${t.startTime},${t.endTime})'`
      }
      parts.push(dt)
    }
  }

  return parts.length > 0 ? parts.join(',') : null
}
