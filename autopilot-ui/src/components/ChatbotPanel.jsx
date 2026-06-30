import { useState, useRef, useEffect } from 'react'

const SEED = [
  { id: 1, role: 'assistant', text: "Hi! I'm AutoPilot. Ask me to summarize your emails, check your schedule, or anything else." },
]

export default function ChatbotPanel() {
  const [messages, setMessages] = useState(SEED)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function handleSend() {
    const text = input.trim()
    if (!text || thinking) return

    setMessages(prev => [...prev, { id: Date.now(), role: 'user', text }])
    setInput('')
    setThinking(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', text: data.reply ?? 'No response' }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', text: 'Could not reach AI. Is the backend running?' }])
    } finally {
      setThinking(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/80 shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.7-1.388 2.7H4.186c-1.418 0-2.389-1.7-1.388-2.7L4.2 15.3" />
        </svg>
        <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-widest">AutoPilot AI</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-lg shadow-indigo-500/20">
                A
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-sm shadow-lg shadow-indigo-500/20'
                : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/50'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 shadow-lg shadow-indigo-500/20">
              A
            </div>
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-800/80">
        <div className="flex gap-2 items-end bg-slate-800/60 rounded-2xl border border-slate-700/50 p-2 focus-within:border-indigo-500/50 focus-within:bg-slate-800 transition-all duration-200">
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask AutoPilot anything…"
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || thinking}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-150 shrink-0 shadow-lg shadow-indigo-500/20"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
