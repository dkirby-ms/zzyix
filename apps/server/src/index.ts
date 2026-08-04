import crypto from 'crypto'
import { lookup } from 'node:dns/promises'
import express from 'express'
import { sql } from 'drizzle-orm'
import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'
import { createAdapter } from '@socket.io/postgres-adapter'
import { rateLimit } from 'express-rate-limit'
import { trace } from '@opentelemetry/api'
import { SCHEMA_VERSION, QUILT_PROTOCOL_VERSION } from './contracts.js'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  ConnectionAuth,
  PlaceTilePayload,
  RemoveTilePayload,
  ChunkId,
  QuiltProtocolLimits,
  QuiltRoomRequest,
  SubscribeQuiltAreaAck,
  QuiltClientRuntimeMetrics,
  CanonicalClientTelemetry,
  MeResponse,
  AccountDeletionResponse,
  OwnershipCommandResponse,
  QuiltMutationRejectCode,
  QuiltPlaceTileAck,
  QuiltPlaceTileRequest,
  QuiltRemoveTileAck,
  QuiltRemoveTileRequest,
  CanonicalWorldDescriptor,
  CanonicalWorldUnavailableError,
  SafeApiError,
} from './contracts.js'
import type { LegacySession as Session } from './domain/legacySession.js'
import {
  closeDatabaseBundle,
  getDatabaseBundle,
  loadPatchDeliverySnapshot,
  loadPatchDeliveryOperationsAfter,
  loadQuiltDeliveryContext,
  loadPrincipalProfile,
  abandonPatch,
  acceptOwnershipTransfer,
  cancelOwnershipTransfer,
  claimPatch,
  createOwnershipTransfer,
  recoverPrincipalDeletion,
  requestPrincipalDeletion,
  persistQuiltTilePlacement,
  persistQuiltTileRemoval,
  discoverCanonicalWorld,
  ensureCanonicalPatchAssignment,
  provisionCanonicalWorld,
  activateCanonicalWorld,
  listEligibleCanonicalPatches,
  listQuiltOccupancy,
  resolveCanonicalPatchNavigation,
  acquireQuiltPresenceLease,
  renewQuiltPresenceLease,
  releaseQuiltPresenceLease,
  reapExpiredQuiltPresenceLeases,
} from './db/index.js'
import { prepareDatabaseSchemaForStartup } from './db/migrate.js'
import { ResourceNotFoundError } from './db/repository.js'
import type { PatchDeliveryOperation, QuiltDeliveryContext } from './db/repository.js'
import { startRetentionJob } from './jobs/retention.js'
import { buildPatchRoomAccess, resolveQuiltRooms } from './realtime/quiltRooms.js'
import { loadAuthenticationConfig } from './auth/config.js'
import { createTokenVerifier, type TokenVerifier } from './auth/tokenVerifier.js'
import {
  resolveProtocolV2MutationEnabled,
  validateProductionRolloutGates,
} from './startup/rolloutGates.js'
import { redactTelemetry } from './logging/redact.js'
import { resolveDeletionPendingPrincipal, resolveOrProvisionPrincipal } from './auth/principalContext.js'
import {
  buildMeResponse,
  createHttpAuth,
  getPrincipalContext,
  sendAuthenticationError,
  sendResourceNotFound,
} from './auth/httpAuth.js'
import { AuthenticationError } from './auth/errors.js'
import { createSocketAuth } from './auth/socketAuth.js'
import { configureQuiltTelemetry, emitQuiltTelemetry } from './migration/quiltTelemetry.js'
import {
  consumeCanonicalAttempt,
  consumeObservedCanonicalCycle,
  issueCanonicalAttempt,
  observeCanonicalCycle,
  rotateCanonicalLineage,
} from './migration/canonicalAttempts.js'
import { parseCanonicalTelemetryEvent } from './operations/canonicalRetirementReportCli.js'
import { tileShapeValues, materialVariantValues } from './db/types.js'

const TILE_SHAPES = new Set<PlaceTilePayload['shape']>(tileShapeValues)
const MATERIAL_VARIANTS = new Set<PlaceTilePayload['material']>(materialVariantValues)

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173'
const QUILT_PRESENCE_LEASE_TTL_MS = Number(process.env.QUILT_PRESENCE_LEASE_TTL_MS ?? 45_000)
const QUILT_PRESENCE_HEARTBEAT_MS = Number(process.env.QUILT_PRESENCE_HEARTBEAT_MS ?? 15_000)
const CANONICAL_TARGET_VALIDATION_INTERVAL_MS = Number(process.env.CANONICAL_TARGET_VALIDATION_INTERVAL_MS ?? 30_000)

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
const isProtocolV2MutationEnabled = resolveProtocolV2MutationEnabled()
const QUILT_PROTOCOL_LIMITS: QuiltProtocolLimits = {
  maxRoomsPerConnection: Number(process.env.QUILT_V2_MAX_ROOMS_PER_CONNECTION ?? 64),
  maxRoomsPerRequest: Number(process.env.QUILT_V2_MAX_ROOMS_PER_REQUEST ?? 32),
  maxChunksPerRequest: Number(process.env.QUILT_V2_MAX_CHUNKS_PER_REQUEST ?? 64),
  maxRoomChurnPerMinute: Number(process.env.QUILT_V2_MAX_ROOM_CHURN_PER_MINUTE ?? 120),
  maxSnapshotTiles: Number(process.env.QUILT_V2_MAX_SNAPSHOT_TILES ?? 2_000),
  maxPayloadBytes: Number(process.env.QUILT_V2_MAX_PAYLOAD_BYTES ?? 256 * 1024),
  source: 'canary-default',
}

export const isQuiltRoomRequest = (value: unknown): value is QuiltRoomRequest => {
  if (!isObjectRecord(value)) return false
  return typeof value.requestId === 'string'
    && (value.kind === 'fine' || value.kind === 'aggregate' || value.kind === 'presence' || value.kind === 'events')
    && typeof value.row === 'number'
    && typeof value.column === 'number'
    && (value.chunkIds === undefined || Array.isArray(value.chunkIds))
}

export const isQuiltClientRuntimeMetrics = (value: unknown): value is QuiltClientRuntimeMetrics => {
  if (!isObjectRecord(value)
    || typeof value.quiltId !== 'string'
    || typeof value.sampleId !== 'string'
    || !UUID_PATTERN.test(value.sampleId)
    || typeof value.entryAttemptId !== 'string'
    || !UUID_PATTERN.test(value.entryAttemptId)
    || !Number.isSafeInteger(value.canonicalGeneration)
    || Number(value.canonicalGeneration) <= 0) return false
  const measurements = [
    value.retainedPatchCount,
    value.retainedTileCount,
    value.sceneObjectCount,
    value.drawCalls,
    value.frameTimeMs,
  ]
  return measurements.every((measurement) =>
    typeof measurement === 'number' && Number.isFinite(measurement) && measurement >= 0,
  )
}

export const recordQuiltClientRuntimeMetrics = (
  payload: unknown,
  context: {
    canaryTelemetryEnabled: boolean
    quiltId: string
    entryAttemptId: string
    canonicalGeneration: number
    cohort: 'canary' | 'global'
  },
): boolean => {
  if (
    !context.canaryTelemetryEnabled
    || !isQuiltClientRuntimeMetrics(payload)
    || payload.quiltId !== context.quiltId
    || payload.entryAttemptId !== context.entryAttemptId
    || payload.canonicalGeneration !== context.canonicalGeneration
  ) return false

  emitQuiltTelemetry({
    schemaVersion: 1,
    eventId: payload.sampleId,
    attemptId: payload.entryAttemptId,
    occurredAt: new Date().toISOString(),
    name: 'client_runtime',
    quiltId: context.quiltId,
    canonicalGeneration: context.canonicalGeneration,
    cohort: context.cohort,
    outcome: 'sampled',
    retainedPatchCount: payload.retainedPatchCount,
    retainedTileCount: payload.retainedTileCount,
    sceneObjectCount: payload.sceneObjectCount,
    drawCalls: payload.drawCalls,
    frameTimeMs: payload.frameTimeMs,
  })
  return true
}

const buildCanonicalClientTelemetryEvent = (
  payload: unknown,
  context: { attemptId: string; parentAttemptId?: string; quiltId: string; canonicalGeneration: number; cohort: 'canary' | 'global' },
): ReturnType<typeof parseCanonicalTelemetryEvent> | null => {
  if (!isObjectRecord(payload) || Object.hasOwn(payload, 'attemptId')) return null
  try {
    const event = parseCanonicalTelemetryEvent({
      ...payload,
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      attemptId: context.attemptId,
      ...(context.parentAttemptId ? { parentAttemptId: context.parentAttemptId } : {}),
      occurredAt: new Date().toISOString(),
      quiltId: context.quiltId,
      canonicalGeneration: context.canonicalGeneration,
      cohort: context.cohort,
    })
    if (!['canonical_entry', 'canonical_reconnect', 'canonical_resubscribe'].includes(event.name)) return null
    return event
  } catch {
    return null
  }
}

export const recordCanonicalClientTelemetry = (
  payload: unknown,
  context: { attemptId: string; parentAttemptId?: string; quiltId: string; canonicalGeneration: number; cohort: 'canary' | 'global' },
): boolean => {
  const event = buildCanonicalClientTelemetryEvent(payload, context)
  if (!event) return false
  emitQuiltTelemetry(event)
  return true
}

export const renewPresenceLeaseOrDisconnect = async (
  renew: () => Promise<boolean>,
  disconnect: () => void,
): Promise<boolean> => {
  try {
    if (await renew()) return true
  } catch {
    // Rejected renewals and missing rows both mean the server no longer owns this lease.
  }
  disconnect()
  return false
}

export const recordCanonicalSafetyTelemetry = (
  code: 'descriptor_leak' | 'target_invalidated',
  context: { attemptId: string; quiltId: string; canonicalGeneration: number; cohort: 'canary' | 'global'; requestId?: string },
): void => {
  emitQuiltTelemetry({
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    attemptId: context.attemptId,
    occurredAt: new Date().toISOString(),
    quiltId: context.quiltId,
    canonicalGeneration: context.canonicalGeneration,
    cohort: context.cohort,
    name: 'canonical_safety',
    outcome: 'detected',
    code,
    ...(context.requestId ? { requestId: context.requestId } : {}),
  })
}

export const resolveLegacySocketAccess = (context: QuiltDeliveryContext | null): {
  allowed: boolean
  mutationAllowed: boolean
} => {
  if (!context || context.patches.length === 0) return { allowed: false, mutationAllowed: false }
  const access = context.patches.map(buildPatchRoomAccess)
  return {
    allowed: access.every((patch) =>
      patch.publishesExistence
      && patch.principalFine
      && patch.principalAggregate
      && patch.principalPresence
      && patch.principalEvents,
    ),
    mutationAllowed: context.patches.every((patch) => patch.isOwner),
  }
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

const isChunkId = (value: unknown): value is ChunkId =>
  typeof value === 'string' && parseChunkId(value) !== null

export const buildChunkAggregate = (tiles: Session['tiles']) => {
  const byShape: Partial<Record<PlaceTilePayload['shape'], number>> = {}
  const byMaterial: Partial<Record<PlaceTilePayload['material'], number>> = {}
  for (const tile of tiles) {
    byShape[tile.shape] = (byShape[tile.shape] ?? 0) + 1
    byMaterial[tile.material] = (byMaterial[tile.material] ?? 0) + 1
  }
  return { tileCount: tiles.length, byShape, byMaterial }
}

export const haveEqualChunkScope = (left: readonly ChunkId[] | undefined, right: readonly ChunkId[]): boolean => {
  if (!left || left.length !== right.length) return false
  const leftSet = new Set(left)
  return leftSet.size === right.length && right.every((chunkId) => leftSet.has(chunkId))
}

export const selectScopedReplayOperations = (
  operations: PatchDeliveryOperation[],
  acceptedChunkIds: readonly ChunkId[],
): PatchDeliveryOperation[] | null => {
  const acceptedChunks = new Set(acceptedChunkIds)
  const selected: PatchDeliveryOperation[] = []

  for (const operation of operations) {
    if (operation.chunkIds.length === 0) return null
    if (operation.chunkIds.some((chunkId) => acceptedChunks.has(chunkId as ChunkId))) {
      selected.push(operation)
    }
  }
  return selected
}

export const quiltChunkRoomName = (canonicalRoomId: string, chunkId: ChunkId): string =>
  `${canonicalRoomId}:chunk:${chunkId}`

export const quiltPresenceRoomName = (quiltId: string): string => `quilt:${quiltId}:presence`

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
  const contextSuffix = context ? ` ${serializeLogValue(redactTelemetry(context))}` : ''
  const activeSpanContext = trace.getActiveSpan()?.spanContext()
  const traceSuffix = activeSpanContext
    ? ` traceId=${activeSpanContext.traceId} spanId=${activeSpanContext.spanId}`
    : ''
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextSuffix}${traceSuffix}`

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

configureQuiltTelemetry((event) => {
  writeLog(event.name === 'dual_read_parity' && event.dimensions?.matched === false ? 'warn' : 'info',
    `quilt_migration_${event.name}`, event)
})

const DB_CONNECT_MAX_ATTEMPTS = Number(process.env.DB_CONNECT_MAX_ATTEMPTS ?? 10)
const DB_CONNECT_RETRY_BASE_MS = Number(process.env.DB_CONNECT_RETRY_BASE_MS ?? 3_000)
const TEST_CONTROL_HEADER = 'x-zzyix-test-token'
const TEST_CONTROL_DEFAULT_TOKEN = 'zzyix-e2e-token'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const resolveDatabaseUrl = (): string => {
  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Please set DATABASE_URL to your PostgreSQL connection string.'
    )
  }

  const databaseUrl = rawUrl.trim()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is empty after trimming whitespace')
  }

  if (databaseUrl.startsWith('secretref:')) {
    throw new Error(
      'DATABASE_URL still contains a secret reference token. ' +
      'In ACA, the environment variable must resolve to the real Postgres URL value.'
    )
  }

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('DATABASE_URL is not a valid URL')
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://')
  }

  if (!parsed.hostname) {
    throw new Error('DATABASE_URL is missing a hostname')
  }

  process.env.DATABASE_URL = databaseUrl
  return databaseUrl
}

const verifyDatabaseHostnameResolution = async (databaseUrl: string): Promise<void> => {
  const parsed = new URL(databaseUrl)
  const hostname = parsed.hostname
  let lastError: unknown

  for (let attempt = 1; attempt <= DB_CONNECT_MAX_ATTEMPTS; attempt++) {
    try {
      const addresses = await lookup(hostname, { all: true })
      writeLog('info', 'database_dns_resolution_succeeded', {
        hostname,
        attempt,
        addressCount: addresses.length,
        families: Array.from(new Set(addresses.map((entry) => entry.family))).sort(),
      })
      return
    } catch (error) {
      lastError = error
      const retryDelayMs = DB_CONNECT_RETRY_BASE_MS * attempt

      if (attempt < DB_CONNECT_MAX_ATTEMPTS) {
        writeLog('warn', 'database_dns_resolution_retrying', {
          hostname,
          attempt,
          maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
          retryDelayMs,
          error,
        })
        await sleep(retryDelayMs)
      } else {
        writeLog('error', 'database_dns_resolution_failed', {
          hostname,
          attempt,
          maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
          error,
        })
      }
    }
  }

  throw lastError
}

const verifyDatabaseConnectivity = async (): Promise<void> => {
  const databaseUrl = resolveDatabaseUrl()

  const databaseTarget = describeDatabaseTarget(databaseUrl)

  writeLog('info', 'database_connectivity_check_started', {
    databaseTarget,
    maxAttempts: DB_CONNECT_MAX_ATTEMPTS,
  })

  await verifyDatabaseHostnameResolution(databaseUrl)

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

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

const assertTestDatabaseSafety = (databaseUrl: string): void => {
  let parsed: URL

  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('Unable to parse DATABASE_URL for test safety checks')
  }

  if (!isLoopbackHostname(parsed.hostname)) {
    throw new Error(
      `Refusing to start in test mode with non-local database host (${parsed.hostname}). ` +
      'Use a localhost/loopback DATABASE_URL for Playwright and end-to-end runs.'
    )
  }
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

const isPatchRevisionMap = (value: unknown): value is Record<string, number> =>
  isObjectRecord(value)
  && Object.keys(value).length > 0
  && Object.entries(value).every(([patchId, revision]) =>
    UUID_PATTERN.test(patchId)
    && Number.isSafeInteger(revision)
    && Number(revision) >= 0,
  )

export const isQuiltPlaceTileRequest = (payload: unknown): payload is QuiltPlaceTileRequest =>
  isObjectRecord(payload)
  && !('principalId' in payload)
  && typeof payload.quiltId === 'string'
  && UUID_PATTERN.test(payload.quiltId)
  && typeof payload.operationId === 'string'
  && UUID_PATTERN.test(payload.operationId)
  && isPatchRevisionMap(payload.expectedPatchRevisions)
  && isPlaceTilePayload(payload.tile)
  && payload.tile.expectedRevision === undefined

export const isQuiltRemoveTileRequest = (payload: unknown): payload is QuiltRemoveTileRequest =>
  isObjectRecord(payload)
  && !('principalId' in payload)
  && typeof payload.quiltId === 'string'
  && UUID_PATTERN.test(payload.quiltId)
  && typeof payload.operationId === 'string'
  && UUID_PATTERN.test(payload.operationId)
  && isPatchRevisionMap(payload.expectedPatchRevisions)
  && typeof payload.tileId === 'string'
  && UUID_PATTERN.test(payload.tileId)

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

export const isSocketHandshakeOriginAllowed = (
  requestOrigin: string | string[] | undefined,
  allowedOrigin: string | string[],
  nodeEnv: string | undefined,
): boolean => {
  if (requestOrigin === undefined) {
    return nodeEnv !== 'production'
  }

  return typeof requestOrigin === 'string'
    && requestOrigin !== 'null'
    && isOriginAllowed(requestOrigin, allowedOrigin)
}

// ─── Configuration ────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? '0.0.0.0'

// ─── Initialize Express ──────────────────────────────────────────────────────

export const app = express()
export const httpServer = createServer(app)
const isTestControlEnabled = process.env.NODE_ENV === 'test' && parseBooleanFlag(process.env.E2E_TEST_MODE, false)
const testControlToken = (process.env.E2E_RESET_TOKEN ?? TEST_CONTROL_DEFAULT_TOKEN).trim()
const HTTP_RATE_LIMIT_WINDOW_MS = Number(process.env.HTTP_RATE_LIMIT_WINDOW_MS ?? 60_000)
const HTTP_HEALTH_RATE_LIMIT_MAX = Number(process.env.HTTP_HEALTH_RATE_LIMIT_MAX ?? 60)
const HTTP_AUTH_READ_RATE_LIMIT_MAX = Number(process.env.HTTP_AUTH_READ_RATE_LIMIT_MAX ?? 240)
const HTTP_AUTH_MUTATION_RATE_LIMIT_MAX = Number(process.env.HTTP_AUTH_MUTATION_RATE_LIMIT_MAX ?? 120)
const HTTP_TEST_CONTROL_RATE_LIMIT_MAX = Number(process.env.HTTP_TEST_CONTROL_RATE_LIMIT_MAX ?? 180)

app.use(express.json())

const createHttpRateLimiter = (max: number, message: string): ReturnType<typeof rateLimit> => rateLimit({
  windowMs: HTTP_RATE_LIMIT_WINDOW_MS,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
})

const authenticatedReadRateLimiter = createHttpRateLimiter(
  HTTP_AUTH_READ_RATE_LIMIT_MAX,
  'Too many authenticated read requests, please try again later.',
)
const authenticatedMutationRateLimiter = createHttpRateLimiter(
  HTTP_AUTH_MUTATION_RATE_LIMIT_MAX,
  'Too many authenticated mutation requests, please try again later.',
)
const healthRateLimiter = createHttpRateLimiter(
  HTTP_HEALTH_RATE_LIMIT_MAX,
  'Too many health check requests, please try again later.',
)
const testControlRateLimiter = createHttpRateLimiter(
  HTTP_TEST_CONTROL_RATE_LIMIT_MAX,
  'Too many test control requests, please try again later.',
)

let configuredTokenVerifier: TokenVerifier | undefined
export const configureTokenVerifierForTests = (verifier: TokenVerifier): void => {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test token verification can only be configured in test mode')
  configuredTokenVerifier = verifier
}
const configureAuthentication = (): void => {
  configuredTokenVerifier ??= createTokenVerifier(loadAuthenticationConfig())
}
const verifyAccessToken: TokenVerifier = (token) => {
  configureAuthentication()
  if (!configuredTokenVerifier) throw new Error('Authentication verifier is unavailable')
  return configuredTokenVerifier(token)
}
const requireHttpPrincipal = createHttpAuth(verifyAccessToken, resolveOrProvisionPrincipal)
const requireDeletionPendingPrincipal = createHttpAuth(verifyAccessToken, resolveDeletionPendingPrincipal)

export const ownershipRequest = (value: unknown, fields: string[]): value is Record<string, string> =>
  isObjectRecord(value)
  && typeof value.operationId === 'string'
  && UUID_PATTERN.test(value.operationId)
  && fields.every((field) => typeof value[field] === 'string' && UUID_PATTERN.test(value[field]))

const sendInvalidOwnershipRequest = (res: express.Response): void => {
  res.status(400).json({
    code: 'invalid_request',
    message: 'The request payload is invalid.',
    requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
  })
}

export const sendOwnershipResult = (
  res: express.Response,
  result: { succeeded?: boolean; claimed?: boolean; idempotent: boolean; transferId?: string; revision?: number },
): void => {
  const succeeded = result.succeeded ?? result.claimed ?? false
  if (!succeeded) {
    res.status(409).json({
      code: 'ownership_command_denied',
      message: 'The ownership command could not be completed.',
      requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
    })
    return
  }
  res.status(200).json({
    status: 'succeeded', idempotent: result.idempotent,
    ...(result.transferId ? { transferId: result.transferId } : {}),
    ...(result.revision !== undefined ? { revision: result.revision } : {}),
  } satisfies OwnershipCommandResponse)
}

app.use((_req, res, next) => {
  res.setHeader('x-request-id', crypto.randomUUID())
  next()
})

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
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')

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
app.get('/health', healthRateLimiter, async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'error'
  try {
    // Use a lightweight query to verify the pooled DB connection is ready.
    await getDatabaseBundle().pool.query('SELECT 1')
    dbStatus = 'ok'
  } catch {
    dbStatus = 'error'
  }

  const healthy = dbStatus === 'ok'
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    version: process.env.npm_package_version ?? '0.0.0',
    checks: { db: dbStatus },
  })
})

app.get('/me', authenticatedReadRateLimiter, requireHttpPrincipal, async (req, res) => {
  const principal = getPrincipalContext(req)
  const profile = await loadPrincipalProfile(principal.principalId)
  const response: MeResponse = buildMeResponse(profile)
  res.status(200).json(response)
})

export const sendCanonicalWorldDiscovery = async (
  res: express.Response,
  loader: () => Promise<CanonicalWorldDescriptor | null> = discoverCanonicalWorld,
  discoveryEnabled = true,
  attemptId?: string,
): Promise<void> => {
  const requestId = res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID()
  const startedAt = performance.now()
  let descriptor: CanonicalWorldDescriptor | null = null
  let outcome: 'success' | 'unavailable' | 'error' = 'error'
  let httpStatus: 200 | 503 | 500 = 500
  let reasonCode: 'missing' | 'inactive' | 'invalid_target' | 'internal_error' = 'internal_error'
  try {
    if (!discoveryEnabled) {
      outcome = 'unavailable'; httpStatus = 503; reasonCode = 'inactive'
      res.setHeader('Retry-After', '30')
      res.status(503).json({
        code: 'canonical_world_unavailable',
        message: 'The canonical world is temporarily unavailable.',
        requestId,
        retryAfterSeconds: 30,
      } satisfies CanonicalWorldUnavailableError)
      return
    }
    descriptor = await loader()
    if (!descriptor) {
      outcome = 'unavailable'; httpStatus = 503; reasonCode = 'missing'
      res.setHeader('Retry-After', '30')
      res.status(503).json({
        code: 'canonical_world_unavailable',
        message: 'The canonical world is temporarily unavailable.',
        requestId,
        retryAfterSeconds: 30,
      } satisfies CanonicalWorldUnavailableError)
      return
    }
    if (!attemptId || !UUID_PATTERN.test(attemptId)) {
      throw new Error('Canonical entry attempt was not persisted')
    }
    outcome = 'success'; httpStatus = 200
    res.status(200).json({ ...descriptor, entryAttemptId: attemptId })
  } catch (error) {
    writeLog('error', 'canonical_world_discovery_failed', { error })
    res.status(500).json({
      code: 'internal_error',
      message: 'An internal error occurred.',
      requestId,
    } satisfies SafeApiError)
  } finally {
    emitQuiltTelemetry({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      attemptId: typeof attemptId === 'string' && UUID_PATTERN.test(attemptId) ? attemptId : crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      quiltId: descriptor?.quiltId ?? null,
      canonicalGeneration: descriptor?.generation ?? null,
      cohort: 'global',
      name: 'canonical_discovery',
      outcome,
      durationMs: performance.now() - startedAt,
      httpStatus,
      ...(outcome === 'success' ? {} : { reasonCode }),
    })
  }
}

app.get('/quilts/canonical', authenticatedReadRateLimiter, requireHttpPrincipal, async (req, res) => {
  try {
    const principal = getPrincipalContext(req)
    const attemptId = await issueCanonicalAttempt(principal.principalId, 'entry')
    await sendCanonicalWorldDiscovery(res, async () => {
      const [descriptor, assignment] = await Promise.all([
        discoverCanonicalWorld(),
        ensureCanonicalPatchAssignment(principal.principalId),
      ])
      if (!descriptor || !assignment) return null
      return {
        ...descriptor,
        assignedPatch: {
          id: assignment.patchId,
          row: assignment.row,
          column: assignment.column,
        },
      }
    }, true, attemptId ?? undefined)
  } catch (error) {
    writeLog('error', 'canonical_attempt_issue_failed', { error })
    if (!res.headersSent) {
      res.status(500).json({
        code: 'internal_error',
        message: 'An internal error occurred.',
        requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
      } satisfies SafeApiError)
    }
  }
})

app.get('/quilts/canonical/patches/eligible', authenticatedReadRateLimiter, requireHttpPrincipal, async (req, res) => {
  const requestId = res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID()
  const result = await listEligibleCanonicalPatches(getPrincipalContext(req).principalId)
  if (!result) {
    res.status(503).json({
      code: 'canonical_world_unavailable',
      message: 'The canonical world is temporarily unavailable.',
      requestId,
      retryAfterSeconds: 30,
    } satisfies CanonicalWorldUnavailableError)
    return
  }
  res.status(200).json(result)
})

app.get('/quilts/:quiltId/occupancy', authenticatedReadRateLimiter, requireHttpPrincipal, async (req, res) => {
  const { quiltId } = req.params
  const requestId = res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID()
  if (typeof quiltId !== 'string' || !UUID_PATTERN.test(quiltId)) {
    sendResourceNotFound(res, requestId)
    return
  }

  const occupancy = await listQuiltOccupancy(quiltId, getPrincipalContext(req).principalId)
  if (!occupancy) {
    sendResourceNotFound(res, requestId)
    return
  }

  res.status(200).json(occupancy)
})

app.post('/quilts/canonical/telemetry', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  const principal = getPrincipalContext(req)
  const attemptId = req.header('x-canonical-attempt-id')
  const lineageAttemptId = req.header('x-canonical-lineage-id')
  const payload = req.body as Partial<CanonicalClientTelemetry> | undefined
  const kind = payload?.name === 'canonical_entry'
    ? 'entry'
    : payload?.name === 'canonical_reconnect'
      ? 'reconnect'
      : payload?.name === 'canonical_resubscribe'
        ? 'resubscribe'
        : null
  const descriptor = await discoverCanonicalWorld()
  const provisionalEvent = descriptor && kind ? buildCanonicalClientTelemetryEvent(payload, {
    attemptId: attemptId && UUID_PATTERN.test(attemptId) ? attemptId : crypto.randomUUID(),
    ...(kind === 'entry' ? {} : { parentAttemptId: lineageAttemptId }),
    quiltId: descriptor.quiltId,
    canonicalGeneration: descriptor.generation,
    cohort: 'global',
  }) : null
  if (!provisionalEvent) {
    res.status(400).json({
      code: 'invalid_request',
      message: 'The request payload is invalid.',
      requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
    } satisfies SafeApiError)
    return
  }
  let observedAttemptId: string | null = null
  try {
    observedAttemptId = kind && kind !== 'entry' && lineageAttemptId && UUID_PATTERN.test(lineageAttemptId)
      ? await consumeObservedCanonicalCycle(principal.principalId, lineageAttemptId, kind)
      : null
  } catch (error) {
    writeLog('error', 'canonical_observed_attempt_consume_failed', { error })
    res.status(500).json({
      code: 'internal_error',
      message: 'An internal error occurred.',
      requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
    } satisfies SafeApiError)
    return
  }
  const effectiveAttemptId = kind === 'entry' ? attemptId : observedAttemptId
  const context = descriptor && effectiveAttemptId && kind ? {
      attemptId: effectiveAttemptId,
      ...(kind === 'entry' && attemptId ? {} : { parentAttemptId: lineageAttemptId }),
      quiltId: descriptor.quiltId,
      canonicalGeneration: descriptor.generation,
      cohort: 'global',
    } as const : null
  const event = context ? buildCanonicalClientTelemetryEvent(payload, context) : null
  let consumed = false
  try {
    consumed = descriptor !== null
      && effectiveAttemptId !== undefined
      && effectiveAttemptId !== null
      && UUID_PATTERN.test(effectiveAttemptId)
      && kind !== null
      && event !== null
      && (kind === 'entry'
        ? await consumeCanonicalAttempt(effectiveAttemptId, principal.principalId, kind)
        : observedAttemptId === effectiveAttemptId)
  } catch (error) {
    writeLog('error', 'canonical_attempt_consume_failed', { error })
    res.status(500).json({
      code: 'internal_error',
      message: 'An internal error occurred.',
      requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
    } satisfies SafeApiError)
    return
  }
  if (!consumed || !event) {
    res.status(400).json({
      code: 'invalid_request',
      message: 'The request payload is invalid.',
      requestId: res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID(),
    } satisfies SafeApiError)
    return
  }
  emitQuiltTelemetry(event)
  res.status(202).end()
})

app.get('/quilts/:quiltId/patches/:patchId/navigation', authenticatedReadRateLimiter, requireHttpPrincipal, async (req, res) => {
  getPrincipalContext(req)
  const requestId = res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID()
  const { quiltId, patchId } = req.params
  if (typeof quiltId !== 'string' || typeof patchId !== 'string'
    || !UUID_PATTERN.test(quiltId) || !UUID_PATTERN.test(patchId)) {
    sendResourceNotFound(res, requestId)
    return
  }
  const navigation = await resolveCanonicalPatchNavigation(quiltId, patchId)
  if (!navigation) {
    sendResourceNotFound(res, requestId)
    return
  }
  res.status(200).json(navigation)
})

app.post('/ownership/claims', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, ['patchId'])) return sendInvalidOwnershipRequest(res)
  const principalId = getPrincipalContext(req).principalId
  sendOwnershipResult(res, await claimPatch({
    operationId: req.body.operationId, patchId: req.body.patchId, principalId,
    requestId: res.getHeader('x-request-id')?.toString(),
  }))
})

app.post('/ownership/transfers', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, ['patchId', 'recipientPrincipalId'])) return sendInvalidOwnershipRequest(res)
  sendOwnershipResult(res, await createOwnershipTransfer({
    operationId: req.body.operationId, patchId: req.body.patchId,
    senderPrincipalId: getPrincipalContext(req).principalId,
    recipientPrincipalId: req.body.recipientPrincipalId,
  }))
})

app.post('/ownership/transfers/accept', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, ['transferId'])) return sendInvalidOwnershipRequest(res)
  sendOwnershipResult(res, await acceptOwnershipTransfer({
    operationId: req.body.operationId, transferId: req.body.transferId,
    recipientPrincipalId: getPrincipalContext(req).principalId,
  }))
})

app.post('/ownership/transfers/cancel', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, ['transferId'])) return sendInvalidOwnershipRequest(res)
  sendOwnershipResult(res, await cancelOwnershipTransfer({
    operationId: req.body.operationId, transferId: req.body.transferId,
    actorPrincipalId: getPrincipalContext(req).principalId,
  }))
})

app.post('/ownership/abandon', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, ['patchId'])) return sendInvalidOwnershipRequest(res)
  sendOwnershipResult(res, await abandonPatch({
    operationId: req.body.operationId, patchId: req.body.patchId,
    principalId: getPrincipalContext(req).principalId,
  }))
})

app.post('/account/deletion', authenticatedMutationRateLimiter, requireHttpPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, [])) return sendInvalidOwnershipRequest(res)
  const result = await requestPrincipalDeletion({
    operationId: req.body.operationId, principalId: getPrincipalContext(req).principalId,
  })
  if (!result.succeeded) return sendOwnershipResult(res, result)
  res.status(200).json({
    status: 'deletion_pending', idempotent: result.idempotent,
    ...(result.recoveryDeadline ? { recoveryDeadline: result.recoveryDeadline.toISOString() } : {}),
  } satisfies AccountDeletionResponse)
})

app.post('/account/deletion/recover', authenticatedMutationRateLimiter, requireDeletionPendingPrincipal, async (req, res) => {
  if (!ownershipRequest(req.body, [])) return sendInvalidOwnershipRequest(res)
  const result = await recoverPrincipalDeletion({
    operationId: req.body.operationId, principalId: getPrincipalContext(req).principalId,
  })
  if (!result.succeeded) return sendOwnershipResult(res, result)
  res.status(200).json({ status: 'active', idempotent: result.idempotent } satisfies AccountDeletionResponse)
})

type TestResetRequest = {
  createCanonicalWorld?: boolean
  ownerExternalSubject?: string
}

const isTestResetRequest = (value: unknown): value is TestResetRequest => {
  if (!isObjectRecord(value)) {
    return false
  }

  if (value.createCanonicalWorld !== undefined && typeof value.createCanonicalWorld !== 'boolean') {
    return false
  }

  if (value.ownerExternalSubject !== undefined && typeof value.ownerExternalSubject !== 'string') {
    return false
  }

  return true
}

const resetAuthoritativeState = async (): Promise<void> => {
  socketAuthRateLimitBuckets.clear()

  for (const socket of await io.fetchSockets()) {
    socket.disconnect(true)
  }

  await getDatabaseBundle().db.execute(sql`
    TRUNCATE TABLE
      operation_log,
      idempotency_keys,
      snapshots,
      participants,
      tiles,
      canvases,
      users
    RESTART IDENTITY CASCADE
  `)
}

if (isTestControlEnabled) {
  const testResetRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many test reset requests, please try again later.' },
  })

  app.post('/test/reset', testResetRateLimiter, async (req, res) => {
    const providedToken = req.header(TEST_CONTROL_HEADER)
    if (!providedToken || providedToken !== testControlToken) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    if (!isTestResetRequest(req.body ?? {})) {
      res.status(400).json({ error: 'Invalid test reset payload' })
      return
    }

    const createCanonicalWorldForRun = req.body?.createCanonicalWorld ?? false
    const ownerExternalSubject = req.body?.ownerExternalSubject

    try {
      await resetAuthoritativeState()

      if (createCanonicalWorldForRun) {
        const provisioned = await provisionCanonicalWorld({
          action: 'provision',
          expectedGeneration: 0,
          patchRows: 32,
          patchColumns: 32,
          patchWidth: 31.2,
          patchHeight: 20.4,
          originX: 0,
          originY: 0,
          operatorId: 'e2e-reset',
          reason: 'isolated canonical acceptance fixture',
        })
        if (!provisioned.quilt || !provisioned.initialPatch) throw new Error('Canonical fixture provisioning failed')
        await activateCanonicalWorld({
          action: 'activate',
          quiltId: provisioned.quilt.id,
          expectedGeneration: provisioned.generation,
          operatorId: 'e2e-reset',
          reason: 'activate isolated canonical acceptance fixture',
        })

        if (ownerExternalSubject) {
          const providerNamespace = process.env.AUTH_TRUSTED_ISSUER
          if (!providerNamespace) throw new Error('AUTH_TRUSTED_ISSUER is required to seed a test owner')
          const principalId = crypto.randomUUID()
          await getDatabaseBundle().db.transaction(async (tx) => {
            await tx.execute(sql`INSERT INTO principals (id, kind) VALUES (${principalId}, 'human')`)
            await tx.execute(sql`
              INSERT INTO external_principal_mappings (provider_namespace, external_subject, principal_id)
              VALUES (${providerNamespace}, ${ownerExternalSubject}, ${principalId})
            `)
            await tx.execute(sql`
              UPDATE patches SET owner_principal_id = ${principalId}, state = 'active'
              WHERE id = ${provisioned.initialPatch!.id}
            `)
            await tx.execute(sql`
              INSERT INTO patch_memberships (patch_id, principal_id, role)
              VALUES (${provisioned.initialPatch!.id}, ${principalId}, 'owner')
            `)
          })
        }

        res.status(200).json({
          reset: true,
          canonical: {
            quiltId: provisioned.quilt.id,
            patchId: provisioned.initialPatch.id,
            generation: provisioned.generation + 1,
          },
        })
        return
      }

      res.status(200).json({ reset: true })
    } catch (error) {
      writeLog('error', 'test_reset_failed', { error })
      res.status(500).json({ error: 'Failed to reset test state' })
    }
  })

  app.post('/test/quilt/setup', testControlRateLimiter, async (req, res) => {
    if (req.header(TEST_CONTROL_HEADER) !== testControlToken) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    const canvasId = crypto.randomUUID()
    const quiltId = crypto.randomUUID()
    const patchId = crypto.randomUUID()
    const secondPatchId = crypto.randomUUID()
    const principalId = crypto.randomUUID()
    const externalSubject = typeof req.body?.externalSubject === 'string'
      ? req.body.externalSubject
      : 'e2e-owner'
    const claimEnabled = req.body?.claimEnabled === true
    const providerNamespace = process.env.AUTH_TRUSTED_ISSUER
    const tileId = crypto.randomUUID()
    try {
      await resetAuthoritativeState()
      await getDatabaseBundle().db.transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO canvases (id, version) VALUES (${canvasId}, 0)`)
        await tx.execute(sql`
          INSERT INTO quilts (id, legacy_canvas_id, patch_rows, patch_columns, patch_width, patch_height, topology, protocol_version)
          VALUES (${quiltId}, ${canvasId}, 1, 2, 31.2, 20.4, 'toroidal', 2)
        `)
        await tx.execute(sql`
          INSERT INTO principals (id, kind)
          VALUES (${principalId}, 'human')
        `)
        if (providerNamespace) {
          await tx.execute(sql`
            INSERT INTO external_principal_mappings (provider_namespace, external_subject, principal_id)
            VALUES (${providerNamespace}, ${externalSubject}, ${principalId})
          `)
        }
        await tx.execute(sql`
          INSERT INTO patches (id, quilt_id, row, "column", state, revision)
          VALUES
            (${patchId}, ${quiltId}, 0, 0, 'active', 0),
            (${secondPatchId}, ${quiltId}, 0, 1, 'unclaimed', 0)
        `)
        await tx.execute(sql`UPDATE patches SET owner_principal_id = ${principalId} WHERE id = ${patchId}`)
        await tx.execute(sql`
          INSERT INTO patch_visibility_policies (
            patch_id, existence, fine_data, aggregate_data, presence, search,
            durable_events, claim_enabled, policy_version
          )
          VALUES (
            ${patchId}, 'authenticated', 'authenticated', 'authenticated', 'authenticated',
            'authenticated', 'authenticated', ${claimEnabled}, 1
          ), (
            ${secondPatchId}, 'authenticated', 'authenticated', 'authenticated', 'authenticated',
            'authenticated', 'authenticated', ${claimEnabled}, 1
          )
        `)
        await tx.execute(sql`
          INSERT INTO canonical_world (product_key, quilt_id, status, generation)
          VALUES ('canonical', ${quiltId}, 'active', 1)
        `)
        await tx.execute(sql`
          INSERT INTO tiles (
            id, canvas_id, quilt_id, anchor_patch_id, shape, color, material,
            pos_x, pos_y, chunk_x, chunk_y, rotation, mirrored
          )
          VALUES (
            ${tileId}, ${canvasId}, ${quiltId}, ${patchId}, 'square', '#123456', 'ceramic',
            1, 1, 0, 0, 0, false
          )
        `)
        await tx.execute(sql`
          INSERT INTO tile_spatial_refs (tile_id, patch_id, chunk_x, chunk_y)
          VALUES (${tileId}, ${patchId}, 0, 0)
        `)
      })
      res.status(200).json({ canvasId, quiltId, patchId, principalId, externalSubject })
    } catch (error) {
      writeLog('error', 'test_quilt_setup_failed', { error })
      res.status(500).json({ error: 'Failed to seed quilt' })
    }
  })

  app.post('/test/quilt/publish', testControlRateLimiter, async (req, res) => {
    if (req.header(TEST_CONTROL_HEADER) !== testControlToken) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (!isObjectRecord(req.body) || typeof req.body.quiltId !== 'string' || typeof req.body.patchId !== 'string') {
      res.status(400).json({ error: 'Invalid publish payload' })
      return
    }

    const operationId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const attachment = typeof req.body.attachment === 'string' ? req.body.attachment : ''
    const chunkId = typeof req.body.chunkId === 'string' && isChunkId(req.body.chunkId) ? req.body.chunkId : '0:0'
    try {
      const result = await getDatabaseBundle().db.transaction(async (tx) => {
        const updated = await tx.execute(sql`
          UPDATE patches
          SET revision = revision + 1, updated_at = now()
          WHERE id = ${req.body.patchId} AND quilt_id = ${req.body.quiltId}
          RETURNING revision
        `)
        const revision = Number(updated.rows[0]?.revision)
        if (!Number.isInteger(revision)) throw new Error('Patch not found')
        await tx.execute(sql`
          INSERT INTO patch_operations (patch_id, op_seq, event_id, operation_id, op_type, payload)
          VALUES (
            ${req.body.patchId},
            ${revision},
            ${eventId},
            ${operationId},
            'tile_removed',
            ${JSON.stringify({ tileId: crypto.randomUUID(), attachment, chunkIds: [chunkId] })}::jsonb
          )
        `)
        return revision
      })

      const canonicalRoomId = `quilt:${req.body.quiltId}:patch:0:0:aggregate`
      const adapterRoomId = quiltChunkRoomName(canonicalRoomId, chunkId)
      const recipientCount = (await io.in(adapterRoomId).fetchSockets()).length
      emitQuiltTelemetry({
        name: 'attachment_use',
        quiltId: req.body.quiltId,
        canary: true,
        measurements: { attachmentBytes: Buffer.byteLength(attachment, 'utf8') },
        dimensions: { source: 'adapter-recovery-test' },
      })
      io.to(adapterRoomId).emit('quilt_patch_event', {
        quiltId: req.body.quiltId,
        canonicalRoomId,
        patchId: req.body.patchId,
        eventId,
        opSeq: result,
        revision: result,
        operation: {
          tileId: crypto.randomUUID(),
          removedBy: 'system-test',
          opSeq: result,
          revision: result,
        },
        testAttachment: attachment,
      })
      res.status(200).json({
        canonicalRoomId,
        adapterRoomId,
        recipientCount,
        eventId,
        revision: result,
        attachmentBytes: Buffer.byteLength(attachment),
      })
    } catch (error) {
      writeLog('error', 'test_quilt_publish_failed', { error })
      res.status(500).json({ error: 'Failed to publish quilt event' })
    }
  })

  app.post('/test/shutdown', testControlRateLimiter, (req, res) => {
    if (req.header(TEST_CONTROL_HEADER) !== testControlToken) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    res.status(202).json({ shuttingDown: true })
    setImmediate(() => void shutdown('test-control'))
  })
}

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = res.getHeader('x-request-id')?.toString() ?? crypto.randomUUID()
  if (error instanceof AuthenticationError) {
    sendAuthenticationError(res, requestId, error)
    return
  }
  if (error instanceof ResourceNotFoundError) {
    sendResourceNotFound(res, requestId)
    return
  }

  writeLog('error', 'http_request_failed', {
    method: req.method,
    path: req.originalUrl,
    requestId,
    error,
  })
  res.status(500).json({
    code: 'internal_error',
    message: 'The request could not be completed.',
    requestId,
  })
})

// ─── Initialize Socket.IO ────────────────────────────────────────────────────

export const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
  httpServer,
  {
    allowRequest: (request, callback) => {
      callback(null, isSocketHandshakeOriginAllowed(
        request.headers.origin,
        resolveCorsOrigin(process.env.CORS_ORIGIN),
        process.env.NODE_ENV,
      ))
    },
    cors: {
      origin: resolveCorsOrigin(process.env.CORS_ORIGIN),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  },
)

type CanonicalSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

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

export const isSupportedCanonicalConnectionAuth = (auth: Partial<ConnectionAuth> | null | undefined): auth is ConnectionAuth =>
  auth?.schemaVersion === SCHEMA_VERSION
  && auth.protocolVersion === QUILT_PROTOCOL_VERSION
  && typeof auth.quiltId === 'string'
  && UUID_PATTERN.test(auth.quiltId)
  && typeof auth.clientId === 'string'
  && auth.clientId.length > 0
  && typeof auth.entryAttemptId === 'string'
  && UUID_PATTERN.test(auth.entryAttemptId)
  && Number.isSafeInteger(auth.canonicalGeneration)
  && Number(auth.canonicalGeneration) > 0

export const buildClientUpgradeRequiredSocketError = (): Error & { data: Record<string, unknown> } => {
  const error = new Error('This client version is no longer supported.') as Error & { data: Record<string, unknown> }
  error.data = {
    code: 'client_upgrade_required',
    message: 'This client version is no longer supported.',
    minimumSchemaVersion: SCHEMA_VERSION,
    minimumProtocolVersion: QUILT_PROTOCOL_VERSION,
  }
  return error
}

// ─── Connection Middleware ───────────────────────────────────────────────────

io.use(createSocketAuth(verifyAccessToken, resolveOrProvisionPrincipal))

export const enforceCanonicalSocketCompatibility = async (
  socket: CanonicalSocket,
  next: (error?: Error) => void,
): Promise<void> => {
  const auth = socket.handshake.auth as unknown as Partial<ConnectionAuth>
  if (!isSupportedCanonicalConnectionAuth(auth)) {
    emitQuiltTelemetry({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      attemptId: typeof auth?.entryAttemptId === 'string' && UUID_PATTERN.test(auth.entryAttemptId) ? auth.entryAttemptId : crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      quiltId: null,
      canonicalGeneration: null,
      cohort: 'global',
      name: 'canonical_old_client_rejected',
      outcome: 'rejected',
      transport: 'socket',
      ...(typeof auth?.schemaVersion === 'string' ? { requestedSchemaVersion: auth.schemaVersion } : {}),
      ...(typeof auth?.protocolVersion === 'number' ? { requestedProtocolVersion: auth.protocolVersion } : {}),
    })
    next(buildClientUpgradeRequiredSocketError())
    return
  }
  let lineageAttemptId: string | null = null
  try {
    lineageAttemptId = await rotateCanonicalLineage(
      socket.data.principalId,
      auth.entryAttemptId,
      typeof auth.lineageAttemptId === 'string' && UUID_PATTERN.test(auth.lineageAttemptId)
        ? auth.lineageAttemptId
        : undefined,
    )
  } catch (error) {
    writeLog('error', 'canonical_socket_attempt_lookup_failed', { error })
    next(new Error('Canonical authorization is temporarily unavailable.'))
    return
  }
  if (!lineageAttemptId) {
    emitQuiltTelemetry({
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      attemptId: typeof auth?.entryAttemptId === 'string' && UUID_PATTERN.test(auth.entryAttemptId) ? auth.entryAttemptId : crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      quiltId: null,
      canonicalGeneration: null,
      cohort: 'global',
      name: 'canonical_old_client_rejected',
      outcome: 'rejected',
      transport: 'socket',
      ...(typeof auth?.schemaVersion === 'string' ? { requestedSchemaVersion: auth.schemaVersion } : {}),
      ...(typeof auth?.protocolVersion === 'number' ? { requestedProtocolVersion: auth.protocolVersion } : {}),
    })
    return next(buildClientUpgradeRequiredSocketError())
  }

  socket.data.quiltId = auth.quiltId
  socket.data.clientId = auth.clientId
  socket.data.schemaVersion = SCHEMA_VERSION
  socket.data.protocolVersion = QUILT_PROTOCOL_VERSION
  socket.data.canonicalGeneration = auth.canonicalGeneration
  socket.data.entryAttemptId = auth.entryAttemptId
  socket.data.lineageAttemptId = lineageAttemptId
  socket.data.reconnectCycleLineageId = auth.lineageAttemptId

  next()
}

io.use(enforceCanonicalSocketCompatibility)

io.use((socket, next) => {
  const now = Date.now()
  pruneSocketAuthRateLimitBuckets(now)
  const addressHeader = socket.handshake.headers['x-forwarded-for']
  const forwardedFor = typeof addressHeader === 'string' ? addressHeader.split(',')[0]?.trim() : undefined
  const rateLimitKey = forwardedFor || socket.handshake.address || socket.conn.remoteAddress || 'unknown'
  const currentBucket = socketAuthRateLimitBuckets.get(rateLimitKey)
  if (!currentBucket || currentBucket.resetAt <= now) {
    socketAuthRateLimitBuckets.set(rateLimitKey, { count: 1, resetAt: now + SOCKET_AUTH_RATE_LIMIT_WINDOW_MS })
  } else if (currentBucket.count >= SOCKET_AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1_000))
    return next(new Error(`Too many connection attempts. Retry after ${retryAfterSeconds}s.`))
  } else {
    currentBucket.count += 1
    socketAuthRateLimitBuckets.set(rateLimitKey, currentBucket)
  }

  writeLog('info', 'socket_connecting', {
    clientId: socket.data.clientId,
    quiltId: socket.data.quiltId,
  })
  next()
})

export const registerCanonicalTelemetryHandler = (socket: CanonicalSocket): void => {
  const terminalNames = new Set<string>()
  socket.on('canonical_telemetry', async (payload: CanonicalClientTelemetry) => {
    if (terminalNames.has(payload?.name) || payload?.name === 'canonical_resubscribe') return
    try {
      const attemptId = payload?.name === 'canonical_entry'
        ? socket.data.entryAttemptId
        : socket.data.reconnectCycleLineageId
          ? await consumeObservedCanonicalCycle(
              socket.data.principalId,
              socket.data.reconnectCycleLineageId,
              'reconnect',
            )
          : null
      const context = attemptId ? {
        attemptId,
        ...(payload.name === 'canonical_entry' ? {} : { parentAttemptId: socket.data.reconnectCycleLineageId }),
        quiltId: socket.data.quiltId,
        canonicalGeneration: socket.data.canonicalGeneration,
        cohort: 'global' as const,
      } : null
      const event = context ? buildCanonicalClientTelemetryEvent(payload, context) : null
      if (!attemptId || !event) return
      if (payload?.name === 'canonical_entry'
        && !await consumeCanonicalAttempt(attemptId, socket.data.principalId, 'entry')) return
      emitQuiltTelemetry(event)
      terminalNames.add(payload.name)
    } catch (error) {
      writeLog('error', 'canonical_socket_attempt_consume_failed', { error })
    }
  })
}

// ─── Connection Handlers ─────────────────────────────────────────────────────

io.on('connection', (socket) => {
  const { quiltId, clientId } = socket.data
  let selectedProtocolVersion: 1 | 2 = 2
  let canaryTelemetryEnabled = true
  let dualReadEnabled = false
  let selectedQuiltId: string | undefined
  let selectedPrincipalId: string | undefined
  let presenceLeaseActive = false
  let presenceHeartbeat: NodeJS.Timeout | null = null
  let canonicalTargetValidation: NodeJS.Timeout | null = null
  let safetyViolationDetected = false
  let quiltRoomIds = new Set<string>()
    let quiltAdapterRoomIds = new Set<string>()
  let roomChurnWindowStartedAt = Date.now()
  let roomChurnInWindow = 0
    let quiltAreaSubscriptionInFlight = false

  registerCanonicalTelemetryHandler(socket)
  socket.emit('canonical_lineage', { lineageAttemptId: socket.data.lineageAttemptId })

  socket.onAny((eventName, ...args) => {
    writeLog('debug', 'socket_event_received', {
      quiltId,
      clientId,
      eventName,
      argCount: args.length,
    })
  })

  const initializeConnection = async (): Promise<void> => {
    const joinedAt = Date.now()
    const canonicalDescriptor = await discoverCanonicalWorld()
    if (!canonicalDescriptor || canonicalDescriptor.quiltId !== quiltId || canonicalDescriptor.generation !== socket.data.canonicalGeneration) {
      recordCanonicalSafetyTelemetry('target_invalidated', {
        attemptId: socket.data.entryAttemptId,
        quiltId,
        canonicalGeneration: socket.data.canonicalGeneration,
        cohort: 'global',
        requestId: socket.id,
      })
      throw new Error('Resource not found.')
    }
    const deliveryContext = await loadQuiltDeliveryContext({
      quiltId,
      principalId: socket.data.principalId,
    })
    if (!deliveryContext || deliveryContext.topology.protocolVersion !== 2) throw new Error('Resource not found.')
    if (deliveryContext.principalId !== socket.data.principalId) {
      recordCanonicalSafetyTelemetry('descriptor_leak', {
        attemptId: socket.data.entryAttemptId,
        quiltId,
        canonicalGeneration: socket.data.canonicalGeneration,
        cohort: 'global',
        requestId: socket.id,
      })
      throw new Error('Resource not found.')
    }
    selectedQuiltId = deliveryContext.topology.quiltId
    selectedPrincipalId = deliveryContext.principalId
    const presenceRoom = quiltPresenceRoomName(selectedQuiltId)
    await socket.join(presenceRoom)
    const presence = await acquireQuiltPresenceLease({ socketId: socket.id, quiltId: selectedQuiltId, principalId: selectedPrincipalId, clientId, now: joinedAt, ttlMs: QUILT_PRESENCE_LEASE_TTL_MS })
    presenceLeaseActive = true
    presenceHeartbeat = setInterval(() => {
      void renewPresenceLeaseOrDisconnect(
        () => renewQuiltPresenceLease(socket.id, Date.now(), QUILT_PRESENCE_LEASE_TTL_MS),
        () => socket.disconnect(true),
      )
    }, QUILT_PRESENCE_HEARTBEAT_MS)
    canonicalTargetValidation = setInterval(() => {
      void discoverCanonicalWorld().then((descriptor) => {
        if (safetyViolationDetected || (descriptor?.quiltId === quiltId && descriptor.generation === socket.data.canonicalGeneration)) return
        safetyViolationDetected = true
        recordCanonicalSafetyTelemetry('target_invalidated', {
          attemptId: socket.data.entryAttemptId,
          quiltId,
          canonicalGeneration: socket.data.canonicalGeneration,
          cohort: 'global',
          requestId: socket.id,
        })
        socket.disconnect(true)
      }).catch((error) => writeLog('error', 'canonical_target_validation_failed', { quiltId, socketId: socket.id, error }))
    }, CANONICAL_TARGET_VALIDATION_INTERVAL_MS)
    socket.emit('quilt_protocol', {
      selectedProtocolVersion: 2,
      v1CompatibilityEnabled: false,
      mutationEnabled: isProtocolV2MutationEnabled,
      ownershipIdentity: selectedPrincipalId,
      canaryTelemetryEnabled,
      topology: deliveryContext.topology,
      limits: QUILT_PROTOCOL_LIMITS,
    })
    if (presence.isFirstLease) socket.to(presenceRoom).emit('client_joined', { client: { clientId: presence.clientId, joinedAt: presence.joinedAt } })
  }

  void initializeConnection().catch((error) => {
    recordCanonicalClientTelemetry({
      name: 'canonical_entry',
      outcome: 'initial_sync_failed',
      durationMs: 0,
    }, {
      attemptId: socket.data.entryAttemptId,
      quiltId: socket.data.quiltId,
      canonicalGeneration: socket.data.canonicalGeneration,
      cohort: 'global',
    })
    writeLog('error', 'socket_initialize_failed', {
      quiltId,
      clientId,
      error,
    })
    socket.disconnect(true)
  })

  // ── Event Handlers ────────────────────────────────────────────────────────

  const rejectQuiltMutation = <T extends QuiltPlaceTileAck | QuiltRemoveTileAck>(
    ack: unknown,
    operationId: string,
    code: QuiltMutationRejectCode,
  ): void => invokeAckSafely<T>(ack, {
    status: 'rejected',
    operationId,
    code,
    message: code === 'THROTTLED' ? 'Mutation temporarily unavailable.' : 'Mutation was not accepted.',
    requestId: crypto.randomUUID(),
  } as T)

  const canonicalMutationRoomId = (
    quiltId: string,
    patchId: string,
    kind: 'fine' | 'events',
    deliveryContext: NonNullable<Awaited<ReturnType<typeof loadQuiltDeliveryContext>>>,
  ): string | undefined => {
    const patch = deliveryContext.patches.find((candidate) => candidate.id === patchId)
    return patch ? `quilt:${quiltId}:patch:${patch.row}:${patch.column}:${kind}` : undefined
  }

  socket.on('quilt_place_tile', async (payload, ack) => {
    const operationId = isObjectRecord(payload) && typeof payload.operationId === 'string'
      ? payload.operationId
      : crypto.randomUUID()
    if (!isProtocolV2MutationEnabled || selectedProtocolVersion !== 2) {
      rejectQuiltMutation<QuiltPlaceTileAck>(ack, operationId, 'MUTATION_DISABLED')
      return
    }
    if (!isQuiltPlaceTileRequest(payload) || payload.quiltId !== selectedQuiltId || !selectedPrincipalId) {
      rejectQuiltMutation<QuiltPlaceTileAck>(ack, operationId, 'INVALID_FOOTPRINT')
      return
    }

    try {
      const result = await persistQuiltTilePlacement({
        quiltId: payload.quiltId,
        operationId: payload.operationId,
        principalId: selectedPrincipalId,
        placedBy: selectedPrincipalId,
        expectedPatchRevisions: payload.expectedPatchRevisions,
        payload: payload.tile,
      })
      if (!result.committed) {
        const code: QuiltMutationRejectCode = result.reason === 'UNAUTHORIZED'
          ? 'UNAUTHORIZED'
          : result.reason === 'STALE_REVISION' || result.reason === 'OUT_OF_ORDER_REVISION'
            ? 'STALE_REVISION'
            : 'COLLISION'
        rejectQuiltMutation<QuiltPlaceTileAck>(ack, payload.operationId, code)
        return
      }

      invokeAckSafely<QuiltPlaceTileAck>(ack, {
        status: 'accepted',
        operationId: result.operationId,
        eventIds: result.eventIds,
        patchRevisions: result.patchRevisions,
        idempotent: result.idempotent,
        tile: result.tile,
      })
      if (result.idempotent) return
      const deliveryContext = await loadQuiltDeliveryContext({ quiltId, principalId: selectedPrincipalId })
      if (!deliveryContext) return
      for (const [patchId, revision] of Object.entries(result.patchRevisions)) {
        const eventId = result.eventIds[patchId]
        for (const kind of ['fine', 'events'] as const) {
          const roomId = canonicalMutationRoomId(payload.quiltId, patchId, kind, deliveryContext)
          if (!roomId) continue
          for (const chunkId of result.patchChunkIds[patchId] ?? []) {
            io.to(quiltChunkRoomName(roomId, chunkId as ChunkId)).emit('quilt_patch_event', {
              quiltId: payload.quiltId,
              canonicalRoomId: roomId,
              patchId,
              eventId,
              opSeq: revision,
              revision,
              operation: { tile: result.tile, placedBy: selectedPrincipalId, opSeq: revision, revision },
            })
          }
        }
      }
    } catch (error) {
      writeLog('error', 'quilt_place_tile_failed', { quiltId, operationId, error })
      rejectQuiltMutation<QuiltPlaceTileAck>(ack, operationId, 'RESOURCE_UNAVAILABLE')
    }
  })

  socket.on('quilt_remove_tile', async (payload, ack) => {
    const operationId = isObjectRecord(payload) && typeof payload.operationId === 'string'
      ? payload.operationId
      : crypto.randomUUID()
    if (!isProtocolV2MutationEnabled || selectedProtocolVersion !== 2) {
      rejectQuiltMutation<QuiltRemoveTileAck>(ack, operationId, 'MUTATION_DISABLED')
      return
    }
    if (!isQuiltRemoveTileRequest(payload) || payload.quiltId !== selectedQuiltId || !selectedPrincipalId) {
      rejectQuiltMutation<QuiltRemoveTileAck>(ack, operationId, 'INVALID_FOOTPRINT')
      return
    }

    try {
      const result = await persistQuiltTileRemoval({
        quiltId: payload.quiltId,
        operationId: payload.operationId,
        principalId: selectedPrincipalId,
        expectedPatchRevisions: payload.expectedPatchRevisions,
        tileId: payload.tileId,
      })
      if (!result.committed) {
        const code: QuiltMutationRejectCode = result.reason === 'UNAUTHORIZED'
          ? 'UNAUTHORIZED'
          : result.reason === 'STALE_REVISION' || result.reason === 'OUT_OF_ORDER_REVISION'
            ? 'STALE_REVISION'
            : 'RESOURCE_UNAVAILABLE'
        rejectQuiltMutation<QuiltRemoveTileAck>(ack, payload.operationId, code)
        return
      }

      invokeAckSafely<QuiltRemoveTileAck>(ack, {
        status: 'accepted',
        operationId: result.operationId,
        eventIds: result.eventIds,
        patchRevisions: result.patchRevisions,
        idempotent: result.idempotent,
      })
      if (result.idempotent) return
      const deliveryContext = await loadQuiltDeliveryContext({ quiltId, principalId: selectedPrincipalId })
      if (!deliveryContext) return
      for (const [patchId, revision] of Object.entries(result.patchRevisions)) {
        const eventId = result.eventIds[patchId]
        for (const kind of ['fine', 'events'] as const) {
          const roomId = canonicalMutationRoomId(payload.quiltId, patchId, kind, deliveryContext)
          if (!roomId) continue
          for (const chunkId of result.patchChunkIds[patchId] ?? []) {
            io.to(quiltChunkRoomName(roomId, chunkId as ChunkId)).emit('quilt_patch_event', {
              quiltId: payload.quiltId,
              canonicalRoomId: roomId,
              patchId,
              eventId,
              opSeq: revision,
              revision,
              operation: { tileId: result.tileId, removedBy: selectedPrincipalId, opSeq: revision, revision },
            })
          }
        }
      }
    } catch (error) {
      writeLog('error', 'quilt_remove_tile_failed', { quiltId, operationId, error })
      rejectQuiltMutation<QuiltRemoveTileAck>(ack, operationId, 'RESOURCE_UNAVAILABLE')
    }
  })

  socket.on('quilt_client_runtime_metrics', (payload) => {
    recordQuiltClientRuntimeMetrics(payload, {
      canaryTelemetryEnabled,
      quiltId: socket.data.quiltId,
      entryAttemptId: socket.data.entryAttemptId,
      canonicalGeneration: socket.data.canonicalGeneration,
      cohort: 'global',
    })
  })

  socket.on('subscribe_quilt_area', async (payload, ack) => {
    const resubscribeStartedAt = performance.now()
    const recordResubscribe = async (outcomes: SubscribeQuiltAreaAck['outcomes']): Promise<void> => {
      try {
        const attemptId = await observeCanonicalCycle(
          socket.data.principalId,
          socket.data.lineageAttemptId,
          'resubscribe',
        )
        if (!attemptId || !await consumeCanonicalAttempt(
          attemptId,
          socket.data.principalId,
          'resubscribe',
        )) return
        const acceptedRooms = outcomes.filter((outcome) => outcome.status === 'accepted').length
        recordCanonicalClientTelemetry({
          name: 'canonical_resubscribe',
          outcome: outcomes.every((outcome) => outcome.status === 'accepted') ? 'completed' : 'failed',
          durationMs: performance.now() - resubscribeStartedAt,
          requestedRooms: Array.isArray(payload?.rooms) ? payload.rooms.length : 0,
          acceptedRooms,
          rejectedRooms: outcomes.length - acceptedRooms,
          resyncRequired: outcomes.filter((outcome) => outcome.status === 'accepted' && outcome.cursor === undefined).length,
        }, {
          attemptId,
          parentAttemptId: socket.data.lineageAttemptId,
          quiltId: socket.data.quiltId,
          canonicalGeneration: socket.data.canonicalGeneration,
          cohort: 'global',
        })
      } catch (error) {
        writeLog('error', 'canonical_resubscribe_attempt_failed', { error })
      }
    }
    if (
      selectedProtocolVersion !== 2
      || !isObjectRecord(payload)
      || typeof payload.quiltId !== 'string'
      || !Array.isArray(payload.rooms)
      || payload.rooms.some((room) => !isQuiltRoomRequest(room))
    ) {
      const outcomes: SubscribeQuiltAreaAck['outcomes'] = [{ requestId: '', status: 'invalid', reason: 'PROTOCOL_OR_PAYLOAD' }]
      invokeAckSafely<SubscribeQuiltAreaAck>(ack, {
        outcomes,
        acceptedCursors: {},
      })
      await recordResubscribe(outcomes)
      return
    }

    if (quiltAreaSubscriptionInFlight) {
      invokeAckSafely<SubscribeQuiltAreaAck>(ack, {
        outcomes: payload.rooms.map((room) => ({
          requestId: room.requestId,
          status: 'invalid',
          reason: 'SUBSCRIPTION_IN_PROGRESS',
        })),
        acceptedCursors: {},
      })
      return
    }

    quiltAreaSubscriptionInFlight = true
    try {
      const deliveryContext = await loadQuiltDeliveryContext({ quiltId, principalId: socket.data.principalId })
      if (!deliveryContext || deliveryContext.topology.quiltId !== payload.quiltId) {
        const outcomes: SubscribeQuiltAreaAck['outcomes'] = payload.rooms.map((room) => ({
          requestId: room.requestId,
          status: 'forbidden',
          reason: 'QUILT_NOT_VISIBLE',
        }))
        invokeAckSafely<SubscribeQuiltAreaAck>(ack, {
          outcomes,
          acceptedCursors: {},
        })
        await recordResubscribe(outcomes)
        return
      }

      const now = Date.now()
      if (now - roomChurnWindowStartedAt >= 60_000) {
        roomChurnWindowStartedAt = now
        roomChurnInWindow = 0
      }

      const accessByAddress = new Map(deliveryContext.patches.map((patch) => [
        `${patch.row}:${patch.column}`,
        buildPatchRoomAccess(patch),
      ]))
      const resolution = resolveQuiltRooms(payload.rooms, {
        topology: deliveryContext.topology,
        principalId: deliveryContext.principalId,
        currentRoomIds: quiltRoomIds,
        churnInWindow: roomChurnInWindow,
        accessByAddress,
        limits: QUILT_PROTOCOL_LIMITS,
      })
      const acceptedCursors: SubscribeQuiltAreaAck['acceptedCursors'] = {}
      const states: Array<Parameters<ServerToClientEvents['quilt_patch_state']>[0]> = []
      const replayEvents: Array<Parameters<ServerToClientEvents['quilt_patch_event']>[0]> = []
      const budgetFailures = new Map<string, string>()
      for (const room of resolution.accepted) {
        const snapshot = await loadPatchDeliverySnapshot(room.patchId, {
          principalId: socket.data.principalId,
          surface: room.kind === 'aggregate' ? 'aggregateData' : 'fineData',
          dualReadEnabled,
          canary: canaryTelemetryEnabled,
          chunkIds: room.chunkIds,
        })
        const cursor = {
          patchId: room.patchId,
          opSeq: snapshot.opSeq,
          revision: snapshot.revision,
          eventId: snapshot.eventId,
          chunkIds: room.chunkIds,
        }
        acceptedCursors[room.canonicalRoomId] = cursor
        const suppliedCursor = payload.cursors?.[room.canonicalRoomId]
        const cursorMatches = suppliedCursor?.opSeq === cursor.opSeq
          && suppliedCursor.revision === cursor.revision
          && suppliedCursor.eventId === cursor.eventId
          && haveEqualChunkScope(suppliedCursor.chunkIds, room.chunkIds)
        if (cursorMatches || room.kind === 'presence') continue

        if (
          room.kind === 'events'
          && suppliedCursor
          && suppliedCursor.patchId === room.patchId
          && suppliedCursor.opSeq < cursor.opSeq
          && haveEqualChunkScope(suppliedCursor.chunkIds, room.chunkIds)
        ) {
          const operations = await loadPatchDeliveryOperationsAfter(
            room.patchId,
            suppliedCursor.opSeq,
            socket.data.principalId,
          )
          const isContiguous = operations.length > 0
            && operations[0]?.opSeq === suppliedCursor.opSeq + 1
            && operations.at(-1)?.opSeq === cursor.opSeq
          const scopedOperations = isContiguous ? selectScopedReplayOperations(operations, room.chunkIds) : null
          if (scopedOperations) {
            const roomReplayEvents: typeof replayEvents = []
            for (const operation of scopedOperations) {
              if (operation.opType === 'tile_placed' && isPlaceTilePayload(operation.payload)) {
                roomReplayEvents.push({
                  quiltId: deliveryContext.topology.quiltId,
                  canonicalRoomId: room.canonicalRoomId,
                  patchId: room.patchId,
                  eventId: operation.eventId,
                  opSeq: operation.opSeq,
                  revision: operation.opSeq,
                  operation: {
                    tile: {
                      id: operation.payload.tileId,
                      shape: operation.payload.shape,
                      color: operation.payload.color,
                      material: operation.payload.material,
                      transform: operation.payload.transform,
                      createdAt: operation.createdAt,
                    },
                    placedBy: operation.actorPrincipalId ?? 'system',
                    opSeq: operation.opSeq,
                    revision: operation.opSeq,
                  },
                })
                continue
              }
              if (operation.opType === 'tile_removed' && isRemoveTilePayload(operation.payload)) {
                roomReplayEvents.push({
                  quiltId: deliveryContext.topology.quiltId,
                  canonicalRoomId: room.canonicalRoomId,
                  patchId: room.patchId,
                  eventId: operation.eventId,
                  opSeq: operation.opSeq,
                  revision: operation.opSeq,
                  operation: {
                    tileId: operation.payload.tileId,
                    removedBy: operation.actorPrincipalId ?? 'system',
                    opSeq: operation.opSeq,
                    revision: operation.opSeq,
                  },
                })
              }
            }
            const replayBytes = Buffer.byteLength(JSON.stringify(roomReplayEvents), 'utf8')
            if (replayBytes > QUILT_PROTOCOL_LIMITS.maxPayloadBytes) {
              budgetFailures.set(room.canonicalRoomId, 'PAYLOAD_BYTES')
              delete acceptedCursors[room.canonicalRoomId]
            } else {
              replayEvents.push(...roomReplayEvents)
            }
            continue
          }
        }

        const roomTiles = room.kind === 'aggregate' ? [] : snapshot.tiles
        if (roomTiles.length > QUILT_PROTOCOL_LIMITS.maxSnapshotTiles) {
          budgetFailures.set(room.canonicalRoomId, 'SNAPSHOT_TILES')
          delete acceptedCursors[room.canonicalRoomId]
          continue
        }
        const scopedSnapshot = {
          quiltId: deliveryContext.topology.quiltId,
          canonicalRoomId: room.canonicalRoomId,
          patchId: room.patchId,
          payloadMode: room.kind === 'aggregate' ? 'aggregate' as const : 'fine' as const,
          chunkIds: room.chunkIds,
          tiles: roomTiles,
          aggregates: room.kind === 'aggregate'
            ? room.chunkIds.map((chunkId) => ({
                chunkId,
                aggregate: buildChunkAggregate(snapshot.tilesByChunk[chunkId] ?? []),
              }))
            : undefined,
          cursor,
        }
        const snapshotBytes = Buffer.byteLength(JSON.stringify(scopedSnapshot), 'utf8')
        emitQuiltTelemetry({
          name: 'snapshot_bytes',
          quiltId: deliveryContext.topology.quiltId,
          principalId: deliveryContext.principalId,
          canary: canaryTelemetryEnabled,
          measurements: { snapshotBytes, tileCount: roomTiles.length },
          dimensions: { kind: room.kind },
        })
        if (snapshotBytes > QUILT_PROTOCOL_LIMITS.maxPayloadBytes) {
          budgetFailures.set(room.canonicalRoomId, 'PAYLOAD_BYTES')
          delete acceptedCursors[room.canonicalRoomId]
          continue
        }
        states.push(scopedSnapshot)
      }

      const outcomes = resolution.outcomes.map((outcome) => {
        const reason = outcome.status === 'accepted' ? budgetFailures.get(outcome.canonicalRoomId) : undefined
        return reason ? { requestId: outcome.requestId, status: 'budget-exceeded' as const, reason } : outcome
      })
      const acceptedRoomIds = new Set(Object.keys(acceptedCursors))
      const acceptedRooms = resolution.accepted.filter((room) => acceptedRoomIds.has(room.canonicalRoomId))
      const nextRoomIds = new Set(acceptedRooms.map((room) => room.canonicalRoomId))
      const nextAdapterRoomIds = new Set(acceptedRooms.flatMap((room) =>
        room.chunkIds.map((chunkId) => quiltChunkRoomName(room.canonicalRoomId, chunkId)),
      ))
      const priorRoomCount = quiltRoomIds.size
      for (const existingRoomId of quiltAdapterRoomIds) {
        if (!nextAdapterRoomIds.has(existingRoomId)) await socket.leave(existingRoomId)
      }
      for (const nextRoomId of nextAdapterRoomIds) {
        if (!quiltAdapterRoomIds.has(nextRoomId)) await socket.join(nextRoomId)
      }
      roomChurnInWindow += Array.from(nextRoomIds).filter((roomId) => !quiltRoomIds.has(roomId)).length
      quiltRoomIds = nextRoomIds
      quiltAdapterRoomIds = nextAdapterRoomIds
      emitQuiltTelemetry({
        name: 'room_churn',
        quiltId: deliveryContext.topology.quiltId,
        principalId: deliveryContext.principalId,
        canary: canaryTelemetryEnabled,
        measurements: {
          priorRoomCount,
          nextRoomCount: nextRoomIds.size,
          churnInWindow: roomChurnInWindow,
        },
      })
      invokeAckSafely<SubscribeQuiltAreaAck>(ack, { outcomes, acceptedCursors })
      await recordResubscribe(outcomes)
      for (const state of states) socket.emit('quilt_patch_state', state)
      for (const event of replayEvents) socket.emit('quilt_patch_event', event)
    } catch (error) {
      writeLog('error', 'subscribe_quilt_area_failed', { quiltId, clientId, error })
      const outcomes: SubscribeQuiltAreaAck['outcomes'] = payload.rooms.map((room) => ({
        requestId: room.requestId,
        status: 'invalid',
        reason: 'SUBSCRIPTION_FAILED',
      }))
      invokeAckSafely<SubscribeQuiltAreaAck>(ack, {
        outcomes,
        acceptedCursors: {},
      })
      await recordResubscribe(outcomes)
    } finally {
      quiltAreaSubscriptionInFlight = false
    }
  })

  // ── Disconnection ──────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    if (presenceHeartbeat) {
      clearInterval(presenceHeartbeat)
      presenceHeartbeat = null
    }
    if (canonicalTargetValidation) {
      clearInterval(canonicalTargetValidation)
      canonicalTargetValidation = null
    }

    writeLog('info', 'socket_disconnected', {
      clientId,
      quiltId,
    })

    try {
      await observeCanonicalCycle(
        socket.data.principalId,
        socket.data.lineageAttemptId,
        'reconnect',
      )
    } catch (error) {
      writeLog('error', 'canonical_reconnect_cycle_observation_failed', { socketId: socket.id, error })
    }

    if (selectedProtocolVersion === 2 && selectedQuiltId && selectedPrincipalId && presenceLeaseActive) {
      try {
        const presence = await releaseQuiltPresenceLease({
          socketId: socket.id,
          quiltId: selectedQuiltId,
          principalId: selectedPrincipalId,
          now: Date.now(),
        })
        if (presence.isLastLease) {
          io.to(quiltPresenceRoomName(selectedQuiltId)).emit('client_left', { clientId: presence.clientId })
        }
      } catch (error) {
        writeLog('error', 'quilt_presence_release_failed', {
          quiltId: selectedQuiltId,
          principalId: selectedPrincipalId,
          socketId: socket.id,
          error,
        })
      }
    }
  })
})

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

const retentionJob = process.env.NODE_ENV === 'test' ? null : startRetentionJob()
const presenceLeaseReaper = process.env.NODE_ENV === 'test' ? null : setInterval(() => {
  void reapExpiredQuiltPresenceLeases(Date.now())
    .then((departures) => {
      for (const departure of departures) {
        io.to(quiltPresenceRoomName(departure.quiltId)).emit('client_left', { clientId: departure.clientId })
      }
    })
    .catch((error) => writeLog('error', 'quilt_presence_reap_failed', { error }))
}, QUILT_PRESENCE_HEARTBEAT_MS)

async function shutdown(signal: string): Promise<void> {
  writeLog('info', 'shutdown_signal_received', { signal })
  retentionJob?.stop()
  if (presenceLeaseReaper) clearInterval(presenceLeaseReaper)

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
  validateProductionRolloutGates()
  configureAuthentication()
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
      return prepareDatabaseSchemaForStartup()
    })
    .then((migrationsApplied) => {
      configureRealtimeAdapter()

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

if (isTestControlEnabled) {
  const databaseUrl = resolveDatabaseUrl()
  assertTestDatabaseSafety(databaseUrl)

  writeLog('info', 'test_mode_database_safety_check_passed', {
    databaseTarget: describeDatabaseTarget(databaseUrl),
    testControlEnabled: isTestControlEnabled,
  })

  void verifyDatabaseConnectivity()
    .then(() => {
      return prepareDatabaseSchemaForStartup()
    })
    .then((migrationsApplied) => {
      configureRealtimeAdapter()

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
