import { useState } from 'react'
import OutlookPanel from './components/OutlookPanel'
import ChatbotPanel from './components/ChatbotPanel'
import CalendarPanel from './components/CalendarPanel'
import TaskListPanel from './components/TaskListPanel'
import TranscriptTaskModal from './components/TranscriptTaskModal'

export default function App() {
  const [showTranscript, setShowTranscript] = useState(false)
  const [injectedTasks, setInjectedTasks] = useState([])

  function handleTasksAdded(tasks) {
    setInjectedTasks(prev => [...prev, ...tasks])
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 font-sans">
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white flex items-center px-6 h-14 shrink-0 gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-bold text-base tracking-tight text-white">AutoPilot</span>
          <span className="text-slate-500 text-sm hidden sm:block">/ dashboard</span>
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => setShowTranscript(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            Transcript
          </button>
        </nav>

        {/* Status */}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-slate-400 font-medium">AI Online</span>
        </div>
      </header>

      {/* 4-panel grid */}
      <main className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 p-3 overflow-hidden">
        <Panel>
          <OutlookPanel />
        </Panel>
        <Panel>
          <ChatbotPanel />
        </Panel>
        <Panel>
          <CalendarPanel />
        </Panel>
        <Panel>
          <TaskListPanel injectedTasks={injectedTasks} />
        </Panel>
      </main>

      {showTranscript && (
        <TranscriptTaskModal
          onClose={() => setShowTranscript(false)}
          onTasksAdded={handleTasksAdded}
        />
      )}
    </div>
  )
}

function Panel({ children }) {
  return (
    <section className="bg-slate-900 rounded-2xl border border-slate-800/80 flex flex-col overflow-hidden shadow-xl shadow-black/20">
      {children}
    </section>
  )
}
