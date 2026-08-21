import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type {
  ChatConversationId,
  ChatCursor,
  ChatMessage,
  ChatMessageId,
  ChatSequence,
} from '../contracts.js'
import { getDatabaseBundle } from './client.js'
import { chatMessages, principals } from './schema.js'

export type ChatHistoryPage = {
  messages: ChatMessage[]
  cursor?: ChatCursor
  hasMore: boolean
}

export const SHARED_CHAT_CONVERSATION_ID = '00000000-0000-4000-8000-000000000001' as ChatConversationId

const normalizeConversationId = (conversationId: ChatConversationId): string => String(conversationId)

const toSafeMessage = (row: {
  id: string
  conversationId: string
  principalId: string | null
  sequence: number
  clientMessageId: string
  body: string
  createdAt: Date | string | null
  displayName: string | null
  email: string | null
}): ChatMessage => ({
  id: row.id as ChatMessageId,
  conversationId: row.conversationId as ChatConversationId,
  principalId: row.principalId,
  clientMessageId: row.clientMessageId,
  authorProfile: row.displayName === null || row.displayName === 'Deleted user'
    ? { displayName: 'Deleted user' }
    : {
        displayName: row.displayName ?? undefined,
        ...(row.email ? { email: row.email } : {}),
      },
  body: row.body,
  sequence: row.sequence as ChatSequence,
  createdAt: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
})

export const isAuthorizedToJoinConversation = async (principalId: string): Promise<boolean> => {
  const { db } = getDatabaseBundle()
  const [principal] = await db
    .select({ id: principals.id, status: principals.status })
    .from(principals)
    .where(eq(principals.id, principalId))
    .limit(1)

  return principal?.status === 'active'
}

export function getConversationHistory(
  conversationId: ChatConversationId,
  cursorOrLimit?: ChatCursor | number,
  maybeLimit?: number,
): Promise<ChatHistoryPage>
export function getConversationHistory(
  conversationId: ChatConversationId,
  cursor?: ChatCursor,
  limit?: number,
): Promise<ChatHistoryPage>
export async function getConversationHistory(
  conversationId: ChatConversationId,
  cursorOrLimit?: ChatCursor | number,
  maybeLimit?: number,
): Promise<ChatHistoryPage> {
  const { db } = getDatabaseBundle()
  const cursor = typeof cursorOrLimit === 'number' ? undefined : cursorOrLimit
  const limit = typeof cursorOrLimit === 'number' ? cursorOrLimit : (maybeLimit ?? 50)
  const normalizedLimit = Math.max(1, Math.min(limit, 500))

  if (cursor && cursor.conversationId !== conversationId) {
    return { messages: [], hasMore: false }
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      conversationId: chatMessages.conversationId,
      principalId: chatMessages.principalId,
      sequence: chatMessages.sequence,
      clientMessageId: chatMessages.clientMessageId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      displayName: principals.displayName,
      email: principals.email,
    })
    .from(chatMessages)
    .leftJoin(principals, eq(chatMessages.principalId, principals.id))
    .where(and(
      eq(chatMessages.conversationId, normalizeConversationId(conversationId)),
      cursor ? gt(chatMessages.sequence, cursor.sequence) : undefined,
    ))
    .orderBy(asc(chatMessages.sequence))
    .limit(normalizedLimit + 1)

  const hasMore = rows.length > normalizedLimit
  const limitedRows = hasMore ? rows.slice(0, normalizedLimit) : rows
  const messages = limitedRows.map(toSafeMessage)
  const lastMessage = limitedRows.at(-1)
  const nextCursor = lastMessage
    ? {
        conversationId: lastMessage.conversationId as ChatConversationId,
        sequence: lastMessage.sequence as ChatSequence,
        messageId: lastMessage.id as ChatMessageId,
      }
    : undefined

  return {
    messages,
    cursor: nextCursor,
    hasMore,
  }
}

export const sendMessage = async (
  conversationId: ChatConversationId,
  principalId: string,
  clientMessageId: string,
  body: string,
): Promise<{ message: ChatMessage; idempotent: boolean }> => {
  const { db } = getDatabaseBundle()

  if (body.length > 2000) {
    throw new Error('Chat message body exceeds 2000 characters.')
  }

  const authorized = await isAuthorizedToJoinConversation(principalId)
  if (!authorized) {
    throw new Error('Unauthorized chat principal.')
  }

  const normalizedConversationId = normalizeConversationId(conversationId)
  const existingRow = await db
    .select({
      id: chatMessages.id,
      conversationId: chatMessages.conversationId,
      principalId: chatMessages.principalId,
      sequence: chatMessages.sequence,
      clientMessageId: chatMessages.clientMessageId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      displayName: principals.displayName,
      email: principals.email,
    })
    .from(chatMessages)
    .leftJoin(principals, eq(chatMessages.principalId, principals.id))
    .where(and(
      eq(chatMessages.conversationId, normalizedConversationId),
      eq(chatMessages.principalId, principalId),
      eq(chatMessages.clientMessageId, clientMessageId),
    ))
    .limit(1)

  if (existingRow[0]) {
    return {
      message: toSafeMessage(existingRow[0]),
      idempotent: true,
    }
  }

  const sequenceResult = await db.execute(sql`
    select coalesce(max(sequence), 0) + 1 as next_sequence
    from chat_messages
    where conversation_id = ${normalizedConversationId}::uuid
  `)

  const nextSequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1)

  const inserted = await db.insert(chatMessages)
    .values({
      id: randomUUID(),
      conversationId: normalizedConversationId,
      principalId,
      sequence: nextSequence,
      clientMessageId,
      body,
    })
    .returning({
      id: chatMessages.id,
      conversationId: chatMessages.conversationId,
      principalId: chatMessages.principalId,
      sequence: chatMessages.sequence,
      clientMessageId: chatMessages.clientMessageId,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })

  const [row] = inserted
  const profileRow = await db
    .select({ displayName: principals.displayName, email: principals.email })
    .from(principals)
    .where(eq(principals.id, principalId))
    .limit(1)

  return {
    message: toSafeMessage({
      ...row,
      displayName: profileRow[0]?.displayName ?? null,
      email: profileRow[0]?.email ?? null,
    }),
    idempotent: false,
  }
}
