import { useState } from 'react'

function ReviewTag() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5" style={{ background: '#fdf2f2', color: '#c62828', border: '1px solid #f5c6c6', borderRadius: '2px' }}>
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      Human review required
    </span>
  )
}

function ApprovalCard({ item, onSent, onRejected }) {
  const [editMode, setEditMode] = useState(false)
  const [body, setBody] = useState(item.draftBody ?? '')
  const [sending, setSending] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneType, setDoneType] = useState(null)

  const pct = Math.round((item.confidence ?? 0) * 100)

  async function send() {
    setSending(true)
    try {
      const res = await fetch('/api/triage/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: item.draftId, editedBody: editMode ? body : null }),
      })
      if (!res.ok) throw new Error()
      setDone(true); setDoneType('sent'); onSent(item.draftId)
    } catch { setSending(false) }
  }

  async function reject() {
    setRejecting(true)
    try {
      const res = await fetch(`/api/triage/draft/${item.draftId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDone(true); setDoneType('rejected'); onRejected(item.draftId)
    } catch { setRejecting(false) }
  }

  if (done) {
    return (
      <div className="px-4 py-3 flex items-center gap-3" style={{ border: `1px solid ${doneType === 'sent' ? '#c8e6c9' : '#e0e0e0'}`, borderRadius: '2px', background: doneType === 'sent' ? '#f1f8e9' : '#f7f7f7' }}>
        <span className="text-[13px] font-medium" style={{ color: doneType === 'sent' ? '#2e7d32' : '#666' }}>
          {doneType === 'sent' ? 'Email sent successfully' : 'Draft rejected and deleted'} — {item.subject}
        </span>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #d9d9d9', borderRadius: '2px' }}>
      {/* Header */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #f0f0f0' }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0" style={{ background: '#1a1a1a' }}>
            {(item.from ?? 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-[13px] font-semibold truncate" style={{ color: '#1a1a1a' }}>{item.from}</p>
              <span className="text-[11px] shrink-0" style={{ color: '#888' }}>{item.receivedTime}</span>
            </div>
            <p className="text-[13px] font-medium truncate" style={{ color: '#444' }}>{item.subject}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          {item.needsReview ? <ReviewTag /> : (
            <span className="text-[11px] font-semibold px-2 py-0.5" style={{ background: '#e8f0fe', color: '#1565c0', border: '1px solid #bbdefb', borderRadius: '2px' }}>
              {item.action === 'reply_needed' ? 'Reply drafted' : 'Forward drafted'}
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full" style={{ background: '#f0f0f0' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 75 ? '#2e7d32' : pct >= 60 ? '#f57f17' : '#c62828' }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#666' }}>{pct}%</span>
          </div>
        </div>
        {item.reasoning && <p className="text-[12px] mt-2 leading-relaxed" style={{ color: '#666' }}>{item.reasoning}</p>}
      </div>

      {/* Draft */}
      {item.draftBody && (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#888' }}>Draft Reply</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#aaa' }}>To: {item.draftTo}</p>
            </div>
            {!item.needsReview && (
              <button onClick={() => setEditMode(e => !e)} className="text-[12px] font-medium" style={{ color: '#1565c0' }}>
                {editMode ? 'Preview' : 'Edit'}
              </button>
            )}
          </div>
          {editMode ? (
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={5}
              className="w-full text-[13px] px-4 py-3 focus:outline-none"
              style={{ border: '1px solid #d9d9d9', borderRadius: '2px', background: '#fafafa', color: '#1a1a1a' }}
            />
          ) : (
            <div className="px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto" style={{ background: '#f7f7f7', border: '1px solid #e8e8e8', borderRadius: '2px', color: '#1a1a1a' }}>
              {body}
            </div>
          )}
        </div>
      )}

      {item.needsReview && !item.draftBody && (
        <div className="px-5 py-4">
          <div className="px-4 py-3 text-[13px] leading-relaxed" style={{ background: '#fdf2f2', border: '1px solid #f5c6c6', borderRadius: '2px', color: '#c62828' }}>
            Confidence too low ({pct}%). No draft was created. Please handle this email manually.
          </div>
        </div>
      )}

      {!item.needsReview && item.draftId && (
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button
            onClick={reject}
            disabled={rejecting || sending}
            className="px-4 py-2 text-[13px] font-medium transition-colors"
            style={{ border: '1px solid #d9d9d9', borderRadius: '2px', color: '#444', background: '#f7f7f7', opacity: (rejecting || sending) ? 0.4 : 1 }}
          >
            {rejecting ? 'Deleting…' : 'Reject'}
          </button>
          <button
            onClick={send}
            disabled={sending || rejecting}
            className="px-4 py-2 text-[13px] font-semibold transition-colors"
            style={{ background: '#1a1a1a', color: '#fff', borderRadius: '2px', opacity: (sending || rejecting) ? 0.4 : 1 }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ApprovalsPage({ items, onSent, onRejected }) {
  const drafts  = items.filter(i => i.draftId)
  const reviews = items.filter(i => i.needsReview && !i.draftId)

  if (!items.length) {
    return (
      <div className="flex flex-col h-full" style={{ background: '#f3f3f3' }}>
        <div className="h-14 flex items-center px-6 shrink-0" style={{ background: '#fff', borderBottom: '1px solid #d9d9d9' }}>
          <h1 className="text-[15px] font-bold" style={{ color: '#1a1a1a' }}>Approvals</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <p className="text-[15px] font-semibold mb-1" style={{ color: '#444' }}>No pending approvals</p>
          <p className="text-[13px]" style={{ color: '#888' }}>Run Triage from the Categorization tool to generate email actions.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f3f3f3' }}>
      <div className="h-14 flex items-center justify-between px-6 shrink-0" style={{ background: '#fff', borderBottom: '1px solid #d9d9d9' }}>
        <h1 className="text-[15px] font-bold" style={{ color: '#1a1a1a' }}>Approvals</h1>
        <div className="flex items-center gap-3">
          {drafts.length > 0 && (
            <span className="text-[11px] font-semibold px-2.5 py-0.5" style={{ background: '#e8f0fe', color: '#1565c0', border: '1px solid #bbdefb', borderRadius: '2px' }}>
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''} pending
            </span>
          )}
          {reviews.length > 0 && (
            <span className="text-[11px] font-semibold px-2.5 py-0.5" style={{ background: '#fdf2f2', color: '#c62828', border: '1px solid #f5c6c6', borderRadius: '2px' }}>
              {reviews.length} need{reviews.length === 1 ? 's' : ''} review
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {drafts.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#888' }}>Pending Drafts</p>
            {drafts.map(item => <ApprovalCard key={item.id} item={item} onSent={onSent} onRejected={onRejected} />)}
          </>
        )}
        {reviews.length > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-2" style={{ color: '#c62828' }}>Human Intervention Required</p>
            {reviews.map(item => <ApprovalCard key={item.id} item={item} onSent={onSent} onRejected={onRejected} />)}
          </>
        )}
      </div>
    </div>
  )
}
