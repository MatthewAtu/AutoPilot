import TaskListPanel from '../components/TaskListPanel'

export default function TasksPage({ injectedTasks }) {
  return (
    <div className="flex flex-col h-full bg-white">
      <TaskListPanel injectedTasks={injectedTasks} />
    </div>
  )
}
