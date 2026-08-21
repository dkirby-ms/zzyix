import { describe, expect, it, vi } from 'vitest'
import type { ChatMessage, SocketData } from '../contracts.js'
import { handleChatJoin, handleChatSend } from './chatHandlers.js'

const repository = vi.hoisted(() => ({
  getConversationHistory: vi.fn(),
  sendMessage: vi.fn(),
}))

const rooms = vi.hoisted(() => ({
  canAccessChatConversation: vi.fn(),
  chatRoomName: vi.fn((conversationId: string) => `chat:${conversationId}`),
  normalizeChatCursor: vi.fn((cursor: unknown) => cursor),
}))

vi.mock('../db/chatRepository.js', () => repository)
vi.mock('./chatRooms.js', () => rooms)

const conversationId = '00000000-0000-0000-0000-000000000001' as never
const message = {
  id: 'message-1',
  conversationId,
  principalId: 'principal-1',
  clientMessageId: 'client-1',
  authorProfile: { displayName: 'Alice' },
  body: 'hello',
  sequence: 1,
  createdAt: 1,
} as ChatMessage

const createSocket = () => {
  const emitted: Array<{ event: string; payload: unknown }> = []
  const socket = {
    data: { principalId: 'principal-1' } as SocketData,
    join: vi.fn(),
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn((event: string, payload: unknown) => { emitted.push({ event, payload }) }),
  }
  return { socket, emitted }
}

describe('chat socket handlers', () => {
  it('rejects unauthorized joins and sends', async () => {
    rooms.canAccessChatConversation.mockResolvedValue(false)
    const { socket } = createSocket()
    const joinAck = vi.fn()
    const sendAck = vi.fn()

    await handleChatJoin(socket as never, { conversationId }, joinAck)
    await handleChatSend(socket as never, { conversationId, body: 'hello', clientMessageId: 'client-1' }, sendAck)

    expect(joinAck).toHaveBeenCalledWith(expect.objectContaining({ code: 'unauthorized' }))
    expect(sendAck).toHaveBeenCalledWith(expect.objectContaining({ code: 'unauthorized' }))
    expect(repository.sendMessage).not.toHaveBeenCalled()
  })

  it('acknowledges idempotent retries without broadcasting a second event', async () => {
    rooms.canAccessChatConversation.mockResolvedValue(true)
    repository.sendMessage.mockResolvedValue({ message, idempotent: true })
    const { socket, emitted } = createSocket()
    const ack = vi.fn()

    await handleChatSend(socket as never, { conversationId, body: 'hello', clientMessageId: 'client-1' }, ack)

    expect(ack).toHaveBeenCalledWith({ status: 'accepted', message, idempotent: true })
    expect(socket.to).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })
})