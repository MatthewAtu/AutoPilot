import { useState, useEffect } from 'react'

const PRIORITY = {
  high:   { label: 'High',   color: '#c62828', bg: '#fdf2f2', border: '#f5c6c6' },
  medium: { label: 'Medium', color: '#f57f17', bg: '#fff8e1', border: '#ffecb3' },
  low:    { label: 'Low',    color: '#2e7d32', bg: '#f1f8e9', border: '#c8e6c9' },
}

export default function TaskListPanel({ injectedTasks = [] }) {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [newTask, setNewTask] = useState('')

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setTasks(data.map((t, i) => ({ ...t, id: i, done: false, source: 'AI' }))))
      .catch(() => setError('Could not load tasks.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!injectedTasks.length) return
    setTasks(prev => [
      ...prev,
      ...injectedTasks.map(t => ({ ...t, id: Date.now() + Math.random(), done: false, source: t.source ?? 'Transcript', priority: t.priority ?? 'medium' })),
    ])
  }, [injectedTasks])

  const toggle  = id => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const addTask = () => {
    const text = newTask.trim()
    if (!text) return
    setTasks(prev => [...prev, { id: Date.now(), text, priority: 'medium', done: false, source: 'Manual' }])
    setNewTask('')
  }

  const pending = tasks.filter(t => !t.done)
  const done    = tasks.filter(t => t.done)

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-5 shrink-0" style={{ borderBottom: '1px solid #d9d9d9', background: '#1a1a1a' }}>
        <span className="text-[13px] font-semibold text-white">Tasks</span>
        {!loading && !error && pending.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#fff', color: '#1a1a1a' }}>
            {pending.length} pending
          </span>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && <div className="space-y-2 px-2 pt-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>}
        {error && <p className="text-[13px] text-center pt-8" style={{ color: '#c62828' }}>{error}</p>}
        {!loading && !error && tasks.length === 0 && (
          <p className="text-[13px] text-center pt-8" style={{ color: '#888' }}>No tasks yet.</p>
        )}
        {!loading && (
          <>
            {pending.map(task => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
            {done.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#bbb' }}>Completed</span>
                  <div className="flex-1 h-px" style={{ background: '#e8e8e8' }} />
                  <span className="text-[10px]" style={{ color: '#bbb' }}>{done.length}</span>
                </div>
                {done.map(task => <TaskRow key={task.id} task={task} onToggle={toggle} />)}
              </>
            )}
          </>
        )}
      </div>

      {/* Add task */}
      <div className="px-4 pb-4 pt-2 shrink-0" style={{ borderTop: '1px solid #e8e8e8' }}>
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Add a task…"
            className="flex-1 text-[13px] px-3.5 py-2 focus:outline-none"
            style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#1a1a1a', background: '#fafafa' }}
          />
          <button
            onClick={addTask}
            disabled={!newTask.trim()}
            className="h-9 px-3 text-[12px] font-semibold transition-colors"
            style={{ background: '#1a1a1a', color: '#fff', borderRadius: '2px', opacity: !newTask.trim() ? 0.3 : 1 }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onToggle }) {
  const p = PRIORITY[task.priority] ?? PRIORITY.medium
  return (
    <div
      onClick={() => onToggle(task.id)}
      className="anim-item flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors"
      style={{ borderRadius: '2px' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f7f7f7' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div
        className="w-4 h-4 shrink-0 mt-0.5 flex items-center justify-center transition-all"
        style={{
          border: `2px solid ${task.done ? '#1a1a1a' : '#d9d9d9'}`,
          background: task.done ? '#1a1a1a' : 'transparent',
          borderRadius: '2px',
        }}
      >
        {task.done && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
            <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-snug" style={{ color: task.done ? '#bbb' : '#1a1a1a', textDecoration: task.done ? 'line-through' : 'none' }}>
          {task.text}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-semibold px-1.5 py-0.5" style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}`, borderRadius: '2px' }}>
            {p.label}
          </span>
          <span className="text-[10px]" style={{ color: '#bbb' }}>{task.source}</span>
        </div>
      </div>
    </div>
  )
}
