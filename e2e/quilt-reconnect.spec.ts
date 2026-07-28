import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  QuiltPatchEventPayload,
  QuiltProtocolHandshake,
  ServerToClientEvents,
  SubscribeQuiltAreaAck,
} from '../apps/server/src/contracts'

const REPLICA_A = 'http://127.0.0.1:3201'
const REPLICA_B = 'http://127.0.0.1:3202'
const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const once = <T>(socket: TestSocket, event: keyof ServerToClientEvents): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 10_000)
  socket.once(event, (payload: unknown) => {
    clearTimeout(timeout)
    resolve(payload as T)
  })
})

const connect = async (url: string, canvasId: string): Promise<{ socket: TestSocket; protocol: QuiltProtocolHandshake }> => {
  const socket: TestSocket = io(url, {
    auth: { sessionId: canvasId, clientId: randomClientId(), protocolVersion: 2 },
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

test('reconnects through another replica with cursor convergence and an attachment payload above 8 KB', async ({ request }) => {
  const setup = await request.post(`${REPLICA_A}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': TOKEN },
  })
  expect(setup.ok()).toBeTruthy()
  const { canvasId, quiltId, patchId } = await setup.json() as { canvasId: string; quiltId: string; patchId: string }

  const { socket: first, protocol: firstProtocol } = await connect(REPLICA_A, canvasId)
  expect(firstProtocol.selectedProtocolVersion).toBe(2)
  const forbidden = await new Promise<SubscribeQuiltAreaAck>((resolve) => first.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [{ requestId: 'fine', kind: 'fine', row: 0, column: 0 }],
  }, resolve))
  expect(forbidden.outcomes).toEqual([{ requestId: 'fine', status: 'forbidden', reason: 'NOT_VISIBLE' }])
  first.disconnect()

  const { socket: second, protocol: secondProtocol } = await connect(REPLICA_B, canvasId)
  expect(secondProtocol.topology?.topology).toBe('toroidal')
  const subscription = await new Promise<SubscribeQuiltAreaAck>((resolve) => second.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [
      { requestId: 'aggregate-a', kind: 'aggregate', row: 0, column: 0 },
      { requestId: 'aggregate-alias', kind: 'aggregate', row: 1, column: 2 },
    ],
  }, resolve))
  expect(subscription.outcomes.every((outcome) => outcome.status === 'accepted')).toBe(true)
  expect(Object.keys(subscription.acceptedCursors)).toHaveLength(1)

  const eventPromise = once<QuiltPatchEventPayload>(second, 'quilt_patch_event')
  const attachment = 'x'.repeat(9 * 1024)
  const publish = await request.post(`${REPLICA_A}/test/quilt/publish`, {
    headers: { 'x-zzyix-test-token': TOKEN },
    data: { quiltId, patchId, attachment },
  })
  expect(publish.ok()).toBeTruthy()
  const published = await publish.json() as { canonicalRoomId: string; eventId: string; revision: number; attachmentBytes: number }
  const event = await eventPromise
  expect(event.eventId).toBe(published.eventId)
  expect(event.testAttachment).toHaveLength(9 * 1024)
  expect(published.attachmentBytes).toBeGreaterThan(8 * 1024)
  second.disconnect()

  const { socket: reconnected, protocol: reconnectProtocol } = await connect(REPLICA_B, canvasId)
  expect(reconnectProtocol.selectedProtocolVersion).toBe(2)
  const recovered = await new Promise<SubscribeQuiltAreaAck>((resolve) => reconnected.emit('subscribe_quilt_area', {
    quiltId,
    rooms: [{ requestId: 'aggregate-reconnect', kind: 'aggregate', row: 0, column: 0 }],
    cursors: {
      [published.canonicalRoomId]: {
        patchId,
        opSeq: published.revision,
        revision: published.revision,
        eventId: published.eventId,
      },
    },
  }, resolve))
  expect(recovered.acceptedCursors[published.canonicalRoomId]).toEqual({
    patchId,
    opSeq: published.revision,
    revision: published.revision,
    eventId: published.eventId,
  })
  reconnected.disconnect()

  const shutdownHeaders = { 'x-zzyix-test-token': TOKEN }
  const [shutdownA, shutdownB] = await Promise.all([
    request.post(`${REPLICA_A}/test/shutdown`, { headers: shutdownHeaders }),
    request.post(`${REPLICA_B}/test/shutdown`, { headers: shutdownHeaders }),
  ])
  expect(shutdownA.status()).toBe(202)
  expect(shutdownB.status()).toBe(202)
})