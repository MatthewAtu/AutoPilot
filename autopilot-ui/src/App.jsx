import { useState } from 'react'
import logo from './assets/logo-White.png'
import OutlookPanel from './components/OutlookPanel'
import ChatbotPanel from './components/ChatbotPanel'
import CalendarPanel from './components/CalendarPanel'
import TaskListPanel from './components/TaskListPanel'
import TranscriptTaskModal from './components/TranscriptTaskModal'

export default function App() {
  const [showTranscript, setShowTranscript] = useState(false)
  const [injectedTasks, setInjectedTasks] = useState([])
  const [showWorkflowMon, setShowworkflowMon] = useState(false);

  function handleTasksAdded(tasks) {
    setInjectedTasks(prev => [...prev, ...tasks])
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <header className="bg-[#1A1A1A] text-white flex flex-wrap items-center justify-between gap-4 px-6 py-3 shadow-sm shadow-slate-300/10">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 overflow-hidden">
            <img src={logo} alt="Ontario logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-tight">AutoPilot</span>
            <span className="text-xs uppercase tracking-[0.22em] text-slate-400">Ontario</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowTranscript(true)}
            className="rounded-full bg-slate-100 text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Transcript
          </button>
        </div>

        {/* Status */}
        <div className="ml-auto flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-slate-400 font-medium">AI Online</span>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <section className="max-w-5xl space-y-4 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">AutoPilot operations dashboard</h1>
          <p className="text-base text-slate-600 max-w-3xl">
            A unified OPS dashboard for email, chat, schedule and tasks aligned with the Ontario website styling.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
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
    <section className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm shadow-slate-400/10">
      {children}
    </section>
  )
}
