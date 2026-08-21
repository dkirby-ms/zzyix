import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../server/src/contracts'
import {
  acknowledgeMessage,
  addPendingSend,
  createChatCache,
  getPaginationCursor,
  mergeChatHistory,
  mergeChatStateMessage,
} from './chatCache'

const message = (id: string, sequence: number, clientMessageId = `client-${id}`): ChatMessage => ({
  id: id as ChatMessage['id'],
  conversationId: 'conversation' as ChatMessage['conversationId'],
  principalId: 'principal',
  clientMessageId,
  authorProfile: { displayName: 'Ada' },
  body: id,
  sequence: sequence as ChatMessage['sequence'],
  createdAt: sequence,
})

describe('chatCache', () => {
  it('merges history and live messages in sequence order without duplicates', () => {
    const merged = mergeChatHistory(
      [message('two', 2), message('one', 1)],
      [message('two', 2), message('three', 3)],
    )

    expect(merged.map((entry) => entry.id)).toEqual(['one', 'two', 'three'])
  })

  it('suppresses replayed messages and returns the oldest pagination cursor', () => {
    const merged = mergeChatHistory([], [message('three', 3), message('one', 1), message('two', 2)])
    const replayed = mergeChatHistory(merged, [message('one', 1), message('two', 2)])

    expect(replayed).toHaveLength(3)
    expect(getPaginationCursor(replayed)).toMatchObject({ sequence: 1, messageId: 'one' })
  })

  it('removes an optimistic send when its acknowledgement arrives', () => {
    const pending = addPendingSend(createChatCache(), 'retry-1', 'hello')
    const acknowledged = acknowledgeMessage(pending, 'retry-1', {
      status: 'accepted',
      message: message('server-1', 1, 'retry-1'),
      idempotent: true,
    })

    expect(acknowledged.pendingSends).toEqual({})
    expect(acknowledged.messages.map((entry) => entry.id)).toEqual(['server-1'])
  })

  it('reconciles an accepted live replay with a pending send', () => {
    const pending = addPendingSend(createChatCache(), 'retry-2', 'hello again')
    const reconciled = mergeChatStateMessage(pending, message('server-2', 2, 'retry-2'))
    const replayed = mergeChatStateMessage(reconciled, message('server-2', 2, 'retry-2'))

    expect(replayed.pendingSends).toEqual({})
    expect(replayed.messages).toHaveLength(1)
  })
})