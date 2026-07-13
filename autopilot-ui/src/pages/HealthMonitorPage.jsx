import { useState, useEffect } from 'react'

// ── Mock data (replace with real API when multi-account is available) ──────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EMAIL_VOLUME = [24, 31, 19, 42, 38, 12, 8]
const ANSWERED     = [18, 27, 16, 35, 30, 9,  5]
const PENDING_VOL  = [6,  4,  3,  7,  8,  3,  3]

const EMPLOYEES = [
  { name: 'Sarah Mitchell',  initials: 'SM', answered: 47, active: 3, avatar: '#2c3e50' },
  { name: 'James Okonkwo',   initials: 'JO', answered: 39, active: 1, avatar: '#1a5276' },
  { name: 'Priya Nair',      initials: 'PN', answered: 52, active: 2, avatar: '#154360' },
  { name: 'David Cartwright',initials: 'DC', answered: 28, active: 0, avatar: '#212f3c' },
  { name: 'Amelia Torres',   initials: 'AT', answered: 33, active: 4, avatar: '#1b2631' },
]

const ACTIVE_EMAILS = [
  { subject: 'Budget Approval Q3 2026', from: 'finance@ontario.ca',        assignee: 'SM', status: 'In Progress' },
  { subject: 'IT Infrastructure Review',from: 'it-support@ops.gov.on.ca',  assignee: 'JO', status: 'Awaiting Info' },
  { subject: 'Policy Amendment Draft',  from: 'legal@ontario.ca',          assignee: 'PN', status: 'In Progress' },
  { subject: 'Vendor Onboarding Form',  from: 'procurement@ontario.ca',    assignee: 'PN', status: 'In Progress' },
  { subject: 'Staff Training Schedule', from: 'hr@ops.gov.on.ca',          assignee: 'AT', status: 'Drafting Reply' },
  { subject: 'Accessibility Audit',     from: 'accessibility@ontario.ca',  assignee: 'AT', status: 'In Progress' },
  { subject: 'FIPPA Request #2026-441', from: 'fippa@ontario.ca',          assignee: 'AT', status: 'In Progress' },
  { subject: 'Stakeholder Meeting Notes',from: 'communications@ontario.ca',assignee: 'AT', status: 'In Progress' },
]

const ACTION_BREAKDOWN = [
  { label: 'Replied',       value: 168, color: '#1a1a1a' },
  { label: 'Forwarded',     value: 43,  color: '#555'    },
  { label: 'Task Created',  value: 31,  color: '#888'    },
  { label: 'No Action',     value: 89,  color: '#bbb'    },
  { label: 'Needs Review',  value: 17,  color: '#d32f2f' },
]

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function BarChart({ data, labels, colors, height = 80 }) {
  const max = Math.max(...data.flat())
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {labels.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col-reverse gap-0.5">
            {data.map((series, si) => {
              const pct = max > 0 ? (series[i] / max) * (height - 20) : 0
              return (
                <div
                  key={si}
                  title={`${series[i]}`}
                  style={{ height: pct, background: colors[si], borderRadius: '2px 2px 0 0', minHeight: pct > 0 ? 2 : 0 }}
                />
              )
            })}
          </div>
          <span className="text-[9px]" style={{ color: '#999' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Donut chart ────────────────────────────────────────────────────────────────
function DonutChart({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  let offset = 0
  const r = 36, circ = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-5">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#f0f0f0" strokeWidth="14" />
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circ
          const el = (
            <circle
              key={i}
              cx="44" cy="44" r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
          )
          offset += dash
          return el
        })}
        <text x="44" y="48" textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: '#1a1a1a' }}>{total}</text>
      </svg>
      <div className="space-y-1.5">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.color }} />
            <span className="text-[11px]" style={{ color: '#555' }}>{seg.label}</span>
            <span className="text-[11px] font-semibold ml-auto pl-3" style={{ color: '#1a1a1a' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className="rounded-sm p-4" style={{ background: '#fff', border: '1px solid #d9d9d9' }}>
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#888' }}>{label}</p>
      <p className="text-[32px] font-bold leading-none" style={{ color: accent ?? '#1a1a1a' }}>{value}</p>
      {sub && <p className="text-[11px] mt-1.5" style={{ color: '#999' }}>{sub}</p>}
    </div>
  )
}

// ── Employee row ──────────────────────────────────────────────────────────────
function EmployeeRow({ emp, rank }) {
  const maxAnswered = Math.max(...EMPLOYEES.map(e => e.answered))
  const pct = (emp.answered / maxAnswered) * 100
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid #f0f0f0' }}>
      <span className="text-[11px] w-4 text-right shrink-0" style={{ color: '#bbb' }}>{rank}</span>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: emp.avatar }}>
        {emp.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: '#1a1a1a' }}>{emp.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f0f0f0' }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#1a1a1a' }} />
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[14px] font-bold" style={{ color: '#1a1a1a' }}>{emp.answered}</p>
        <p className="text-[10px]" style={{ color: '#999' }}>answered</p>
      </div>
      {emp.active > 0 && (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm" style={{ background: '#f3f3f3', color: '#555', border: '1px solid #d9d9d9' }}>
          {emp.active} active
        </span>
      )}
    </div>
  )
}

// ── Active email row ──────────────────────────────────────────────────────────
function ActiveEmailRow({ email }) {
  const emp = EMPLOYEES.find(e => e.initials === email.assignee)
  const statusColor = email.status === 'Awaiting Info' ? '#d32f2f' : email.status === 'Drafting Reply' ? '#1565c0' : '#2e7d32'
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid #f0f0f0' }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: emp?.avatar ?? '#555' }}>
        {email.assignee}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: '#1a1a1a' }}>{email.subject}</p>
        <p className="text-[11px] truncate" style={{ color: '#888' }}>{email.from}</p>
      </div>
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm shrink-0" style={{ color: statusColor, background: `${statusColor}12`, border: `1px solid ${statusColor}33` }}>
        {email.status}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HealthMonitorPage() {
  const [emailCount, setEmailCount] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/emails/list')
      .then(r => r.ok ? r.json() : [])
      .then(data => setEmailCount(data.length))
      .catch(() => setEmailCount(null))
      .finally(() => setLoading(false))
  }, [])

  const totalThisWeek = EMAIL_VOLUME.reduce((a, b) => a + b, 0)
  const totalAnswered = ANSWERED.reduce((a, b) => a + b, 0)
  const needsAction   = ACTION_BREAKDOWN.find(x => x.label === 'Needs Review')?.value ?? 0

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#f3f3f3' }}>
      {/* Page header */}
      <div className="shrink-0 px-6 py-4" style={{ background: '#fff', borderBottom: '1px solid #d9d9d9' }}>
        <h1 className="text-[18px] font-bold" style={{ color: '#1a1a1a' }}>Health Monitor</h1>
        <p className="text-[12px] mt-0.5" style={{ color: '#888' }}>Email operations overview — Ontario Public Service</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Inbox (live)" value={loading ? '—' : (emailCount ?? '—')} sub="Unread in mailbox" />
          <StatCard label="This week" value={totalThisWeek} sub={`${totalAnswered} answered`} />
          <StatCard label="Active now" value={ACTIVE_EMAILS.length} sub="Emails being worked" />
          <StatCard label="Needs review" value={needsAction} sub="Low confidence flags" accent="#d32f2f" />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-3 gap-3">

          {/* Email volume chart */}
          <div className="col-span-2 rounded-sm p-5" style={{ background: '#fff', border: '1px solid #d9d9d9' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#1a1a1a' }}>Email Volume — This Week</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#888' }}>Received vs. answered per day</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1a1a1a' }} /><span className="text-[11px]" style={{ color: '#666' }}>Received</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#bbb' }} /><span className="text-[11px]" style={{ color: '#666' }}>Answered</span></div>
              </div>
            </div>
            <BarChart
              data={[EMAIL_VOLUME, ANSWERED]}
              labels={DAYS}
              colors={['#1a1a1a', '#bbb']}
              height={100}
            />
          </div>

          {/* Action breakdown donut */}
          <div className="rounded-sm p-5" style={{ background: '#fff', border: '1px solid #d9d9d9' }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: '#1a1a1a' }}>Actions This Week</p>
            <p className="text-[11px] mb-4" style={{ color: '#888' }}>How emails were handled</p>
            <DonutChart segments={ACTION_BREAKDOWN} />
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-2 gap-3">

          {/* Employee leaderboard */}
          <div className="rounded-sm p-5" style={{ background: '#fff', border: '1px solid #d9d9d9' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#1a1a1a' }}>Staff Performance</p>
                <p className="text-[11px]" style={{ color: '#888' }}>Emails answered this month</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm" style={{ background: '#f3f3f3', color: '#666', border: '1px solid #d9d9d9' }}>Mock data</span>
            </div>
            <div>
              {EMPLOYEES.sort((a, b) => b.answered - a.answered).map((emp, i) => (
                <EmployeeRow key={emp.name} emp={emp} rank={i + 1} />
              ))}
            </div>
          </div>

          {/* Active email assignments */}
          <div className="rounded-sm p-5" style={{ background: '#fff', border: '1px solid #d9d9d9' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#1a1a1a' }}>Currently Being Worked</p>
                <p className="text-[11px]" style={{ color: '#888' }}>Do not pick up — already assigned</p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-sm" style={{ background: '#f3f3f3', color: '#666', border: '1px solid #d9d9d9' }}>Mock data</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
              {ACTIVE_EMAILS.map((email, i) => (
                <ActiveEmailRow key={i} email={email} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
