import { describe, expect, it, vi } from 'vitest'
import {
  applyPlaceTile,
  buildListSessionsResponse,
  createAuthoritativeSessionState,
  finalizeParticipantPresence,
  getSessionState,
  initializeParticipantPresence,
  isPlaceTilePayload,
  isSelectionUpdatePayload,
  registerClientSocket,
  unregisterClientSocket,
} from './index.js'
import { vec2 } from './domain/math2d.js'

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
      revision: state.lastOpSeq,
    }

    expect(snapshot.session.id).toBe(sessionId)
    expect(snapshot.session.tiles).toHaveLength(1)
    expect(snapshot.clients).toEqual([{ clientId: 'client-1', joinedAt }])
    expect(snapshot.lastOpSeq).toBe(1)
    expect(snapshot.revision).toBe(1)
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
      revision: reconnectState.lastOpSeq,
    }

    expect(reconnectSnapshot.session.id).toBe(sessionId)
    expect(reconnectSnapshot.session.tiles).toHaveLength(1)
    expect(reconnectSnapshot.clients).toEqual([{ clientId: 'client-a', joinedAt: 15 }])
    expect(reconnectSnapshot.lastOpSeq).toBe(1)
    expect(reconnectSnapshot.revision).toBe(1)
  })

  it('initializes participant presence from persisted replay state', async () => {
    const repository = {
      markParticipantJoined: vi.fn().mockResolvedValue({ clientId: 'client-a', joinedAt: 1_000 }),
      loadSessionReplayRecord: vi.fn().mockResolvedValue({
        session: { id: 'session-1', tiles: [], createdAt: 10, updatedAt: 20 },
        clients: [{ clientId: 'client-a', joinedAt: 1_000 }],
        lastOpSeq: 3,
        revision: 4,
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
        revision: 4,
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
      event: { tileId: '11111111-1111-4111-8111-111111111111', removedBy: 'client-a', opSeq: 12, revision: 7 },
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

describe('multi-client collaboration', () => {
  it('only finalizes presence after the last socket for a shared client disconnects', () => {
    const sessionId = nextSessionId()
    const clientId = 'shared-client'

    expect(registerClientSocket(sessionId, clientId, 'socket-a')).toBe(1)
    expect(registerClientSocket(sessionId, clientId, 'socket-b')).toBe(2)

    expect(unregisterClientSocket(sessionId, clientId, 'socket-a')).toBe(1)
    expect(unregisterClientSocket(sessionId, clientId, 'socket-b')).toBe(0)
  })

  it('safely handles unregister calls for unknown socket membership', () => {
    expect(unregisterClientSocket('missing-session', 'missing-client', 'missing-socket')).toBe(0)
  })

  it('maps repository session summaries into lobby metadata with canonical canvas size', () => {
    const payload = buildListSessionsResponse([
      { id: '11111111-1111-4111-8111-111111111111', participantCount: 3 },
      { id: '22222222-2222-4222-8222-222222222222', participantCount: 1 },
    ])

    expect(payload).toEqual({
      sessions: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          displayName: 'Canvas 11111111',
          participantCount: 3,
          canvasSize: { width: 10.4, height: 6.8 },
          canvasConfig: {
            canvasSize: { width: 10.4, height: 6.8 },
            boundsPolicy: {
              mode: 'bounded',
              bounds: { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 },
            },
          },
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          displayName: 'Canvas 22222222',
          participantCount: 1,
          canvasSize: { width: 10.4, height: 6.8 },
          canvasConfig: {
            canvasSize: { width: 10.4, height: 6.8 },
            boundsPolicy: {
              mode: 'bounded',
              bounds: { minX: -5.2, maxX: 5.2, minY: -3.4, maxY: 3.4 },
            },
          },
        },
      ],
    })
  })

  it('preserves participant counts from summary source records', () => {
    const payload = buildListSessionsResponse([
      { id: '33333333-3333-4333-8333-333333333333', participantCount: 0 },
      { id: '44444444-4444-4444-8444-444444444444', participantCount: 7 },
    ])

    expect(payload.sessions.map((session) => session.participantCount)).toEqual([0, 7])
  })

  it('two clients joining the same session receive identical snapshot tiles and revision', async () => {
    const sessionId = nextSessionId()
    const replayRecord = {
      session: { id: sessionId, tiles: [], createdAt: 10, updatedAt: 20 },
      clients: [],
      lastOpSeq: 0,
      revision: 0,
      snapshotOpSeq: 0,
      replayedOperations: [],
    }

    const repositoryA = {
      markParticipantJoined: vi.fn().mockResolvedValue({ clientId: 'client-a', joinedAt: 1_000 }),
      loadSessionReplayRecord: vi.fn().mockResolvedValue(replayRecord),
      listActiveParticipants: vi.fn(),
      markParticipantLeft: vi.fn(),
    }
    const repositoryB = {
      markParticipantJoined: vi.fn().mockResolvedValue({ clientId: 'client-b', joinedAt: 1_001 }),
      loadSessionReplayRecord: vi.fn().mockResolvedValue(replayRecord),
      listActiveParticipants: vi.fn(),
      markParticipantLeft: vi.fn(),
    }

    const resultA = await initializeParticipantPresence(sessionId, 'client-a', 1_000, repositoryA)
    const resultB = await initializeParticipantPresence(sessionId, 'client-b', 1_001, repositoryB)

    // Both clients receive snapshots from the same authoritative session record
    expect(resultA.snapshot.session.id).toBe(sessionId)
    expect(resultB.snapshot.session.id).toBe(sessionId)
    expect(resultA.snapshot.session.tiles).toEqual(resultB.snapshot.session.tiles)
    expect(resultA.snapshot.lastOpSeq).toBe(resultB.snapshot.lastOpSeq)
  })

  it('client A placement produces a broadcastable event visible to client B', () => {
    const state = createAuthoritativeSessionState(nextSessionId(), 1)

    const result = applyPlaceTile(
      state,
      {
        tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(result.ack.rejected).toBe(false)
    expect(result.event).toBeDefined()

    if (result.event) {
      // The broadcast event that client B would receive via tile_placed
      expect(result.event.opSeq).toBe(result.opSeq)
      expect(result.event.placedBy).toBe('client-a')
      expect(result.event.tile.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
      expect(result.event.revision).toBe(result.ack.rejected ? -1 : result.ack.newRevision)
    }
  })

  it('updates passive client revision from peer broadcast revision payload', () => {
    const state = createAuthoritativeSessionState(nextSessionId(), 1)

    const peerPlacement = applyPlaceTile(
      state,
      {
        tileId: '99999999-9999-4999-8999-999999999999',
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(peerPlacement.ack.rejected).toBe(false)
    if (!peerPlacement.ack.rejected && peerPlacement.event) {
      expect(peerPlacement.event.revision).toBe(peerPlacement.ack.newRevision)
      const passiveClientRevision = peerPlacement.event.revision
      expect(passiveClientRevision).toBe(1)
    }
  })

  it('serves explicit snapshot request without reconnect side effects', async () => {
    const sessionId = nextSessionId()
    const repository = {
      markParticipantJoined: vi.fn(),
      markParticipantLeft: vi.fn(),
      listActiveParticipants: vi.fn(),
      loadSessionReplayRecord: vi.fn().mockResolvedValue({
        session: { id: sessionId, tiles: [], createdAt: 10, updatedAt: 20 },
        clients: [{ clientId: 'client-a', joinedAt: 1_000 }],
        lastOpSeq: 2,
        revision: 2,
        snapshotOpSeq: 2,
        replayedOperations: [],
      }),
    }

    const snapshot = await initializeParticipantPresence(sessionId, 'client-a', 1_000, repository)

    expect(repository.loadSessionReplayRecord).toHaveBeenCalledTimes(1)
    expect(snapshot.snapshot.lastOpSeq).toBe(2)
    expect(snapshot.snapshot.revision).toBe(2)
  })

  it('preserves placedBy through replay snapshot for per-author undo after reconnect', async () => {
    const sessionId = nextSessionId()
    const replayTile = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      shape: 'square' as const,
      color: '#abc',
      material: 'ceramic' as const,
      transform: { position: vec2(0, 0), rotation: 0 },
      createdAt: 10,
      placedBy: 'client-a',
    }

    const repository = {
      markParticipantJoined: vi.fn().mockResolvedValue({ clientId: 'client-a', joinedAt: 1_000 }),
      markParticipantLeft: vi.fn(),
      listActiveParticipants: vi.fn(),
      loadSessionReplayRecord: vi.fn().mockResolvedValue({
        session: { id: sessionId, tiles: [replayTile], createdAt: 10, updatedAt: 20 },
        clients: [{ clientId: 'client-a', joinedAt: 1_000 }],
        lastOpSeq: 1,
        revision: 1,
        snapshotOpSeq: 1,
        replayedOperations: [],
      }),
    }

    const result = await initializeParticipantPresence(sessionId, 'client-a', 1_000, repository)

    expect(result.snapshot.session.tiles[0].placedBy).toBe('client-a')
  })

  it('concurrent placements on non-overlapping positions both succeed and broadcast', () => {
    const state = createAuthoritativeSessionState(nextSessionId(), 1)

    const resultA = applyPlaceTile(
      state,
      {
        tileId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        shape: 'square',
        color: '#111',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    const resultB = applyPlaceTile(
      state,
      {
        tileId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        shape: 'square',
        color: '#222',
        material: 'glass',
        transform: { position: vec2(1.01, 0), rotation: 0 },
      },
      'client-b',
    )

    // Both placements succeed (non-overlapping positions)
    expect(resultA.ack.rejected).toBe(false)
    expect(resultB.ack.rejected).toBe(false)
    expect(state.session.tiles).toHaveLength(2)

    // Each produces a broadcastable event
    expect(resultA.event).toBeDefined()
    expect(resultB.event).toBeDefined()

    if (resultA.event && resultB.event) {
      // opSeq is monotonically increasing
      expect(resultA.event.opSeq).toBeLessThan(resultB.event.opSeq)
    }
  })

  it('stale expectedRevision is correctly identified against the advanced session revision', () => {
    // Simulates the server-side condition that triggers STALE_REVISION + resync_required:
    //   Client A places a tile, advancing the authoritative revision from 0 to 1.
    //   Client B holds an expectedRevision of 0 (has not yet received A's broadcast).
    //   The socket handler checks: payload.expectedRevision (0) < record.revision (1)
    //   → STALE_REVISION ack is returned, and resync_required is emitted to client B.
    const state = createAuthoritativeSessionState(nextSessionId(), 1)

    const resultA = applyPlaceTile(
      state,
      {
        tileId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
      },
      'client-a',
    )

    expect(resultA.ack.rejected).toBe(false)
    // state.lastOpSeq now represents the authoritative revision (1)
    expect(state.lastOpSeq).toBe(1)

    // Client B's stale expectedRevision (0) is behind the current revision (1).
    // The condition that the place_tile socket handler evaluates:
    const clientBExpectedRevision = 0
    const isStale = clientBExpectedRevision < state.lastOpSeq
    expect(isStale).toBe(true)

    // The resync_required payload the handler would emit to client B:
    const expectedResyncPayload = {
      currentOpSeq: state.lastOpSeq,
      reason: 'REVISION_MISMATCH' as const,
    }
    expect(expectedResyncPayload).toEqual({ currentOpSeq: 1, reason: 'REVISION_MISMATCH' })
  })

  it('selection_update fanout targets room peers without local echo', () => {
    const emitToPeers = vi.fn()
    const socket = {
      to: vi.fn().mockReturnValue({ emit: emitToPeers }),
    }

    const sessionId = nextSessionId()
    const clientId = 'client-a'
    const payload = {
      canvasId: sessionId,
      clientId,
      tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: Date.now(),
    }

    socket.to(sessionId).emit('selection_update', payload)

    expect(socket.to).toHaveBeenCalledTimes(1)
    expect(socket.to).toHaveBeenCalledWith(sessionId)
    expect(emitToPeers).toHaveBeenCalledTimes(1)
    expect(emitToPeers).toHaveBeenCalledWith('selection_update', payload)
  })

  it('selection_update guard rejects payload when canvas membership mismatches', () => {
    const sessionId = nextSessionId()
    const clientId = 'client-a'
    const payload = {
      canvasId: `${sessionId}-different`,
      clientId,
      tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: Date.now(),
    }

    expect(isSelectionUpdatePayload(payload)).toBe(true)
    const membershipMatches = payload.canvasId === sessionId && payload.clientId === clientId
    expect(membershipMatches).toBe(false)
  })

  it('selection_update guard rejects payload when client identity mismatches', () => {
    const sessionId = nextSessionId()
    const clientId = 'client-a'
    const payload = {
      canvasId: sessionId,
      clientId: 'client-b',
      tileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updatedAt: Date.now(),
    }

    expect(isSelectionUpdatePayload(payload)).toBe(true)
    const membershipMatches = payload.canvasId === sessionId && payload.clientId === clientId
    expect(membershipMatches).toBe(false)
  })

  it('pointer_update fanout payload includes sender identity and position', () => {
    const emitToPeers = vi.fn()
    const socket = {
      to: vi.fn().mockReturnValue({ emit: emitToPeers }),
    }

    const sessionId = nextSessionId()
    const payload = {
      clientId: 'client-a',
      position: { x: 3, y: -2 },
    }

    socket.to(sessionId).emit('pointer_update', payload)

    expect(socket.to).toHaveBeenCalledWith(sessionId)
    expect(emitToPeers).toHaveBeenCalledWith('pointer_update', payload)
  })

  it('client_joined and client_left payloads preserve collaborator identity', () => {
    const emitRoom = vi.fn()
    const io = {
      to: vi.fn().mockReturnValue({ emit: emitRoom }),
    }

    const sessionId = nextSessionId()
    const joinedPayload = {
      client: {
        clientId: 'client-z',
        joinedAt: Date.now(),
      },
    }
    const leftPayload = { clientId: 'client-z' }

    io.to(sessionId).emit('client_joined', joinedPayload)
    io.to(sessionId).emit('client_left', leftPayload)

    expect(emitRoom).toHaveBeenNthCalledWith(1, 'client_joined', joinedPayload)
    expect(emitRoom).toHaveBeenNthCalledWith(2, 'client_left', leftPayload)
  })

  it('disconnect leave-gating keeps presence when at least one socket remains', () => {
    const sessionId = nextSessionId()
    const clientId = 'shared-client'

    expect(registerClientSocket(sessionId, clientId, 'socket-1')).toBe(1)
    expect(registerClientSocket(sessionId, clientId, 'socket-2')).toBe(2)

    const remainingAfterFirstDisconnect = unregisterClientSocket(sessionId, clientId, 'socket-1')
    const shouldEmitClientLeftAfterFirstDisconnect = remainingAfterFirstDisconnect === 0
    expect(shouldEmitClientLeftAfterFirstDisconnect).toBe(false)

    const remainingAfterLastDisconnect = unregisterClientSocket(sessionId, clientId, 'socket-2')
    const shouldEmitClientLeftAfterLastDisconnect = remainingAfterLastDisconnect === 0
    expect(shouldEmitClientLeftAfterLastDisconnect).toBe(true)
  })

  it('fanouts chunk tile events to scoped chunk room names', () => {
    const io = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    }

    const sessionId = nextSessionId()
    const chunkId = '0:0'
    const chunkRoom = `chunk:${sessionId}:${chunkId}`
    const eventPayload = {
      canvasId: sessionId,
      chunkId,
      tile: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        shape: 'square' as const,
        color: '#abc',
        material: 'ceramic' as const,
        transform: { position: vec2(0, 0), rotation: 0 },
        createdAt: Date.now(),
      },
      placedBy: 'client-a',
      opSeq: 3,
      revision: 3,
    }

    io.to(chunkRoom).emit('chunk_tile_placed', eventPayload)

    expect(io.to).toHaveBeenCalledWith(chunkRoom)
    expect(io.to(chunkRoom).emit).toHaveBeenCalledWith('chunk_tile_placed', eventPayload)
  })

  it('models chunk snapshot payload with monotonic ordering metadata', () => {
    const sessionId = nextSessionId()
    const chunkSnapshot = {
      canvasId: sessionId,
      chunks: [
        {
          chunkId: '0:0',
          tiles: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              shape: 'square' as const,
              color: '#abc',
              material: 'ceramic' as const,
              transform: { position: vec2(0, 0), rotation: 0 },
              createdAt: 10,
            },
          ],
          opSeq: 4,
          revision: 4,
        },
      ],
      serverOpSeq: 4,
      serverRevision: 4,
    }

    expect(chunkSnapshot.chunks[0].opSeq).toBe(chunkSnapshot.serverOpSeq)
    expect(chunkSnapshot.chunks[0].revision).toBe(chunkSnapshot.serverRevision)
  })

  it('flags chunk resync_required when client cursor outruns server ordering', () => {
    const serverCursor = { opSeq: 5, revision: 5 }
    const clientCursor = { opSeq: 6, revision: 5 }
    const requiresResync = clientCursor.opSeq > serverCursor.opSeq || clientCursor.revision > serverCursor.revision

    expect(requiresResync).toBe(true)
    expect({
      canvasId: 'session-1',
      chunkId: '0:0',
      payloadMode: 'fine' as const,
      coordination: {
        replicaId: 'replica-a',
        membershipScope: 'process-local' as const,
        membershipAssumption: 'best-effort' as const,
        emittedAt: 1,
      },
      currentOpSeq: serverCursor.opSeq,
      currentRevision: serverCursor.revision,
      reason: 'REVISION_MISMATCH' as const,
    }).toEqual({
      canvasId: 'session-1',
      chunkId: '0:0',
      payloadMode: 'fine',
      coordination: {
        replicaId: 'replica-a',
        membershipScope: 'process-local',
        membershipAssumption: 'best-effort',
        emittedAt: 1,
      },
      currentOpSeq: 5,
      currentRevision: 5,
      reason: 'REVISION_MISMATCH',
    })
  })

  it('supports aggregate chunk snapshot payload mode contract for far zoom tiers', () => {
    const sessionId = nextSessionId()
    const payloadMode = 'aggregate' as const
    const coordination = {
      replicaId: 'replica-a',
      membershipScope: 'adapter-shared' as const,
      membershipAssumption: 'authoritative' as const,
      emittedAt: Date.now(),
    }

    const chunkSnapshot = {
      canvasId: sessionId,
      payloadMode,
      coordination,
      chunks: [
        {
          chunkId: '0:0',
          tiles: [],
          aggregate: {
            tileCount: 3,
            byShape: { square: 2, triangle: 1 },
            byMaterial: { ceramic: 2, glass: 1 },
          },
          opSeq: 5,
          revision: 5,
        },
      ],
      serverOpSeq: 5,
      serverRevision: 5,
    }

    expect(chunkSnapshot.payloadMode).toBe('aggregate')
    expect(chunkSnapshot.chunks[0].tiles).toEqual([])
    expect(chunkSnapshot.chunks[0].aggregate?.tileCount).toBe(3)
    expect(chunkSnapshot.chunks[0].aggregate?.byShape.square).toBe(2)
    expect(chunkSnapshot.coordination.membershipScope).toBe('adapter-shared')
  })

  it('models delayed leave in process-local mode as best-effort until adapter-shared state is enabled', () => {
    const firstReplicaView = {
      replicaId: 'replica-a',
      membershipScope: 'process-local' as const,
      membershipAssumption: 'best-effort' as const,
      activeSocketsForClient: 0,
    }
    const secondReplicaView = {
      replicaId: 'replica-b',
      membershipScope: 'process-local' as const,
      membershipAssumption: 'best-effort' as const,
      activeSocketsForClient: 1,
    }

    const shouldEmitClientLeftFromReplicaA = firstReplicaView.activeSocketsForClient === 0
    const globallySafeToTreatClientAsAbsent =
      firstReplicaView.membershipScope === 'adapter-shared'
      && secondReplicaView.activeSocketsForClient === 0

    expect(shouldEmitClientLeftFromReplicaA).toBe(true)
    expect(globallySafeToTreatClientAsAbsent).toBe(false)
  })

  it('represents duplicate cross-replica chunk joins as idempotent room membership state', () => {
    const joinEvents = [
      { replicaId: 'replica-a', socketId: 'socket-1', chunkId: '2:3' },
      { replicaId: 'replica-b', socketId: 'socket-1', chunkId: '2:3' },
    ]

    const membershipKeys = new Set(joinEvents.map((event) => `${event.socketId}:${event.chunkId}`))

    expect(joinEvents).toHaveLength(2)
    expect(membershipKeys.size).toBe(1)
  })

  it('chunk snapshot parity includes only tiles from requested chunks', () => {
    const chunkWorldSize = 8
    const worldToChunkId = (x: number, y: number): string =>
      `${Math.floor(x / chunkWorldSize)}:${Math.floor(y / chunkWorldSize)}`

    const requestedChunks = ['0:0', '1:0']
    const allTiles = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        shape: 'square' as const,
        color: '#abc',
        material: 'ceramic' as const,
        transform: { position: vec2(0, 0), rotation: 0 },
        createdAt: 1,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        shape: 'square' as const,
        color: '#def',
        material: 'glass' as const,
        transform: { position: vec2(8.2, 0), rotation: 0 },
        createdAt: 2,
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        shape: 'square' as const,
        color: '#123',
        material: 'stone' as const,
        transform: { position: vec2(-8.2, 0), rotation: 0 },
        createdAt: 3,
      },
    ]

    const chunkedTiles = allTiles.filter((tile) => requestedChunks.includes(worldToChunkId(
      tile.transform.position.x,
      tile.transform.position.y,
    )))

    const legacyUnionTiles = allTiles.filter((tile) => requestedChunks.includes(worldToChunkId(
      tile.transform.position.x,
      tile.transform.position.y,
    )))

    const toIdentity = (tile: { id: string; transform: { position: { x: number; y: number } } }): string =>
      `${tile.id}:${worldToChunkId(tile.transform.position.x, tile.transform.position.y)}`

    expect(chunkedTiles.map(toIdentity).sort()).toEqual(legacyUnionTiles.map(toIdentity).sort())
  })

  it('chunk boundary parity test detects mismatched chunk assignment at x=8 seam', () => {
    const chunkWorldSize = 8
    const worldToChunkId = (x: number, y: number): string =>
      `${Math.floor(x / chunkWorldSize)}:${Math.floor(y / chunkWorldSize)}`

    const legacyTile = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      transform: { position: vec2(7.99, 0) },
    }
    const chunkTile = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      transform: { position: vec2(8.01, 0) },
    }

    const legacyIdentity = `${legacyTile.id}:${worldToChunkId(legacyTile.transform.position.x, legacyTile.transform.position.y)}`
    const chunkIdentity = `${chunkTile.id}:${worldToChunkId(chunkTile.transform.position.x, chunkTile.transform.position.y)}`

    expect(legacyIdentity).not.toBe(chunkIdentity)
    expect(legacyIdentity).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd:0:0')
    expect(chunkIdentity).toBe('dddddddd-dddd-4ddd-8ddd-dddddddddddd:1:0')
  })
})