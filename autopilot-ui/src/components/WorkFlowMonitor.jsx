import { useState, useEffect, useRef } from 'react'

export default function WorkflowMonitor({ onClose }) {
  const [allFolders,  setAllFolders]  = useState([])
  const [categories,  setCategories]  = useState([])
  const [newCat,      setNewCat]      = useState('')
  const [status,      setStatus]      = useState('idle')
  const [results,     setResults]     = useState([])
  const [error,       setError]       = useState(null)
  const [loadingFolders, setLoadingFolders] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    fetch('/api/folders')
      .then(r => r.ok ? r.json() : [])
      .then(folders => {
        setAllFolders(folders)
        // default to all folders as categories
        setCategories(folders.slice(0, 5))
      })
      .catch(() => setAllFolders([]))
      .finally(() => setLoadingFolders(false))
  }, [])

  function toggleFolder(folder) {
    setCategories(prev =>
      prev.includes(folder) ? prev.filter(c => c !== folder) : [...prev, folder]
    )
  }

  function addCustom() {
    const v = newCat.trim()
    if (!v || categories.includes(v)) { setNewCat(''); return }
    setCategories(p => [...p, v])
    setNewCat('')
    inputRef.current?.focus()
  }

  async function run() {
    if (!categories.length) return
    setStatus('running'); setResults([]); setError(null)
    try {
      const res = await fetch('/api/Workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setResults(await res.json())
      setStatus('done')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  return (
    <Overlay>
      <div
        className="modal-in w-full mx-4 flex flex-col overflow-hidden"
        style={{
          maxWidth: 480,
          maxHeight: '88vh',
          background: '#fff',
          border: '1px solid #d9d9d9',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #d9d9d9', background: '#1a1a1a' }}>
          <div>
            <h2 className="text-[14px] font-semibold text-white">Email Categorization</h2>
            <p className="text-[11px] mt-0.5" style={{ color: '#aaa' }}>Move completed emails into mailbox folders</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center transition-colors"
            style={{ color: '#aaa', borderRadius: '2px' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#333'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Folder picker */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#888' }}>
              Select Destination Folders
            </p>
            {loadingFolders ? (
              <div className="space-y-1.5">
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}
              </div>
            ) : allFolders.length === 0 ? (
              <p className="text-[12px]" style={{ color: '#888' }}>Could not load folders. Check your Graph token.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                {allFolders.map(folder => {
                  const selected = categories.includes(folder)
                  return (
                    <button
                      key={folder}
                      onClick={() => toggleFolder(folder)}
                      className="text-[12px] font-medium px-2.5 py-1 transition-all"
                      style={{
                        borderRadius: '2px',
                        border: `1px solid ${selected ? '#1a1a1a' : '#d9d9d9'}`,
                        background: selected ? '#1a1a1a' : '#f7f7f7',
                        color: selected ? '#fff' : '#444',
                      }}
                    >
                      {folder}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Custom category input */}
            <div className="flex gap-2 mt-3">
              <input
                ref={inputRef}
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="Add custom folder name…"
                className="flex-1 text-[13px] px-3 py-2 focus:outline-none"
                style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#1a1a1a', background: '#fafafa' }}
              />
              <button
                onClick={addCustom}
                disabled={!newCat.trim()}
                className="px-3 py-2 text-[13px] font-medium transition-colors"
                style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#444', background: '#f7f7f7' }}
              >
                Add
              </button>
            </div>

            {categories.length > 0 && (
              <p className="text-[11px] mt-2" style={{ color: '#888' }}>
                {categories.length} folder{categories.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          {/* Running */}
          {status === 'running' && (
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#f7f7f7', border: '1px solid #d9d9d9', borderRadius: '2px' }}>
              <span className="flex gap-1">
                <span className="dot-1 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#1a1a1a' }} />
                <span className="dot-2 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#1a1a1a' }} />
                <span className="dot-3 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#1a1a1a' }} />
              </span>
              <p className="text-[13px]" style={{ color: '#1a1a1a' }}>Categorizing emails in Completed folder…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="px-4 py-3 text-[13px]" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', borderRadius: '2px', color: '#c62828' }}>
              {error}
            </div>
          )}

          {status === 'done' && (
            results.length === 0 ? (
              <div className="px-5 py-6 text-center" style={{ background: '#f7f7f7', border: '1px solid #d9d9d9', borderRadius: '2px' }}>
                <p className="text-[13px] font-semibold" style={{ color: '#444' }}>No emails in Completed folder</p>
                <p className="text-[12px] mt-1" style={{ color: '#888' }}>Move emails into a <strong>Completed</strong> folder in Outlook and run again.</p>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#888' }}>
                  {results.length} email{results.length !== 1 ? 's' : ''} processed
                </p>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-3 py-2" style={{ border: '1px solid #e8e8e8', borderRadius: '2px' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.moved ? '#2e7d32' : '#d32f2f' }} />
                        <p className="text-[11px] font-mono truncate" style={{ color: '#888' }}>{r.emailId.slice(0, 28)}…</p>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 shrink-0" style={{ background: '#f0f0f0', color: '#444', borderRadius: '2px' }}>
                        {r.category}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#666' }}><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#2e7d32' }} />Moved</span>
                  <span className="flex items-center gap-1.5 text-[11px]" style={{ color: '#666' }}><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#d32f2f' }} />Failed</span>
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderTop: '1px solid #d9d9d9' }}>
          <button onClick={onClose} className="text-[13px]" style={{ color: '#666' }}>Cancel</button>
          <button
            onClick={run}
            disabled={status === 'running' || categories.length === 0}
            className="text-[13px] font-semibold px-5 py-2 transition-colors"
            style={{
              background: '#1a1a1a',
              color: '#fff',
              borderRadius: '2px',
              opacity: (status === 'running' || categories.length === 0) ? 0.4 : 1,
              cursor: (status === 'running' || categories.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            {status === 'running' ? 'Running…' : status === 'done' ? 'Run Again' : 'Run Categorization'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export function Overlay({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
      {children}
    </div>
  )
}
