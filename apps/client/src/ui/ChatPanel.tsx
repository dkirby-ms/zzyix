import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../../../server/src/contracts'
import './ChatPanel.css'

interface ChatPanelProps {
  messages: ChatMessage[]
  clientId: string
  onSendMessage: (text: string) => void
  isReplaying: boolean
  sendError?: string | null
}

export const ChatPanel = ({ messages, clientId, onSendMessage, isReplaying, sendError }: ChatPanelProps) => {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!inputValue.trim()) return
    onSendMessage(inputValue)
    setInputValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>Chat</h3>
        {isReplaying && <span className="chat-loading">Loading messages...</span>}
      </div>
      {sendError && (
        <div className="chat-status chat-status-error" role="status" aria-live="polite">
          {sendError}
        </div>
      )}
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.senderClientId === clientId ? 'own' : 'other'}`}>
            <div className="chat-message-sender">{msg.senderClientId}</div>
            <div className="chat-message-text">{msg.text}</div>
            <div className="chat-message-time">{new Date(msg.serverTs).toLocaleTimeString()}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          className="chat-input"
        />
        <button onClick={handleSend} disabled={!inputValue.trim()} className="chat-send-button">
          Send
        </button>
      </div>
    </div>
  )
}
