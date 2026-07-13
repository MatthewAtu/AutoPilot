import { useState, useRef } from 'react'
import { Overlay } from './WorkFlowMonitor'

const MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — Groq (Fast)' },
  { value: 'llama3-70b-8192',      label: 'Llama 3 70B — Groq (Powerful)' },
  { value: 'llama3',               label: 'Llama 3 — Ollama (Local)' },
]

const PRIORITY = {
  high:   { color: '#c62828', bg: '#fdf2f2', border: '#f5c6c6' },
  medium: { color: '#f57f17', bg: '#fff8e1', border: '#ffecb3' },
  low:    { color: '#2e7d32', bg: '#f1f8e9', border: '#c8e6c9' },
}

export default function TranscriptTaskModal({ onClose, onTasksAdded }) {
  const [tab,        setTab]        = useState('transcript')
  const [model,      setModel]      = useState(MODELS[0].value)
  const [transcript, setTranscript] = useState('')
  const [videoFile,  setVideoFile]  = useState(null)
  const [dragOver,   setDragOver]   = useState(false)
  const [processing, setProcessing] = useState(false)
  const [extracted,  setExtracted]  = useState([])
  const [selected,   setSelected]   = useState(new Set())
  const [detectedTx, setDetectedTx] = useState('')
  const [error,      setError]      = useState(null)
  const fileRef = useRef(null)

  function reset() { setExtracted([]); setSelected(new Set()); setError(null); setDetectedTx('') }

  function applyExtracted(tasks) {
    const tagged = tasks.map((t, i) => ({ id: i, ...t }))
    setExtracted(tagged)
    setSelected(new Set(tagged.map(t => t.id)))
  }

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function extractFromTranscript() {
    const text = transcript.trim()
    if (!text) return
    reset(); setProcessing(true)
    try {
      const res = await fetch('/api/tasks/from-transcript', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, model }),
      })
      if (!res.ok) throw new Error()
      applyExtracted((await res.json()).tasks ?? [])
    } catch { setError('Could not extract tasks.') }
    finally { setProcessing(false) }
  }

  async function extractFromVideo() {
    if (!videoFile) return
    reset(); setProcessing(true)
    try {
      const form = new FormData()
      form.append('video', videoFile)
      form.append('model', model)
      const res = await fetch('/api/tasks/from-video', { method: 'POST', body: form })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDetectedTx(data.transcript ?? '')
      applyExtracted(data.tasks ?? [])
    } catch { setError('Could not process video.') }
    finally { setProcessing(false) }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f?.type.startsWith('video/')) setVideoFile(f)
  }

  function addSelected() {
    onTasksAdded(extracted.filter(t => selected.has(t.id)))
    onClose()
  }

  const canExtract   = tab === 'transcript' ? transcript.trim().length > 0 : videoFile !== null
  const extractLabel = processing
    ? (tab === 'video' ? 'Transcribing…' : 'Extracting…')
    : (tab === 'video' ? 'Transcribe & Extract' : 'Extract Tasks')

  return (
    <Overlay>
      <div
        className="modal-in w-full mx-4 flex flex-col overflow-hidden"
        style={{ maxWidth: 480, maxHeight: '88vh', background: '#fff', border: '1px solid #d9d9d9', borderRadius: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #d9d9d9', background: '#1a1a1a' }}>
          <div>
            <h2 className="text-[14px] font-semibold text-white">Tasks from Transcript</h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#aaa' }}>Extract action items using AI</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center transition-colors"
            style={{ color: '#aaa', borderRadius: '2px' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#333' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Model */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest block mb-1.5" style={{ color: '#888' }}>AI Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full text-[13px] px-3.5 py-2.5 focus:outline-none"
              style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#1a1a1a', background: '#fafafa' }}
            >
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex" style={{ border: '1px solid #d9d9d9', borderRadius: '2px', overflow: 'hidden' }}>
            {[['transcript','Paste Transcript'],['video','Upload Video']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setTab(key); reset() }}
                className="flex-1 py-2 text-[12px] font-semibold transition-colors"
                style={{
                  background: tab === key ? '#1a1a1a' : '#f7f7f7',
                  color: tab === key ? '#fff' : '#666',
                  borderRight: key === 'transcript' ? '1px solid #d9d9d9' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Transcript input */}
          {tab === 'transcript' && (
            <textarea
              rows={6}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste your transcript here…"
              className="w-full text-[13px] px-4 py-3 focus:outline-none"
              style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#1a1a1a', background: '#fafafa' }}
            />
          )}

          {/* Video drop */}
          {tab === 'video' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 px-6 py-10 cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragOver ? '#1a1a1a' : videoFile ? '#2e7d32' : '#d9d9d9'}`,
                  borderRadius: '2px',
                  background: dragOver ? '#f0f0f0' : videoFile ? '#f1f8e9' : '#fafafa',
                }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: videoFile ? '#2e7d32' : '#bbb' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                {videoFile
                  ? <p className="text-[13px] font-semibold" style={{ color: '#2e7d32' }}>{videoFile.name}</p>
                  : <>
                      <p className="text-[13px] font-semibold" style={{ color: '#444' }}>Drop a video or audio file</p>
                      <p className="text-[12px]" style={{ color: '#aaa' }}>mp4, mov, m4a, webm…</p>
                    </>
                }
              </div>
              <input ref={fileRef} type="file" accept="video/*,audio/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) setVideoFile(f) }} />
              {videoFile && (
                <button onClick={() => { setVideoFile(null); reset() }} className="mt-2 text-[12px]" style={{ color: '#aaa' }}>Remove file</button>
              )}
            </div>
          )}

          {detectedTx && (
            <details style={{ border: '1px solid #d9d9d9', borderRadius: '2px' }}>
              <summary className="px-4 py-2.5 text-[12px] font-semibold cursor-pointer select-none" style={{ color: '#666' }}>Detected Transcript</summary>
              <p className="px-4 pb-3 text-[12px] whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto" style={{ color: '#444' }}>{detectedTx}</p>
            </details>
          )}

          {error && (
            <div className="px-4 py-3 text-[13px]" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', borderRadius: '2px', color: '#c62828' }}>{error}</div>
          )}

          {extracted.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#888' }}>
                {selected.size} of {extracted.length} selected
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {extracted.map(task => {
                  const p = PRIORITY[task.priority] ?? PRIORITY.medium
                  const sel = selected.has(task.id)
                  return (
                    <div
                      key={task.id}
                      onClick={() => toggle(task.id)}
                      className="flex items-start gap-3 p-3 cursor-pointer transition-colors"
                      style={{ border: `1px solid ${sel ? '#1a1a1a' : '#d9d9d9'}`, borderRadius: '2px', background: sel ? '#f7f7f7' : '#fafafa' }}
                    >
                      <div
                        className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ border: `2px solid ${sel ? '#1a1a1a' : '#d9d9d9'}`, background: sel ? '#1a1a1a' : 'transparent', borderRadius: '2px' }}
                      >
                        {sel && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px]" style={{ color: '#1a1a1a' }}>{task.text}</p>
                        {task.priority && (
                          <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5" style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}`, borderRadius: '2px' }}>
                            {task.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderTop: '1px solid #d9d9d9' }}>
          <button onClick={onClose} className="text-[13px]" style={{ color: '#666' }}>Cancel</button>
          <div className="flex gap-2">
            <button
              onClick={tab === 'transcript' ? extractFromTranscript : extractFromVideo}
              disabled={!canExtract || processing}
              className="text-[13px] font-semibold px-4 py-2 transition-colors"
              style={{ border: '1px solid #d9d9d9', background: '#f7f7f7', color: '#444', borderRadius: '2px', opacity: (!canExtract || processing) ? 0.4 : 1 }}
            >
              {processing && (
                <span className="inline-flex gap-0.5 mr-1.5">
                  <span className="dot-1 w-1 h-1 rounded-full inline-block" style={{ background: '#666' }} />
                  <span className="dot-2 w-1 h-1 rounded-full inline-block" style={{ background: '#666' }} />
                  <span className="dot-3 w-1 h-1 rounded-full inline-block" style={{ background: '#666' }} />
                </span>
              )}
              {extractLabel}
            </button>
            {extracted.length > 0 && (
              <button
                onClick={addSelected}
                disabled={selected.size === 0}
                className="text-[13px] font-semibold px-4 py-2 transition-colors"
                style={{ background: '#1a1a1a', color: '#fff', borderRadius: '2px', opacity: selected.size === 0 ? 0.4 : 1 }}
              >
                Add {selected.size} Task{selected.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}
