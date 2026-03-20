import React, { useState, useRef, useCallback } from 'react'
import VideoPlayer from './components/VideoPlayer.jsx'
import TextPanel from './components/TextPanel.jsx'
import FiltersPanel from './components/FiltersPanel.jsx'
import AudioPanel from './components/AudioPanel.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import { useFFmpeg } from './hooks/useFFmpeg.js'

const TABS = [
  { id: 'trim', label: 'カット', icon: '✂' },
  { id: 'text', label: 'テキスト', icon: 'T' },
  { id: 'filters', label: 'フィルター', icon: '◑' },
  { id: 'audio', label: '音声', icon: '♪' },
  { id: 'export', label: 'エクスポート', icon: '⚙' },
]

export default function App() {
  const [videoFile, setVideoFile] = useState(null)
  const [videoSrc, setVideoSrc] = useState(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [activeTab, setActiveTab] = useState('trim')
  const [dragging, setDragging] = useState(false)
  const [outputBlob, setOutputBlob] = useState(null)
  const [processing, setProcessing] = useState(false)

  const [text, setText] = useState({
    content: '', x: 50, y: 85,
    fontSize: 36, color: '#ffffff',
    startTime: 0, endTime: 0,
  })
  const [filters, setFilters] = useState({
    brightness: 1, contrast: 1, saturation: 1, blur: 0,
  })
  const [audio, setAudio] = useState({ mute: false, volume: 1 })

  const { load, loaded, loading, progress, processVideo } = useFFmpeg()
  const dropRef = useRef(null)

  const loadVideo = (file) => {
    if (!file || !file.type.startsWith('video/')) return
    setVideoFile(file)
    const url = URL.createObjectURL(file)
    setVideoSrc(url)
    setOutputBlob(null)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) loadVideo(file)
  }, [])

  const handleDurationChange = (d) => {
    setDuration(d)
    setTrimEnd(d)
    setText(t => ({ ...t, endTime: d }))
  }

  const handleExport = async () => {
    if (!videoFile || !loaded) return
    setProcessing(true)
    setOutputBlob(null)
    try {
      const blob = await processVideo(videoFile, {
        trim: trimEnd > trimStart ? { start: trimStart, end: trimEnd } : null,
        text: text.content ? {
          ...text,
          x: `(w*${(text.x / 100).toFixed(3)})-(tw/2)`,
          y: `(h*${(text.y / 100).toFixed(3)})-(th/2)`,
        } : null,
        filters,
        mute: audio.mute,
        volume: audio.volume,
      })
      setOutputBlob(blob)
      setActiveTab('export')
    } catch (err) {
      console.error('Export error:', err)
      alert('エクスポート中にエラーが発生しました。コンソールを確認してください。')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-0)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: '-0.02em',
            color: 'var(--accent)',
          }}>
            CUT<span style={{ color: 'var(--text-0)' }}>LAB</span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-2)',
            borderLeft: '1px solid var(--border)',
            paddingLeft: 12,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Browser-native Video Editor
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {videoFile && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--text-2)', maxWidth: 200,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {videoFile.name}
            </div>
          )}
          <label style={{ cursor: 'pointer' }}>
            <input type="file" accept="video/*" style={{ display: 'none' }}
              onChange={e => loadVideo(e.target.files[0])} />
            <div className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }}>
              {videoFile ? '↺ 変更' : '+ 動画を開く'}
            </div>
          </label>
          {loaded && (
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, padding: '3px 8px',
              background: 'rgba(46,204,113,0.1)', color: 'var(--green)',
              border: '1px solid rgba(46,204,113,0.3)', borderRadius: 2,
              letterSpacing: '0.06em',
            }}>
              WASM READY
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Video Preview */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          gap: 12,
          borderRight: '1px solid var(--border)',
          minWidth: 0,
        }}>
          {!videoFile ? (
            /* Drop zone */
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                background: dragging ? 'var(--accent-bg)' : 'var(--bg-1)',
                transition: 'var(--transition)',
                gap: 16, cursor: 'pointer',
              }}
            >
              <label style={{ display: 'contents', cursor: 'pointer' }}>
                <input type="file" accept="video/*" style={{ display: 'none' }}
                  onChange={e => loadVideo(e.target.files[0])} />
                <div style={{
                  width: 72, height: 72,
                  borderRadius: '50%',
                  background: dragging ? 'var(--accent-bg)' : 'var(--bg-3)',
                  border: `1px solid ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, transition: 'var(--transition)',
                }}>
                  🎬
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                    {dragging ? 'ここにドロップ' : '動画をドロップ、またはクリック'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                    MP4, MOV, AVI, WebM 対応
                  </div>
                </div>
              </label>
            </div>
          ) : (
            <VideoPlayer
              src={videoSrc}
              currentTime={currentTime}
              duration={duration}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onTimeUpdate={setCurrentTime}
              onDurationChange={handleDurationChange}
              onTrimChange={(s, e) => { setTrimStart(s); setTrimEnd(e) }}
            />
          )}
        </div>

        {/* Right: Controls panel */}
        <div style={{
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--bg-1)',
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '10px 4px',
                  background: 'transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-2)',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  transition: 'var(--transition)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
          }}>
            {activeTab === 'trim' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s ease' }}>
                <SectionHeader title="カット / トリミング" />
                <div style={{
                  padding: '14px',
                  background: 'var(--bg-2)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  lineHeight: 1.8,
                }}>
                  <Row label="開始点" value={formatTime(trimStart)} accent />
                  <Row label="終了点" value={formatTime(trimEnd)} accent />
                  <Row label="デュレーション" value={formatTime(trimEnd - trimStart)} />
                  <Row label="元の長さ" value={formatTime(duration)} />
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-2)',
                  fontFamily: 'var(--font-mono)', lineHeight: 1.7,
                  padding: '10px 12px',
                  background: 'var(--bg-2)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                }}>
                  タイムライン上の黄色いハンドルをドラッグして<br />
                  IN点・OUT点を設定します。
                </div>
                {videoFile && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                      onClick={() => { setTrimStart(0); setTrimEnd(duration) }}>
                      リセット
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                      onClick={() => setTrimStart(currentTime)}>
                      現在地をIN
                    </button>
                    <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                      onClick={() => setTrimEnd(currentTime)}>
                      現在地をOUT
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'text' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <SectionHeader title="テキスト / 字幕" />
                <div style={{ marginTop: 14 }}>
                  <TextPanel text={text} onChange={setText} />
                </div>
              </div>
            )}

            {activeTab === 'filters' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <SectionHeader title="フィルター / エフェクト" />
                <div style={{ marginTop: 14 }}>
                  <FiltersPanel filters={filters} onChange={setFilters} />
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <SectionHeader title="音声設定" />
                <div style={{ marginTop: 14 }}>
                  <AudioPanel audio={audio} onChange={setAudio} />
                </div>
              </div>
            )}

            {activeTab === 'export' && (
              <div style={{ animation: 'fadeIn 0.2s ease' }}>
                <SectionHeader title="エクスポート" />
                <div style={{ marginTop: 14 }}>
                  <ExportPanel
                    onExport={handleExport}
                    processing={processing}
                    progress={progress}
                    loaded={loaded}
                    loading={loading}
                    onLoadFFmpeg={load}
                    outputBlob={outputBlob}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quick export button */}
          {videoFile && activeTab !== 'export' && (
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              {!loaded ? (
                <button
                  onClick={load}
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                >
                  {loading ? '⟳ 読み込み中...' : '⚡ FFmpeg を読み込む'}
                </button>
              ) : (
                <button
                  onClick={handleExport}
                  disabled={processing}
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                >
                  {processing ? `⟳ ${progress}%` : '⚙ エクスポート'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        fontWeight: 800, fontSize: 13,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        color: 'var(--text-0)',
      }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span style={{ color: accent ? 'var(--accent)' : 'var(--text-0)' }}>{value}</span>
    </div>
  )
}

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00.0'
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}
