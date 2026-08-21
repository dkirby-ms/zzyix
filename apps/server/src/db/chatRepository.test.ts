import { sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ChatConversationId } from '../contracts.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../test/postgresTestDatabase.js'
import { chatMessages } from './schema.js'
import { getConversationHistory, isAuthorizedToJoinConversation, sendMessage } from './chatRepository.js'

const SHARED_CONVERSATION_ID = '00000000-0000-4000-8000-000000000001' as ChatConversationId

describe('chat repository', () => {
  let database: PostgresTestDatabase

  beforeAll(async () => {
    database = await createPostgresTestDatabase('zzyix_chat_repository')
  })

  beforeEach(async () => {
    await database.db.execute(sql`truncate table chat_messages, conversations, principals cascade`)
    await database.db.execute(sql`
      insert into principals (id, kind, status, display_name)
      values
        ('11111111-1111-4111-8111-111111111111', 'human', 'active', 'Alice'),
        ('22222222-2222-4222-8222-222222222222', 'human', 'active', 'Bob')
    `)
    await database.db.execute(sql`
      insert into conversations (id, product_key)
      values (${SHARED_CONVERSATION_ID}, 'shared')
    `)
  })

  it('orders messages by sequence and returns a continuation cursor', async () => {
    await sendMessage(SHARED_CONVERSATION_ID, '11111111-1111-4111-8111-111111111111' as any, 'client-1', 'first message')
    await sendMessage(SHARED_CONVERSATION_ID, '22222222-2222-4222-8222-222222222222' as any, 'client-2', 'second message')

    const page = await getConversationHistory(SHARED_CONVERSATION_ID, undefined, 1)

    expect(page.messages).toHaveLength(1)
    expect(page.messages[0]?.body).toBe('first message')
    expect(page.cursor).toEqual({
      conversationId: SHARED_CONVERSATION_ID,
      sequence: 1,
      messageId: page.messages[0].id,
    })
    expect(page.hasMore).toBe(true)

    const nextPage = await getConversationHistory(SHARED_CONVERSATION_ID, page.cursor, 1)
    expect(nextPage.messages).toHaveLength(1)
    expect(nextPage.messages[0]?.body).toBe('second message')
    expect(nextPage.cursor).toEqual({
      conversationId: SHARED_CONVERSATION_ID,
      sequence: 2,
      messageId: nextPage.messages[0].id,
    })
  })

  it('deduplicates retries by conversation, principal, and client message id', async () => {
    const first = await sendMessage(SHARED_CONVERSATION_ID, '11111111-1111-4111-8111-111111111111' as any, 'retry-1', 'hello there')
    const second = await sendMessage(SHARED_CONVERSATION_ID, '11111111-1111-4111-8111-111111111111' as any, 'retry-1', 'hello there again')

    expect(second.idempotent).toBe(true)
    expect(second.message.id).toBe(first.message.id)
    expect(second.message.body).toBe('hello there')

    const rows = await database.db.select().from(chatMessages)
    expect(rows).toHaveLength(1)
  })

  it('uses Deleted user when a principal reference is nullified', async () => {
    await database.db.execute(sql`
      insert into chat_messages (id, conversation_id, principal_id, sequence, client_message_id, body)
      values (
        '33333333-3333-4333-8333-333333333333',
        ${SHARED_CONVERSATION_ID},
        null,
        1,
        'deleted-client-1',
        'ghost message'
      )
    `)

    const history = await getConversationHistory(SHARED_CONVERSATION_ID, undefined, 10)
    expect(history.messages[0]?.authorProfile.displayName).toBe('Deleted user')
    expect(history.messages[0]?.principalId).toBeNull()
  })

  it('authorizes only active principals for shared chat access', async () => {
    await expect(isAuthorizedToJoinConversation('11111111-1111-4111-8111-111111111111' as any)).resolves.toBe(true)
    await expect(isAuthorizedToJoinConversation('99999999-9999-4999-8999-999999999999' as any)).resolves.toBe(false)

    await database.db.execute(sql`
      update principals
      set status = 'deleted',
          deletion_requested_at = now(),
          deletion_completed_at = now()
      where id = '11111111-1111-4111-8111-111111111111'
    `)
    await expect(isAuthorizedToJoinConversation('11111111-1111-4111-8111-111111111111' as any)).resolves.toBe(false)
  })

  it('replays from a cursor without duplicating earlier messages', async () => {
    await sendMessage(SHARED_CONVERSATION_ID, '11111111-1111-4111-8111-111111111111' as any, 'c-1', 'one')
    await sendMessage(SHARED_CONVERSATION_ID, '22222222-2222-4222-8222-222222222222' as any, 'c-2', 'two')

    const firstPage = await getConversationHistory(SHARED_CONVERSATION_ID, undefined, 10)
    const afterFirst = await getConversationHistory(SHARED_CONVERSATION_ID, firstPage.cursor, 10)

    expect(afterFirst.messages).toHaveLength(0)
    expect(afterFirst.cursor).toBeUndefined()
    expect(firstPage.messages.map((message) => message.body)).toEqual(['one', 'two'])
  })
})
