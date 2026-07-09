import { useState, useEffect } from 'react'

const EVENT_COLORS = [
  { bar: 'bg-slate-900', bg: 'bg-slate-900/10 border-slate-900/20', text: 'text-slate-700' },
  { bar: 'bg-zinc-800', bg: 'bg-zinc-800/10 border-zinc-800/20', text: 'text-zinc-700' },
  { bar: 'bg-stone-700', bg: 'bg-stone-700/10 border-stone-700/20', text: 'text-stone-700' },
  { bar: 'bg-slate-700', bg: 'bg-slate-700/10 border-slate-700/20', text: 'text-slate-600' },
  { bar: 'bg-zinc-700', bg: 'bg-zinc-700/10 border-zinc-700/20', text: 'text-zinc-600' },
  { bar: 'bg-slate-600', bg: 'bg-slate-600/10 border-slate-600/20', text: 'text-slate-500' },
]

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getMiniCal() {
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return { cells, month, year, todayDate: today.getDate() }
}

export default function CalendarPanel() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { cells, month, year, todayDate } = getMiniCal()

  useEffect(() => {
    fetch('/api/calendar/events')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setEvents(data))
      .catch(() => setError('Failed to load calendar'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Calendar</h2>
        </div>
        <span className="text-xs text-slate-500 font-medium">{MONTHS[month]} {year}</span>
      </div>

      {/* Mini calendar */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-800/60 shrink-0">
        <div className="grid grid-cols-7 text-center mb-1.5">
          {DAYS.map((d, i) => (
            <span key={i} className="text-xs text-slate-600 font-medium py-0.5">{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center gap-y-0.5">
          {cells.map((d, i) => (
            <span
              key={i}
              className={`text-xs py-1 rounded-lg w-6 h-6 mx-auto flex items-center justify-center transition-colors ${
                d === todayDate
                  ? 'bg-slate-900 text-white font-bold shadow-lg shadow-slate-900/30'
                  : d
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer'
                  : ''
              }`}
            >
              {d || ''}
            </span>
          ))}
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <p className="text-xs text-slate-600 font-semibold uppercase tracking-widest mb-2">Today's Events</p>

        {loading && <p className="text-sm text-slate-500 text-center pt-4">Loading events…</p>}
        {error && <p className="text-sm text-rose-400 text-center pt-4">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-slate-500 text-center pt-4">No events today.</p>
        )}

        {!loading && !error && events.map((event, i) => (
          <div key={event.id ?? i} className="flex gap-3 p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer">
            <div className="w-1 rounded-full bg-slate-900 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{event.title}</p>
              <p className="text-xs mt-0.5 text-slate-500">{event.start} – {event.end}</p>
            </div>
            {event.attendees > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs text-slate-500">{event.attendees}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
