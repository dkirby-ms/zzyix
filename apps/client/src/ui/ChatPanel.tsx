import { useState } from 'react'
import type { ChatCursor, ChatMessage } from '../../../server/src/contracts'
import type { ConnectionStatus } from '../network/useConnectionStatus'
import type { PendingSend } from '../domain/chatCache'

type ChatPanelProps = {
  messages: ChatMessage[]
  pending: PendingSend[]
  connectionStatus: ConnectionStatus
  onSend: (body: string) => void
  onLoadMoreHistory: (cursor?: ChatCursor) => void
  loading?: boolean
  error?: string
}

const MAX_BODY_LENGTH = 2000

const statusLabel: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  disconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  error: 'Connection error',
}

export function ChatPanel({
  messages,
  pending,
  connectionStatus,
  onSend,
  onLoadMoreHistory,
  loading = false,
  error,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [validationError, setValidationError] = useState<string | undefined>()
  const canSend = connectionStatus === 'connected'

  const sendDraft = (): void => {
    const body = draft.trim()
    if (!body) {
      setValidationError('Enter a message before sending.')
      return
    }
    if (body.length > MAX_BODY_LENGTH) {
      setValidationError(`Messages must be ${MAX_BODY_LENGTH} characters or fewer.`)
      return
    }
    setValidationError(undefined)
    onSend(body)
    setDraft('')
  }

  return (
    <aside className="chat-panel" aria-label="Community chat">
      <div className="chat-panel-header">
        <div>
          <p className="chat-panel-kicker">Conversation</p>
          <h2>Chat</h2>
        </div>
        <span className={`chat-status chat-status--${connectionStatus}`} aria-label={`Chat connection: ${statusLabel[connectionStatus]}`}>
          <span aria-hidden="true" />
          {statusLabel[connectionStatus]}
        </span>
      </div>

      {error && <p className="chat-panel-error" role="alert">{error}</p>}
      {loading ? (
        <p className="chat-panel-state" aria-live="polite">Loading conversation...</p>
      ) : messages.length === 0 ? (
        <p className="chat-panel-state">No messages yet. Start the conversation.</p>
      ) : (
        <div className="chat-message-list" role="log" aria-live="polite" aria-label="Chat messages">
          {messages.map((message) => (
            <article className="chat-message" key={message.id}>
              <div className="chat-message-meta">
                <strong>{message.authorProfile.displayName ?? 'Deleted user'}</strong>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </time>
              </div>
              <p>{message.body}</p>
            </article>
          ))}
          {pending.map((send) => (
            <article className="chat-message chat-message--pending" key={send.clientMessageId}>
              <div className="chat-message-meta"><strong>You</strong><span>{send.status === 'error' ? 'Not sent' : 'Sending...'}</span></div>
              <p>{send.body}</p>
              {send.error && <small role="alert">{send.error}</small>}
            </article>
          ))}
        </div>
      )}

      <button type="button" className="chat-load-more" onClick={() => onLoadMoreHistory(messages.length > 0 ? {
        conversationId: messages[0].conversationId,
        sequence: messages[0].sequence,
        messageId: messages[0].id,
      } : undefined)} disabled={loading || messages.length === 0}>
        Load older messages
      </button>

      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendDraft() }}>
        <label htmlFor="chat-message">Message</label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setValidationError(undefined) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              sendDraft()
            }
          }}
          placeholder={canSend ? 'Write a message...' : 'Reconnect to send a message...'}
          aria-describedby="chat-message-count chat-message-error"
        />
        <div className="chat-composer-footer">
          <span id="chat-message-count">{draft.length}/{MAX_BODY_LENGTH}</span>
          <button type="submit" disabled={!canSend}>Send</button>
        </div>
        {validationError && <p id="chat-message-error" className="chat-panel-error" role="alert">{validationError}</p>}
      </form>
    </aside>
  )
}