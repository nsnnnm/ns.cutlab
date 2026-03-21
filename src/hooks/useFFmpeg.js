import { useState, useCallback } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

let ff = null

export function useFFmpeg() {
  const [loaded,   setLoaded]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [eta,      setEta]      = useState(null)
  const startRef = { current: 0 }

  const load = useCallback(async () => {
    if (loaded || loading) return
    setLoading(true)
    try {
      if (!ff) {
        ff = createFFmpeg({
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
          progress: ({ ratio }) => {
            const pct = Math.round(ratio * 100)
            setProgress(pct)
            if (pct > 2 && startRef.current) {
              const elapsed = (Date.now() - startRef.current) / 1000
              setEta(Math.round((elapsed / ratio) * (1 - ratio)))
            }
          },
          log: false,
        })
      }
      if (!ff.isLoaded()) await ff.load()
      setLoaded(true)
    } catch (e) {
      console.error('FFmpeg load error:', e)
    } finally {
      setLoading(false)
    }
  }, [loaded, loading])

  const processVideo = useCallback(async ({
    clips, texts, filters, audioSettings, audioTracks,
    exportSettings = {}
  }) => {
    if (!ff || !ff.isLoaded()) throw new Error('FFmpeg not loaded')
    setProgress(0); setEta(null)
    startRef.current = Date.now()

    const {
      preset       = 'ultrafast',
      crf          = 23,
      scale        = 1,
      audioBitrate = '128k',
    } = exportSettings

    const hasFilters    = filters && (filters.brightness !== 1 || filters.contrast !== 1 || filters.saturation !== 1 || filters.blur > 0)
    const activeTexts   = (texts || []).filter(t => t.content && t.content.trim())
    const hasTexts      = activeTexts.length > 0
    const hasBGM        = audioTracks && audioTracks.length > 0
    const hasAudioFx    = audioSettings.mute || audioSettings.volume !== 1
    const needsReencode = hasFilters || hasTexts || hasBGM || hasAudioFx || scale !== 1

    // Write input video files
    for (let i = 0; i < clips.length; i++) {
      ff.FS('writeFile', `clip${i}.${clips[i].ext}`, await fetchFile(clips[i].file))
    }
    // Write audio files
    for (let i = 0; i < (audioTracks || []).length; i++) {
      ff.FS('writeFile', `bgm${i}.${audioTracks[i].ext}`, await fetchFile(audioTracks[i].file))
    }
    // Write text files (avoid all escaping issues)
    for (let i = 0; i < activeTexts.length; i++) {
      ff.FS('writeFile', `txt${i}.txt`, new TextEncoder().encode(activeTexts[i].content))
    }

    // Build vf filter string
    const vfParts = []
    if (scale !== 1) vfParts.push(`scale=iw*${scale}:ih*${scale}`)
    if (hasFilters) {
      const { brightness: b, contrast: c, saturation: s, blur } = filters
      if (b !== 1 || c !== 1 || s !== 1)
        vfParts.push(`eq=brightness=${(b-1).toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}`)
      if (blur > 0) vfParts.push(`boxblur=${blur}:${blur}`)
    }
    if (hasTexts) {
      for (let i = 0; i < activeTexts.length; i++) {
        const t = activeTexts[i]
        const col    = (t.color || '#ffffff').replace('#', '0x')
        const xExpr  = `(w*${((t.x || 50) / 100).toFixed(3)}-tw/2)`
        const yExpr  = `(h*${((t.y || 85) / 100).toFixed(3)}-th/2)`
        const fs     = Math.min(Math.max(t.fontSize || 36, 8), 200)
        let dt = `drawtext=textfile=txt${i}.txt:fontsize=${fs}:fontcolor=${col}:x=${xExpr}:y=${yExpr}:shadowx=2:shadowy=2:shadowcolor=black`
        if (t.endTime > t.startTime) {
          dt += `:enable='between(t\\,${t.startTime.toFixed(2)}\\,${t.endTime.toFixed(2)})'`
        }
        vfParts.push(dt)
      }
    }
    const vf = vfParts.length ? vfParts.join(',') : null

    // Step 1: Trim each clip
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const args = []
      if (clip.trimStart > 0) args.push('-ss', String(clip.trimStart))
      args.push('-i', `clip${i}.${clip.ext}`)
      if (clip.trimEnd > clip.trimStart) args.push('-t', String(clip.trimEnd - clip.trimStart))
      if (needsReencode) {
        args.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf))
        args.push('-c:a', 'aac', '-b:a', audioBitrate)
      } else {
        args.push('-c', 'copy')
      }
      args.push('-y', `trimmed${i}.mp4`)
      await ff.run(...args)
    }

    // Step 2: Concat
    if (clips.length > 1) {
      const list = clips.map((_, i) => `file trimmed${i}.mp4`).join('\n')
      ff.FS('writeFile', 'concat.txt', new TextEncoder().encode(list))
      await ff.run('-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', '-y', 'joined.mp4')
    } else {
      ff.FS('writeFile', 'joined.mp4', ff.FS('readFile', 'trimmed0.mp4'))
    }

    // Step 3: Apply vf + audio
    if (!needsReencode) {
      const data = ff.FS('readFile', 'joined.mp4')
      cleanup(clips, audioTracks || [], activeTexts)
      return new Blob([data.buffer], { type: 'video/mp4' })
    }

    const step3 = ['-i', 'joined.mp4']
    const bgmCount = (audioTracks || []).length
    for (let i = 0; i < bgmCount; i++) {
      step3.push('-i', `bgm${i}.${audioTracks[i].ext}`)
    }

    if (vf) step3.push('-vf', vf)

    if (bgmCount > 0) {
      if (audioSettings.mute) {
        const delays = audioTracks.map((t, i) => {
          const d = Math.round((t.startTime || 0) * 1000)
          return `[${i+1}:a]adelay=${d}|${d},volume=${t.volume || 0.8}[bgm${i}]`
        }).join(';')
        const labels = audioTracks.map((_, i) => `[bgm${i}]`).join('')
        step3.push('-filter_complex', `${delays};${labels}amix=inputs=${bgmCount}:normalize=0[aout]`, '-map', '0:v', '-map', '[aout]')
      } else {
        const delays = audioTracks.map((t, i) => {
          const d = Math.round((t.startTime || 0) * 1000)
          return `[${i+1}:a]adelay=${d}|${d},volume=${t.volume || 0.8}[bgm${i}]`
        }).join(';')
        const labels = audioTracks.map((_, i) => `[bgm${i}]`).join('')
        step3.push('-filter_complex', `${delays};[0:a]${labels}amix=inputs=${bgmCount+1}:normalize=0[aout]`, '-map', '0:v', '-map', '[aout]')
        if (audioSettings.volume !== 1) step3.push('-af', `volume=${audioSettings.volume}`)
      }
    } else {
      if (audioSettings.mute) step3.push('-an')
      else if (audioSettings.volume !== 1) step3.push('-af', `volume=${audioSettings.volume}`)
    }

    step3.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf))
    step3.push('-c:a', 'aac', '-b:a', audioBitrate, '-y', 'output.mp4')
    await ff.run(...step3)

    const data = ff.FS('readFile', 'output.mp4')
    cleanup(clips, audioTracks || [], activeTexts)
    setEta(null)
    return new Blob([data.buffer], { type: 'video/mp4' })
  }, [loaded])

  return { load, loaded, loading, progress, eta, processVideo }
}

function cleanup(clips, audioTracks, texts) {
  for (let i = 0; i < clips.length; i++) {
    try { ff.FS('unlink', `clip${i}.${clips[i].ext}`) } catch {}
    try { ff.FS('unlink', `trimmed${i}.mp4`) } catch {}
  }
  for (let i = 0; i < audioTracks.length; i++) {
    try { ff.FS('unlink', `bgm${i}.${audioTracks[i].ext}`) } catch {}
  }
  for (let i = 0; i < (texts || []).length; i++) {
    try { ff.FS('unlink', `txt${i}.txt`) } catch {}
  }
  try { ff.FS('unlink', 'concat.txt') } catch {}
  try { ff.FS('unlink', 'joined.mp4') } catch {}
  try { ff.FS('unlink', 'output.mp4') } catch {}
}
