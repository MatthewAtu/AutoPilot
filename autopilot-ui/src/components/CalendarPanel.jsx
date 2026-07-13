import { useState, useEffect } from 'react'

const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const EVENT_COLORS = ['#1a1a1a','#444','#666','#888','#2e7d32','#1565c0']

function buildCal() {
  const today     = new Date()
  const year      = today.getFullYear()
  const month     = today.getMonth()
  const firstDay  = new Date(year, month, 1).getDay()
  const daysInMon = new Date(year, month + 1, 0).getDate()
  const cells     = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMon; d++) cells.push(d)
  return { cells, month, year, today: today.getDate() }
}

export default function CalendarPanel() {
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const { cells, month, year, today } = buildCal()

  useEffect(() => {
    fetch('/api/calendar/events')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setEvents)
      .catch(() => setError('Could not load events.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-5 shrink-0" style={{ borderBottom: '1px solid #d9d9d9', background: '#1a1a1a' }}>
        <span className="text-[13px] font-semibold text-white">Calendar</span>
        <span className="text-[11px]" style={{ color: '#aaa' }}>{MONTHS[month]} {year}</span>
      </div>

      {/* Mini calendar */}
      <div className="px-4 pt-3 pb-3 shrink-0" style={{ borderBottom: '1px solid #e8e8e8' }}>
        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => (
            <span key={d} className="text-[10px] font-bold text-center py-0.5" style={{ color: '#999' }}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => (
            <div key={i} className="flex items-center justify-center">
              <span
                className="text-[12px] w-6 h-6 flex items-center justify-center font-medium transition-colors cursor-pointer"
                style={{
                  borderRadius: '2px',
                  background: d === today ? '#1a1a1a' : 'transparent',
                  color: d === today ? '#fff' : d ? '#444' : 'transparent',
                  fontWeight: d === today ? 700 : 400,
                }}
              >
                {d || ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#999' }}>Today</p>

        {loading && <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 rounded" />)}</div>}
        {error && <p className="text-[13px] text-center pt-4" style={{ color: '#c62828' }}>{error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className="text-[13px] text-center pt-6" style={{ color: '#888' }}>No events today.</p>
        )}
        {!loading && !error && events.map((ev, i) => {
          const color = EVENT_COLORS[i % EVENT_COLORS.length]
          return (
            <div
              key={ev.id ?? i}
              className="anim-item flex items-start gap-3 p-3 cursor-pointer transition-colors"
              style={{ border: '1px solid #e8e8e8', borderRadius: '2px', background: '#fafafa', borderLeft: `3px solid ${color}` }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f3f3f3' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fafafa' }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: '#1a1a1a' }}>{ev.title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: '#888' }}>{ev.start} – {ev.end}</p>
              </div>
              {ev.attendees > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: '#aaa' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[11px]" style={{ color: '#aaa' }}>{ev.attendees}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
