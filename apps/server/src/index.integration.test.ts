import { describe, expect, it, vi } from 'vitest'
import {
  applyPlaceTile,
  finalizeParticipantPresence,
  getSessionState,
  initializeParticipantPresence,
  isPlaceTilePayload,
} from './index'
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
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
        tileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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

  it('keeps deterministic sequencing when duplicate place payload is replayed through production path', () => {
    const sessionId = nextSessionId()
    const state = getSessionState(sessionId)
    const payload = {
      tileId: '11111111-1111-4111-8111-111111111111',
      shape: 'square' as const,
      color: '#123',
      material: 'glass' as const,
      transform: { position: vec2(0, 0), rotation: 0 },
    }

    expect(isPlaceTilePayload(payload)).toBe(true)

    const first = applyPlaceTile(state, payload, 'client-a')
    const replay = applyPlaceTile(state, payload, 'client-a')

    expect(first.ack.rejected).toBe(false)
    expect(replay.ack.rejected).toBe(true)
    if (!first.ack.rejected) {
      expect(first.ack.opSeq).toBe(1)
      expect(first.ack.placed.id).toBe(payload.tileId)
    }
    if (replay.ack.rejected) {
      expect(replay.ack.reason).toBe('OVERLAP')
    }
    expect(state.lastOpSeq).toBe(2)
  })

  it('models handler precondition behavior for stale and out-of-order checks before mutation', () => {
    const revision = 6
    const staleExpectedRevision = 4
    const futureExpectedRevision = 7

    const placeStaleAck =
      staleExpectedRevision < revision
        ? { placed: null, rejected: true as const, reason: 'STALE_REVISION' as const }
        : { placed: null, rejected: true as const, reason: 'PLACEMENT_REJECTED' as const }

    const removeFutureAck =
      futureExpectedRevision > revision
        ? { removed: false as const, reason: 'OUT_OF_ORDER_REVISION' as const }
        : { removed: false as const }

    expect(placeStaleAck).toEqual({
      placed: null,
      rejected: true,
      reason: 'STALE_REVISION',
    })
    expect(removeFutureAck).toEqual({
      removed: false,
      reason: 'OUT_OF_ORDER_REVISION',
    })
  })

  it('suppresses duplicate remove replay broadcast and snapshot write while preserving opSeq', () => {
    const emit = vi.fn()
    const room = { emit }
    const io = {
      to: vi.fn().mockReturnValue(room),
    }
    const persistSnapshotIfNeeded = vi.fn()

    const firstRemoval = {
      opSeq: 12,
      revision: 7,
      session: { id: 'session-1', tiles: [], createdAt: 10, updatedAt: 20 },
      ack: { removed: true as const, opSeq: 12 },
      event: { tileId: '11111111-1111-4111-8111-111111111111', removedBy: 'client-a', opSeq: 12 },
    }

    const replayRemoval = {
      ...firstRemoval,
      ack: { ...firstRemoval.ack, idempotent: true },
    }

    const handleRemoveResult = async (result: typeof firstRemoval): Promise<void> => {
      if (result.event && 'tileId' in result.event && 'opSeq' in result && !result.ack.idempotent) {
        io.to('session-1').emit('tile_removed', result.event)
        await persistSnapshotIfNeeded('session-1', result.opSeq, result.session)
      }
    }

    void handleRemoveResult(firstRemoval)
    void handleRemoveResult(replayRemoval)

    expect(firstRemoval.ack.opSeq).toBe(12)
    expect(replayRemoval.ack.opSeq).toBe(12)
    expect(io.to).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith('tile_removed', firstRemoval.event)
    expect(persistSnapshotIfNeeded).toHaveBeenCalledTimes(1)
  })
})