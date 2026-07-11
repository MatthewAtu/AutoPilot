import { useState, useEffect, useCallback } from 'react'

const STATUS_STYLES = {
  OnTrack: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  Warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  Overdue: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
}

function formatAge(hours) {
  if (hours < 24) return `${Math.round(hours)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export default function WorkflowMonitor({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(() => new Set())
  const [completing, setCompleting] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health-monitor')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setData(json)
    } catch {
      setError('Could not reach the workflow monitor. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function toggleCategory(category) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(category) ? next.delete(category) : next.add(category)
      return next
    })
  }

  async function markComplete(emailId) {
    setCompleting(prev => new Set(prev).add(emailId))
    try {
      const res = await fetch('/api/health-monitor/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId }),
      })
      if (res.ok) setData(await res.json())
    } finally {
      setCompleting(prev => {
        const next = new Set(prev)
        next.delete(emailId)
        return next
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-14 shrink-0 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="4" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 11h3l1.5-3 2.5 7 2-10 1.5 6H19" />
            </svg>
          </div>
          <span className="font-bold text-base tracking-tight text-white">Workflow Health Monitor</span>
          {data && (
            <span className="text-slate-500 text-xs hidden sm:block">
              updated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 transition-all duration-150"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-lg hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {loading && !data && (
          <p className="text-sm text-slate-500 text-center pt-10">Loading health monitor…</p>
        )}

        {error && (
          <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 max-w-lg mx-auto">
            {error}
          </p>
        )}

        {data && (
          <>
            {/* Category list — click a category to see its emails */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Categories — click a request's Complete button, or move it to "Resolved" in Outlook, once it's done
              </h2>
              <div className="space-y-2">
                {data.categories.map(cat => (
                  <CategoryPanel
                    key={cat.category}
                    cat={cat}
                    isOpen={expanded.has(cat.category)}
                    onToggle={() => toggleCategory(cat.category)}
                    onComplete={markComplete}
                    completing={completing}
                  />
                ))}
              </div>
            </section>

            {/* Overdue / warning section */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Needs Attention — {data.overdueItems.length}
              </h2>
              {data.overdueItems.length === 0 ? (
                <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                  Nothing overdue right now — every category is on track.
                </p>
              ) : (
                <div className="rounded-2xl border border-slate-800/80 overflow-hidden divide-y divide-slate-800/60">
                  {data.overdueItems.map(item => (
                    <EmailRow key={item.id} item={item} onComplete={markComplete} completing={completing} />
                  ))}
                </div>
              )}
            </section>

            {/* Recently completed section */}
            <section>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                Recently Completed — {data.recentlyCompleted.length}
              </h2>
              {data.recentlyCompleted.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing marked complete yet.</p>
              ) : (
                <div className="rounded-2xl border border-slate-800/80 overflow-hidden divide-y divide-slate-800/60">
                  {data.recentlyCompleted.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 bg-slate-900">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{item.subject}</p>
                        <p className="text-xs text-slate-500 truncate">{item.from} · {item.category}</p>
                      </div>
                      <p className="text-xs text-slate-500 shrink-0">{formatDateTime(item.resolvedAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function CategoryPanel({ cat, isOpen, onToggle, onComplete, completing }) {
  const hasIssues = cat.warning + cat.overdue > 0
  return (
    <div className={`rounded-2xl border overflow-hidden ${
      hasIssues ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800/80 bg-slate-900'
    }`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <svg className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <h3 className="text-sm font-semibold text-slate-100 w-36 shrink-0">{cat.category}</h3>
        <span className="text-xs text-slate-500 w-20 shrink-0">{cat.total} email{cat.total !== 1 ? 's' : ''}</span>

        <div className="flex flex-wrap gap-1.5 flex-1">
          <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
            {cat.onTrack} on track
          </span>
          {cat.warning > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25">
              {cat.warning} warning
            </span>
          )}
          {cat.overdue > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-rose-500/15 text-rose-300 border border-rose-500/25">
              {cat.overdue} overdue
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 shrink-0">
          avg <span className="text-slate-300 font-medium">{cat.total > 0 ? formatAge(cat.avgAgeHours) : '—'}</span> in category
        </p>
      </button>

      {isOpen && (
        cat.emails.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 pb-4">No emails in this category right now.</p>
        ) : (
          <div className="border-t border-slate-800/60 divide-y divide-slate-800/60">
            {cat.emails.map(item => (
              <EmailRow key={item.id} item={item} hideCategory onComplete={onComplete} completing={completing} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function EmailRow({ item, hideCategory, onComplete, completing }) {
  const isCompleting = completing?.has(item.id)
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-slate-900">
      <span className={`text-xs px-2 py-0.5 rounded-md font-medium shrink-0 ${STATUS_STYLES[item.status]}`}>
        {item.status}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{item.subject}</p>
        <p className="text-xs text-slate-500 truncate">{item.from}{!hideCategory && ` · ${item.category}`}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-slate-300 font-medium">{formatAge(item.ageHours)} old</p>
        {item.deadline && (
          <p className="text-xs text-rose-400">due {formatDate(item.deadline)}</p>
        )}
      </div>
      {onComplete && (
        <button
          onClick={() => onComplete(item.id)}
          disabled={isCompleting}
          className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-medium text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {isCompleting ? 'Moving…' : 'Complete'}
        </button>
      )}
    </div>
  )
}
