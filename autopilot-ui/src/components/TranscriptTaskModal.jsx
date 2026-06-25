import { useState } from 'react'

export default function TranscriptTaskModal({ onClose, onTasksAdded }) {
  const [transcript, setTranscript] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)

  async function handleExtract() {
    const text = transcript.trim()
    if (!text) return
    setExtracting(true)
    setError(null)
    setExtracted([])
    setSelected(new Set())

    try {
      const res = await fetch('/api/tasks/from-transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      const tasks = (data.tasks ?? []).map((t, i) => ({ id: i, ...t }))
      setExtracted(tasks)
      setSelected(new Set(tasks.map(t => t.id)))
    } catch {
      setError('Could not extract tasks. Paste your transcript and try again.')
    } finally {
      setExtracting(false)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleAdd() {
    const toAdd = extracted.filter(t => selected.has(t.id))
    onTasksAdded(toAdd)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <h2 className="text-base font-semibold text-gray-800">Create Tasks from Video Transcript</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Transcript input */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
              Paste video transcript
            </label>
            <textarea
              rows={6}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Paste transcript text here…"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
          )}

          {/* Extracted tasks */}
          {extracted.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Extracted tasks — {selected.size} selected
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {extracted.map(task => (
                  <div
                    key={task.id}
                    onClick={() => toggleSelect(task.id)}
                    className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                      selected.has(task.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                    }`}>
                      {selected.has(task.id) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{task.text}</p>
                      {task.priority && (
                        <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                          task.priority === 'high' ? 'bg-red-100 text-red-700'
                          : task.priority === 'low' ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>
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
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleExtract}
              disabled={!transcript.trim() || extracting}
              className="bg-indigo-100 hover:bg-indigo-200 disabled:opacity-40 text-indigo-700 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            >
              {extracting ? 'Extracting…' : 'Extract Tasks'}
            </button>
            {extracted.length > 0 && (
              <button
                onClick={handleAdd}
                disabled={selected.size === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
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
