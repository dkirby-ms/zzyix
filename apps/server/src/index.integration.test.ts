import { describe, expect, it, vi } from 'vitest'
import { applyPlaceTile, finalizeParticipantPresence, getSessionState, initializeParticipantPresence } from './index'
import { vec2 } from './domain/math2d'

let sessionCounter = 0

const nextSessionId = (): string => {
  sessionCounter += 1
  return `integration-session-${sessionCounter}`
}

describe('authoritative snapshot reconciliation', () => {
  it('builds snapshot payload from canonical server tiles for first connect', () => {
    const sessionId = nextSessionId()
    const state = getSessionState(sessionId)

    const place = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'authoritative-client',
    )

    expect(place.ack.rejected).toBe(false)

    const joinedAt = 10
    state.clients.set('client-1', { clientId: 'client-1', joinedAt })
    const snapshot = {
      session: state.session,
      clients: [...state.clients.values()],
      lastOpSeq: state.lastOpSeq,
    }

    expect(snapshot.session.id).toBe(sessionId)
    expect(snapshot.session.tiles).toHaveLength(1)
    expect(snapshot.clients).toEqual([{ clientId: 'client-1', joinedAt }])
    expect(snapshot.lastOpSeq).toBe(1)
  })

  it('reconnect snapshot reflects latest canonical session state', () => {
    const sessionId = nextSessionId()
    const state = getSessionState(sessionId)

    const firstPlace = applyPlaceTile(
      state,
      {
        shape: 'square',
        color: '#123',
        material: 'glass',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(firstPlace.ack.rejected).toBe(false)

  state.clients.set('client-a', { clientId: 'client-a', joinedAt: 5 })

    // Simulate reconnect: same session id resolves to the same authoritative state.
  const reconnectState = getSessionState(sessionId)
    reconnectState.clients.set('client-a', { clientId: 'client-a', joinedAt: 15 })

    const reconnectSnapshot = {
      session: reconnectState.session,
      clients: [...reconnectState.clients.values()],
      lastOpSeq: reconnectState.lastOpSeq,
    }

    expect(reconnectSnapshot.session.id).toBe(sessionId)
    expect(reconnectSnapshot.session.tiles).toHaveLength(1)
    expect(reconnectSnapshot.clients).toEqual([{ clientId: 'client-a', joinedAt: 15 }])
    expect(reconnectSnapshot.lastOpSeq).toBe(1)
  })

  it('initializes participant presence from persisted replay state', async () => {
    const repository = {
      markParticipantJoined: vi.fn().mockResolvedValue({ clientId: 'client-a', joinedAt: 1_000 }),
      loadSessionReplayRecord: vi.fn().mockResolvedValue({
        session: { id: 'session-1', tiles: [], createdAt: 10, updatedAt: 20 },
        clients: [{ clientId: 'client-a', joinedAt: 1_000 }],
        lastOpSeq: 3,
        snapshotOpSeq: 3,
        replayedOperations: [],
      }),
      listActiveParticipants: vi.fn(),
      markParticipantLeft: vi.fn(),
    }

    const result = await initializeParticipantPresence('session-1', 'client-a', 1_000, repository)

    expect(repository.markParticipantJoined).toHaveBeenCalledWith('session-1', 'client-a', 1_000)
    expect(repository.loadSessionReplayRecord).toHaveBeenCalledWith('session-1')
    expect(result).toEqual({
      joinedClient: { clientId: 'client-a', joinedAt: 1_000 },
      snapshot: {
        session: { id: 'session-1', tiles: [], createdAt: 10, updatedAt: 20 },
        clients: [{ clientId: 'client-a', joinedAt: 1_000 }],
        lastOpSeq: 3,
      },
    })
  })

  it('finalizes participant presence and requests cleanup when the room becomes empty', async () => {
    const repository = {
      markParticipantJoined: vi.fn(),
      loadSessionReplayRecord: vi.fn(),
      markParticipantLeft: vi.fn().mockResolvedValue(undefined),
      listActiveParticipants: vi.fn().mockResolvedValue([]),
    }

    const result = await finalizeParticipantPresence('session-1', 'client-a', 2_000, repository)

    expect(repository.markParticipantLeft).toHaveBeenCalledWith('session-1', 'client-a', 2_000)
    expect(repository.listActiveParticipants).toHaveBeenCalledWith('session-1')
    expect(result).toEqual({ activeClients: [], shouldCleanup: true })
  })
})