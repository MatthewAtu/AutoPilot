import { useState, useEffect, useRef } from 'react'

const AVATAR_COLORS = [
  'from-slate-700 to-slate-900',
  'from-zinc-700 to-zinc-900',
  'from-stone-700 to-stone-900',
  'from-slate-600 to-slate-800',
  'from-zinc-600 to-zinc-800',
  'from-slate-500 to-slate-700',
]

export default function OutlookPanel() {
  const [emails, setEmails]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [folders, setFolders] = useState([])
  const [openMenu, setOpenMenu]   = useState(null)   // email id whose menu is open
  const [moving, setMoving]       = useState({})     // { [emailId]: true }
  const [moved, setMoved]         = useState({})     // { [emailId]: folderName }
  const [toast, setToast]         = useState(null)   // { message, ok }

  useEffect(() => {
    fetch('/api/emails/list')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setEmails(data))
      .catch(() => setError('Failed to load emails'))
      .finally(() => setLoading(false))

    fetch('/api/folders')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setFolders(data))
      .catch(() => {})
  }, [])

  // Close menu on outside click
  const panelRef = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target))
        setOpenMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function showToast(message, ok = true) {
    setToast({ message, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function openEmail(email) {
    window.open(email.webLink, '_blank', 'width=800,height=600')

    if (!email.unread) return
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, unread: false } : e))
    fetch('/api/emails/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailId: email.id }),
    }).catch(() => {})
  }

  async function moveEmail(emailId, folderName) {
    setOpenMenu(null)
    setMoving(prev => ({ ...prev, [emailId]: true }))
    try {
      const res = await fetch('/api/emails/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, folderName }),
      })
      if (res.ok) {
        setMoved(prev => ({ ...prev, [emailId]: folderName }))
        setTimeout(() => {
          setEmails(prev => prev.filter(e => e.id !== emailId))
          setMoved(prev => { const n = { ...prev }; delete n[emailId]; return n })
        }, 600)
        showToast(`Moved to "${folderName}"`)
      } else {
        showToast('Could not move email — try again', false)
      }
    } catch {
      showToast('Network error', false)
    } finally {
      setMoving(prev => { const n = { ...prev }; delete n[emailId]; return n })
    }
  }

  const unreadCount = emails.filter(e => e.unread).length

  return (
    <div className="flex flex-col h-full" ref={panelRef}>
      <PanelHeader
        icon={
          <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
        title="Inbox"
      >
        {!loading && !error && unreadCount > 0 && (
          <span className="text-xs bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-full font-medium">
            {unreadCount} unread
          </span>
        )}
      </PanelHeader>

      {loading && <PanelStatus text="Loading emails…" />}
      {error   && <PanelStatus text={error} isError />}

      {!loading && !error && (
        <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-slate-100">
          {emails.length === 0 && <PanelStatus text="No emails found." />}

          {emails.map((email, i) => {
            const isMoving  = !!moving[email.id]
            const movedTo   = moved[email.id]
            const menuOpen  = openMenu === email.id

            return (
              <div
                key={email.id}
                className={`relative flex gap-3 p-4 bg-white transition-all duration-500 group ${
                  movedTo ? 'opacity-0 scale-95' : 'opacity-100'
                } ${email.unread ? 'ring-inset ring-1 ring-slate-200' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm`}
                >
                  {(email.from ?? '?')[0].toUpperCase()}
                </div>

                {/* Body — click opens Outlook */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => openEmail(email)}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className={`text-sm truncate ${email.unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                      {email.from}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">{email.receivedTime}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${email.unread ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                    {email.subject}
                  </p>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{email.preview}</p>
                </div>

                {/* Move button */}
                <div className="relative shrink-0 flex items-start pt-0.5">
                  {isMoving ? (
                    <svg className="w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenu(menuOpen ? null : email.id) }}
                      title="Move to folder"
                      className="p-1 rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all duration-150"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>
                    </button>
                  )}

                  {/* Folder dropdown */}
                  {menuOpen && (
                    <div className="absolute right-0 top-7 z-30 w-52 bg-white border border-slate-200 rounded-xl shadow-lg py-1 overflow-hidden">
                      <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                        Move to folder
                      </p>
                      <div className="max-h-56 overflow-y-auto">
                        {folders.length === 0 && (
                          <p className="px-3 py-2 text-xs text-slate-400">No folders found</p>
                        )}
                        {folders.map(f => (
                          <button
                            key={f.id}
                            onClick={() => moveEmail(email.id, f.name)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                            </svg>
                            <span className="truncate">{f.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {email.unread && !menuOpen && (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0 mt-2 absolute right-4 top-4 group-hover:hidden" />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-sm font-medium shadow-lg border transition-all duration-300 z-40 whitespace-nowrap ${
          toast.ok
            ? 'bg-white border-slate-200 text-slate-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          {toast.ok && (
            <span className="inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {toast.message}
            </span>
          )}
          {!toast.ok && toast.message}
        </div>
      )}
    </div>
  )
}

export function PanelHeader({ icon, title, children }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-slate-700">{icon}</span>
        <h2 className="text-xs font-semibold text-slate-700 uppercase tracking-widest">{title}</h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function PanelStatus({ text, isError }) {
  return (
    <div className={`flex-1 flex items-center justify-center text-sm ${isError ? 'text-rose-500' : 'text-slate-400'}`}>
      {text}
    </div>
  )
}
