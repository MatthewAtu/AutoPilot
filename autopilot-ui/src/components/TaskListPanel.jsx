import { useState, useEffect } from 'react'

const PRIORITIES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
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
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tasks</h2>
        {!loading && !error && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {loading && <p className="text-sm text-gray-400 text-center pt-4">Loading tasks…</p>}
        {error && <p className="text-sm text-red-400 text-center pt-4">{error}</p>}

        {!loading && !error && tasks.length === 0 && (
          <p className="text-sm text-gray-400 text-center pt-4">No tasks found.</p>
        )}

        {!loading && pending.map(task => (
          <TaskItem key={task.id} task={task} onToggle={toggle} />
        ))}

        {!loading && done.length > 0 && (
          <>
            <p className="text-xs text-gray-400 font-medium pt-3 pb-1">COMPLETED</p>
            {done.map(task => (
              <TaskItem key={task.id} task={task} onToggle={toggle} />
            ))}
          </>
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Add a task…"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={addTask}
            disabled={!newTask.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskItem({ task, onToggle }) {
  return (
    <div
      onClick={() => onToggle(task.id)}
      className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors group"
    >
      <div className={`w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
        task.done ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 group-hover:border-indigo-400'
      }`}>
        {task.done && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.text}</p>
        <div className="flex gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITIES[task.priority] ?? PRIORITIES.medium}`}>
            {task.priority}
          </span>
          <span className="text-xs text-gray-400">{task.source}</span>
        </div>
      </div>
    </div>
  )
}
