import { useState } from 'react'

const ACTION_META = {
  reply_needed:   { label: 'Reply drafted',  color: 'bg-blue-50 text-blue-700 border-blue-200',     dot: 'bg-blue-500'    },
  forward_needed: { label: 'Forwarded',      color: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500'  },
  task_needed:    { label: 'Task added',     color: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-500'   },
  info_only:      { label: 'No action',      color: 'bg-slate-100 text-slate-500 border-slate-200',  dot: 'bg-slate-400'   },
  sent:           { label: 'Sent',           color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  rejected:       { label: 'Rejected',       color: 'bg-red-50 text-red-600 border-red-200',         dot: 'bg-red-400'     },
}

function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100)
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-slate-500 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

function ReviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      Review needed
    </span>
  )
}

function EmailRow({ item, selected, onClick }) {
  const meta = ACTION_META[item.action] ?? ACTION_META.info_only
  const isActive = selected?.id === item.id

  return (
    <div
      onClick={() => onClick(item)}
      className={`anim-item flex items-start gap-3 px-4 py-3.5 cursor-pointer border-b border-slate-100 transition-all duration-100 ${
        isActive ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
      }`}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-[12px] font-bold text-indigo-600 shrink-0 mt-0.5">
        {(item.from ?? 'U')[0].toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-[13px] font-semibold text-slate-800 truncate">{item.from}</p>
          <span className="text-[11px] text-slate-400 shrink-0">{item.receivedTime}</span>
        </div>
        <p className="text-[13px] text-slate-600 truncate font-medium">{item.subject}</p>
        <p className="text-[12px] text-slate-400 truncate mt-0.5">{item.preview}</p>

        <div className="flex items-center gap-2 mt-2">
          {item.needsReview ? (
            <ReviewBadge />
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          )}
          {!item.needsReview && <ConfidenceBar value={item.confidence ?? 0} />}
        </div>
      </div>
    </div>
  )
}

function DetailPane({ item, onClose }) {
  if (!item) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-slate-500">Select an email</p>
        <p className="text-[12px] text-slate-400 mt-1">Click any email to see AI analysis</p>
      </div>
    )
  }

  const meta = ACTION_META[item.action] ?? ACTION_META.info_only
  const pct = Math.round((item.confidence ?? 0) * 100)
  const barColor = pct >= 75 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 space-y-5">
        {/* Email header */}
        <div>
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-[16px] font-semibold text-slate-800 leading-snug">{item.subject}</h2>
            <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="text-[13px] text-slate-500">
            From <span className="font-medium text-slate-700">{item.from}</span>
            {item.fromAddress && <span className="text-slate-400"> &lt;{item.fromAddress}&gt;</span>}
          </p>
          <p className="text-[12px] text-slate-400 mt-0.5">{item.receivedTime}</p>
        </div>

        <div className="h-px bg-slate-100" />

        {/* AI Analysis */}
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">AI Analysis</p>

          <div className="space-y-3">
            {/* Action */}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-slate-500">Action</span>
              {item.needsReview ? <ReviewBadge /> : (
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${meta.color}`}>
                  {meta.label}
                </span>
              )}
            </div>

            {/* Confidence */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-slate-500">Confidence</span>
                <span className={`text-[12px] font-bold ${pct >= 75 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>{pct}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>

            {/* Reasoning */}
            {item.reasoning && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold text-slate-400 mb-1">Reasoning</p>
                <p className="text-[13px] text-slate-600 leading-relaxed">{item.reasoning}</p>
              </div>
            )}

            {/* Task */}
            {item.taskText && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold text-amber-500 mb-1">Task Extracted</p>
                <p className="text-[13px] text-amber-800 leading-relaxed">{item.taskText}</p>
              </div>
            )}

            {/* Draft */}
            {item.draftBody && (
              <div>
                <p className="text-[11px] font-semibold text-slate-400 mb-2">Draft saved to Outlook Drafts</p>
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <p className="text-[11px] font-semibold text-blue-500 mb-1">To: {item.draftTo}</p>
                  <p className="text-[11px] font-medium text-blue-600 mb-2">{item.draftSubject}</p>
                  <p className="text-[13px] text-blue-900 leading-relaxed whitespace-pre-wrap">{item.draftBody}</p>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">Go to <span className="font-medium text-indigo-600">Approvals</span> to send or reject this draft.</p>
              </div>
            )}

            {item.action === 'sent' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-[13px] text-emerald-700 font-medium">
                Draft was sent successfully.
              </div>
            )}

            {item.action === 'rejected' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-500">
                Draft was rejected and deleted.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TriagePage({ triageData, onTriageComplete }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  async function runTriage() {
    setRunning(true)
    setError(null)
    setSelected(null)
    try {
      const res = await fetch('/api/triage/run', { method: 'POST' })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()
      onTriageComplete(data)
    } catch (e) {
      setError(e.message ?? 'Triage failed. Is the backend running?')
    } finally {
      setRunning(false)
    }
  }

  const emails = triageData?.results ?? []
  const hasData = emails.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-slate-800">Smart Triage</h1>
          {hasData && (
            <p className="text-[11px] text-slate-400">{emails.length} emails analyzed</p>
          )}
        </div>
        <button
          onClick={runTriage}
          disabled={running}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm shadow-indigo-200"
        >
          {running ? (
            <>
              <span className="flex gap-0.5">
                <span className="dot-1 w-1 h-1 rounded-full bg-white/70 inline-block" />
                <span className="dot-2 w-1 h-1 rounded-full bg-white/70 inline-block" />
                <span className="dot-3 w-1 h-1 rounded-full bg-white/70 inline-block" />
              </span>
              Analyzing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run Triage
            </>
          )}
        </button>
      </div>

      {/* Stats bar */}
      {hasData && (
        <div className="bg-white border-b border-slate-100 px-6 py-3 flex items-center gap-6 shrink-0">
          <StatPill label="Analyzed" value={triageData.totalAnalyzed} color="text-slate-700" />
          <StatPill label="Drafts pending" value={triageData.draftsPending} color="text-blue-600" />
          <StatPill label="Tasks created" value={triageData.tasksCreated} color="text-amber-600" />
          <StatPill label="Need review" value={triageData.needReview} color="text-red-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-[13px] text-red-600">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Email list */}
        <div className={`flex flex-col overflow-hidden border-r border-slate-200 bg-white ${selected ? 'w-[420px] shrink-0' : 'flex-1'}`}>
          <div className="flex-1 overflow-y-auto">
            {!hasData && !running && (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h2 className="text-[16px] font-semibold text-slate-700 mb-1">AI Email Intelligence</h2>
                <p className="text-[13px] text-slate-400 leading-relaxed max-w-xs">
                  Click <span className="font-semibold text-indigo-600">Run Triage</span> to analyze your inbox. AutoPilot will classify each email, draft replies, extract tasks, and flag what needs your attention.
                </p>
              </div>
            )}

            {running && (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton h-20 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            )}

            {!running && emails.map(item => (
              <EmailRow
                key={item.id}
                item={item}
                selected={selected}
                onClick={setSelected}
              />
            ))}
          </div>
        </div>

        {/* Detail pane */}
        {selected && (
          <div className="flex-1 overflow-hidden flex flex-col bg-white">
            <DetailPane item={selected} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-[20px] font-bold tabular-nums ${color}`}>{value ?? 0}</span>
      <span className="text-[11px] text-slate-400 leading-tight">{label}</span>
    </div>
  )
}
