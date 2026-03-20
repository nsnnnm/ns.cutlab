import { useState, useCallback } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

let ff = null

export function useFFmpeg() {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)

  const load = useCallback(async () => {
    if (loaded || loading) return
    setLoading(true)
    try {
      if (!ff) {
        ff = createFFmpeg({
          corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
          progress: ({ ratio }) => setProgress(Math.round(ratio * 100)),
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

  // Build vf filter string
  const buildVf = (filters, texts) => {
    const parts = []
    if (filters) {
      const { brightness: b, contrast: c, saturation: s, blur } = filters
      if (b !== 1 || c !== 1 || s !== 1) parts.push(`eq=brightness=${(b-1).toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}`)
      if (blur > 0) parts.push(`boxblur=${blur}:${blur}`)
    }
    if (texts) {
      for (const t of texts) {
        if (!t.content) continue
        const safe = t.content.replace(/\\/g,'\\\\').replace(/'/g,'\u2019').replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/,/g,'\\,')
        const col = (t.color||'#ffffff').replace('#','0x')
        const x = `(w*${((t.x||50)/100).toFixed(3)}-tw/2)`
        const y = `(h*${((t.y||85)/100).toFixed(3)}-th/2)`
        let dt = `drawtext=text='${safe}':fontsize=${t.fontSize||36}:fontcolor=${col}:x=${x}:y=${y}:shadowx=2:shadowy=2:shadowcolor=0x000000`
        if (t.endTime > t.startTime) dt += `:enable='between(t,${t.startTime},${t.endTime})'`
        parts.push(dt)
      }
    }
    return parts.length ? parts.join(',') : null
  }

  const processVideo = useCallback(async ({ clips, texts, filters, audioSettings, audioTracks }) => {
    if (!ff || !ff.isLoaded()) throw new Error('FFmpeg not loaded')
    setProgress(0)

    // Write video clips
    for (let i = 0; i < clips.length; i++) {
      ff.FS('writeFile', `clip${i}.${clips[i].ext}`, await fetchFile(clips[i].file))
    }

    // Write audio tracks
    for (let i = 0; i < (audioTracks||[]).length; i++) {
      ff.FS('writeFile', `bgm${i}.${audioTracks[i].ext}`, await fetchFile(audioTracks[i].file))
    }

    const totalDur = clips.reduce((s,c) => s + (c.trimEnd - c.trimStart), 0)
    const vf = buildVf(filters, texts)

    // Step 1: trim each clip, pad black before startTime
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const args = []
      // black pad before clip if startTime > 0 (for first clip on timeline)
      if (i === 0 && (clip.startTime || 0) > 0) {
        const pad = clip.startTime
        // generate black video pad
        args.push('-f', 'lavfi', '-i', `color=c=black:size=1280x720:rate=30:duration=${pad}`)
        args.push('-i', `clip${i}.${clip.ext}`)
        if (clip.trimStart > 0) args.push('-ss', String(clip.trimStart))
        args.push('-t', String(clip.trimEnd - clip.trimStart))
        args.push('-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]')
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-an', '-y', `trimmed${i}.mp4`)
      } else {
        if (clip.trimStart > 0) args.push('-ss', String(clip.trimStart))
        args.push('-i', `clip${i}.${clip.ext}`)
        args.push('-t', String(clip.trimEnd - clip.trimStart))
        args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23')
        args.push('-c:a', 'aac', '-b:a', '128k', '-y', `trimmed${i}.mp4`)
      }
      await ff.run(...args)
    }

    // Step 2: concat
    if (clips.length > 1) {
      const list = clips.map((_,i) => `file trimmed${i}.mp4`).join('\n')
      ff.FS('writeFile', 'concat.txt', new TextEncoder().encode(list))
      await ff.run('-f','concat','-safe','0','-i','concat.txt','-c','copy','-y','joined.mp4')
    } else {
      ff.FS('writeFile', 'joined.mp4', ff.FS('readFile', 'trimmed0.mp4'))
    }

    // Step 3: apply vf + audio
    const step3 = ['-i', 'joined.mp4']

    // Mix BGM tracks
    const bgmCount = (audioTracks||[]).length
    for (let i = 0; i < bgmCount; i++) {
      step3.push('-i', `bgm${i}.${audioTracks[i].ext}`)
    }

    if (vf) step3.push('-vf', vf)

    if (bgmCount > 0) {
      // Mix original audio with BGM tracks
      let filterComplex = '[0:a]'
      const delays = audioTracks.map((t,i) => {
        const delayMs = Math.round((t.startTime||0)*1000)
        return `[${i+1}:a]adelay=${delayMs}|${delayMs},volume=${t.volume||0.8}[bgm${i}]`
      })
      const bgmLabels = audioTracks.map((_,i) => `[bgm${i}]`).join('')
      filterComplex = delays.join(';') + `;[0:a]${bgmLabels}amix=inputs=${bgmCount+1}:normalize=0[aout]`
      if (audioSettings.mute) {
        // skip original audio
        const muteDelays = audioTracks.map((t,i) => `[${i+1}:a]adelay=${Math.round((t.startTime||0)*1000)}|${Math.round((t.startTime||0)*1000)},volume=${t.volume||0.8}[bgm${i}]`).join(';')
        const muteLabels = audioTracks.map((_,i) => `[bgm${i}]`).join('')
        const muteFilter = muteDelays + `;${muteLabels}amix=inputs=${bgmCount}:normalize=0[aout]`
        step3.push('-filter_complex', muteFilter, '-map', '0:v', '-map', '[aout]')
      } else {
        step3.push('-filter_complex', filterComplex, '-map', '0:v', '-map', '[aout]')
        if (audioSettings.volume !== 1) step3.push('-af', `volume=${audioSettings.volume}`)
      }
    } else {
      if (audioSettings.mute) step3.push('-an')
      else if (audioSettings.volume !== 1) step3.push('-af', `volume=${audioSettings.volume}`)
    }

    step3.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-y', 'output.mp4')
    await ff.run(...step3)

    const data = ff.FS('readFile', 'output.mp4')
    const blob = new Blob([data.buffer], { type: 'video/mp4' })

    // Cleanup
    for (let i = 0; i < clips.length; i++) {
      try { ff.FS('unlink', `clip${i}.${clips[i].ext}`) } catch {}
      try { ff.FS('unlink', `trimmed${i}.mp4`) } catch {}
    }
    for (let i = 0; i < bgmCount; i++) { try { ff.FS('unlink', `bgm${i}.${audioTracks[i].ext}`) } catch {} }
    try { ff.FS('unlink', 'concat.txt') } catch {}
    try { ff.FS('unlink', 'joined.mp4') } catch {}
    try { ff.FS('unlink', 'output.mp4') } catch {}

    return blob
  }, [loaded])

  return { load, loaded, loading, progress, processVideo }
}
