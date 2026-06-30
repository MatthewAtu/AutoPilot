import { useState, useRef } from 'react'

const MODELS = [
  { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · Groq (Fast)' },
  { value: 'llama3-70b-8192', label: 'Llama 3 70B · Groq (Powerful)' },
  { value: 'llama3', label: 'Llama 3 · Local (Ollama)' },
]

const PRIORITY_STYLES = {
  high: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
  medium: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  low: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
}

export default function TranscriptTaskModal({ onClose, onTasksAdded }) {
  const [tab, setTab] = useState('transcript')
  const [model, setModel] = useState('llama-3.1-8b-instant')
  const [transcript, setTranscript] = useState('')
  const [videoFile, setVideoFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [extracted, setExtracted] = useState([])
  const [detectedTranscript, setDetectedTranscript] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  function reset() {
    setExtracted([])
    setSelected(new Set())
    setError(null)
    setDetectedTranscript('')
  }

  async function handleExtractFromTranscript() {
    const text = transcript.trim()
    if (!text) return
    reset()
    setProcessing(true)
    try {
      const res = await fetch('/api/tasks/from-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, model }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      applyExtracted(data.tasks ?? [])
    } catch {
      setError('Could not extract tasks. Check that the backend is running.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleExtractFromVideo() {
    if (!videoFile) return
    reset()
    setProcessing(true)
    try {
      const form = new FormData()
      form.append('video', videoFile)
      form.append('model', model)
      const res = await fetch('/api/tasks/from-video', { method: 'POST', body: form })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDetectedTranscript(data.transcript ?? '')
      applyExtracted(data.tasks ?? [])
    } catch {
      setError('Could not process video. Ensure the backend is running.')
    } finally {
      setProcessing(false)
    }
  }

  function applyExtracted(tasks) {
    const tagged = tasks.map((t, i) => ({ id: i, ...t }))
    setExtracted(tagged)
    setSelected(new Set(tagged.map(t => t.id)))
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleAdd() {
    onTasksAdded(extracted.filter(t => selected.has(t.id)))
    onClose()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('video/')) setVideoFile(file)
  }

  const canExtract = tab === 'transcript' ? transcript.trim().length > 0 : videoFile !== null
  const extractLabel = processing
    ? (tab === 'video' ? 'Transcribing…' : 'Extracting…')
    : (tab === 'video' ? 'Transcribe & Extract' : 'Extract Tasks')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-100">Tasks from Transcript</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Model selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              AI Model
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
            >
              {MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Tabs */}
          <div className="flex rounded-xl bg-slate-800/80 border border-slate-700/50 p-1 gap-1">
            {[
              { key: 'transcript', label: 'Paste Transcript' },
              { key: 'video', label: 'Upload Video' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); reset() }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  tab === t.key
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Transcript tab */}
          {tab === 'transcript' && (
            <textarea
              rows={6}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste transcript text here…"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all"
            />
          )}

          {/* Video tab */}
          {tab === 'video' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : videoFile
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/60'
                }`}
              >
                <svg className={`w-8 h-8 ${videoFile ? 'text-emerald-400' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
                {videoFile ? (
                  <p className="text-sm font-medium text-emerald-300">{videoFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-300">Drop a video file here</p>
                    <p className="text-xs text-slate-500">or click to browse — mp4, mov, m4a, webm…</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="video/*,audio/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) setVideoFile(f) }} />
              {videoFile && (
                <button onClick={() => { setVideoFile(null); reset() }} className="mt-2 text-xs text-slate-500 hover:text-rose-400 transition-colors">
                  Remove file
                </button>
              )}
            </div>
          )}

          {/* Detected transcript */}
          {detectedTranscript && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 uppercase tracking-widest select-none">
                Detected transcript
              </summary>
              <p className="mt-2 text-slate-400 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto bg-slate-800 rounded-xl p-3 text-xs border border-slate-700">
                {detectedTranscript}
              </p>
            </details>
          )}

          {error && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">{error}</p>
          )}

          {/* Extracted tasks */}
          {extracted.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                Extracted — {selected.size} selected
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {extracted.map(task => (
                  <div
                    key={task.id}
                    onClick={() => toggleSelect(task.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                      selected.has(task.id)
                        ? 'border-indigo-500/40 bg-indigo-500/10'
                        : 'border-slate-700/50 hover:border-slate-600 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                      selected.has(task.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600'
                    }`}>
                      {selected.has(task.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200">{task.text}</p>
                      {task.priority && (
                        <span className={`inline-block mt-1.5 text-xs px-1.5 py-0.5 rounded-md font-medium ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium}`}>
                          {task.priority}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-800">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              onClick={tab === 'transcript' ? handleExtractFromTranscript : handleExtractFromVideo}
              disabled={!canExtract || processing}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 border border-slate-700 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150"
            >
              {processing && (
                <span className="inline-flex gap-0.5 mr-2">
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              )}
              {extractLabel}
            </button>
            {extracted.length > 0 && (
              <button
                onClick={handleAdd}
                disabled={selected.size === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 shadow-lg shadow-indigo-500/20"
              >
                Add {selected.size} Task{selected.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
