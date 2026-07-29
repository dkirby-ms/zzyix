import type { CanvasSizePreset, CreateSessionResponse, OwnershipCommandResponse } from '../../../server/src/contracts'

const SESSION_STORAGE_KEY = 'zzyix_session_id'
const CLIENT_STORAGE_KEY = 'zzyix_client_id'

export type CreateSessionOptions = {
  canvasPreset: CanvasSizePreset
}

export type CreatedSession = CreateSessionResponse

export type ChunkId = `${number}:${number}`

export const toChunkId = (chunkX: number, chunkY: number): ChunkId => `${chunkX}:${chunkY}`

export const parseChunkId = (chunkId: ChunkId): { x: number; y: number } => {
  const [rawX, rawY] = chunkId.split(':')
  return {
    x: Number(rawX),
    y: Number(rawY),
  }
}

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

export const createSession = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
  options?: CreateSessionOptions,
): Promise<CreatedSession> => {
  const response = await authenticatedFetch(`${apiOrigin}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options ?? {}),
  })
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`)

  return response.json() as Promise<CreatedSession>
}

export const claimPatch = async (
  authenticatedFetch: typeof fetch,
  apiOrigin: string,
  patchId: string,
): Promise<void> => {
  const response = await authenticatedFetch(`${apiOrigin}/ownership/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: crypto.randomUUID(), patchId }),
  })
  const result = await response.json() as OwnershipCommandResponse
  if (!response.ok || result.status !== 'succeeded') {
    throw new Error('Failed to claim the new canvas patch')
  }
}

export const listSessions = async (authenticatedFetch: typeof fetch, apiOrigin: string): Promise<SessionSummary[]> => {
  const response = await authenticatedFetch(`${apiOrigin}/sessions`, { method: 'GET' })
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

export const ensureSession = async (authenticatedFetch: typeof fetch, apiOrigin: string): Promise<string> => {
  const stored = getStoredSessionId()
  if (stored) return stored

  const created = await createSession(authenticatedFetch, apiOrigin)
  setStoredSessionId(created.session.id)
  return created.session.id
}

export const ensureClientId = (): string => {
  const stored = localStorage.getItem(CLIENT_STORAGE_KEY)
  if (stored) return stored

  const id = crypto.randomUUID()
  localStorage.setItem(CLIENT_STORAGE_KEY, id)
  return id
}