import { useState, useRef, useEffect } from 'react'

const SEED = [{
  id: 0, role: 'assistant',
  text: "Hi, I'm AutoPilot. Ask me to summarize emails, check your schedule, or help manage tasks.",
}]

export default function ChatbotPanel() {
  const [messages, setMessages] = useState(SEED)
  const [input,    setInput]    = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function send() {
    const text = input.trim()
    if (!text || thinking) return
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text }])
    setInput('')
    setThinking(true)
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', text: data.reply ?? 'No response.' }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', text: 'Could not reach the backend.' }])
    } finally {
      setThinking(false)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="h-12 flex items-center gap-3 px-5 shrink-0" style={{ borderBottom: '1px solid #d9d9d9', background: '#1a1a1a' }}>
        <span className="text-[13px] font-semibold text-white">AI Assistant</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#4caf50' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#4caf50' }} />
          </span>
          <span className="text-[11px]" style={{ color: '#aaa' }}>Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`anim-in flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5" style={{ background: '#1a1a1a' }}>
                A
              </div>
            )}
            <div
              className="max-w-[78%] px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
              style={{
                borderRadius: '4px',
                background: msg.role === 'user' ? '#1a1a1a' : '#f7f7f7',
                color:      msg.role === 'user' ? '#ffffff' : '#1a1a1a',
                border:     msg.role === 'user' ? 'none' : '1px solid #e8e8e8',
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="anim-in flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0 mt-0.5" style={{ background: '#1a1a1a' }}>
              A
            </div>
            <div className="px-4 py-3 flex items-center gap-1" style={{ background: '#f7f7f7', border: '1px solid #e8e8e8', borderRadius: '4px' }}>
              <span className="dot-1 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#888' }} />
              <span className="dot-2 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#888' }} />
              <span className="dot-3 w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#888' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 shrink-0" style={{ borderTop: '1px solid #e8e8e8' }}>
        <div className="flex items-end gap-2 px-4 py-2.5" style={{ border: '1px solid #d9d9d9', borderRadius: '2px', background: '#fafafa' }}>
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Message AutoPilot…"
            className="flex-1 bg-transparent text-[13px] focus:outline-none leading-relaxed"
            style={{ color: '#1a1a1a' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || thinking}
            className="w-8 h-8 flex items-center justify-center transition-colors shrink-0"
            style={{ background: '#1a1a1a', borderRadius: '2px', opacity: (!input.trim() || thinking) ? 0.3 : 1 }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] mt-1.5 text-center" style={{ color: '#bbb' }}>Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}
