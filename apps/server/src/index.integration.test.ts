import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server as SocketServer } from 'socket.io'
import { io as createSocketClient, type Socket as SocketClient } from 'socket.io-client'
import {
  buildChunkAggregate,
  isQuiltClientRuntimeMetrics,
  isQuiltPlaceTileRequest,
  isQuiltRemoveTileRequest,
  isQuiltRoomRequest,
  isSocketHandshakeOriginAllowed,
  ownershipRequest,
  recordQuiltClientRuntimeMetrics,
  recordCanonicalClientTelemetry,
  renewPresenceLeaseOrDisconnect,
  resolveLegacySocketAccess,
  haveEqualChunkScope,
  selectScopedReplayOperations,
  sendOwnershipResult,
  sendCanonicalWorldDiscovery,
  createRetiredSessionsRouter,
  enforceCanonicalSocketCompatibility,
  registerCanonicalTelemetryHandler,
} from './index.js'
import { buildPatchRoomAccess } from './realtime/quiltRooms.js'
import type { PersistedVisibilityPolicy } from './domain/authorizationPolicy.js'
import type { PatchDeliveryOperation } from './db/repository.js'
import { vec2 } from './domain/math2d.js'
import { configureQuiltTelemetry } from './migration/quiltTelemetry.js'
import { createHttpAuth } from './auth/httpAuth.js'
import { AuthenticationError } from './auth/errors.js'
import { createSocketAuth } from './auth/socketAuth.js'
import {
  consumeCanonicalAttempt,
  issueCanonicalAttempt,
} from './migration/canonicalAttempts.js'
import { createPostgresTestDatabase, type PostgresTestDatabase } from './test/postgresTestDatabase.js'

let attemptDatabase: PostgresTestDatabase

beforeAll(async () => {
  attemptDatabase = await createPostgresTestDatabase('zzyix_index_attempts')
}, 30_000)

beforeEach(async () => {
  await attemptDatabase.db.execute(sql`truncate table canonical_attempts, principals cascade`)
  await attemptDatabase.db.execute(sql`
    insert into principals (id, kind) values
      ('11111111-1111-4111-8111-111111111111', 'human'),
      ('22222222-2222-4222-8222-222222222222', 'human')
  `)
})

afterAll(async () => attemptDatabase?.dispose(), 30_000)

describe('Socket.IO handshake origin boundary', () => {
  const allowedOrigin = 'https://app.example.com'

  it('accepts only the exact configured browser origin', () => {
    expect(isSocketHandshakeOriginAllowed(allowedOrigin, allowedOrigin, 'production')).toBe(true)
    expect(isSocketHandshakeOriginAllowed('https://app.example.com.evil.net', allowedOrigin, 'production')).toBe(false)
    expect(isSocketHandshakeOriginAllowed('https://example.com', allowedOrigin, 'production')).toBe(false)
    expect(isSocketHandshakeOriginAllowed(['https://app.example.com'], allowedOrigin, 'production')).toBe(false)
  })

  it('rejects missing browser origins in production but permits deliberate test and server clients', () => {
    expect(isSocketHandshakeOriginAllowed(undefined, allowedOrigin, 'production')).toBe(false)
    expect(isSocketHandshakeOriginAllowed(undefined, allowedOrigin, 'test')).toBe(true)
    expect(isSocketHandshakeOriginAllowed(undefined, allowedOrigin, 'development')).toBe(true)
    expect(isSocketHandshakeOriginAllowed('null', allowedOrigin, 'test')).toBe(false)
  })
})

describe('ownership HTTP contracts', () => {
  it('requires UUID operation and resource identifiers', () => {
    expect(ownershipRequest({
      operationId: '10000000-0000-4000-8000-000000000001',
      patchId: '20000000-0000-4000-8000-000000000001',
    }, ['patchId'])).toBe(true)
    expect(ownershipRequest({ operationId: 'not-an-id', patchId: 'also-not-an-id' }, ['patchId'])).toBe(false)
  })

  it('returns the same stable safe error for distinct internal denials', () => {
    const response = () => {
      const json = vi.fn()
      const status = vi.fn(() => ({ json }))
      return {
        response: { status, getHeader: vi.fn(() => 'request-1') } as never,
        json,
      }
    }
    const quota = response()
    const unavailable = response()

    sendOwnershipResult(quota.response, { succeeded: false, idempotent: false })
    sendOwnershipResult(unavailable.response, { claimed: false, idempotent: false })

    expect(quota.json).toHaveBeenCalledWith({
      code: 'ownership_command_denied',
      message: 'The ownership command could not be completed.',
      requestId: 'request-1',
    })
    expect(unavailable.json).toHaveBeenCalledWith(quota.json.mock.calls[0][0])
  })
})

describe('canonical discovery HTTP contract', () => {
  const response = () => {
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const setHeader = vi.fn()
    return {
      response: { status, setHeader, getHeader: vi.fn(() => 'request-1') } as never,
      json,
      setHeader,
      status,
    }
  }

  it('maps missing, inactive, and invalid repository outcomes to one retryable 503', async () => {
    const unavailable = response()
    await sendCanonicalWorldDiscovery(unavailable.response, vi.fn().mockResolvedValue(null))

    expect(unavailable.setHeader).toHaveBeenCalledWith('Retry-After', '30')
    expect(unavailable.status).toHaveBeenCalledWith(503)
    expect(unavailable.json).toHaveBeenCalledWith({
      code: 'canonical_world_unavailable',
      message: 'The canonical world is temporarily unavailable.',
      requestId: 'request-1',
      retryAfterSeconds: 30,
    })
  })

  it('does not load the descriptor while discovery is disabled', async () => {
    const unavailable = response()
    const loader = vi.fn()
    await sendCanonicalWorldDiscovery(unavailable.response, loader, false)

    expect(unavailable.status).toHaveBeenCalledWith(503)
    expect(loader).not.toHaveBeenCalled()
  })

  it.each([
    { error: new AuthenticationError('authentication_required'), statusCode: 401, code: 'authentication_required' },
    { error: new AuthenticationError('insufficient_scope'), statusCode: 403, code: 'insufficient_scope' },
  ])('preserves authentication-first $statusCode without invoking discovery', async ({ error, statusCode, code }) => {
    const loader = vi.fn()
    const authResponse = response()
    const middleware = createHttpAuth(vi.fn().mockRejectedValue(error), vi.fn())
    const next = vi.fn(() => sendCanonicalWorldDiscovery(authResponse.response, loader))

    await middleware({ header: vi.fn(() => 'Bearer token') } as never, authResponse.response, next)

    expect(authResponse.status).toHaveBeenCalledWith(statusCode)
    expect(authResponse.json).toHaveBeenCalledWith(expect.objectContaining({ code, requestId: 'request-1' }))
    expect(next).not.toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
  })

  it('preserves unexpected failures as safe internal errors', async () => {
    const failed = response()
    await sendCanonicalWorldDiscovery(failed.response, vi.fn().mockRejectedValue(new Error('database details')))

    expect(failed.status).toHaveBeenCalledWith(500)
    expect(failed.json).toHaveBeenCalledWith({
      code: 'internal_error',
      message: 'An internal error occurred.',
      requestId: 'request-1',
    })
  })
})

describe('live retired session HTTP boundary', () => {
  it.each([
    ['missing bearer', undefined, 401, 'authentication_required'],
    ['disallowed principal', 'Bearer denied', 403, 'insufficient_scope'],
    ['authenticated principal', 'Bearer allowed', 426, 'client_upgrade_required'],
  ])('orders %s before retirement rejection without parsing POST bodies', async (_label, authorization, expectedStatus, expectedCode) => {
    const verifier = vi.fn(async (token: string) => {
      if (token === 'denied') throw new AuthenticationError('insufficient_scope')
      return { subject: 'subject-1' }
    })
    const resolver = vi.fn(async () => ({ principalId: 'principal-1', status: 'active' as const }))
    const boundary = express()
    boundary.use((_req, res, next) => {
      res.setHeader('x-request-id', 'request-live')
      next()
    })
    boundary.use('/sessions', createRetiredSessionsRouter(createHttpAuth(verifier as never, resolver as never)))
    const server = createServer(boundary)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/sessions`, {
        method: 'POST',
        headers: {
          ...(authorization ? { authorization } : {}),
          'content-type': 'application/json',
        },
        body: '{not valid json',
      })
      const payload = await response.json() as { code: string }

      expect(response.status).toBe(expectedStatus)
      expect(payload.code).toBe(expectedCode)
      expect(resolver).toHaveBeenCalledTimes(expectedStatus === 426 ? 1 : 0)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })
})

describe('live Socket.IO compatibility boundary', () => {
  const principalId = '11111111-1111-4111-8111-111111111111'
  const listen = async (onConnection?: (socket: Parameters<typeof registerCanonicalTelemetryHandler>[0]) => void) => {
    const server = createServer()
    const socketServer = new SocketServer(server, { transports: ['websocket'] })
    socketServer.use(createSocketAuth(
      vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) }) as never,
      vi.fn().mockResolvedValue({ principalId, status: 'active', tokenExpiresAt: new Date(Date.now() + 60_000) }) as never,
    ))
    socketServer.use(enforceCanonicalSocketCompatibility)
    if (onConnection) socketServer.on('connection', onConnection as never)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    return { server, socketServer, url: `http://127.0.0.1:${address.port}` }
  }

  const close = async (client: SocketClient, socketServer: SocketServer): Promise<void> => {
    client.close()
    await new Promise<void>((resolve) => socketServer.close(() => resolve()))
  }

  it('returns the exact upgrade payload before accepting an unsupported socket', async () => {
    const observed = vi.fn()
    configureQuiltTelemetry(observed)
    const { socketServer, url } = await listen()
    const client = createSocketClient(url, { transports: ['websocket'], auth: { token: 'token' }, reconnection: false })
    try {
      const error = await new Promise<Error & { data?: Record<string, unknown> }>((resolve) => client.once('connect_error', resolve))

      expect(error.data).toEqual({
        code: 'client_upgrade_required',
        message: 'This client version is no longer supported.',
        minimumSchemaVersion: '2.0.0',
        minimumProtocolVersion: 2,
      })
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        name: 'canonical_old_client_rejected',
        quiltId: null,
        canonicalGeneration: null,
      }))
    } finally {
      configureQuiltTelemetry()
      await close(client, socketServer)
    }
  })

  it('binds telemetry to the authenticated handshake attempt and rejects client attempt overrides', async () => {
    const observed = vi.fn()
    configureQuiltTelemetry(observed)
    const entryAttemptId = (await issueCanonicalAttempt(principalId, 'entry'))!
    const { socketServer, url } = await listen(registerCanonicalTelemetryHandler)
    const client = createSocketClient(url, {
      transports: ['websocket'],
      reconnection: false,
      auth: {
        token: 'token',
        quiltId: '10000000-0000-4000-8000-000000000001',
        clientId: 'client-1',
        schemaVersion: '2.0.0',
        protocolVersion: 2,
        canonicalGeneration: 2,
        entryAttemptId,
      },
    })
    try {
      await new Promise<void>((resolve) => client.once('connect', resolve))
      client.emit('canonical_telemetry', {
        name: 'canonical_entry',
        attemptId: '30000000-0000-4000-8000-000000000001',
        outcome: 'ready',
        durationMs: 1,
        selectedProtocolVersion: 2,
      } as never)
      client.emit('canonical_telemetry', {
        name: 'canonical_entry',
        outcome: 'ready',
        durationMs: 1,
        selectedProtocolVersion: 2,
      })
      const entryEvents = () => observed.mock.calls.filter(([event]) => event.name === 'canonical_entry')
      await vi.waitFor(() => expect(entryEvents()).toHaveLength(1))
      expect(observed).toHaveBeenCalledWith(expect.objectContaining({
        name: 'canonical_entry',
        attemptId: entryAttemptId,
      }))
      client.emit('canonical_telemetry', {
        name: 'canonical_entry',
        outcome: 'ready',
        durationMs: 2,
        selectedProtocolVersion: 2,
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(entryEvents()).toHaveLength(1)
    } finally {
      configureQuiltTelemetry()
      await close(client, socketServer)
    }
  })
})

describe('protocol-v2 authorization boundary', () => {
  it('rejects replayed, foreign, and fabricated server-issued attempts', async () => {
    const principalId = '11111111-1111-4111-8111-111111111111'
    const attemptId = (await issueCanonicalAttempt(principalId, 'entry'))!

    await expect(consumeCanonicalAttempt(
      attemptId,
      '22222222-2222-4222-8222-222222222222',
      'entry',
    )).resolves.toBe(false)
    await expect(consumeCanonicalAttempt(
      '30000000-0000-4000-8000-000000000001',
      principalId,
      'entry',
    )).resolves.toBe(false)
    await expect(consumeCanonicalAttempt(attemptId, principalId, 'entry')).resolves.toBe(true)
    await expect(consumeCanonicalAttempt(attemptId, principalId, 'entry')).resolves.toBe(false)
  })

  it('owns canonical telemetry envelope fields and rejects unknown client fields', () => {
    const observer = vi.fn()
    configureQuiltTelemetry(observer)
    try {
      const payload = {
        name: 'canonical_entry',
        outcome: 'ready',
        durationMs: 12,
        selectedProtocolVersion: 2,
      }
      expect(recordCanonicalClientTelemetry(payload, {
        attemptId: '10000000-0000-4000-8000-000000000001',
        quiltId: '20000000-0000-4000-8000-000000000001',
        canonicalGeneration: 3,
        cohort: 'global',
      })).toBe(true)
      expect(observer).toHaveBeenCalledWith(expect.objectContaining({
        ...payload,
        attemptId: '10000000-0000-4000-8000-000000000001',
        schemaVersion: 1,
        eventId: expect.any(String),
        occurredAt: expect.any(String),
        quiltId: '20000000-0000-4000-8000-000000000001',
        canonicalGeneration: 3,
        cohort: 'global',
      }))
      expect(recordCanonicalClientTelemetry({ ...payload, principalId: 'forbidden' }, {
        attemptId: '10000000-0000-4000-8000-000000000001',
        quiltId: '20000000-0000-4000-8000-000000000001',
        canonicalGeneration: 3,
        cohort: 'global',
      })).toBe(false)
      expect(recordCanonicalClientTelemetry({
        ...payload,
        attemptId: '30000000-0000-4000-8000-000000000001',
      }, {
        attemptId: '10000000-0000-4000-8000-000000000001',
        quiltId: '20000000-0000-4000-8000-000000000001',
        canonicalGeneration: 3,
        cohort: 'global',
      })).toBe(false)
    } finally {
      configureQuiltTelemetry()
    }
  })

  it.each([
    ['missing lease', vi.fn().mockResolvedValue(false)],
    ['rejected renewal', vi.fn().mockRejectedValue(new Error('database unavailable'))],
  ])('disconnects deterministically after %s', async (_label, renew) => {
    const disconnect = vi.fn()

    await expect(renewPresenceLeaseOrDisconnect(renew, disconnect)).resolves.toBe(false)

    expect(disconnect).toHaveBeenCalledOnce()
  })

  const authenticatedPolicy: PersistedVisibilityPolicy = {
    existence: 'authenticated',
    fineData: 'authenticated',
    aggregateData: 'authenticated',
    presence: 'authenticated',
    search: 'authenticated',
    durableEvents: 'authenticated',
    claimEnabled: false,
    policyVersion: 1,
  }

  it('derives only authenticated principal capabilities for room access', () => {
    const patchAccess = buildPatchRoomAccess({
      id: 'patch-1',
      state: 'active',
      isMember: false,
      policy: authenticatedPolicy,
    })

    expect(patchAccess).toMatchObject({
      principalFine: true,
      principalAggregate: true,
      principalPresence: true,
      principalEvents: true,
    })
  })

  it('grants member surfaces according to lifecycle without bypassing deletion', () => {
    expect(buildPatchRoomAccess({
      id: 'patch-1',
      state: 'active',
      isMember: true,
      policy: authenticatedPolicy,
    })).toMatchObject({
      principalFine: true,
      principalAggregate: true,
      principalPresence: true,
      principalEvents: true,
    })
    expect(buildPatchRoomAccess({
      id: 'patch-1',
      state: 'deleted',
      isMember: true,
      policy: authenticatedPolicy,
    })).toMatchObject({
      publishesExistence: false,
      principalFine: false,
      principalAggregate: false,
      principalPresence: false,
      principalEvents: false,
    })
  })

  it('validates each requested room before database or adapter work', () => {
    expect(isQuiltRoomRequest({ requestId: 'fine:0:0', kind: 'fine', row: 0, column: 0 })).toBe(true)
    expect(isQuiltRoomRequest({ requestId: 'bad', kind: 'owner', row: 0, column: 0 })).toBe(false)
    expect(isQuiltRoomRequest({ requestId: 'bad', kind: 'fine', row: '0', column: 0 })).toBe(false)
  })

  it('validates dedicated protocol-v2 mutations with complete patch revisions', () => {
    const request = {
      quiltId: '20000000-0000-4000-8000-000000000001',
      operationId: '10000000-0000-4000-8000-000000000001',
      expectedPatchRevisions: { 'f0000000-0000-4000-8000-000000000001': 4 },
      tile: {
        tileId: '40000000-0000-4000-8000-000000000001',
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: { x: 1, y: 2 }, rotation: 0 },
      },
    }

    expect(isQuiltPlaceTileRequest(request)).toBe(true)
    expect(isQuiltPlaceTileRequest({ ...request, expectedPatchRevisions: {} })).toBe(false)
    expect(isQuiltPlaceTileRequest({ ...request, principalId: 'client-controlled' })).toBe(false)
    expect(isQuiltRemoveTileRequest({
      quiltId: request.quiltId,
      operationId: request.operationId,
      expectedPatchRevisions: request.expectedPatchRevisions,
      tileId: request.tile.tileId,
    })).toBe(true)
    expect(isQuiltRemoveTileRequest({
      quiltId: request.quiltId,
      operationId: request.operationId,
      expectedPatchRevisions: { unknown: 0 },
      tileId: request.tile.tileId,
    })).toBe(false)
  })

  it('fails the monolithic legacy protocol closed unless every exposed patch surface is visible', () => {
    const baseContext = {
      topology: {
        quiltId: 'quilt-1',
        protocolVersion: 2,
        topology: 'toroidal' as const,
        patchRows: 1,
        patchColumns: 1,
        patchWidth: 10,
        patchHeight: 10,
      },
      principalId: 'principal-1',
      patches: [{
        id: 'patch-1',
        row: 0,
        column: 0,
        state: 'active' as const,
        revision: 0,
        isMember: true,
        isOwner: true,
        policy: authenticatedPolicy,
      }],
    }

    expect(resolveLegacySocketAccess(baseContext)).toEqual({ allowed: true, mutationAllowed: true })
    expect(resolveLegacySocketAccess({
      ...baseContext,
      patches: [{ ...baseContext.patches[0], policy: { ...authenticatedPolicy, presence: 'hidden' }, isMember: false }],
    })).toEqual({ allowed: false, mutationAllowed: true })
    expect(resolveLegacySocketAccess({
      ...baseContext,
      patches: [{ ...baseContext.patches[0], isOwner: false }],
    })).toEqual({ allowed: true, mutationAllowed: false })
  })

  it('accepts finite normal-operation client runtime measurements', () => {
    const payload = {
      sampleId: '10000000-0000-4000-8000-000000000001',
      entryAttemptId: '20000000-0000-4000-8000-000000000001',
      canonicalGeneration: 2,
      quiltId: '30000000-0000-4000-8000-000000000001',
      retainedPatchCount: 2,
      retainedTileCount: 12,
      sceneObjectCount: 24,
      drawCalls: 5,
      frameTimeMs: 16.7,
    }
    expect(isQuiltClientRuntimeMetrics(payload)).toBe(true)
    expect(isQuiltClientRuntimeMetrics({
      ...payload,
      retainedPatchCount: -1,
    })).toBe(false)

    const observer = vi.fn()
    configureQuiltTelemetry(observer)
    try {
      expect(recordQuiltClientRuntimeMetrics(payload, {
        canaryTelemetryEnabled: true,
        quiltId: payload.quiltId,
        entryAttemptId: payload.entryAttemptId,
        canonicalGeneration: 2,
        cohort: 'global',
      })).toBe(true)
      expect(observer).toHaveBeenCalledWith(expect.objectContaining({
        schemaVersion: 1,
        eventId: payload.sampleId,
        attemptId: payload.entryAttemptId,
        name: 'client_runtime',
        quiltId: payload.quiltId,
        canonicalGeneration: 2,
        cohort: 'global',
        outcome: 'sampled',
        retainedPatchCount: 2,
        retainedTileCount: 12,
        sceneObjectCount: 24,
        drawCalls: 5,
        frameTimeMs: 16.7,
      }))
      expect(recordQuiltClientRuntimeMetrics(payload, {
        canaryTelemetryEnabled: true,
        quiltId: payload.quiltId,
        entryAttemptId: payload.entryAttemptId,
        canonicalGeneration: 3,
        cohort: 'global',
      })).toBe(false)
    } finally {
      configureQuiltTelemetry()
    }
  })
})

describe('protocol-v2 scoped recovery delivery', () => {
  const operation = (overrides: Partial<PatchDeliveryOperation> = {}): PatchDeliveryOperation => ({
    eventId: crypto.randomUUID(),
    opSeq: 1,
    opType: 'tile_placed',
    payload: {
      tileId: crypto.randomUUID(),
      shape: 'square',
      color: '#abc',
      material: 'ceramic',
      transform: { position: vec2(0, 0), rotation: 0 },
    },
    createdAt: 1,
    chunkIds: ['0:0'],
    ...overrides,
  })

  it('replays all applicable operations for a deliberately stale scoped cursor in order', () => {
    const staleCursorScope = ['0:0'] as const
    const retained = [
      operation({ opSeq: 3, chunkIds: ['0:0'] }),
      operation({ opSeq: 4, chunkIds: ['1:0'] }),
      operation({ opSeq: 5, chunkIds: ['0:0', '1:0'] }),
    ]

    expect(haveEqualChunkScope(staleCursorScope, ['0:0'])).toBe(true)
    expect(selectScopedReplayOperations(retained, ['0:0'])?.map((entry) => entry.opSeq)).toEqual([3, 5])
  })

  it('requires scoped snapshot fallback when a retained operation has no provable chunk scope', () => {
    const retained = [
      operation({ opSeq: 3 }),
      operation({ opSeq: 4, opType: 'tile_removed', payload: { tileId: crypto.randomUUID() }, chunkIds: [] }),
    ]

    expect(selectScopedReplayOperations(retained, ['0:0'])).toBeNull()
    expect(haveEqualChunkScope(undefined, ['0:0'])).toBe(false)
  })

  it('builds useful aggregate content from only the scoped tiles', () => {
    const aggregate = buildChunkAggregate([
      {
        id: crypto.randomUUID(),
        shape: 'square',
        color: '#abc',
        material: 'ceramic',
        transform: { position: vec2(0, 0), rotation: 0 },
        createdAt: 1,
      },
      {
        id: crypto.randomUUID(),
        shape: 'triangle',
        color: '#def',
        material: 'glass',
        transform: { position: vec2(1, 0), rotation: 0 },
        createdAt: 2,
      },
    ])

    expect(aggregate).toEqual({
      tileCount: 2,
      byShape: { square: 1, triangle: 1 },
      byMaterial: { ceramic: 1, glass: 1 },
    })
  })
})