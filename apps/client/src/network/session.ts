import { resolveServerUrl } from './serverUrl'

const SERVER_URL = resolveServerUrl()
const SESSION_STORAGE_KEY = 'zzyix_session_id'
const CLIENT_STORAGE_KEY = 'zzyix_client_id'

export type SessionSummary = {
  id: string
  displayName: string
  connectedUserCount: number
  canvasSize: {
    width: number
    height: number
  }
}

type ListSessionsResponse = {
  sessions: Array<{
    id: string
    displayName?: string
    connectedUserCount?: number
    participantCount?: number
    canvasSize?: {
      width?: number
      height?: number
    }
  }>
}

export const getStoredSessionId = (): string | null => sessionStorage.getItem(SESSION_STORAGE_KEY)

export const setStoredSessionId = (sessionId: string): void => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
}

export const clearStoredSessionId = (): void => {
  sessionStorage.removeItem(SESSION_STORAGE_KEY)
}

export const createSession = async (): Promise<string> => {
  const response = await fetch(`${SERVER_URL}/sessions`, { method: 'POST' })
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`)

  const data = (await response.json()) as { session: { id: string } }
  return data.session.id
}

export const listSessions = async (): Promise<SessionSummary[]> => {
  const response = await fetch(`${SERVER_URL}/sessions`, { method: 'GET' })
  if (!response.ok) throw new Error(`Failed to list sessions: ${response.status}`)

  const data = (await response.json()) as ListSessionsResponse
  const sessions = Array.isArray(data.sessions) ? data.sessions : []

  return sessions
    .filter((session): session is ListSessionsResponse['sessions'][number] => typeof session.id === 'string' && session.id.length > 0)
    .map((session) => {
      const connectedUserCount = Number.isFinite(session.connectedUserCount)
        ? Number(session.connectedUserCount)
        : Number.isFinite(session.participantCount)
          ? Number(session.participantCount)
          : 0

      const width = Number.isFinite(session.canvasSize?.width) ? Number(session.canvasSize?.width) : 0
      const height = Number.isFinite(session.canvasSize?.height) ? Number(session.canvasSize?.height) : 0

      return {
        id: session.id,
        displayName: session.displayName?.trim() ? session.displayName : `Canvas ${session.id.slice(0, 8)}`,
        connectedUserCount,
        canvasSize: {
          width,
          height,
        },
      }
    })
}

export const ensureSession = async (): Promise<string> => {
  const stored = getStoredSessionId()
  if (stored) return stored

  const sessionId = await createSession()
  setStoredSessionId(sessionId)
  return sessionId
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem(CLIENT_STORAGE_KEY)
  if (stored) return stored

  const id = crypto.randomUUID()
  localStorage.setItem(CLIENT_STORAGE_KEY, id)
  return id
}