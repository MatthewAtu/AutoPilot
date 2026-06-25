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
    <div className="h-screen flex flex-col bg-gray-100 font-sans">
      {/* Top nav */}
      <header className="bg-indigo-700 text-white flex items-center px-6 h-14 shrink-0 shadow-md">
        <span className="font-bold text-lg tracking-tight">AutoPilot</span>
        <span className="ml-3 text-indigo-300 text-sm">Your daily AI assistant</span>

        <nav className="ml-8 flex items-center gap-1">
          <button
            onClick={() => setShowTranscript(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-indigo-200 hover:text-white hover:bg-indigo-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.07A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            Tasks from Transcript
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm text-indigo-200">AI Online</span>
        </div>
      </header>

      {/* 4-panel grid */}
      <main className="flex-1 grid grid-cols-2 grid-rows-2 gap-3 p-4 overflow-hidden">
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <OutlookPanel />
        </section>
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <ChatbotPanel />
        </section>
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <CalendarPanel />
        </section>
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
          <TaskListPanel injectedTasks={injectedTasks} />
        </section>
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
