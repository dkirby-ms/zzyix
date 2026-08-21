import type { ChatConversationId, ChatCursor } from '../contracts.js'
import { isAuthorizedToJoinConversation } from '../db/chatRepository.js'

export const chatRoomName = (conversationId: ChatConversationId): string => `chat:${String(conversationId)}`

export const canAccessChatConversation = async (principalId: string): Promise<boolean> => {
  return isAuthorizedToJoinConversation(principalId)
}

export const normalizeChatCursor = (cursor?: ChatCursor): ChatCursor | undefined => {
  if (!cursor) return undefined
  return {
    conversationId: cursor.conversationId,
    sequence: cursor.sequence,
    messageId: cursor.messageId,
  }
}
