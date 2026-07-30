import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientJoinedPayload,
  ClientLeftPayload,
  ClientToServerEvents,
  QuiltPatchEventPayload,
  QuiltPlaceTileAck,
  QuiltProtocolHandshake,
  QuiltRemoveTileAck,
  QuiltScopedSnapshotPayload,
  ServerToClientEvents,
  SubscribeQuiltAreaAck,
} from '../apps/server/src/contracts'

const REPLICA_A = 'http://127.0.0.1:3201'
const REPLICA_B = 'http://127.0.0.1:3202'
const OIDC_ISSUER = 'http://127.0.0.1:3299/'
const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
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
  const timeout = setTimeout(() => {
    socket.off(event, listener as never)
    reject(new Error(`Timed out waiting for matching ${event}`))
  }, 10_000)
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
  const discovery = await fetch(new URL('/quilts/canonical', url), {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(discovery.ok).toBe(true)
  const descriptor = await discovery.json() as { quiltId: string; generation: number; entryAttemptId: string }
  expect(descriptor.quiltId).toBe(quiltId)
  const socket: TestSocket = io(url, {
    auth: {
      token,
      quiltId,
      clientId: randomClientId(),
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

const randomClientId = (): string => `e2e-${Date.now()}-${Math.random()}`

const expectNoEvent = async (socket: TestSocket, event: keyof ServerToClientEvents, durationMs = 300): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener as never)
      resolve()
    }, durationMs)
    const listener = (): void => {
      clearTimeout(timeout)
      socket.off(event, listener as never)
      reject(new Error(`Unexpected ${event}`))
    }
    socket.on(event, listener as never)
  })
}

test('reconnects through another replica with cursor convergence and an attachment payload above 8 KB', async ({ request }) => {
  const setup = await request.post(`${REPLICA_A}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': TOKEN },
    data: {
      externalSubject: `e2e-reconnect-owner-${crypto.randomUUID()}`,
      claimEnabled: true,
    },
  })
  expect(setup.ok()).toBeTruthy()
  const { quiltId, patchId, principalId, externalSubject } = await setup.json() as {
    quiltId: string
    patchId: string
    principalId: string
    externalSubject: string
  }
  const deniedToken = await issueToken('e2e-denied-member')
  const ownerToken = await issueToken(externalSubject)

  const { socket: presenceObserver } = await connect(REPLICA_A, quiltId, await issueToken(`e2e-presence-observer-${crypto.randomUUID()}`))
  const joinedPromise = onceMatching<ClientJoinedPayload>(presenceObserver, 'client_joined', (payload) => payload.client.clientId === principalId)
  const { socket: ownerPresenceA } = await connect(REPLICA_A, quiltId, ownerToken)
  await expect(joinedPromise).resolves.toMatchObject({ client: { clientId: principalId } })
  const duplicateJoinCheck = expectNoEvent(presenceObserver, 'client_joined')
  const { socket: ownerPresenceB } = await connect(REPLICA_B, quiltId, ownerToken)
  await duplicateJoinCheck
  ownerPresenceA.disconnect()
  await expectNoEvent(presenceObserver, 'client_left')
  const leftPromise = onceMatching<ClientLeftPayload>(presenceObserver, 'client_left', (payload) => payload.clientId === principalId)
  ownerPresenceB.disconnect()
  await expect(leftPromise).resolves.toEqual({ clientId: principalId })
  presenceObserver.disconnect()

  const { socket: first, protocol: firstProtocol } = await connect(REPLICA_A, quiltId, deniedToken)
  expect(firstProtocol.selectedProtocolVersion).toBe(2)
  const denied = await new Promise<QuiltPlaceTileAck>((resolve) => first.emit('quilt_place_tile', {
    quiltId,
    operationId: crypto.randomUUID(),
    expectedPatchRevisions: { [patchId]: 0 },
    tile: {
      tileId: crypto.randomUUID(),
      shape: 'square',
      color: '#ff0000',
      material: 'ceramic',
      transform: { position: { x: 5, y: 5 }, rotation: 0, mirrored: false },
    },
  }, resolve))
  expect(denied).toMatchObject({ status: 'rejected', code: 'UNAUTHORIZED' })
  first.disconnect()

  const { socket: second, protocol: secondProtocol } = await connect(REPLICA_B, quiltId, ownerToken)
  expect(secondProtocol.topology?.topology).toBe('toroidal')
  expect(secondProtocol.mutationEnabled).toBe(true)
  const aggregateSnapshotPromise = onceMatching<QuiltScopedSnapshotPayload>(
    second,
    'quilt_patch_snapshot',
    (payload) => payload.payloadMode === 'aggregate',
  )
  const subscription = await new Promise<SubscribeQuiltAreaAck>((resolve) => second.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [
      { requestId: 'fine-events', kind: 'fine', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'aggregate-a', kind: 'aggregate', row: 0, column: 0, chunkIds: ['0:0'] },
      { requestId: 'aggregate-alias', kind: 'aggregate', row: 1, column: 2, chunkIds: ['0:0'] },
    ],
  }, resolve))
  expect(subscription.outcomes.every((outcome) => outcome.status === 'accepted')).toBe(true)
  expect(Object.keys(subscription.acceptedCursors)).toHaveLength(2)
  const aggregateSnapshot = await aggregateSnapshotPromise
  expect(aggregateSnapshot.payloadMode).toBe('aggregate')
  expect(aggregateSnapshot.tiles).toEqual([])
  expect(aggregateSnapshot.aggregates).toEqual([{
    chunkId: '0:0',
    aggregate: {
      tileCount: 1,
      byShape: { square: 1 },
      byMaterial: { ceramic: 1 },
    },
  }])

  const mutationEventPromise = once<QuiltPatchEventPayload>(second, 'quilt_patch_event')
  const placementOperationId = crypto.randomUUID()
  const placement = await new Promise<QuiltPlaceTileAck>((resolve) => second.emit('quilt_place_tile', {
    quiltId,
    operationId: placementOperationId,
    expectedPatchRevisions: { [patchId]: 0 },
    tile: {
      tileId: crypto.randomUUID(),
      shape: 'square',
      color: '#abcdef',
      material: 'glass',
      transform: { position: { x: 2, y: 2 }, rotation: 0, mirrored: false },
    },
  }, resolve))
  expect(placement).toMatchObject({ status: 'accepted', operationId: placementOperationId })
  if (placement.status !== 'accepted') throw new Error('Owner placement should be accepted')
  const mutationEvent = await mutationEventPromise
  expect(mutationEvent.operation).toMatchObject({ tile: { id: placement.tile.id } })

  const stale = await new Promise<QuiltPlaceTileAck>((resolve) => second.emit('quilt_place_tile', {
    quiltId,
    operationId: crypto.randomUUID(),
    expectedPatchRevisions: { [patchId]: 0 },
    tile: {
      tileId: crypto.randomUUID(),
      shape: 'square',
      color: '#fedcba',
      material: 'stone',
      transform: { position: { x: 4, y: 4 }, rotation: 0, mirrored: false },
    },
  }, resolve))
  expect(stale).toMatchObject({ status: 'rejected', code: 'STALE_REVISION' })

  const removalEventPromise = once<QuiltPatchEventPayload>(second, 'quilt_patch_event')
  const removal = await new Promise<QuiltRemoveTileAck>((resolve) => second.emit('quilt_remove_tile', {
    quiltId,
    operationId: crypto.randomUUID(),
    expectedPatchRevisions: placement.patchRevisions,
    tileId: placement.tile.id,
  }, resolve))
  expect(removal).toMatchObject({ status: 'accepted' })
  const removalEvent = await removalEventPromise
  expect(removalEvent.operation).toMatchObject({ tileId: placement.tile.id })

  const eventPromise = once<QuiltPatchEventPayload>(second, 'quilt_patch_event')
  const attachment = 'x'.repeat(9 * 1024)
  const publish = await request.post(`${REPLICA_A}/test/quilt/publish`, {
    headers: { 'x-zzyix-test-token': TOKEN },
    data: { quiltId, patchId, attachment },
  })
  expect(publish.ok()).toBeTruthy()
  const published = await publish.json() as {
    canonicalRoomId: string
    adapterRoomId: string
    recipientCount: number
    eventId: string
    revision: number
    attachmentBytes: number
  }
  expect(published.adapterRoomId).toBe(`${published.canonicalRoomId}:chunk:0:0`)
  expect(published.recipientCount).toBe(1)
  const event = await eventPromise
  expect(event.eventId).toBe(published.eventId)
  expect(event.testAttachment).toHaveLength(9 * 1024)
  expect(published.attachmentBytes).toBeGreaterThan(8 * 1024)
  second.disconnect()

  const { socket: reconnected, protocol: reconnectProtocol } = await connect(REPLICA_A, quiltId, await issueToken(externalSubject))
  expect(reconnectProtocol.selectedProtocolVersion).toBe(2)
  const eventRoomId = `quilt:${quiltId}:patch:0:0:events`
  const recoveredEventPromise = onceMatching<QuiltPatchEventPayload>(
    reconnected,
    'quilt_patch_event',
    (payload) => payload.eventId === published.eventId,
  )
  const recovered = await new Promise<SubscribeQuiltAreaAck>((resolve) => reconnected.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [{ requestId: 'events-reconnect', kind: 'events', row: 0, column: 0, chunkIds: ['0:0'] }],
    cursors: {
      [eventRoomId]: {
        patchId,
        opSeq: 0,
        revision: 0,
        chunkIds: ['0:0'],
      },
    },
  }, resolve))
  const recoveredEvent = await recoveredEventPromise
  expect(recoveredEvent.eventId).toBe(published.eventId)
  expect(recoveredEvent.canonicalRoomId).toBe(eventRoomId)
  expect(recovered.acceptedCursors[eventRoomId]).toEqual({
    patchId,
    opSeq: published.revision,
    revision: published.revision,
    eventId: published.eventId,
    chunkIds: ['0:0'],
  })

  const rejected = await new Promise<SubscribeQuiltAreaAck>((resolve) => reconnected.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [{
      requestId: 'too-many-chunks',
      kind: 'aggregate',
      row: 0,
      column: 0,
      chunkIds: Array.from({ length: 65 }, (_, index) => `${index}:0` as `${number}:${number}`),
    }],
  }, resolve))
  expect(rejected.outcomes).toEqual([{ requestId: 'too-many-chunks', status: 'budget-exceeded', reason: 'CHUNKS_PER_REQUEST' }])
  let leakedEvent = false
  reconnected.once('quilt_patch_event', () => { leakedEvent = true })
  const rejectedPublish = await request.post(`${REPLICA_A}/test/quilt/publish`, {
    headers: { 'x-zzyix-test-token': TOKEN },
    data: { quiltId, patchId, chunkId: '64:0' },
  })
  expect(rejectedPublish.ok()).toBeTruthy()
  await new Promise((resolve) => setTimeout(resolve, 250))
  expect(leakedEvent).toBe(false)
  reconnected.disconnect()

  const shutdownHeaders = { 'x-zzyix-test-token': TOKEN }
  const [shutdownA, shutdownB] = await Promise.all([
    request.post(`${REPLICA_A}/test/shutdown`, { headers: shutdownHeaders }),
    request.post(`${REPLICA_B}/test/shutdown`, { headers: shutdownHeaders }),
  ])
  expect(shutdownA.status()).toBe(202)
  expect(shutdownB.status()).toBe(202)
})