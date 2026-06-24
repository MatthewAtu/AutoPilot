import OutlookPanel from './components/OutlookPanel'
import ChatbotPanel from './components/ChatbotPanel'
import CalendarPanel from './components/CalendarPanel'
import TaskListPanel from './components/TaskListPanel'

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-100 font-sans">
      {/* Top nav */}
      <header className="bg-indigo-700 text-white flex items-center px-6 h-14 shrink-0 shadow-md">
        <span className="font-bold text-lg tracking-tight">AutoPilot</span>
        <span className="ml-3 text-indigo-300 text-sm">Your daily AI assistant</span>
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
          <TaskListPanel />
        </section>
      </main>
    </div>
  )
}
