import { useState } from 'react'
import Sidebar from './components/Sidebar'
import HealthMonitorPage from './pages/HealthMonitorPage'
import ApprovalsPage from './pages/ApprovalsPage'
import TasksPage from './pages/TasksPage'
import CalendarPage from './pages/CalendarPage'
import ChatPage from './pages/ChatPage'
import WorkflowMonitor from './components/WorkFlowMonitor'
import TranscriptTaskModal from './components/TranscriptTaskModal'

export default function App() {
  const [page, setPage] = useState('health')
  const [triageData, setTriageData] = useState(null)
  const [injectedTasks, setInjectedTasks] = useState([])
  const [showCategorize, setShowCategorize] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  const pendingApprovals = triageData?.results?.filter(r => r.draftId && r.action !== 'sent' && r.action !== 'rejected') ?? []
  const reviewQueue      = triageData?.results?.filter(r => r.needsReview) ?? []

  function onDraftSent(draftId) {
    setTriageData(prev => !prev ? prev : {
      ...prev,
      results: prev.results.map(r => r.draftId === draftId ? { ...r, draftId: null, action: 'sent' } : r),
    })
  }

  function onDraftRejected(draftId) {
    setTriageData(prev => !prev ? prev : {
      ...prev,
      results: prev.results.map(r => r.draftId === draftId ? { ...r, draftId: null, action: 'rejected' } : r),
    })
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f3f3f3' }}>
      <Sidebar
        page={page}
        setPage={setPage}
        pendingCount={pendingApprovals.length + reviewQueue.length}
        onCategorize={() => setShowCategorize(true)}
        onTranscript={() => setShowTranscript(true)}
      />

      <main className="flex-1 overflow-hidden">
        {page === 'health'    && <HealthMonitorPage />}
        {page === 'approvals' && <ApprovalsPage items={[...pendingApprovals, ...reviewQueue]} onSent={onDraftSent} onRejected={onDraftRejected} />}
        {page === 'tasks'     && <TasksPage injectedTasks={injectedTasks} />}
        {page === 'calendar'  && <CalendarPage />}
        {page === 'chat'      && <ChatPage />}
      </main>

      {showCategorize && <WorkflowMonitor onClose={() => setShowCategorize(false)} />}
      {showTranscript && <TranscriptTaskModal onClose={() => setShowTranscript(false)} onTasksAdded={tasks => setInjectedTasks(prev => [...prev, ...tasks])} />}
    </div>
  )
}
