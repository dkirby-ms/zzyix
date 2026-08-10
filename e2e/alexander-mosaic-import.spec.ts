import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  QuiltPatchEventPayload,
  QuiltPlaceTileAck,
  QuiltProtocolHandshake,
  QuiltScopedStatePayload,
  ServerToClientEvents,
  SubscribeQuiltAreaAck,
} from '../apps/server/src/contracts'

const REPLICA_A = 'http://127.0.0.1:3201'
const REPLICA_B = 'http://127.0.0.1:3202'
const OIDC_ISSUER = 'http://127.0.0.1:3299/'
const RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const once = <T>(socket: TestSocket, event: keyof ServerToClientEvents): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 10_000)
  socket.once(event, (payload: unknown) => {
    clearTimeout(timeout)
    resolve(payload as T)
  })
})

const onceMatching = <T>(
  socket: TestSocket,
  event: keyof ServerToClientEvents,
  predicate: (payload: T) => boolean,
): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for matching ${event}`)), 10_000)
  const listener = (payload: T): void => {
    if (!predicate(payload)) return
    clearTimeout(timeout)
    socket.off(event, listener as never)
    resolve(payload)
  }
  socket.on(event, listener as never)
})

const issueToken = async (subject: string): Promise<string> => {
  const response = await fetch(new URL('token', OIDC_ISSUER), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject }),
  })
  expect(response.ok).toBe(true)
  return (await response.json() as { access_token: string }).access_token
}

const connect = async (url: string, quiltId: string, token: string): Promise<{ socket: TestSocket; protocol: QuiltProtocolHandshake }> => {
  const discovery = await fetch(new URL('/quilts/canonical', url), { headers: { authorization: `Bearer ${token}` } })
  expect(discovery.ok).toBe(true)
  const descriptor = await discovery.json() as { generation: number; entryAttemptId: string }
  const socket: TestSocket = io(url, {
    auth: {
      token,
      quiltId,
      clientId: `e2e-alexander-${Date.now()}-${Math.random()}`,
      schemaVersion: '2.0.0',
      protocolVersion: 2,
      canonicalGeneration: descriptor.generation,
      entryAttemptId: descriptor.entryAttemptId,
    },
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
  })
  const connected = new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  const protocol = once<QuiltProtocolHandshake>(socket, 'quilt_protocol')
  socket.connect()
  await connected
  return { socket, protocol: await protocol }
}

const place = (socket: TestSocket, request: {
  quiltId: string
  patchId: string
  operationId: string
  revision: number
  tileId: string
  position: { x: number; y: number }
  color: string
  material: 'ceramic' | 'glass' | 'stone'
}): Promise<QuiltPlaceTileAck> => new Promise((resolve) => socket.emit('quilt_place_tile', {
  quiltId: request.quiltId,
  operationId: request.operationId,
  expectedPatchRevisions: { [request.patchId]: request.revision },
  tile: {
    tileId: request.tileId,
    shape: 'square',
    color: request.color,
    material: request.material,
    transform: { position: request.position, rotation: 0, mirrored: false },
  },
}, resolve))

const subscribe = (socket: TestSocket, payload: Parameters<ClientToServerEvents['subscribe_quilt_area']>[0]): Promise<SubscribeQuiltAreaAck> =>
  new Promise((resolve) => socket.emit('subscribe_quilt_area', payload, resolve))

test('imports bounded Alexander fixtures through canonical placement, replay, and reconnect', async ({ request }) => {
  const setup = await request.post(`${REPLICA_A}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': RESET_TOKEN },
    data: { externalSubject: `e2e-alexander-owner-${crypto.randomUUID()}`, claimEnabled: true },
  })
  expect(setup.ok()).toBeTruthy()
  const { quiltId, patchId, externalSubject } = await setup.json() as { quiltId: string; patchId: string; externalSubject: string }
  const ownerToken = await issueToken(externalSubject)
  const denied = await connect(REPLICA_A, quiltId, await issueToken(`e2e-alexander-denied-${crypto.randomUUID()}`))
  const deniedAck = await place(denied.socket, {
    quiltId, patchId, operationId: crypto.randomUUID(), revision: 0,
    tileId: crypto.randomUUID(), position: { x: 2, y: 2 }, color: '#ff0000', material: 'ceramic',
  })
  expect(deniedAck).toMatchObject({ status: 'rejected', code: 'UNAUTHORIZED' })
  denied.socket.disconnect()

  const owner = await connect(REPLICA_B, quiltId, ownerToken)
  expect(owner.protocol.mutationEnabled).toBe(true)
  const first = {
    quiltId, patchId, operationId: crypto.randomUUID(), revision: 0,
    tileId: crypto.randomUUID(), position: { x: 2, y: 2 }, color: '#abc', material: 'ceramic' as const,
  }
  const firstAck = await place(owner.socket, first)
  expect(firstAck).toMatchObject({ status: 'accepted', operationId: first.operationId, idempotent: false })
  if (firstAck.status !== 'accepted') throw new Error('small fixture placement should be accepted')
  const replay = await place(owner.socket, first)
  expect(replay).toMatchObject({ status: 'accepted', operationId: first.operationId, idempotent: true })

  const second = {
    quiltId, patchId, operationId: crypto.randomUUID(), revision: firstAck.patchRevisions[patchId],
    tileId: crypto.randomUUID(), position: { x: 4, y: 4 }, color: '#def', material: 'glass' as const,
  }
  const secondAck = await place(owner.socket, second)
  expect(secondAck).toMatchObject({ status: 'accepted', operationId: second.operationId, idempotent: false })
  if (secondAck.status !== 'accepted') throw new Error('small fixture second placement should be accepted')

  const collision = await place(owner.socket, {
    quiltId, patchId, operationId: crypto.randomUUID(), revision: secondAck.patchRevisions[patchId],
    tileId: crypto.randomUUID(), position: first.position, color: '#fedcba', material: 'stone',
  })
  expect(collision).toMatchObject({ status: 'rejected', code: 'COLLISION' })

  const acceptedTileIds = [first.tileId, second.tileId]
  let revision = secondAck.patchRevisions[patchId]
  for (const [index, position] of [[1, 6], [3, 6], [5, 6], [7, 6], [1, 8]] as const) {
    const fixture = {
      quiltId, patchId, operationId: crypto.randomUUID(), revision,
      tileId: crypto.randomUUID(), position: { x: index, y: position }, color: '#789', material: 'stone' as const,
    }
    const ack = await place(owner.socket, fixture)
    expect(ack).toMatchObject({ status: 'accepted', operationId: fixture.operationId, idempotent: false })
    if (ack.status !== 'accepted') throw new Error('bounded larger fixture placement should be accepted')
    acceptedTileIds.push(fixture.tileId)
    revision = ack.patchRevisions[patchId]
  }
  expect(new Set(acceptedTileIds).size).toBe(7)
  owner.socket.disconnect()

  const reconnected = await connect(REPLICA_A, quiltId, ownerToken)
  const statePromise = onceMatching<QuiltScopedStatePayload>(reconnected.socket, 'quilt_patch_state', (payload) => payload.patchId === patchId && payload.payloadMode === 'fine')
  const stateSubscription = await subscribe(reconnected.socket, {
    quiltId,
    rooms: [{ requestId: 'alexander-fine', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] }],
  })
  expect(stateSubscription.outcomes.every((outcome) => outcome.status === 'accepted')).toBe(true)
  const state = await statePromise
  const importedTiles = state.tiles.filter((tile) => acceptedTileIds.includes(tile.id))
  expect(importedTiles).toHaveLength(acceptedTileIds.length)
  expect(importedTiles.map((tile) => ({ id: tile.id, shape: tile.shape, material: tile.material, color: tile.color, rotation: tile.transform.rotation })))
    .toEqual(expect.arrayContaining([
      { id: first.tileId, shape: 'square', material: 'ceramic', color: '#abc', rotation: 0 },
      { id: second.tileId, shape: 'square', material: 'glass', color: '#def', rotation: 0 },
    ]))
  expect(state.cursor.revision).toBe(revision)

  const eventRoomId = `quilt:${quiltId}:patch:0:0:events`
  const replayEventPromise = onceMatching<QuiltPatchEventPayload>(reconnected.socket, 'quilt_patch_event', (payload) => payload.patchId === patchId && payload.opSeq === revision)
  const replaySubscription = await subscribe(reconnected.socket, {
    quiltId,
    rooms: [{ requestId: 'alexander-replay', kind: 'events', row: 0, column: 0, chunkIds: ['0:0'] }],
    cursors: { [eventRoomId]: { patchId, opSeq: 0, revision: 0, chunkIds: ['0:0'] } },
  })
  const replayEvent = await replayEventPromise
  expect(replayEvent.operation).toMatchObject({ tile: { id: acceptedTileIds.at(-1) } })
  expect(replaySubscription.acceptedCursors[eventRoomId]).toMatchObject({ opSeq: revision, revision })
  reconnected.socket.disconnect()

  await Promise.all([REPLICA_A, REPLICA_B].map(async (replica) => {
    const shutdown = await request.post(`${replica}/test/shutdown`, { headers: { 'x-zzyix-test-token': RESET_TOKEN } })
    expect(shutdown.status()).toBe(202)
  }))
})