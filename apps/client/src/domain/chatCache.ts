import type {
  ChatCursor,
  ChatMessage,
  ChatSendAck,
} from '../../../server/src/contracts'

export type PendingSend = {
  clientMessageId: string
  body: string
  status: 'pending' | 'error'
  error?: string
}

export type ChatCacheState = {
  messages: ChatMessage[]
  pendingSends: Record<string, PendingSend>
  continuationCursor?: ChatCursor
}

const compareMessages = (left: ChatMessage, right: ChatMessage): number => {
  const sequenceOrder = Number(left.sequence) - Number(right.sequence)
  return sequenceOrder !== 0 ? sequenceOrder : String(left.id).localeCompare(String(right.id))
}

const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const byId = new Map(current.map((message) => [message.id, message]))
  incoming.forEach((message) => byId.set(message.id, message))
  return Array.from(byId.values()).sort(compareMessages)
}

export const createChatCache = (): ChatCacheState => ({
  messages: [],
  pendingSends: {},
})

export const mergeChatHistory = (current: ChatMessage[], newHistory: ChatMessage[]): ChatMessage[] =>
  mergeMessages(current, newHistory)

export const mergeNewMessage = (current: ChatMessage[], message: ChatMessage): ChatMessage[] =>
  mergeMessages(current, [message])

export const addPendingSend = (
  state: ChatCacheState,
  clientMessageId: string,
  body: string,
): ChatCacheState => ({
  ...state,
  pendingSends: {
    ...state.pendingSends,
    [clientMessageId]: { clientMessageId, body, status: 'pending' },
  },
})

export const acknowledgeMessage = (
  state: ChatCacheState,
  clientMessageId: string,
  ack: ChatSendAck,
): ChatCacheState => {
  if (ack.status === 'rejected') {
    const pending = state.pendingSends[clientMessageId]
    if (!pending) return state
    return {
      ...state,
      pendingSends: {
        ...state.pendingSends,
        [clientMessageId]: { ...pending, status: 'error', error: ack.message ?? ack.code },
      },
    }
  }

  const { [clientMessageId]: _removed, ...pendingSends } = state.pendingSends
  return {
    ...state,
    messages: mergeNewMessage(state.messages, ack.message),
    pendingSends,
  }
}

export const mergeChatStateHistory = (
  state: ChatCacheState,
  messages: ChatMessage[],
  cursor?: ChatCursor,
): ChatCacheState => ({
  ...state,
  messages: mergeChatHistory(state.messages, messages),
  continuationCursor: cursor ?? state.continuationCursor,
})

export const mergeChatStateMessage = (state: ChatCacheState, message: ChatMessage): ChatCacheState => {
  const pendingId = message.clientMessageId
  const next = pendingId && state.pendingSends[pendingId]
    ? acknowledgeMessage(state, pendingId, { status: 'accepted', message, idempotent: true })
    : state

  return {
    ...next,
    messages: mergeNewMessage(next.messages, message),
  }
}

export const getPaginationCursor = (messages: ChatMessage[]): ChatCursor | undefined => {
  const oldest = messages[0]
  return oldest
    ? {
        conversationId: oldest.conversationId,
        sequence: oldest.sequence,
        messageId: oldest.id,
      }
    : undefined
}