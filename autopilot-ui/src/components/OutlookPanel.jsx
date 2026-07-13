import { useState, useEffect } from 'react'

const AVATAR_PALETTE = [
  'bg-indigo-100 text-indigo-700',
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-amber-100 text-amber-700',
]

export default function OutlookPanel() {
  const [emails,  setEmails]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetch('/api/emails/list')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setEmails)
      .catch(() => setError('Could not load emails.'))
      .finally(() => setLoading(false))
  }, [])

  const unread = emails.filter(e => e.unread).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-5 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-slate-700">Inbox</span>
        </div>
        {!loading && !error && unread > 0 && (
          <span className="text-[11px] font-semibold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
            {unread} new
          </span>
        )}
      </div>

      {/* Body */}
      {loading && <SkeletonList />}
      {error   && <Empty>{error}</Empty>}
      {!loading && !error && (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {emails.length === 0 && <Empty>Your inbox is empty.</Empty>}
          {emails.map((email, i) => (
            <button
              key={email.id}
              onClick={() => email.webLink && window.open(email.webLink, '_blank')}
              className={`anim-item w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors group ${
                email.unread ? 'bg-indigo-50/40' : ''
              }`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${AVATAR_PALETTE[i % AVATAR_PALETTE.length]}`}>
                {(email.from ?? '?')[0].toUpperCase()}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[13px] truncate ${email.unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                    {email.from}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">{email.receivedTime}</span>
                </div>
                <p className={`text-[12px] truncate mt-0.5 ${email.unread ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                  {email.subject}
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{email.preview}</p>
              </div>

              {email.unread && <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Shared primitives ──────────────────────────── */
export function PanelHeader({ icon, title, badge, action }) {
  return (
    <div className="h-12 flex items-center justify-between px-5 border-b border-slate-100 shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500">
          {icon}
        </div>
        <span className="text-[13px] font-semibold text-slate-700">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
  )
}

export function Empty({ children }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400 px-6 text-center">
      <p className="text-[13px]">{children}</p>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="flex-1 overflow-hidden divide-y divide-slate-50 p-0">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3.5">
          <div className="skeleton w-8 h-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="skeleton h-3 w-2/5 rounded" />
            <div className="skeleton h-2.5 w-3/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}
