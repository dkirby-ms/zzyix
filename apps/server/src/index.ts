import crypto from 'crypto'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/postgres-adapter'
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
  ListSessionsResponse,
} from './contracts.js'
import {
  closeDatabaseBundle,
  getDatabaseBundle,
  listSessionSummaries,
  listActiveParticipants,
  loadSessionReplayRecord,
  loadSessionRecord,
  markParticipantJoined,
  markParticipantLeft,
  persistSnapshotIfNeeded,
  persistTilePlacement,
  persistTileRemoval,
} from './db/index.js'
import type { SessionSummaryRecord } from './db/repository.js'
import { defaultBounds, validatePlacement } from './domain/placementSolver.js'
import { startRetentionJob } from './jobs/retention.js'

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
const CANVAS_WIDTH = defaultBounds.maxX - defaultBounds.minX
const CANVAS_HEIGHT = defaultBounds.maxY - defaultBounds.minY

export const buildListSessionsResponse = (summaries: SessionSummaryRecord[]): ListSessionsResponse => ({
  sessions: summaries.map((summary) => ({
    id: summary.id,
    displayName: `Canvas ${summary.id.slice(0, 8)}`,
    participantCount: summary.participantCount,
    canvasSize: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    },
  })),
})

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const resolveLogLevel = (rawLevel: string | undefined): LogLevel => {
  const normalized = (rawLevel ?? '').toLowerCase()

  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized
  }

  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

const ACTIVE_LOG_LEVEL = resolveLogLevel(process.env.LOG_LEVEL)

const serializeLogValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.stack ?? value.message
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const shouldLog = (level: LogLevel): boolean => LOG_LEVELS[level] >= LOG_LEVELS[ACTIVE_LOG_LEVEL]

const writeLog = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
  if (!shouldLog(level)) {
    return
  }

  const timestamp = new Date().toISOString()
  const contextSuffix = context ? ` ${serializeLogValue(context)}` : ''
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextSuffix}`

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}

export const isValidTileId = (tileId: string): boolean => UUID_PATTERN.test(tileId)

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isPlaceTilePayload = (payload: unknown): payload is PlaceTilePayload => {
  if (!isObjectRecord(payload)) {
    return false
  }

  if (typeof payload.tileId !== 'string' || !isValidTileId(payload.tileId)) {
    return false
  }

  if (typeof payload.color !== 'string') {
    return false
  }

  if (payload.expectedRevision !== undefined) {
    if (!isFiniteNumber(payload.expectedRevision) || !Number.isInteger(payload.expectedRevision)) {
      return false
    }

    if (payload.expectedRevision < 0) {
      return false
    }
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

  if (typeof payload.tileId !== 'string') {
    return false
  }

  if (payload.expectedRevision !== undefined) {
    if (!isFiniteNumber(payload.expectedRevision) || !Number.isInteger(payload.expectedRevision)) {
      return false
    }

    if (payload.expectedRevision < 0) {
      return false
    }
  }

  return true
}

const isPointerMovePayload = (payload: unknown): payload is { position: { x: number; y: number } } => {
  if (!isObjectRecord(payload)) {
    return false
  }

  const position = payload.position
  if (!isObjectRecord(position)) {
    return false
  }

  return isFiniteNumber(position.x) && isFiniteNumber(position.y)
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

export const isOriginAllowed = (requestOrigin: string, allowedOrigin: string | string[]): boolean => {
  if (Array.isArray(allowedOrigin)) {
    return allowedOrigin.includes(requestOrigin)
  }

  return allowedOrigin === requestOrigin
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
    revision: number
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
      revision: record.revision,
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
    id: payload.tileId,
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
      newRevision: opSeq,
    },
    event: {
      tile,
      placedBy,
      opSeq,
      revision: opSeq,
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
    ack: { removed: true, opSeq, newRevision: opSeq },
    event: {
      tileId: payload.tileId,
      removedBy,
      opSeq,
      revision: opSeq,
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

// CORS middleware for HTTP endpoints
app.use((req, res, next) => {
  const configuredOrigin = resolveCorsOrigin(process.env.CORS_ORIGIN)
  const requestOrigin = req.header('origin')
  const corsOrigin = requestOrigin
    && requestOrigin !== 'null'
    && isOriginAllowed(requestOrigin, configuredOrigin)
    ? requestOrigin
    : null

  if (corsOrigin) {
    res.header('Access-Control-Allow-Origin', corsOrigin)
    res.header('Vary', 'Origin')
    res.header('Access-Control-Allow-Credentials', 'true')
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200)
  }

  next()
})

app.use((req, res, next) => {
  const startedAt = Date.now()

  res.on('finish', () => {
    writeLog('info', 'http_request', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    })
  })

  next()
})

// Health check endpoint for container orchestration (ACA, K8s, etc.)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: '0.0.0' })
})

app.get('/sessions', async (_req, res) => {
  try {
    const summaries = await listSessionSummaries()
    const response = buildListSessionsResponse(summaries)

    res.status(200).json(response)
  } catch (error) {
    writeLog('error', 'session_list_failed', { error })
    res.status(500).json({ error: 'Failed to list sessions' })
  }
})

// Session creation endpoint
app.post('/sessions', async (_req, res) => {
  try {
    const sessionId = crypto.randomUUID()
    getSessionState(sessionId)

    // Initialize canvas in database to satisfy foreign key constraints
    await loadSessionRecord(sessionId)

    writeLog('info', 'session_created', { sessionId })

    res.status(200).json({ session: { id: sessionId } })
  } catch (error) {
    writeLog('error', 'session_creation_failed', { error })
    res.status(500).json({ error: 'Failed to create session' })
  }
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

  writeLog('debug', 'socket_auth_received', {
    authType: typeof auth,
    hasSessionId: Boolean(auth?.sessionId),
    hasClientId: Boolean(auth?.clientId),
  })

  if (!auth || !auth.sessionId || !auth.clientId) {
    const errorMsg = 'Missing sessionId or clientId in auth payload'
    writeLog('warn', 'socket_auth_validation_failed', {
      authType: typeof auth,
      hasSessionId: Boolean(auth?.sessionId),
      hasClientId: Boolean(auth?.clientId),
    })
    return next(new Error(errorMsg))
  }

  // Store per-socket metadata
  socket.data.sessionId = auth.sessionId
  socket.data.clientId = auth.clientId

  writeLog('info', 'socket_connecting', {
    clientId: auth.clientId,
    sessionId: auth.sessionId,
  })

  next()
})

// ─── Connection Handlers ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { sessionId, clientId } = socket.data

  const initializeConnection = async (): Promise<void> => {
    const joinedAt = Date.now()

    socket.join(sessionId)
    const connectionState = await initializeParticipantPresence(sessionId, clientId, joinedAt)
    const sessionState = getSessionState(sessionId)
    sessionState.session = connectionState.snapshot.session
    sessionState.lastOpSeq = connectionState.snapshot.lastOpSeq
    sessionState.clients = new Map(connectionState.snapshot.clients.map((client) => [client.clientId, client]))

    writeLog('info', 'socket_joined', {
      clientId,
      sessionId,
      roomSize: io.sockets.adapter.rooms.get(sessionId)?.size ?? 0,
    })

    socket.emit('session_snapshot', connectionState.snapshot)

    socket.to(sessionId).emit('client_joined', { client: connectionState.joinedClient })
  }

  void initializeConnection().catch((error) => {
    writeLog('error', 'socket_initialize_failed', {
      sessionId,
      clientId,
      error,
    })
    socket.disconnect(true)
  })

  // ── Event Handlers ────────────────────────────────────────────────────────

  socket.on('place_tile', async (payload, ack) => {
    writeLog('debug', 'place_tile_received', {
      sessionId,
      clientId,
      payload,
    })

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

      if (payload.expectedRevision !== undefined) {
        if (payload.expectedRevision < record.revision) {
          invokeAckSafely(ack, {
            placed: null,
            rejected: true,
            reason: 'STALE_REVISION',
          })
          socket.emit('resync_required', { currentOpSeq: record.revision, reason: 'REVISION_MISMATCH' })
          return
        }

        if (payload.expectedRevision > record.revision) {
          invokeAckSafely(ack, {
            placed: null,
            rejected: true,
            reason: 'OUT_OF_ORDER_REVISION',
          })
          return
        }
      }

      const validation = validatePlacement(payload.shape, payload.transform, record.session.tiles, defaultBounds)

      if (!validation.valid) {
        writeLog('info', 'place_tile_rejected', {
          sessionId,
          clientId,
          reason: validation.reason,
          tileId: payload.tileId,
        })
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

      const placeAck: PlaceTileAck = result.ack.rejected
        ? result.ack
        : { ...result.ack, newRevision: result.revision }

      writeLog('info', 'place_tile_processed', {
        sessionId,
        clientId,
        tileId: payload.tileId,
        rejected: placeAck.rejected,
        idempotent: placeAck.rejected ? false : (placeAck.idempotent ?? false),
        opSeq: 'opSeq' in result ? result.opSeq : null,
      })

      invokeAckSafely(ack, placeAck)

      // Retries should acknowledge deterministically but must not rebroadcast
      // already applied operations.
      if (result.event && 'tile' in result.event && 'opSeq' in result && !placeAck.rejected && !placeAck.idempotent) {
        io.to(sessionId).emit('tile_placed', result.event)
        await persistSnapshotIfNeeded(sessionId, result.opSeq, result.session)
      }
    } catch (error) {
      writeLog('error', 'place_tile_failed', {
        sessionId,
        clientId,
        error,
      })
      invokeAckSafely(ack, {
        placed: null,
        rejected: true,
        reason: 'PLACEMENT_REJECTED',
      })
    }
  })

  socket.on('remove_tile', async (payload, ack) => {
    writeLog('debug', 'remove_tile_received', {
      sessionId,
      clientId,
      payload,
    })

    if (!isRemoveTilePayload(payload) || !isValidTileId(payload.tileId)) {
      invokeAckSafely(ack, { removed: false })
      return
    }

    try {
      const record = await loadSessionRecord(sessionId)

      if (payload.expectedRevision !== undefined) {
        if (payload.expectedRevision < record.revision) {
          invokeAckSafely(ack, { removed: false, reason: 'STALE_REVISION' })
          socket.emit('resync_required', { currentOpSeq: record.revision, reason: 'REVISION_MISMATCH' })
          return
        }

        if (payload.expectedRevision > record.revision) {
          invokeAckSafely(ack, { removed: false, reason: 'OUT_OF_ORDER_REVISION' })
          socket.emit('resync_required', { currentOpSeq: record.revision, reason: 'REVISION_MISMATCH' })
          return
        }
      }

      const result = await persistTileRemoval({
        sessionId,
        payload,
        removedBy: clientId,
      })

      const removeAck: RemoveTileAck = result.ack.removed
        ? { ...result.ack, newRevision: result.revision }
        : result.ack

      writeLog('info', 'remove_tile_processed', {
        sessionId,
        clientId,
        tileId: payload.tileId,
        removed: removeAck.removed,
        reason: removeAck.removed ? undefined : removeAck.reason,
        idempotent: removeAck.removed ? (removeAck.idempotent ?? false) : false,
        opSeq: 'opSeq' in result ? result.opSeq : null,
      })

      invokeAckSafely(ack, removeAck)

      // Duplicate remove replays reuse opSeq and ack, but should not emit a
      // second tile_removed broadcast.
      if (result.event && 'tileId' in result.event && 'opSeq' in result && removeAck.removed && !removeAck.idempotent) {
        io.to(sessionId).emit('tile_removed', result.event)
        await persistSnapshotIfNeeded(sessionId, result.opSeq, result.session)
      }
    } catch (error) {
      writeLog('error', 'remove_tile_failed', {
        sessionId,
        clientId,
        error,
      })
      invokeAckSafely(ack, { removed: false })
    }
  })

  socket.on('pointer_move', (payload) => {
    if (!isPointerMovePayload(payload)) {
      return
    }

    writeLog('debug', 'pointer_move', {
      sessionId,
      clientId,
      position: payload.position,
    })

    socket.to(sessionId).emit('pointer_update', {
      clientId,
      position: payload.position,
    })
  })

  socket.on('request_snapshot', async () => {
    try {
      const record = await loadSessionReplayRecord(sessionId)
      const snapshot = {
        session: record.session,
        clients: record.clients,
        lastOpSeq: record.lastOpSeq,
        revision: record.revision,
      }

      const sessionState = getSessionState(sessionId)
      sessionState.session = snapshot.session
      sessionState.lastOpSeq = snapshot.lastOpSeq
      sessionState.clients = new Map(snapshot.clients.map((client) => [client.clientId, client]))

      socket.emit('session_snapshot', snapshot)
    } catch (error) {
      writeLog('error', 'request_snapshot_failed', {
        sessionId,
        clientId,
        error,
      })
    }
  })

  // ── Disconnection ──────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    writeLog('info', 'socket_disconnected', {
      clientId,
      sessionId,
    })

    try {
      await finalizeParticipantPresence(sessionId, clientId, Date.now())
      io.to(sessionId).emit('client_left', { clientId })
    } catch (error) {
      writeLog('error', 'socket_disconnect_persist_failed', {
        sessionId,
        clientId,
        error,
      })
    }
  })
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const retentionJob = process.env.NODE_ENV === 'test' ? null : startRetentionJob()

const shutdown = async (signal: string): Promise<void> => {
  writeLog('info', 'shutdown_signal_received', { signal })
  retentionJob?.stop()

  await new Promise<void>((resolve) => io.close(() => resolve()))

  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      writeLog('info', 'server_closed')
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
    writeLog('info', 'server_listening', {
      host: HOST,
      port: PORT,
      corsOrigin: resolveCorsOrigin(process.env.CORS_ORIGIN),
      logLevel: ACTIVE_LOG_LEVEL,
    })
  })
}
