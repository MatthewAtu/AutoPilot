import { useState, useEffect } from 'react'

const EVENT_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-red-400', 'bg-indigo-500']

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

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
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Calendar</h2>
        <span className="text-xs text-gray-500">{MONTHS[month]} {year}</span>
      </div>

      {/* Mini calendar — always shown, client-side */}
      <div className="p-3 border-b border-gray-100">
        <div className="grid grid-cols-7 text-center mb-1">
          {DAYS.map(d => (
            <span key={d} className="text-xs text-gray-400 font-medium py-1">{d[0]}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 text-center gap-y-0.5">
          {cells.map((d, i) => (
            <span
              key={i}
              className={`text-xs py-1 rounded-full w-6 h-6 mx-auto flex items-center justify-center ${
                d === todayDate
                  ? 'bg-indigo-600 text-white font-bold'
                  : d
                  ? 'text-gray-700 hover:bg-gray-100 cursor-pointer'
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
        <p className="text-xs text-gray-400 font-medium mb-2">TODAY'S EVENTS</p>

        {loading && <p className="text-sm text-gray-400 text-center pt-4">Loading events…</p>}
        {error && <p className="text-sm text-red-400 text-center pt-4">{error}</p>}

        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-4">No events today.</p>
        )}

        {!loading && !error && events.map((event, i) => (
          <div key={event.id ?? i} className="flex gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
            <div className={`w-1 rounded-full ${EVENT_COLORS[i % EVENT_COLORS.length]} shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{event.start} – {event.end}</p>
            </div>
            <span className="text-xs text-gray-400 shrink-0 mt-0.5">{event.attendees} ppl</span>
          </div>
        ))}
      </div>
    </div>
  )
}
