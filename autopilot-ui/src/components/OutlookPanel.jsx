import { useState, useEffect } from 'react'

export default function OutlookPanel() {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/emails/list')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setEmails(data))
      .catch(() => setError('Failed to load emails'))
      .finally(() => setLoading(false))
  }, [])

  const unreadCount = emails.filter(e => e.unread).length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inbox</h2>
        {!loading && !error && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {unreadCount} unread
          </span>
        )}
      </div>

      {loading && <PanelStatus text="Loading emails…" />}
      {error && <PanelStatus text={error} isError />}

      {!loading && !error && (
        <div className="overflow-y-auto flex-1">
          {emails.length === 0 && <PanelStatus text="No emails found." />}
          {emails.map((email) => (
            <div
              key={email.id}
              className={`flex gap-3 p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${email.unread ? 'bg-blue-50/40' : ''}`}
            >
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                {(email.from ?? '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <span className={`text-sm truncate ${email.unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {email.from}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">{email.receivedTime}</span>
                </div>
                <p className={`text-xs truncate mt-0.5 ${email.unread ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
                  {email.subject}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">{email.preview}</p>
              </div>
              {email.unread && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PanelStatus({ text, isError }) {
  return (
    <div className={`flex-1 flex items-center justify-center text-sm ${isError ? 'text-red-400' : 'text-gray-400'}`}>
      {text}
    </div>
  )
}
