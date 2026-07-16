import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/postgres-adapter'
import { randomUUID } from 'node:crypto'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  ConnectionAuth,
  Session,
  ClientPresence,
  PlaceTilePayload,
  PlaceTileAck,
  PlaceTileRejectReason,
  RemoveTilePayload,
  RemoveTileAck,
  TilePlacedPayload,
  TileRemovedPayload,
} from './contracts'
import {
  closeDatabaseBundle,
  getDatabaseBundle,
  listActiveParticipants,
  loadSessionReplayRecord,
  loadSessionRecord,
  markParticipantJoined,
  markParticipantLeft,
  persistSnapshotIfNeeded,
  persistTilePlacement,
  persistTileRemoval,
} from './db'
import { defaultBounds, validatePlacement } from './domain/placementSolver'
import { startRetentionJob } from './jobs/retention'

type AuthoritativeSessionState = {
  session: Session
  clients: Map<string, ClientPresence>
  lastOpSeq: number
}

type PresenceRepository = {
  listActiveParticipants: typeof listActiveParticipants
  loadSessionReplayRecord: typeof loadSessionReplayRecord
  markParticipantJoined: typeof markParticipantJoined
  markParticipantLeft: typeof markParticipantLeft
}

const sessions = new Map<string, AuthoritativeSessionState>()
const defaultPresenceRepository: PresenceRepository = {
  listActiveParticipants,
  loadSessionReplayRecord,
  markParticipantJoined,
  markParticipantLeft,
}
const TILE_SHAPES = new Set<PlaceTilePayload['shape']>(['square', 'triangle', 'rectangle', 'l-shape'])
const MATERIAL_VARIANTS = new Set<PlaceTilePayload['material']>(['ceramic', 'glass', 'stone'])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173'
const DEFAULT_SESSION_STALE_MS = 30 * 60 * 1000

export const isValidTileId = (tileId: string): boolean => UUID_PATTERN.test(tileId)

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isPlaceTilePayload = (payload: unknown): payload is PlaceTilePayload => {
  if (!isObjectRecord(payload)) {
    return false
  }

  if (typeof payload.color !== 'string') {
    return false
  }

  if (!TILE_SHAPES.has(payload.shape as PlaceTilePayload['shape'])) {
    return false
  }

  if (!MATERIAL_VARIANTS.has(payload.material as PlaceTilePayload['material'])) {
    return false
  }

  const transform = payload.transform
  if (!isObjectRecord(transform)) {
    return false
  }

  if (!isFiniteNumber(transform.rotation)) {
    return false
  }

  if (transform.mirrored !== undefined && typeof transform.mirrored !== 'boolean') {
    return false
  }

  const position = transform.position
  if (!isObjectRecord(position)) {
    return false
  }

  return isFiniteNumber(position.x) && isFiniteNumber(position.y)
}

export const isRemoveTilePayload = (payload: unknown): payload is RemoveTilePayload => {
  if (!isObjectRecord(payload)) {
    return false
  }

  return typeof payload.tileId === 'string'
}

export const invokeAckSafely = <T>(ack: unknown, response: T): void => {
  if (typeof ack === 'function') {
    ;(ack as (result: T) => void)(response)
  }
}

export const resolveCorsOrigin = (rawOrigin: string | undefined): string | string[] => {
  const configured = (rawOrigin ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*')

  if (configured.length === 0) {
    return DEFAULT_CORS_ORIGIN
  }

  if (configured.length === 1) {
    return configured[0]
  }

  return configured
}

export const toRejectReason = (reason: string): PlaceTileRejectReason => {
  if (reason.startsWith('out-of-bounds')) {
    return 'OUT_OF_BOUNDS'
  }
  if (reason.startsWith('overlap')) {
    return 'OVERLAP'
  }
  if (reason.startsWith('gap too large')) {
    return 'GAP_TOO_LARGE'
  }
  return 'PLACEMENT_REJECTED'
}

export const createAuthoritativeSessionState = (
  sessionId: string,
  now: number = Date.now(),
): AuthoritativeSessionState => ({
  session: {
    id: sessionId,
    tiles: [],
    createdAt: now,
    updatedAt: now,
  },
  clients: new Map(),
  lastOpSeq: 0,
})

export const shouldCleanupSession = (
  state: AuthoritativeSessionState,
  now: number,
  staleAfterMs: number,
): boolean => {
  if (state.clients.size > 0) {
    return false
  }

  if (state.session.tiles.length === 0) {
    return true
  }

  return now - state.session.updatedAt >= staleAfterMs
}

export const cleanupSessions = (
  now: number = Date.now(),
  staleAfterMs: number = DEFAULT_SESSION_STALE_MS,
): string[] => {
  const removedSessionIds: string[] = []

  for (const [sessionId, state] of sessions) {
    if (shouldCleanupSession(state, now, staleAfterMs)) {
      sessions.delete(sessionId)
      removedSessionIds.push(sessionId)
    }
  }

  return removedSessionIds
}

export const getSessionState = (sessionId: string): AuthoritativeSessionState => {
  cleanupSessions()

  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  const created = createAuthoritativeSessionState(sessionId)
  sessions.set(sessionId, created)
  return created
}

export const initializeParticipantPresence = async (
  sessionId: string,
  clientId: string,
  joinedAt: number,
  repository: PresenceRepository = defaultPresenceRepository,
): Promise<{
  joinedClient: ClientPresence
  snapshot: {
    session: Session
    clients: ClientPresence[]
    lastOpSeq: number
  }
}> => {
  const joinedClient = await repository.markParticipantJoined(sessionId, clientId, joinedAt)
  const record = await repository.loadSessionReplayRecord(sessionId)

  return {
    joinedClient,
    snapshot: {
      session: record.session,
      clients: record.clients,
      lastOpSeq: record.lastOpSeq,
    },
  }
}

export const finalizeParticipantPresence = async (
  sessionId: string,
  clientId: string,
  leftAt: number,
  repository: PresenceRepository = defaultPresenceRepository,
): Promise<{
  activeClients: ClientPresence[]
  shouldCleanup: boolean
}> => {
  await repository.markParticipantLeft(sessionId, clientId, leftAt)
  const activeClients = await repository.listActiveParticipants(sessionId)

  return {
    activeClients,
    shouldCleanup: activeClients.length === 0,
  }
}

const nextOpSeq = (state: AuthoritativeSessionState): number => {
  state.lastOpSeq += 1
  return state.lastOpSeq
}

export const applyPlaceTile = (
  state: AuthoritativeSessionState,
  payload: PlaceTilePayload,
  placedBy: string,
): {
  opSeq: number
  ack: PlaceTileAck
  event?: TilePlacedPayload
} => {
  const opSeq = nextOpSeq(state)
  const validation = validatePlacement(payload.shape, payload.transform, state.session.tiles, defaultBounds)

  if (!validation.valid) {
    return {
      opSeq,
      ack: {
        placed: null,
        rejected: true,
        reason: toRejectReason(validation.reason),
      },
    }
  }

  const tile = {
    id: randomUUID(),
    ...payload,
    createdAt: Date.now(),
  }

  state.session.tiles.push(tile)
  state.session.updatedAt = Date.now()

  return {
    opSeq,
    ack: {
      placed: tile,
      rejected: false,
      opSeq,
    },
    event: {
      tile,
      placedBy,
      opSeq,
    },
  }
}

export const applyRemoveTile = (
  state: AuthoritativeSessionState,
  payload: RemoveTilePayload,
  removedBy: string,
): {
  opSeq: number
  ack: RemoveTileAck
  event?: TileRemovedPayload
} => {
  const opSeq = nextOpSeq(state)

  if (!isValidTileId(payload.tileId)) {
    return {
      opSeq,
      ack: { removed: false },
    }
  }

  const index = state.session.tiles.findIndex((tile) => tile.id === payload.tileId)
  if (index === -1) {
    return {
      opSeq,
      ack: { removed: false },
    }
  }

  state.session.tiles.splice(index, 1)
  state.session.updatedAt = Date.now()

  return {
    opSeq,
    ack: { removed: true, opSeq },
    event: {
      tileId: payload.tileId,
      removedBy,
      opSeq,
    },
  }
}

export const handlePlaceTileRequest = (
  state: AuthoritativeSessionState,
  payload: unknown,
  placedBy: string,
): {
  opSeq?: number
  ack: PlaceTileAck
  event?: TilePlacedPayload
} => {
  if (!isPlaceTilePayload(payload)) {
    return {
      ack: {
        placed: null,
        rejected: true,
        reason: 'PLACEMENT_REJECTED',
      },
    }
  }

  return applyPlaceTile(state, payload, placedBy)
}

export const handleRemoveTileRequest = (
  state: AuthoritativeSessionState,
  payload: unknown,
  removedBy: string,
): {
  opSeq?: number
  ack: RemoveTileAck
  event?: TileRemovedPayload
} => {
  if (!isRemoveTilePayload(payload)) {
    return {
      ack: { removed: false },
    }
  }

  return applyRemoveTile(state, payload, removedBy)
}

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

// ─── Initialize Express ──────────────────────────────────────────────────────

const app = express()
const httpServer = createServer(app)

app.use(express.json())

// Health check endpoint for container orchestration (ACA, K8s, etc.)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: '0.0.0' })
})

// ─── Initialize Socket.IO ────────────────────────────────────────────────────

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    cors: {
      origin: resolveCorsOrigin(process.env.CORS_ORIGIN),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  },
)

const configureRealtimeAdapter = (): void => {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'test') {
      return
    }

    throw new Error('DATABASE_URL is required for Postgres-backed persistence')
  }

  io.adapter(createAdapter(getDatabaseBundle().pool))
}

configureRealtimeAdapter()

// ─── Connection Middleware ───────────────────────────────────────────────────

io.use((socket, next) => {
  const auth = socket.handshake.auth as unknown as Partial<ConnectionAuth>

  if (!auth.sessionId || !auth.clientId) {
    return next(new Error('Missing sessionId or clientId in auth'))
  }

  // Store per-socket metadata
  socket.data.sessionId = auth.sessionId
  socket.data.clientId = auth.clientId

  console.log(`[Socket] Client connecting: ${auth.clientId} to session ${auth.sessionId}`)

  next()
})

// ─── Connection Handlers ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { sessionId, clientId } = socket.data

  const initializeConnection = async (): Promise<void> => {
    const joinedAt = Date.now()

    socket.join(sessionId)
    const connectionState = await initializeParticipantPresence(sessionId, clientId, joinedAt)

    console.log(
      `[Socket] Client joined: ${clientId} | Session: ${sessionId} | Room size: ${io.sockets.adapter.rooms.get(sessionId)?.size ?? 0}`,
    )

    socket.emit('session_snapshot', connectionState.snapshot)

    socket.to(sessionId).emit('client_joined', { client: connectionState.joinedClient })
  }

  void initializeConnection().catch((error) => {
    console.error(`[Socket] Failed to initialize session ${sessionId}`, error)
    socket.disconnect(true)
  })

  // ── Event Handlers ────────────────────────────────────────────────────────

  socket.on('place_tile', async (payload, ack) => {
    console.log(`[place_tile] ${clientId} attempting to place`, payload)

    if (!isPlaceTilePayload(payload)) {
      invokeAckSafely(ack, {
        placed: null,
        rejected: true,
        reason: 'PLACEMENT_REJECTED',
      })
      return
    }

    try {
      const record = await loadSessionRecord(sessionId)
      const validation = validatePlacement(payload.shape, payload.transform, record.session.tiles, defaultBounds)

      if (!validation.valid) {
        invokeAckSafely(ack, {
          placed: null,
          rejected: true,
          reason: toRejectReason(validation.reason),
        })
        return
      }

      const result = await persistTilePlacement({
        sessionId,
        payload,
        placedBy: clientId,
      })

      invokeAckSafely(ack, result.ack)

      if (result.event && 'tile' in result.event && 'opSeq' in result) {
        io.to(sessionId).emit('tile_placed', result.event)
        await persistSnapshotIfNeeded(sessionId, result.opSeq, result.session)
      }
    } catch (error) {
      console.error(`[place_tile] Failed for session ${sessionId}`, error)
      invokeAckSafely(ack, {
        placed: null,
        rejected: true,
        reason: 'PLACEMENT_REJECTED',
      })
    }
  })

  socket.on('remove_tile', async (payload, ack) => {
    console.log(`[remove_tile] ${clientId} attempting to remove`, payload.tileId)

    if (!isRemoveTilePayload(payload) || !isValidTileId(payload.tileId)) {
      invokeAckSafely(ack, { removed: false })
      return
    }

    try {
      const result = await persistTileRemoval({
        sessionId,
        payload,
        removedBy: clientId,
      })

      invokeAckSafely(ack, result.ack)

      if (result.event && 'tileId' in result.event && 'opSeq' in result) {
        io.to(sessionId).emit('tile_removed', result.event)
        await persistSnapshotIfNeeded(sessionId, result.opSeq, result.session)
      }
    } catch (error) {
      console.error(`[remove_tile] Failed for session ${sessionId}`, error)
      invokeAckSafely(ack, { removed: false })
    }
  })

  socket.on('pointer_move', (payload) => {
    console.log(`[pointer_move] ${clientId}:`, payload)

    socket.to(sessionId).emit('pointer_update', {
      clientId,
      position: payload.position,
    })
  })

  // ── Disconnection ──────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    console.log(`[Socket] Client disconnected: ${clientId} from session ${sessionId}`)

    try {
      const disconnectState = await finalizeParticipantPresence(sessionId, clientId, Date.now())
      io.to(sessionId).emit('client_left', { clientId })

      if (disconnectState.shouldCleanup) {
        cleanupSessions()
      }
    } catch (error) {
      console.error(`[Socket] Failed to persist disconnect for session ${sessionId}`, error)
    }
  })
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const retentionJob = process.env.NODE_ENV === 'test' ? null : startRetentionJob()

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} received, shutting down gracefully`)
  retentionJob?.stop()

  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      console.log('Server closed')
      resolve()
    })
  })

  await closeDatabaseBundle()
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})

// ─── Start Server ────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, HOST, () => {
    console.log(`[Server] Listening on ${HOST}:${PORT}`)
  })
}
