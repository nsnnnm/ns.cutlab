import { useState, useRef, useCallback } from 'react'
import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg'

export function useFFmpeg() {
  const ffmpegRef = useRef(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState('')

  const load = useCallback(async () => {
    if (loaded || loading) return
    setLoading(true)
    try {
      const ffmpeg = createFFmpeg({
        corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
        progress: ({ ratio }) => setProgress(Math.round(ratio * 100)),
        log: true,
      })
      await ffmpeg.load()
      ffmpegRef.current = ffmpeg
      setLoaded(true)
    } catch (e) {
      console.error('FFmpeg load error:', e)
    } finally {
      setLoading(false)
    }
  }, [loaded, loading])

  const processVideo = useCallback(async (file, options) => {
    const ffmpeg = ffmpegRef.current
    if (!ffmpeg || !loaded) throw new Error('FFmpeg not loaded')

    const inputName = 'input.' + file.name.split('.').pop()
    const outputName = 'output.mp4'

    ffmpeg.FS('writeFile', inputName, await fetchFile(file))

    const args = ['-i', inputName]

    if (options.trim) {
      const { start, end } = options.trim
      args.push('-ss', String(start))
      if (end > 0) args.push('-to', String(end))
    }

    const vfFilters = []

    if (options.filters) {
      const { brightness, contrast, saturation, blur } = options.filters
      if (brightness !== 1 || contrast !== 1 || saturation !== 1) {
        vfFilters.push(`eq=brightness=${(brightness - 1).toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`)
      }
      if (blur > 0) {
        vfFilters.push(`boxblur=${blur}:${blur}`)
      }
    }

    if (options.text && options.text.content) {
      const { content, x, y, fontSize, color, startTime, endTime } = options.text
      const safeText = content.replace(/'/g, "\\'").replace(/:/g, "\\:")
      const colorHex = color.replace('#', '0x')
      let drawtext = `drawtext=text='${safeText}':fontsize=${fontSize}:fontcolor=${colorHex}:x=${x}:y=${y}`
      if (startTime !== undefined && endTime !== undefined) {
        drawtext += `:enable='between(t,${startTime},${endTime})'`
      }
      vfFilters.push(drawtext)
    }

    if (vfFilters.length > 0) {
      args.push('-vf', vfFilters.join(','))
    }

    if (options.mute) {
      args.push('-an')
    } else if (options.volume !== undefined && options.volume !== 1) {
      args.push('-filter:a', `volume=${options.volume}`)
    }

    args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
    args.push('-c:a', 'aac', '-b:a', '128k')
    args.push(outputName)

    setProgress(0)
    await ffmpeg.run(...args)

    const data = ffmpeg.FS('readFile', outputName)
    const blob = new Blob([data.buffer], { type: 'video/mp4' })

    ffmpeg.FS('unlink', inputName)
    ffmpeg.FS('unlink', outputName)

    return blob
  }, [loaded])

  return { load, loaded, loading, progress, log, processVideo }
}
