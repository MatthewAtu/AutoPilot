import { useState, useEffect } from 'react'

const PRIORITIES = {
  high: { badge: 'bg-rose-500/15 text-rose-300 border border-rose-500/25', dot: 'bg-rose-400' },
  medium: { badge: 'bg-amber-500/15 text-amber-300 border border-amber-500/25', dot: 'bg-amber-400' },
  low: { badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25', dot: 'bg-emerald-400' },
}

export default function TaskListPanel({ injectedTasks = [] }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newTask, setNewTask] = useState('')

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setTasks(data.map((t, i) => ({ ...t, id: i, done: false, source: 'AI' }))))
      .catch(() => setError('Failed to load tasks'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!injectedTasks.length) return
    setTasks(prev => [
      ...prev,
      ...injectedTasks.map(t => ({
        ...t,
        id: Date.now() + Math.random(),
        done: false,
        source: 'Transcript',
        priority: t.priority ?? 'medium',
      })),
    ])
  }, [injectedTasks])

  const toggle = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))

  const addTask = () => {
    const text = newTask.trim()
    if (!text) return
    setTasks(prev => [...prev, { id: Date.now(), text, priority: 'medium', done: false, source: 'Manual' }])
    setNewTask('')
  }

  const pending = tasks.filter(t => !t.done)
  const done = tasks.filter(t => t.done)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h2 className="text-xs font-semibold text-slate-600 uppercase tracking-widest">Daily Tasks</h2>
        </div>
        {!loading && !error && pending.length > 0 && (
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {loading && <p className="text-sm text-slate-500 text-center pt-4">Loading tasks…</p>}
        {error && <p className="text-sm text-rose-500 text-center pt-4">{error}</p>}

        {!loading && !error && tasks.length === 0 && (
          <p className="text-sm text-slate-500 text-center pt-4">No tasks found.</p>
        )}

        {!loading && pending.map(task => (
          <TaskItem key={task.id} task={task} onToggle={toggle} />
        ))}

        {!loading && done.length > 0 && (
          <>
            <p className="text-xs text-slate-600 font-semibold uppercase tracking-widest pt-3 pb-1">Completed</p>
            {done.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggle} />
            ))}
          </>
        )}
      </div>

      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2 items-center bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-slate-400/70 transition-all duration-200">
          <input
            type="text"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Add a task…"
            className="flex-1 bg-white text-sm text-slate-900 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={addTask}
            disabled={!newTask.trim()}
            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1 text-xs font-semibold transition-all duration-150"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskItem({ task, onToggle }) {
  const priority = PRIORITIES[task.priority] ?? PRIORITIES.medium
  return (
    <div
      onClick={() => onToggle(task.id)}
      className="flex items-start gap-3 p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-all duration-150 group"
    >
      <div className={`w-4 h-4 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all duration-150 ${
        task.done
          ? 'bg-slate-900 border-slate-900 shadow-lg shadow-slate-900/20'
          : 'border-slate-600 group-hover:border-slate-700'
      }`}>
        {task.done && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.done ? 'line-through text-slate-600' : 'text-slate-700'}`}>{task.text}</p>
        <div className="flex gap-2 mt-1.5 items-center">
          <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${priority.badge}`}>
            <span className={`inline-block w-1 h-1 rounded-full ${priority.dot} mr-1 mb-px`} />
            {task.priority}
          </span>
          <span className="text-xs text-slate-600">{task.source}</span>
        </div>
      </div>
    </div>
  )
}
