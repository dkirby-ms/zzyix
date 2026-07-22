import crypto from 'crypto'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/postgres-adapter'
import { rateLimit } from 'express-rate-limit'
import { RUNTIME_CHUNK_WORLD_SIZE } from './contracts.js'
import type {
  CanvasSizePreset,
  CreateSessionRequest,
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
  SelectionUpdatePayload,
  BoundsPolicy,
  SessionCanvasConfig,
  ChunkId,
  SubscribeChunksPayload,
  UnsubscribeChunksPayload,
  RequestChunkSnapshotPayload,
  ChunkSnapshotPayload,
  ChunkPayloadMode,
  RealtimeCapabilities,
  ChunkCoordinationMetadata,
} from './contracts.js'
import {
  closeDatabaseBundle,
  getDatabaseBundle,
  listSessionSummaries,
  listTilesByChunksWithParity,
  listActiveParticipants,
  loadSessionReplayRecord,
  loadSessionRecord,
  markParticipantJoined,
  markParticipantLeft,
  persistSnapshotIfNeeded,
  persistTilePlacement,
  persistTileRemoval,
} from './db/index.js'
import { applyDatabaseMigrationsIfNeeded } from './db/migrate.js'
import type { SessionSummaryRecord } from './db/repository.js'
import { defaultBounds, validatePlacement } from './domain/placementSolver.js'
import { startRetentionJob } from './jobs/retention.js'

type AuthoritativeSessionState = {
  session: Session
  canvasConfig: SessionCanvasConfig
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
const sessionClientSockets = new Map<string, Map<string, Set<string>>>()
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
const DEFAULT_BOUNDS_POLICY: BoundsPolicy = {
  mode: 'bounded',
  bounds: defaultBounds,
}
const DEFAULT_CANVAS_CONFIG: SessionCanvasConfig = {
  canvasSize: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  },
  boundsPolicy: DEFAULT_BOUNDS_POLICY,
}

const CANVAS_PRESET_MULTIPLIER: Record<CanvasSizePreset, number> = {
  classic: 1,
  expanded: 2,
  vast: 3,
}

const CHUNK_WORLD_SIZE = RUNTIME_CHUNK_WORLD_SIZE
const CHUNK_ROOM_PREFIX = 'chunk'
const REPLICA_ID = process.env.REPLICA_ID ?? process.env.HOSTNAME ?? `local-${process.pid}`
const SOCKET_AUTH_RATE_LIMIT_WINDOW_MS = Number(process.env.SOCKET_AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000)
const SOCKET_AUTH_RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.SOCKET_AUTH_RATE_LIMIT_MAX_ATTEMPTS ?? 60)

const socketAuthRateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

const pruneSocketAuthRateLimitBuckets = (now: number): void => {
  if (socketAuthRateLimitBuckets.size < 2_000) {
    return
  }

  for (const [key, bucket] of socketAuthRateLimitBuckets) {
    if (bucket.resetAt <= now) {
      socketAuthRateLimitBuckets.delete(key)
    }
  }
}

const sessionCreateRateLimit = rateLimit({
  windowMs: Number(process.env.SESSION_CREATE_RATE_LIMIT_WINDOW_MS ?? 60_000),
  limit: Number(process.env.SESSION_CREATE_RATE_LIMIT_MAX_REQUESTS ?? 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
})

const parseBooleanFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }

  return fallback
}

const parseCanarySessions = (value: string | undefined): Set<string> => {
  if (!value) {
    return new Set()
  }

  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
}

const isChunkStreamingEnabledByDefault = parseBooleanFlag(process.env.FEATURE_CHUNK_STREAMING_ENABLED, true)
const isAggregatePayloadEnabledByDefault = parseBooleanFlag(process.env.FEATURE_CHUNK_AGGREGATE_ENABLED, true)
const isChunkCanaryEnabled = parseBooleanFlag(process.env.FEATURE_CHUNK_CANARY_ENABLED, false)
const canarySessionIds = parseCanarySessions(process.env.FEATURE_CHUNK_CANARY_SESSION_IDS)
const isMultiReplicaReady = parseBooleanFlag(process.env.FEATURE_MULTI_REPLICA_READY, false)

const getRealtimeCapabilities = (sessionId: string): RealtimeCapabilities => {
  const canarySessionEnabled = !isChunkCanaryEnabled || canarySessionIds.has(sessionId)
  const chunkStreamingEnabled = isChunkStreamingEnabledByDefault && canarySessionEnabled
  const aggregateSnapshotEnabled = isAggregatePayloadEnabledByDefault && chunkStreamingEnabled

  return {
    chunkStreamingEnabled,
    aggregateSnapshotEnabled,
    chunkCanaryEnabled: isChunkCanaryEnabled,
    multiReplicaReady: isMultiReplicaReady,
  }
}

const resolvePayloadMode = (
  requestedMode: ChunkPayloadMode | undefined,
  capabilities: RealtimeCapabilities,
): ChunkPayloadMode => {
  if (requestedMode === 'aggregate' && capabilities.aggregateSnapshotEnabled) {
    return 'aggregate'
  }

  return 'fine'
}

const buildCoordinationMetadata = (): ChunkCoordinationMetadata => ({
  replicaId: REPLICA_ID,
  membershipScope: isMultiReplicaReady ? 'adapter-shared' : 'process-local',
  membershipAssumption: isMultiReplicaReady ? 'authoritative' : 'best-effort',
  emittedAt: Date.now(),
})

const chunkTelemetry = {
  subscribeEvents: 0,
  unsubscribeEvents: 0,
  resyncEvents: 0,
  snapshotEvents: 0,
  snapshotBytesFine: 0,
  snapshotBytesAggregate: 0,
}

const emitChunkTelemetry = (
  event: 'chunk_subscribe' | 'chunk_unsubscribe' | 'chunk_snapshot' | 'chunk_resync_required',
  payload: Record<string, unknown>,
): void => {
  writeLog('info', event, payload)
}

const toChunkId = (x: number, y: number): ChunkId => `${x}:${y}`

const worldToChunk = (x: number, y: number, chunkWorldSize: number = CHUNK_WORLD_SIZE): ChunkId => {
  const chunkX = Math.floor(x / chunkWorldSize)
  const chunkY = Math.floor(y / chunkWorldSize)
  return toChunkId(chunkX, chunkY)
}

const parseChunkId = (chunkId: string): { x: number; y: number } | null => {
  const [rawX, rawY] = chunkId.split(':')
  const x = Number(rawX)
  const y = Number(rawY)
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null
  }

  return { x, y }
}

const chunkRoomName = (sessionId: string, chunkId: ChunkId): string => `${CHUNK_ROOM_PREFIX}:${sessionId}:${chunkId}`

const chunkIdsToCoordinates = (chunkIds: ChunkId[]): Array<{ x: number; y: number }> =>
  chunkIds
    .map((chunkId) => parseChunkId(chunkId))
    .filter((chunk): chunk is { x: number; y: number } => chunk !== null)

const isChunkId = (value: unknown): value is ChunkId =>
  typeof value === 'string' && parseChunkId(value) !== null

const isChunkCursor = (value: unknown): value is { opSeq: number; revision: number } => {
  if (!isObjectRecord(value)) {
    return false
  }

  const opSeq = value.opSeq
  const revision = value.revision
  return (
    typeof opSeq === 'number'
    && Number.isInteger(opSeq)
    && opSeq >= 0
    && typeof revision === 'number'
    && Number.isInteger(revision)
    && revision >= 0
  )
}

const isSubscribeChunksPayload = (value: unknown): value is SubscribeChunksPayload => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (typeof value.canvasId !== 'string' || value.canvasId.length === 0) {
    return false
  }

  if (!Array.isArray(value.chunks) || value.chunks.some((chunkId) => !isChunkId(chunkId))) {
    return false
  }

  if (value.payloadMode !== undefined && value.payloadMode !== 'fine' && value.payloadMode !== 'aggregate') {
    return false
  }

  if (value.clientOffsetByChunk !== undefined) {
    if (!isObjectRecord(value.clientOffsetByChunk)) {
      return false
    }

    for (const [chunkId, cursor] of Object.entries(value.clientOffsetByChunk)) {
      if (!isChunkId(chunkId) || !isChunkCursor(cursor)) {
        return false
      }
    }
  }

  return true
}

const isUnsubscribeChunksPayload = (value: unknown): value is UnsubscribeChunksPayload => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (typeof value.canvasId !== 'string' || value.canvasId.length === 0) {
    return false
  }

  if (!Array.isArray(value.chunks) || value.chunks.some((chunkId) => !isChunkId(chunkId))) {
    return false
  }

  return true
}

const isRequestChunkSnapshotPayload = (value: unknown): value is RequestChunkSnapshotPayload => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (typeof value.canvasId !== 'string' || value.canvasId.length === 0) {
    return false
  }

  if (!Array.isArray(value.chunks) || value.chunks.some((chunkId) => !isChunkId(chunkId))) {
    return false
  }

  if (value.payloadMode !== undefined && value.payloadMode !== 'fine' && value.payloadMode !== 'aggregate') {
    return false
  }

  return true
}

const buildChunkSnapshot = (
  canvasId: string,
  chunks: ChunkId[],
  sessionTiles: Session['tiles'],
  currentOpSeq: number,
  currentRevision: number,
  payloadMode: ChunkPayloadMode,
): ChunkSnapshotPayload => {
  const uniqueChunks = Array.from(new Set(chunks))
  const tileGroups = new Map<ChunkId, Session['tiles']>()

  for (const chunkId of uniqueChunks) {
    tileGroups.set(chunkId, [])
  }

  for (const tile of sessionTiles) {
    const tileChunk = worldToChunk(tile.transform.position.x, tile.transform.position.y)
    if (!tileGroups.has(tileChunk)) {
      continue
    }

    tileGroups.get(tileChunk)?.push(tile)
  }

  return {
    canvasId,
    payloadMode,
    coordination: buildCoordinationMetadata(),
    chunks: uniqueChunks.map((chunkId) => ({
      chunkId,
      tiles: payloadMode === 'aggregate' ? [] : (tileGroups.get(chunkId) ?? []),
      aggregate: payloadMode === 'aggregate'
        ? (() => {
            const groupedTiles = tileGroups.get(chunkId) ?? []
            const byShape: Partial<Record<PlaceTilePayload['shape'], number>> = {}
            const byMaterial: Partial<Record<PlaceTilePayload['material'], number>> = {}
            for (const tile of groupedTiles) {
              byShape[tile.shape] = (byShape[tile.shape] ?? 0) + 1
              byMaterial[tile.material] = (byMaterial[tile.material] ?? 0) + 1
            }

            return {
              tileCount: groupedTiles.length,
              byShape,
              byMaterial,
            }
          })()
        : undefined,
      opSeq: currentOpSeq,
      revision: currentRevision,
    })),
    serverOpSeq: currentOpSeq,
    serverRevision: currentRevision,
  }
}

const cloneCanvasConfig = (config: SessionCanvasConfig): SessionCanvasConfig => ({
  canvasSize: {
    width: config.canvasSize.width,
    height: config.canvasSize.height,
  },
  boundsPolicy: config.boundsPolicy.mode === 'bounded'
    ? {
        mode: 'bounded',
        bounds: {
          ...config.boundsPolicy.bounds,
        },
      }
    : {
        mode: 'unbounded',
      },
})

export const buildListSessionsResponse = (summaries: SessionSummaryRecord[]): ListSessionsResponse => ({
  sessions: summaries.map((summary) => ({
    id: summary.id,
    displayName: `Canvas ${summary.id.slice(0, 8)}`,
    participantCount: summary.participantCount,
    canvasSize: {
      width: (sessions.get(summary.id)?.canvasConfig.canvasSize.width ?? DEFAULT_CANVAS_CONFIG.canvasSize.width),
      height: (sessions.get(summary.id)?.canvasConfig.canvasSize.height ?? DEFAULT_CANVAS_CONFIG.canvasSize.height),
    },
    canvasConfig: cloneCanvasConfig(sessions.get(summary.id)?.canvasConfig ?? DEFAULT_CANVAS_CONFIG),
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

const describeDatabaseTarget = (databaseUrl: string | undefined): string | undefined => {
  if (!databaseUrl) {
    return undefined
  }

  try {
    const parsed = new URL(databaseUrl)
    const port = parsed.port || '5432'
    const databaseName = parsed.pathname.replace(/^\//, '') || '(default)'
    return `${parsed.hostname}:${port}/${databaseName}`
  } catch {
    return 'unparseable-database-url'
  }
}

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

const DB_CONNECT_MAX_ATTEMPTS = Number(process.env.DB_CONNECT_MAX_ATTEMPTS ?? 10)
const DB_CONNECT_RETRY_BASE_MS = Number(process.env.DB_CONNECT_RETRY_BASE_MS ?? 3_000)

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const verifyDatabaseConnectivity = async (): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Please set DATABASE_URL to your PostgreSQL connection string.'
    )
  }

  const databaseTarget = describeDatabaseTarget(process.env.DATABASE_URL)

  writeLog('info', 'database_connectivity_check_started', {
    databaseTarget,
    maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
  })

  let lastError: unknown

  for (let attempt = 1; attempt <= DB_CONNECT_MAX_ATTEMPTS; attempt++) {
    const attemptStartedAt = Date.now()
    try {
      const client = await getDatabaseBundle().pool.connect()
      try {
        await client.query('SELECT 1 AS ok')
      } finally {
        client.release()
      }

      writeLog('info', 'database_connectivity_check_succeeded', {
        databaseTarget,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
      })
      return
    } catch (error) {
      lastError = error
      const retryDelayMs = DB_CONNECT_RETRY_BASE_MS * attempt

      if (attempt < DB_CONNECT_MAX_ATTEMPTS) {
        writeLog('warn', 'database_connectivity_check_retrying', {
          databaseTarget,
          attempt,
          maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
          retryDelayMs,
          error,
        })
        await sleep(retryDelayMs)
      } else {
        writeLog('error', 'database_connectivity_check_failed', {
          databaseTarget,
          attempt,
          maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
          durationMs: Date.now() - attemptStartedAt,
          error,
        })
      }
    }
  }

  throw lastError
}

export const isValidTileId = (tileId: string): boolean => UUID_PATTERN.test(tileId)

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isCanvasSizePreset = (value: unknown): value is CanvasSizePreset =>
  value === 'classic' || value === 'expanded' || value === 'vast'

export const isCreateSessionRequest = (value: unknown): value is CreateSessionRequest => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (value.canvasPreset === undefined) {
    return true
  }

  return isCanvasSizePreset(value.canvasPreset)
}

export const resolveCanvasConfigFromPreset = (preset: CanvasSizePreset | undefined): SessionCanvasConfig => {
  const normalizedPreset: CanvasSizePreset = preset ?? 'expanded'
  const multiplier = CANVAS_PRESET_MULTIPLIER[normalizedPreset] ?? CANVAS_PRESET_MULTIPLIER.expanded

  return {
    canvasSize: {
      width: Number((CANVAS_WIDTH * multiplier).toFixed(4)),
      height: Number((CANVAS_HEIGHT * multiplier).toFixed(4)),
    },
    boundsPolicy: {
      mode: 'bounded',
      bounds: {
        minX: Number((defaultBounds.minX * multiplier).toFixed(4)),
        maxX: Number((defaultBounds.maxX * multiplier).toFixed(4)),
        minY: Number((defaultBounds.minY * multiplier).toFixed(4)),
        maxY: Number((defaultBounds.maxY * multiplier).toFixed(4)),
      },
    },
  }
}

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

export const isSelectionUpdatePayload = (payload: unknown): payload is SelectionUpdatePayload => {
  if (!isObjectRecord(payload)) {
    return false
  }

  if (typeof payload.canvasId !== 'string' || payload.canvasId.length === 0) {
    return false
  }

  if (typeof payload.clientId !== 'string' || payload.clientId.length === 0) {
    return false
  }

  if (!isFiniteNumber(payload.updatedAt)) {
    return false
  }

  if (payload.tileId !== undefined) {
    if (typeof payload.tileId !== 'string' || !isValidTileId(payload.tileId)) {
      return false
    }
  }

  return true
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
  canvasConfig: SessionCanvasConfig = DEFAULT_CANVAS_CONFIG,
): AuthoritativeSessionState => {
  const resolvedCanvasConfig = cloneCanvasConfig(canvasConfig)

  return {
    session: {
      id: sessionId,
      tiles: [],
      boundsPolicy: resolvedCanvasConfig.boundsPolicy,
      createdAt: now,
      updatedAt: now,
    },
    canvasConfig: resolvedCanvasConfig,
    clients: new Map(),
    lastOpSeq: 0,
  }
}

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
  preserveSessionId?: string,
): string[] => {
  const removedSessionIds: string[] = []

  for (const [sessionId, state] of sessions) {
    if (preserveSessionId && sessionId === preserveSessionId) {
      continue
    }

    if (shouldCleanupSession(state, now, staleAfterMs)) {
      sessions.delete(sessionId)
      removedSessionIds.push(sessionId)
    }
  }

  return removedSessionIds
}

export const getSessionState = (sessionId: string): AuthoritativeSessionState => {
  cleanupSessions(Date.now(), DEFAULT_SESSION_STALE_MS, sessionId)

  const existing = sessions.get(sessionId)
  if (existing) {
    return existing
  }

  const created = createAuthoritativeSessionState(sessionId)
  sessions.set(sessionId, created)
  return created
}

export const registerClientSocket = (
  sessionId: string,
  clientId: string,
  socketId: string,
): number => {
  let sessionMembership = sessionClientSockets.get(sessionId)
  if (!sessionMembership) {
    sessionMembership = new Map<string, Set<string>>()
    sessionClientSockets.set(sessionId, sessionMembership)
  }

  let clientSockets = sessionMembership.get(clientId)
  if (!clientSockets) {
    clientSockets = new Set<string>()
    sessionMembership.set(clientId, clientSockets)
  }

  clientSockets.add(socketId)
  return clientSockets.size
}

export const unregisterClientSocket = (
  sessionId: string,
  clientId: string,
  socketId: string,
): number => {
  const sessionMembership = sessionClientSockets.get(sessionId)
  if (!sessionMembership) {
    return 0
  }

  const clientSockets = sessionMembership.get(clientId)
  if (!clientSockets) {
    return 0
  }

  clientSockets.delete(socketId)
  const remainingSockets = clientSockets.size

  if (remainingSockets === 0) {
    sessionMembership.delete(clientId)
  }

  if (sessionMembership.size === 0) {
    sessionClientSockets.delete(sessionId)
  }

  return remainingSockets
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
  const validation = validatePlacement(payload.shape, payload.transform, state.session.tiles, state.canvasConfig.boundsPolicy)

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

  writeLog('debug', 'http_request_received', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    origin: req.header('origin') ?? null,
    userAgent: req.header('user-agent') ?? null,
  })

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
app.post('/sessions', sessionCreateRateLimit, async (req, res) => {
  if (!isCreateSessionRequest(req.body ?? {})) {
    res.status(400).json({ error: 'Invalid session creation payload' })
    return
  }

  try {
    const sessionId = crypto.randomUUID()
    const canvasConfig = resolveCanvasConfigFromPreset(req.body?.canvasPreset)
    const sessionState = createAuthoritativeSessionState(sessionId, Date.now(), canvasConfig)
    sessions.set(sessionId, sessionState)

    // Initialize canvas in database to satisfy foreign key constraints
    await loadSessionRecord(sessionId)

    writeLog('info', 'session_created', {
      sessionId,
      canvasPreset: req.body?.canvasPreset ?? 'expanded',
      canvasSize: canvasConfig.canvasSize,
    })

    res.status(200).json({
      session: {
        id: sessionId,
        canvasConfig,
      },
    })
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
      writeLog('debug', 'socket_adapter_skipped', {
        reason: 'DATABASE_URL missing in test mode',
      })
      return
    }

    throw new Error('DATABASE_URL is required for Postgres-backed persistence')
  }

  io.adapter(createAdapter(getDatabaseBundle().pool))

  writeLog('info', 'socket_adapter_configured', {
    adapter: '@socket.io/postgres-adapter',
    databaseTarget: describeDatabaseTarget(process.env.DATABASE_URL),
  })
}

configureRealtimeAdapter()

// ─── Connection Middleware ───────────────────────────────────────────────────

io.use((socket, next) => {
  const now = Date.now()
  pruneSocketAuthRateLimitBuckets(now)

  const addressHeader = socket.handshake.headers['x-forwarded-for']
  const forwardedFor = typeof addressHeader === 'string' ? addressHeader.split(',')[0]?.trim() : undefined
  const rateLimitKey = forwardedFor || socket.handshake.address || socket.conn.remoteAddress || 'unknown'

  const currentBucket = socketAuthRateLimitBuckets.get(rateLimitKey)

  if (!currentBucket || currentBucket.resetAt <= now) {
    socketAuthRateLimitBuckets.set(rateLimitKey, {
      count: 1,
      resetAt: now + SOCKET_AUTH_RATE_LIMIT_WINDOW_MS,
    })
  } else if (currentBucket.count >= SOCKET_AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1_000))
    writeLog('warn', 'socket_auth_rate_limited', {
      rateLimitKey,
      retryAfterSeconds,
      windowMs: SOCKET_AUTH_RATE_LIMIT_WINDOW_MS,
      maxAttempts: SOCKET_AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    })
    return next(new Error(`Too many connection attempts. Retry after ${retryAfterSeconds}s.`))
  } else {
    currentBucket.count += 1
    socketAuthRateLimitBuckets.set(rateLimitKey, currentBucket)
  }

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
  registerClientSocket(sessionId, clientId, socket.id)

  socket.onAny((eventName, ...args) => {
    writeLog('debug', 'socket_event_received', {
      sessionId,
      clientId,
      eventName,
      argCount: args.length,
    })
  })

  const initializeConnection = async (): Promise<void> => {
    const joinedAt = Date.now()

    socket.join(sessionId)
    const connectionState = await initializeParticipantPresence(sessionId, clientId, joinedAt)
    const sessionState = getSessionState(sessionId)
    sessionState.session = connectionState.snapshot.session
    sessionState.session.boundsPolicy = sessionState.canvasConfig.boundsPolicy
    sessionState.lastOpSeq = connectionState.snapshot.lastOpSeq
    sessionState.clients = new Map(connectionState.snapshot.clients.map((client) => [client.clientId, client]))

    writeLog('info', 'socket_joined', {
      clientId,
      sessionId,
      roomSize: io.sockets.adapter.rooms.get(sessionId)?.size ?? 0,
    })

    socket.emit('session_snapshot', {
      ...connectionState.snapshot,
      session: {
        ...connectionState.snapshot.session,
        boundsPolicy: sessionState.canvasConfig.boundsPolicy,
      },
      canvasConfig: sessionState.canvasConfig,
      realtimeCapabilities: getRealtimeCapabilities(sessionId),
    })

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

      const sessionState = getSessionState(sessionId)
      const validation = validatePlacement(
        payload.shape,
        payload.transform,
        record.session.tiles,
        sessionState.canvasConfig.boundsPolicy,
      )

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
        const chunkId = worldToChunk(result.event.tile.transform.position.x, result.event.tile.transform.position.y)
        io.to(chunkRoomName(sessionId, chunkId)).emit('chunk_tile_placed', {
          canvasId: sessionId,
          chunkId,
          tile: result.event.tile,
          placedBy: result.event.placedBy,
          opSeq: result.event.opSeq,
          revision: result.event.revision,
        })
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
        const removedTile = record.session.tiles.find((tile) => tile.id === payload.tileId)
        if (removedTile) {
          const chunkId = worldToChunk(removedTile.transform.position.x, removedTile.transform.position.y)
          io.to(chunkRoomName(sessionId, chunkId)).emit('chunk_tile_removed', {
            canvasId: sessionId,
            chunkId,
            tileId: result.event.tileId,
            removedBy: result.event.removedBy,
            opSeq: result.event.opSeq,
            revision: result.event.revision,
          })
        }
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

  socket.on('subscribe_chunks', async (payload) => {
    if (!isSubscribeChunksPayload(payload) || payload.canvasId !== sessionId) {
      return
    }

    const capabilities = getRealtimeCapabilities(sessionId)
    if (!capabilities.chunkStreamingEnabled) {
      writeLog('debug', 'subscribe_chunks_ignored_by_flag', {
        sessionId,
        clientId,
      })
      return
    }

    const chunks = Array.from(new Set(payload.chunks))
    const payloadMode = resolvePayloadMode(payload.payloadMode, capabilities)
    for (const chunkId of chunks) {
      socket.join(chunkRoomName(sessionId, chunkId))
    }

    chunkTelemetry.subscribeEvents += chunks.length
    emitChunkTelemetry('chunk_subscribe', {
      sessionId,
      clientId,
      chunkCount: chunks.length,
      payloadMode,
      totalSubscribeEvents: chunkTelemetry.subscribeEvents,
    })

    try {
      const chunkRead = await listTilesByChunksWithParity(sessionId, chunkIdsToCoordinates(chunks))
      const snapshot = buildChunkSnapshot(
        sessionId,
        chunks,
        chunkRead.tiles,
        chunkRead.opSeq,
        chunkRead.revision,
        payloadMode,
      )

      const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
      chunkTelemetry.snapshotEvents += 1
      if (payloadMode === 'aggregate') {
        chunkTelemetry.snapshotBytesAggregate += snapshotBytes
      } else {
        chunkTelemetry.snapshotBytesFine += snapshotBytes
      }

      emitChunkTelemetry('chunk_snapshot', {
        sessionId,
        clientId,
        payloadMode,
        chunkCount: chunks.length,
        snapshotBytes,
        totalSnapshotEvents: chunkTelemetry.snapshotEvents,
        snapshotBytesFine: chunkTelemetry.snapshotBytesFine,
        snapshotBytesAggregate: chunkTelemetry.snapshotBytesAggregate,
      })

      socket.emit('chunk_snapshot', snapshot)

      if (!chunkRead.parityMatched) {
        writeLog('warn', 'chunk_snapshot_parity_fallback', {
          sessionId,
          clientId,
          chunks,
        })
      }

      if (payload.clientOffsetByChunk) {
        for (const chunkId of chunks) {
          const clientCursor = payload.clientOffsetByChunk[chunkId]
          if (!clientCursor) {
            continue
          }

          if (clientCursor.opSeq > chunkRead.opSeq || clientCursor.revision > chunkRead.revision) {
            chunkTelemetry.resyncEvents += 1
            emitChunkTelemetry('chunk_resync_required', {
              sessionId,
              clientId,
              chunkId,
              payloadMode,
              currentOpSeq: chunkRead.opSeq,
              currentRevision: chunkRead.revision,
              totalResyncEvents: chunkTelemetry.resyncEvents,
            })
            socket.emit('chunk_resync_required', {
              canvasId: sessionId,
              chunkId,
              payloadMode,
              coordination: buildCoordinationMetadata(),
              currentOpSeq: chunkRead.opSeq,
              currentRevision: chunkRead.revision,
              reason: 'REVISION_MISMATCH',
            })
          }
        }
      }
    } catch (error) {
      writeLog('error', 'subscribe_chunks_failed', {
        sessionId,
        clientId,
        error,
      })
    }
  })

  socket.on('unsubscribe_chunks', (payload) => {
    if (!isUnsubscribeChunksPayload(payload) || payload.canvasId !== sessionId) {
      return
    }

    const capabilities = getRealtimeCapabilities(sessionId)
    if (!capabilities.chunkStreamingEnabled) {
      return
    }

    const chunks = Array.from(new Set(payload.chunks))
    chunkTelemetry.unsubscribeEvents += chunks.length
    emitChunkTelemetry('chunk_unsubscribe', {
      sessionId,
      clientId,
      chunkCount: chunks.length,
      totalUnsubscribeEvents: chunkTelemetry.unsubscribeEvents,
    })

    for (const chunkId of chunks) {
      socket.leave(chunkRoomName(sessionId, chunkId))
    }
  })

  socket.on('request_chunk_snapshot', async (payload) => {
    if (!isRequestChunkSnapshotPayload(payload) || payload.canvasId !== sessionId) {
      return
    }

    const capabilities = getRealtimeCapabilities(sessionId)
    if (!capabilities.chunkStreamingEnabled) {
      return
    }

    try {
      const chunkRead = await listTilesByChunksWithParity(sessionId, chunkIdsToCoordinates(payload.chunks))
      const payloadMode = resolvePayloadMode(payload.payloadMode, capabilities)
      const snapshot = buildChunkSnapshot(
        sessionId,
        payload.chunks,
        chunkRead.tiles,
        chunkRead.opSeq,
        chunkRead.revision,
        payloadMode,
      )

      const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8')
      chunkTelemetry.snapshotEvents += 1
      if (payloadMode === 'aggregate') {
        chunkTelemetry.snapshotBytesAggregate += snapshotBytes
      } else {
        chunkTelemetry.snapshotBytesFine += snapshotBytes
      }

      emitChunkTelemetry('chunk_snapshot', {
        sessionId,
        clientId,
        payloadMode,
        chunkCount: payload.chunks.length,
        snapshotBytes,
        totalSnapshotEvents: chunkTelemetry.snapshotEvents,
        snapshotBytesFine: chunkTelemetry.snapshotBytesFine,
        snapshotBytesAggregate: chunkTelemetry.snapshotBytesAggregate,
      })

      socket.emit('chunk_snapshot', snapshot)

      if (!chunkRead.parityMatched) {
        writeLog('warn', 'chunk_snapshot_parity_fallback', {
          sessionId,
          clientId,
          chunks: payload.chunks,
        })
      }
    } catch (error) {
      writeLog('error', 'request_chunk_snapshot_failed', {
        sessionId,
        clientId,
        error,
      })
    }
  })

  socket.on('selection_update', (payload) => {
    if (!isSelectionUpdatePayload(payload)) {
      return
    }

    if (payload.canvasId !== sessionId || payload.clientId !== clientId) {
      writeLog('warn', 'selection_update_ignored_invalid_membership', {
        sessionId,
        clientId,
        payloadCanvasId: payload.canvasId,
        payloadClientId: payload.clientId,
      })
      return
    }

    writeLog('debug', 'selection_update', {
      sessionId,
      clientId,
      tileId: payload.tileId,
    })

    socket.to(sessionId).emit('selection_update', {
      canvasId: sessionId,
      clientId,
      tileId: payload.tileId,
      updatedAt: payload.updatedAt,
    })
  })

  socket.on('request_snapshot', async () => {
    try {
      const record = await loadSessionReplayRecord(sessionId)
      const sessionState = getSessionState(sessionId)
      const snapshot = {
        session: record.session,
        canvasConfig: sessionState.canvasConfig,
        clients: record.clients,
        lastOpSeq: record.lastOpSeq,
        revision: record.revision,
      }

      sessionState.session = snapshot.session
      sessionState.session.boundsPolicy = sessionState.canvasConfig.boundsPolicy
      sessionState.lastOpSeq = snapshot.lastOpSeq
      sessionState.clients = new Map(snapshot.clients.map((client) => [client.clientId, client]))

      socket.emit('session_snapshot', {
        ...snapshot,
        session: {
          ...snapshot.session,
          boundsPolicy: sessionState.canvasConfig.boundsPolicy,
        },
      })
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
    const remainingSockets = unregisterClientSocket(sessionId, clientId, socket.id)

    writeLog('info', 'socket_disconnected', {
      clientId,
      sessionId,
      remainingSockets,
    })

    if (remainingSockets > 0) {
      writeLog('debug', 'socket_disconnected_presence_deferred', {
        sessionId,
        clientId,
        remainingSockets,
      })
      return
    }

    const connectedClientCount = (io.engine as { clientsCount?: number }).clientsCount ?? 0

    if (connectedClientCount > 1) {
      writeLog('warn', 'presence_leave_gating_process_local', {
        sessionId,
        clientId,
        socketId: socket.id,
        connectedClientCount,
        note: 'last-socket leave gating is process-local; enforce sticky sessions or add shared membership state for multi-replica correctness',
      })
    }

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
  writeLog('info', 'server_startup_begin', {
    host: HOST,
    port: PORT,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigin: resolveCorsOrigin(process.env.CORS_ORIGIN),
    logLevel: ACTIVE_LOG_LEVEL,
    databaseTarget: describeDatabaseTarget(process.env.DATABASE_URL),
    featureChunkStreamingEnabled: isChunkStreamingEnabledByDefault,
    featureChunkAggregateEnabled: isAggregatePayloadEnabledByDefault,
    featureChunkCanaryEnabled: isChunkCanaryEnabled,
    featureChunkCanarySessionCount: canarySessionIds.size,
    featureMultiReplicaReady: isMultiReplicaReady,
    replicaId: REPLICA_ID,
  })

  void verifyDatabaseConnectivity()
    .then(() => {
      return applyDatabaseMigrationsIfNeeded()
    })
    .then((migrationsApplied) => {
      writeLog('info', 'database_migration_check_complete', {
        migrationsApplied,
      })

      httpServer.listen(PORT, HOST, () => {
        writeLog('info', 'server_listening', {
          host: HOST,
          port: PORT,
          corsOrigin: resolveCorsOrigin(process.env.CORS_ORIGIN),
          logLevel: ACTIVE_LOG_LEVEL,
        })
      })
    })
    .catch((error) => {
      writeLog('error', 'server_startup_failed', { error })
      process.exit(1)
    })
}
