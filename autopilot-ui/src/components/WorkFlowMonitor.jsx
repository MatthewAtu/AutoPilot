import { useState, useEffect, useCallback } from 'react'

// ── helpers ─────────────────────────────────────────────────────────────────
function formatAge(hours) {
  if (!hours) return '—'
  if (hours < 24) return `${Math.round(hours)}h`
  return `${(hours / 24).toFixed(1)}d`
}
function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function formatDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// ── derived metrics from API data ────────────────────────────────────────────
function deriveMetrics(data) {
  const cats = data.categories ?? []
  const totalOpen    = cats.reduce((s, c) => s + c.total, 0)
  const totalOnTrack = cats.reduce((s, c) => s + c.onTrack, 0)
  const totalWarning = cats.reduce((s, c) => s + c.warning, 0)
  const totalOverdue = cats.reduce((s, c) => s + c.overdue, 0)
  const bottlenecks  = cats.find(c => c.category === 'Approvals')
    ? (cats.find(c => c.category === 'Approvals').overdue + cats.find(c => c.category === 'Approvals').warning)
    : totalOverdue

  const activeCats = cats.filter(c => c.total > 0)
  const avgDays = activeCats.length > 0
    ? (activeCats.reduce((s, c) => s + c.avgAgeHours, 0) / activeCats.length / 24).toFixed(1)
    : '—'

  const healthScore = totalOpen === 0
    ? 100
    : Math.max(0, Math.round(((totalOpen - totalOverdue * 2 - totalWarning * 0.5) / totalOpen) * 100))

  const highestRisk = [...cats].sort(
    (a, b) => (b.overdue + b.warning) - (a.overdue + a.warning)
  )[0]

  const criticalCats = cats.filter(c => c.overdue > 0).length
  const warningCats  = cats.filter(c => c.overdue === 0 && c.warning > 0).length
  const healthyCats  = cats.filter(c => c.overdue === 0 && c.warning === 0).length

  // Generate rule-based AI insight
  let insight
  if (totalOverdue > 0) {
    const worst = highestRisk
    insight = `${totalOverdue} item${totalOverdue !== 1 ? 's' : ''} are currently overdue across ` +
      `${criticalCats} workflow ${criticalCats === 1 ? 'category' : 'categories'}. ` +
      (worst && worst.overdue + worst.warning > 0
        ? `Most delays are concentrated in ${worst.category} with ${worst.overdue} overdue ` +
          `and ${worst.warning} in warning state. `
        : '') +
      (bottlenecks > 0 ? `${bottlenecks} approval${bottlenecks !== 1 ? 's' : ''} are stalled and may require escalation.` : '')
  } else if (totalWarning > 0) {
    insight = `No items are overdue, but ${totalWarning} item${totalWarning !== 1 ? 's' : ''} across ` +
      `${warningCats} ${warningCats === 1 ? 'category' : 'categories'} are approaching their response deadline ` +
      `and require attention to prevent escalation.`
  } else {
    insight = `All ${totalOpen || 0} tracked workflow items are on track. No overdue or at-risk items detected. ` +
      `The organization is operating within normal processing time thresholds.`
  }

  return { totalOpen, totalOnTrack, totalWarning, totalOverdue, bottlenecks, avgDays, healthScore, highestRisk, criticalCats, warningCats, healthyCats, insight }
}

function catStatus(cat) {
  if (cat.overdue > 0) return 'critical'
  if (cat.warning > 0) return 'warning'
  return 'healthy'
}
function catScore(cat) {
  if (cat.total === 0) return 100
  return Math.round((cat.onTrack / cat.total) * 100)
}

// ── visual constants ─────────────────────────────────────────────────────────
const STATUS_BADGE = {
  OnTrack:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Warning:  'bg-amber-50   text-amber-700   border border-amber-200',
  Overdue:  'bg-rose-50    text-rose-700    border border-rose-200',
}
const DEPT_STATUS = {
  healthy:  { dot: 'bg-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Healthy'  },
  warning:  { dot: 'bg-amber-400',   bar: 'bg-amber-500',   badge: 'bg-amber-50  text-amber-700  border-amber-200',  label: 'Attention' },
  critical: { dot: 'bg-rose-400',    bar: 'bg-rose-500',    badge: 'bg-rose-50   text-rose-700   border-rose-200',   label: 'Critical'  },
}

// ── sub-components ───────────────────────────────────────────────────────────
function ScoreGauge({ score }) {
  const r     = 40
  const circ  = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color  = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e'
  const label  = score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : 'Critical'
  const lColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
          <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900 leading-none">{score}</span>
          <span className="text-xs text-slate-400">/100</span>
        </div>
      </div>
      <span className={`text-xs font-bold uppercase tracking-wide ${lColor}`}>{label}</span>
    </div>
  )
}

function KpiCard({ label, value, sub, icon, accent }) {
  const accents = {
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-700',   icon: 'bg-slate-100 text-slate-500' },
    rose:    { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    icon: 'bg-rose-100 text-rose-500' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: 'bg-amber-100 text-amber-500' },
    violet:  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  icon: 'bg-violet-100 text-violet-500' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: 'bg-emerald-100 text-emerald-500' },
  }
  const a = accents[accent] ?? accents.slate
  return (
    <div className={`rounded-2xl border p-4 shadow-sm flex flex-col gap-3 ${a.bg} ${a.border}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest leading-tight">{label}</span>
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${a.icon}`}>{icon}</span>
      </div>
      <div>
        <span className={`text-3xl font-bold ${a.text}`}>{value}</span>
        {sub && <p className="text-xs text-slate-400 mt-1 font-medium">{sub}</p>}
      </div>
    </div>
  )
}

function DeptRow({ cat }) {
  const st    = catStatus(cat)
  const score = catScore(cat)
  const s     = DEPT_STATUS[st]
  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors rounded-xl">
      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{cat.category}</p>
        {cat.overdue > 0 && (
          <p className="text-xs text-rose-500 truncate mt-0.5">
            {cat.overdue} overdue · avg {formatAge(cat.avgAgeHours)} wait
          </p>
        )}
      </div>
      <div className="w-24 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 font-semibold">{score}</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${s.bar} transition-all duration-700`} style={{ width: `${score}%` }} />
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <div className="text-right">
          <p className="text-xs font-semibold text-rose-500">{cat.overdue}</p>
          <p className="text-xs text-slate-400">overdue</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-600">{cat.total}</p>
          <p className="text-xs text-slate-400">total</p>
        </div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border shrink-0 ${s.badge}`}>
        {s.label}
      </span>
    </div>
  )
}

function AlertRow({ item, onComplete, completing, onOpenDetail }) {
  const isCompleting = completing?.has(item.id)
  const isOverdue = item.status === 'Overdue'
  return (
    <div
      onClick={() => onOpenDetail?.(item)}
      className={`flex gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
      isOverdue ? 'border-rose-200 bg-rose-50 hover:bg-rose-100/60' : 'border-amber-200 bg-amber-50 hover:bg-amber-100/60'
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${isOverdue ? 'bg-rose-400' : 'bg-amber-400'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 leading-snug truncate">{item.subject}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${
            isOverdue ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200'
          }`}>{item.category}</span>
          <span className="text-xs text-slate-500">{formatAge(item.ageHours)} old</span>
          {item.deadline && <span className="text-xs text-rose-500">due {formatDate(item.deadline)}</span>}
        </div>
      </div>
      {onComplete && (
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(item.id) }}
          disabled={isCompleting}
          className="shrink-0 self-center text-xs px-2.5 py-1.5 rounded-lg font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-all"
        >
          {isCompleting ? '…' : 'Resolve'}
        </button>
      )}
    </div>
  )
}

function CategoryPanel({ cat, isOpen, onToggle, onComplete, completing, onOpenDetail }) {
  const hasIssues = cat.warning + cat.overdue > 0
  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm ${hasIssues ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${hasIssues ? 'hover:bg-amber-100/60' : 'hover:bg-slate-50'}`}
      >
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <h3 className="text-sm font-semibold text-slate-800 w-36 shrink-0">{cat.category}</h3>
        <span className="text-xs text-slate-500 w-20 shrink-0">{cat.total} email{cat.total !== 1 ? 's' : ''}</span>
        <div className="flex flex-wrap gap-1.5 flex-1">
          <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{cat.onTrack} on track</span>
          {cat.warning > 0 && <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-amber-50 text-amber-700 border border-amber-200">{cat.warning} warning</span>}
          {cat.overdue > 0 && <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-rose-50 text-rose-700 border border-rose-200">{cat.overdue} overdue</span>}
        </div>
        <p className="text-xs text-slate-500 shrink-0">avg <span className="text-slate-700 font-medium">{formatAge(cat.avgAgeHours)}</span></p>
      </button>
      {isOpen && (
        cat.emails.length === 0
          ? <p className="text-sm text-slate-400 px-4 pb-4">No emails in this category.</p>
          : <div className="border-t border-slate-200 divide-y divide-slate-100">
              {cat.emails.map(item => (
                <div
                  key={item.id}
                  onClick={() => onOpenDetail?.(item)}
                  className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium shrink-0 ${STATUS_BADGE[item.status] ?? STATUS_BADGE.OnTrack}`}>{item.status}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 truncate">{item.subject}</p>
                    <p className="text-xs text-slate-500 truncate">{item.from}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-600 font-medium">{formatAge(item.ageHours)} old</p>
                    {item.deadline && <p className="text-xs text-rose-500">due {formatDate(item.deadline)}</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onComplete(item.id) }}
                    disabled={completing?.has(item.id)}
                    className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 transition-all"
                  >
                    {completing?.has(item.id) ? '…' : 'Complete'}
                  </button>
                </div>
              ))}
            </div>
      )}
    </div>
  )
}

function EmailDetailModal({ item, loading, error, onClose }) {
  if (!item) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900 leading-snug">{item.subject}</p>
            <p className="text-sm text-slate-500 mt-1">{item.from}{item.category ? ` · ${item.category}` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 pt-3 flex-wrap">
          {item.status && (
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_BADGE[item.status] ?? STATUS_BADGE.OnTrack}`}>
              {item.status}
            </span>
          )}
          {item.deadline && <span className="text-xs text-rose-500">due {formatDate(item.deadline)}</span>}
          {item.resolvedAt && <span className="text-xs text-emerald-600">resolved {formatDateTime(item.resolvedAt)}</span>}
          {item.receivedDateTime && <span className="text-xs text-slate-400">received {formatDateTime(item.receivedDateTime)}</span>}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="text-sm text-slate-400">Loading email content…</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {!loading && !error && (
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {item.body || 'No content available.'}
            </p>
          )}
        </div>

        {item.webLink && (
          <div className="p-4 border-t border-slate-100">
            <a
              href={item.webLink} target="_blank" rel="noreferrer"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
            >
              Open in Outlook
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────
export default function WorkflowMonitor() {
  const [data, setData]             = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [expanded, setExpanded]     = useState(() => new Set())
  const [completing, setCompleting] = useState(() => new Set())

  const [pending, setPending]             = useState(null)
  const [pendingLoading, setPendingLoading] = useState(true)
  const [categorizing, setCategorizing]   = useState(false)
  const [catResult, setCatResult]         = useState(null)

  const [detailItem, setDetailItem]       = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/health-monitor')
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError('Could not reach the workflow monitor. Check that the backend is running.')
    } finally { setLoading(false) }
  }, [])

  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const res = await fetch('/api/workflow/pending')
      if (!res.ok) throw new Error()
      setPending(await res.json())
    } catch { setPending([]) }
    finally { setPendingLoading(false) }
  }, [])

  async function runCategorization() {
    setCategorizing(true); setCatResult(null)
    try {
      const res  = await fetch('/api/workflow/categorize', { method: 'POST' })
      const json = await res.json()
      setCatResult(json)
      await Promise.all([loadPending(), load()])
    } finally { setCategorizing(false) }
  }

  useEffect(() => { load(); loadPending() }, [load, loadPending])

  function toggleCategory(cat) {
    setExpanded(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }

  async function markComplete(emailId) {
    setCompleting(prev => new Set(prev).add(emailId))
    try {
      const res = await fetch('/api/health-monitor/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId }),
      })
      if (res.ok) setData(await res.json())
    } finally {
      setCompleting(prev => { const n = new Set(prev); n.delete(emailId); return n })
    }
  }

  async function openEmailDetail(item) {
    setDetailItem(item)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/health-monitor/email/${item.id}`)
      if (!res.ok) throw new Error()
      const detail = await res.json()
      setDetailItem(prev => (prev?.id === item.id ? { ...prev, ...detail } : prev))
    } catch {
      setDetailError('Could not load email content.')
    } finally {
      setDetailLoading(false)
    }
  }

  function closeEmailDetail() {
    setDetailItem(null)
    setDetailError(null)
  }

  const metrics = data ? deriveMetrics(data) : null

  return (
    <div className="flex-1 flex flex-col bg-white">

      {/* Sub-header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">OPS Workflow Health Monitor</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data
              ? <>Live · Updated {new Date(data.generatedAt).toLocaleTimeString()}</>
              : 'A real-time view of organizational workflow health'}
          </p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all shadow-sm"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5 max-w-7xl w-full mx-auto">

        {/* Loading */}
        {loading && !data && (
          <div className="flex items-center justify-center pt-20">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-8 h-8 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <p className="text-sm text-slate-500">Analyzing your email workflows…</p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 max-w-lg">
            {error}
          </p>
        )}

        {data && metrics && (
          <>
            {/* ── Row 1: Health Score + KPI cards ── */}
            <div className="flex gap-4">
              {/* Score card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-5 shrink-0">
                <ScoreGauge score={metrics.healthScore} />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Overall Health</p>
                  <p className="text-lg font-bold text-slate-900 leading-tight">OPS Workflows</p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-xs text-slate-500">{metrics.criticalCats} Critical</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="text-xs text-slate-500">{metrics.warningCats} Attention</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-slate-500">{metrics.healthyCats} Healthy</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    <span className="text-xs text-slate-400">Live · From email inbox</span>
                  </div>
                </div>
              </div>

              {/* KPI grid */}
              <div className="flex-1 grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard
                  label="Open Requests" value={metrics.totalOpen}
                  sub="Active tracked items"
                  accent="slate"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                />
                <KpiCard
                  label="Overdue Requests" value={metrics.totalOverdue}
                  sub={metrics.totalOverdue > 0 ? 'Require immediate action' : 'All within deadline'}
                  accent={metrics.totalOverdue > 0 ? 'rose' : 'emerald'}
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <KpiCard
                  label="Approval Bottlenecks" value={metrics.bottlenecks}
                  sub={metrics.bottlenecks > 0 ? 'Stalled approvals' : 'No stalled approvals'}
                  accent={metrics.bottlenecks > 0 ? 'amber' : 'emerald'}
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                />
                <KpiCard
                  label="Avg Completion Time"
                  value={metrics.avgDays === '—' ? '—' : `${metrics.avgDays}d`}
                  sub={metrics.highestRisk?.overdue > 0 ? `Highest risk: ${metrics.highestRisk.category}` : 'All categories on track'}
                  accent="violet"
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
              </div>
            </div>

            {/* ── Row 2: Department table + right sidebar ── */}
            <div className="flex gap-4 items-start">

              {/* Department Status table */}
              <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Workflow Category Status</h2>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Score</span>
                    <span className="hidden sm:block">Overdue / Total</span>
                    <span>Status</span>
                  </div>
                </div>
                <div className="p-2 space-y-0.5">
                  {data.categories.map(cat => <DeptRow key={cat.category} cat={cat} />)}
                </div>
              </div>

              {/* Right sidebar */}
              <div className="w-72 xl:w-80 flex flex-col gap-3 shrink-0">

                {/* AI Insight */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center shadow-sm">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" />
                      </svg>
                    </div>
                    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">AI Insight</h2>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{metrics.insight}</p>
                  {metrics.totalOverdue > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Auto Escalation</p>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                        <p className="text-xs text-slate-600">Reminder sent to item owner</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <p className="text-xs text-slate-600">Manager notification pending</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                        <p className="text-xs text-slate-500">ADM escalation after threshold</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Alerts — overdue + warning items */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Needs Attention</h2>
                    </div>
                    {data.overdueItems.length > 0 && (
                      <span className="text-xs bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-medium">
                        {data.overdueItems.filter(e => e.status === 'Overdue').length} overdue
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                    {data.overdueItems.length === 0 ? (
                      <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        Everything is on track
                      </div>
                    ) : (
                      data.overdueItems.map(item => (
                        <AlertRow key={item.id} item={item} onComplete={markComplete} completing={completing} onOpenDetail={openEmailDetail} />
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Row 3: Detailed workflow categories ── */}
            <section>
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Workflow Detail — click a category to see individual items
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
                    onOpenDetail={openEmailDetail}
                  />
                ))}
              </div>
            </section>

            {/* ── Row 4: Recently Completed ── */}
            {data.recentlyCompleted.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Recently Resolved — {data.recentlyCompleted.length}
                </h2>
                <div className="rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-sm">
                  {data.recentlyCompleted.map(item => (
                    <div
                      key={item.id}
                      onClick={() => openEmailDetail(item)}
                      className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 10 8">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 truncate">{item.subject}</p>
                        <p className="text-xs text-slate-400 truncate">{item.from} · {item.category}</p>
                      </div>
                      <p className="text-xs text-slate-400 shrink-0">{formatDateTime(item.resolvedAt)}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── AI Categorization inbox ── (always shown) */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">AI Categorization Inbox</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Drag emails into <span className="font-medium text-slate-700">To Categorize</span> in Outlook — the AI will sort them into the correct workflow category.
                </p>
              </div>
            </div>
            <button
              onClick={runCategorization}
              disabled={categorizing || pendingLoading || pending?.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
            >
              {categorizing ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Sorting…</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Run AI Sort</>
              )}
            </button>
          </div>

          {catResult && (
            <div className={`px-5 py-3 border-b text-sm font-medium flex flex-wrap items-center gap-2 ${catResult.processed > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
              {catResult.processed > 0 ? (
                <>{catResult.processed} email{catResult.processed !== 1 ? 's' : ''} sorted:&nbsp;
                  {catResult.results.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span className="text-xs bg-slate-900 text-white px-2 py-0.5 rounded-full">{r.assignedCategory}</span>
                    </span>
                  ))}
                </>
              ) : 'No emails were moved — check the AI model is running.'}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {pendingLoading && <div className="px-5 py-4 text-sm text-slate-400">Loading…</div>}
            {!pendingLoading && pending?.length === 0 && (
              <div className="px-5 py-5 flex items-center gap-3 text-sm text-slate-500">
                <svg className="w-5 h-5 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                No emails waiting. Move emails into <span className="font-medium text-slate-700 mx-1">To Categorize</span> in Outlook, then click Run AI Sort.
              </div>
            )}
            {!pendingLoading && pending?.map(email => (
              <div key={email.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0 mt-0.5">
                  {(email.from ?? '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{email.subject}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{email.from} · {email.preview}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0 mt-0.5">{email.receivedTime}</span>
              </div>
            ))}
          </div>
        </section>

      </div>

      <EmailDetailModal
        item={detailItem}
        loading={detailLoading}
        error={detailError}
        onClose={closeEmailDetail}
      />
    </div>
  )
}
