import type { Socket } from 'socket.io'
import { getConversationHistory, sendMessage } from '../db/chatRepository.js'
import type {
  ChatConversationId,
  ChatCursor,
  ChatErrorPayload,
  ChatJoinAck,
  ChatMessageAcceptedPayload,
  ChatSendAck,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../contracts.js'
import { canAccessChatConversation, chatRoomName, normalizeChatCursor } from './chatRooms.js'

const isValidConversationId = (value: unknown): value is ChatConversationId =>
  typeof value === 'string' && value.length > 0

const buildChatError = (conversationId: ChatConversationId, code: ChatErrorPayload['code'], message?: string): ChatErrorPayload => ({
  conversationId,
  code,
  message,
})

// Product contract: 10 sends per rolling minute per principal. See docs/chat-product-contract.md.
const CHAT_RATE_LIMIT_MAX_SENDS = 10
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000
const chatSendTimestampsByPrincipal = new Map<string, number[]>()

const checkChatRateLimit = (principalId: string, now = Date.now()): { allowed: boolean; retryAfterSeconds?: number } => {
  const windowStart = now - CHAT_RATE_LIMIT_WINDOW_MS
  const recentSends = (chatSendTimestampsByPrincipal.get(principalId) ?? []).filter((timestamp) => timestamp > windowStart)

  if (recentSends.length >= CHAT_RATE_LIMIT_MAX_SENDS) {
    chatSendTimestampsByPrincipal.set(principalId, recentSends)
    const retryAfterSeconds = Math.max(1, Math.ceil((recentSends[0] + CHAT_RATE_LIMIT_WINDOW_MS - now) / 1000))
    return { allowed: false, retryAfterSeconds }
  }

  recentSends.push(now)
  chatSendTimestampsByPrincipal.set(principalId, recentSends)
  return { allowed: true }
}

/** Test-only reset for the in-memory rate limit window. */
export const resetChatRateLimiterForTests = (): void => {
  chatSendTimestampsByPrincipal.clear()
}

export const handleChatJoin = async (
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  payload: unknown,
  ack: (response: ChatJoinAck | ChatErrorPayload) => void,
): Promise<void> => {
  if (!isValidConversationId((payload as { conversationId?: unknown })?.conversationId)) {
    ack(buildChatError('' as ChatConversationId, 'invalid_request', 'Invalid chat conversation id.'))
    return
  }

  const conversationId = (payload as { conversationId: ChatConversationId }).conversationId
  const principalId = socket.data.principalId
  const allowed = await canAccessChatConversation(principalId)
  if (!allowed) {
    ack(buildChatError(conversationId, 'unauthorized', 'You are not authorized to join this conversation.'))
    return
  }

  const cursor = normalizeChatCursor((payload as { cursor?: ChatCursor })?.cursor)
  const history = await getConversationHistory(conversationId, cursor, 50)
  await socket.join(chatRoomName(conversationId))
  socket.data.chatSubscribed = { conversationId, cursor: history.cursor }

  const response: ChatJoinAck = {
    conversationId,
    messages: history.messages,
    cursor: history.cursor,
  }
  ack(response)
}

export const handleChatSend = async (
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  payload: unknown,
  ack: (response: ChatSendAck) => void,
): Promise<void> => {
  if (!isValidConversationId((payload as { conversationId?: unknown })?.conversationId)
    || typeof (payload as { body?: unknown })?.body !== 'string'
    || typeof (payload as { clientMessageId?: unknown })?.clientMessageId !== 'string') {
    ack({ status: 'rejected', code: 'invalid_request', message: 'Invalid chat payload.' })
    return
  }

  const conversationId = (payload as { conversationId: ChatConversationId }).conversationId
  const body = (payload as { body: string }).body.trim()
  const clientMessageId = (payload as { clientMessageId: string }).clientMessageId

  if (body.length === 0 || body.length > 2000) {
    ack({ status: 'rejected', code: 'invalid_request', message: 'Message body must be between 1 and 2000 characters.' })
    return
  }

  const principalId = socket.data.principalId
  const allowed = await canAccessChatConversation(principalId)
  if (!allowed) {
    ack({ status: 'rejected', code: 'unauthorized', message: 'You are not authorized to send messages.' })
    return
  }

  const rateLimit = checkChatRateLimit(principalId)
  if (!rateLimit.allowed) {
    ack({
      status: 'rejected',
      code: 'rate_limited',
      message: 'Too many messages sent. Please wait before sending another.',
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    })
    return
  }

  try {
    const result = await sendMessage(conversationId, principalId, clientMessageId, body)
    if (result.idempotent) {
      ack({ status: 'accepted', message: result.message, idempotent: true })
      return
    }
    const roomName = chatRoomName(conversationId)
    const acceptedPayload: ChatMessageAcceptedPayload = {
      conversationId,
      message: result.message,
    }
    socket.to(roomName).emit('chat_message_accepted', acceptedPayload)
    socket.emit('chat_message_accepted', acceptedPayload)
    ack({ status: 'accepted', message: result.message, idempotent: result.idempotent })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Message could not be saved.'
    ack({ status: 'rejected', code: 'invalid_request', message })
  }
}

export const handleChatDisconnect = async (
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
): Promise<void> => {
  const conversationId = socket.data.chatSubscribed?.conversationId
  if (conversationId) {
    await socket.leave(chatRoomName(conversationId))
    socket.data.chatSubscribed = undefined
  }
}

export const handleSocketReconnect = async (
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
): Promise<void> => {
  const conversationId = socket.data.chatSubscribed?.conversationId
  if (!conversationId) return
  const cursor = socket.data.chatSubscribed?.cursor
  const history = await getConversationHistory(conversationId, cursor, 50)
  if (history.messages.length > 0) {
    socket.emit('chat_message_accepted', {
      conversationId,
      message: history.messages[0],
    })
  }
}
