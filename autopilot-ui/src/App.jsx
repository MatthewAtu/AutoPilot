import { useState } from 'react'
import { Group, Panel as ResizablePanel, Separator, useGroupRef } from 'react-resizable-panels'
import logo from './assets/logo-White.png'
import OutlookPanel from './components/OutlookPanel'
import ChatbotPanel from './components/ChatbotPanel'
import CalendarPanel from './components/CalendarPanel'
import TaskListPanel from './components/TaskListPanel'
import TranscriptTaskModal from './components/TranscriptTaskModal'
import WorkflowMonitor from './components/WorkFlowMonitor'

export default function App() {
  const [showTranscript, setShowTranscript] = useState(false)
  const [injectedTasks, setInjectedTasks] = useState([])
  const [activeView, setActiveView] = useState('dashboard')

  const rowsGroupRef = useGroupRef()
  const topRowGroupRef = useGroupRef()
  const bottomRowGroupRef = useGroupRef()

  function handleTasksAdded(tasks) {
    setInjectedTasks(prev => [...prev, ...tasks])
  }

  function resetLayout() {
    rowsGroupRef.current?.setLayout({ 'row-top': 50, 'row-bottom': 50 })
    topRowGroupRef.current?.setLayout({ outlook: 50, chatbot: 50 })
    bottomRowGroupRef.current?.setLayout({ calendar: 50, tasks: 50 })
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

        <nav className="flex items-center gap-2">
          {activeView === 'health' ? (
            <button
              onClick={() => setActiveView('dashboard')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-all duration-150"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Dashboard
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowTranscript(true)}
                className="rounded-full bg-slate-100 text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                Transcript
              </button>
              <button
                onClick={() => setActiveView('health')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all duration-150"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 11h3l1.5-3 2.5 7 2-10 1.5 6H19" />
                </svg>
                Workflow Health Monitor
              </button>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-slate-400 font-medium">AI Online</span>
        </div>
      </header>

      {activeView === 'health' ? (
        <main className="flex-1 flex flex-col">
          <WorkflowMonitor />
        </main>
      ) : (
        <main className="flex-1 px-6 py-6">
          <section className="max-w-5xl space-y-4 pb-6">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">AutoPilot dashboard</h1>
              <button
                onClick={resetLayout}
                className="hidden md:flex items-center gap-1.5 rounded-full border border-slate-200 text-slate-600 px-3 py-1.5 text-xs font-medium hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset Layout
              </button>
            </div>
          </section>

          <div className="hidden md:block md:h-[calc(100vh-260px)]">
            <Group orientation="vertical" className="gap-2" groupRef={rowsGroupRef}>
              <ResizablePanel id="row-top" defaultSize={50} minSize={20}>
                <Group orientation="horizontal" className="gap-2" groupRef={topRowGroupRef}>
                  <ResizablePanel id="outlook" defaultSize={50} minSize={20}>
                    <Panel><OutlookPanel /></Panel>
                  </ResizablePanel>
                  <ResizeHandle orientation="horizontal" />
                  <ResizablePanel id="chatbot" defaultSize={50} minSize={20}>
                    <Panel><ChatbotPanel /></Panel>
                  </ResizablePanel>
                </Group>
              </ResizablePanel>
              <ResizeHandle orientation="vertical" />
              <ResizablePanel id="row-bottom" defaultSize={50} minSize={20}>
                <Group orientation="horizontal" className="gap-2" groupRef={bottomRowGroupRef}>
                  <ResizablePanel id="calendar" defaultSize={50} minSize={20}>
                    <Panel><CalendarPanel /></Panel>
                  </ResizablePanel>
                  <ResizeHandle orientation="horizontal" />
                  <ResizablePanel id="tasks" defaultSize={50} minSize={20}>
                    <Panel><TaskListPanel injectedTasks={injectedTasks} /></Panel>
                  </ResizablePanel>
                </Group>
              </ResizablePanel>
            </Group>
          </div>

          <div className="grid grid-cols-1 gap-4 md:hidden">
            <Panel><OutlookPanel /></Panel>
            <Panel><ChatbotPanel /></Panel>
            <Panel><CalendarPanel /></Panel>
            <Panel><TaskListPanel injectedTasks={injectedTasks} /></Panel>
          </div>
        </main>
      )}

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
    <section className="bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm shadow-slate-400/10 min-h-0 h-full">
      {children}
    </section>
  )
}

function ResizeHandle({ orientation }) {
  const isVertical = orientation === 'vertical'
  return (
    <Separator
      className={
        isVertical
          ? 'h-2 my-1 flex items-center justify-center group cursor-row-resize'
          : 'w-2 mx-1 flex items-center justify-center group cursor-col-resize'
      }
    >
      <div
        className={
          (isVertical ? 'w-10 h-1' : 'w-1 h-10') +
          ' rounded-full bg-slate-200 group-hover:bg-slate-400 transition-colors'
        }
      />
    </Separator>
  )
}
