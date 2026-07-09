import { useState, useEffect } from 'react'

const AVATAR_COLORS = [
  'from-slate-700 to-slate-900',
  'from-zinc-700 to-zinc-900',
  'from-stone-700 to-stone-900',
  'from-slate-600 to-slate-800',
  'from-zinc-600 to-zinc-800',
  'from-slate-500 to-slate-700',
]

export default function OutlookPanel() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/emails/list')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setEmails(data))
      .catch(() => setError('Failed to load emails'))
      .finally(() => setLoading(false))
  }, [])

  const unreadCount = emails.filter(e => e.unread).length

  function openOutlook(weblink) {
    window.open(weblink, '_blank', 'width=800,height=600')
  }

  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon={
        <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      } title="Inbox">
        {!loading && !error && unreadCount > 0 && (
          <span className="text-xs bg-slate-100 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-full font-medium">
            {unreadCount} unread
          </span>
        )}
      </PanelHeader>

      {loading && <PanelStatus text="Loading emails…" />}
      {error && <PanelStatus text={error} isError />}

      {!loading && !error && (
        <div className="overflow-y-auto flex-1 divide-y divide-slate-800/60">
          {emails.length === 0 && <PanelStatus text="No emails found." />}
          {emails.map((email, i) => (
            <div
              key={email.id}
              onClick={() => openOutlook(email.webLink)}
              className={`flex gap-3 p-4 cursor-pointer rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all duration-150 group ${
                email.unread ? 'ring-1 ring-slate-200' : ''
              }`}
            >
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-sm`}>
                {(email.from ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <span className={`text-sm truncate ${email.unread ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    {email.from}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0 transition-colors">{email.receivedTime}</span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${email.unread ? 'font-medium text-slate-900' : 'text-slate-600'}`}>
                  {email.subject}
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{email.preview}</p>
              </div>
              {email.unread && (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0 mt-2 shadow-sm shadow-slate-700/50" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function PanelHeader({ icon, title, children }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-slate-700">{icon}</span>
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-widest">{title}</h2>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function PanelStatus({ text, isError }) {
  return (
    <div className={`flex-1 flex items-center justify-center text-sm ${isError ? 'text-rose-400' : 'text-slate-500'}`}>
      {text}
    </div>
  )
}
