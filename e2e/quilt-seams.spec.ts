import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  QuiltProtocolHandshake,
  QuiltScopedSnapshotPayload,
  ServerToClientEvents,
  SubscribeQuiltAreaAck,
} from '../apps/server/src/contracts'

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://127.0.0.1:3101'
const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const once = <T>(socket: TestSocket, event: keyof ServerToClientEvents): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 10_000)
  socket.once(event, (payload: unknown) => {
    clearTimeout(timeout)
    resolve(payload as T)
  })
})

const connect = async (canvasId: string): Promise<{ socket: TestSocket; protocol: QuiltProtocolHandshake }> => {
  const socket: TestSocket = io(SERVER_URL, {
    auth: { sessionId: canvasId, clientId: `seam-${crypto.randomUUID()}`, protocolVersion: 2 },
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

const subscribe = (socket: TestSocket, quiltId: string, rooms: Array<{ requestId: string; row: number; column: number }>, cursors?: Parameters<ClientToServerEvents['subscribe_quilt_area']>[0]['cursors']): Promise<SubscribeQuiltAreaAck> =>
  new Promise((resolve) => socket.emit('subscribe_quilt_area', {
    quiltId,
    rooms: rooms.map((room) => ({ ...room, kind: 'aggregate' })),
    cursors,
  }, resolve))

test('canonical room aliases stay deduplicated across one-axis seams, corners, repeated laps, and reconnect', async ({ request }, testInfo) => {
  const setup = await request.post(`${SERVER_URL}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': TOKEN },
  })
  expect(setup.ok()).toBeTruthy()
  const { canvasId, quiltId } = await setup.json() as { canvasId: string; quiltId: string }
  const { socket, protocol } = await connect(canvasId)

  expect(protocol.selectedProtocolVersion).toBe(2)
  expect(protocol.topology?.topology).toBe('toroidal')
  expect(protocol.mutationEnabled).toBe(false)

  const snapshotPromise = once<QuiltScopedSnapshotPayload>(socket, 'quilt_patch_snapshot')
  const aliases = await subscribe(socket, quiltId, [
    { requestId: 'origin', row: 0, column: 0 },
    { requestId: 'x-seam', row: 0, column: 2 },
    { requestId: 'y-seam', row: 1, column: 0 },
    { requestId: 'corner', row: 1, column: 2 },
    { requestId: 'many-laps', row: 10_000, column: -10_000 },
  ])
  const acceptedRoomIds = aliases.outcomes.flatMap((outcome) => outcome.status === 'accepted' ? [outcome.canonicalRoomId] : [])
  expect(new Set(acceptedRoomIds).size).toBe(1)
  expect(Object.keys(aliases.acceptedCursors)).toHaveLength(1)
  const snapshot = await snapshotPromise

  const snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot))
  await testInfo.attach('quilt-seam-measurements.json', {
    body: JSON.stringify({
      requestedAliasCount: 5,
      canonicalRoomCount: new Set(acceptedRoomIds).size,
      snapshotBytes,
      tileCount: snapshot.tiles.length,
      mutationScenario: 'blocked: authenticated toroidal handshake reports mutationEnabled=false',
    }, null, 2),
    contentType: 'application/json',
  })

  socket.disconnect()
  const { socket: reconnected } = await connect(canvasId)
  const recovered = await subscribe(reconnected, quiltId, [
    { requestId: 'reconnect-alias', row: -20_000, column: 20_000 },
  ], aliases.acceptedCursors)
  expect(recovered.acceptedCursors).toEqual(aliases.acceptedCursors)
  reconnected.disconnect()
})

test('client traversal measurement artifact records cache, scene, grid, and frame state', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()
  await page.getByRole('button', { name: 'Create Canvas' }).click()
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })

  const start = performance.now()
  for (let lap = 0; lap < 40; lap += 1) {
    await page.mouse.move(480 + (lap % 2), 360 + (lap % 3))
    await page.mouse.wheel(0, lap % 2 === 0 ? 120 : -120)
  }
  const traversalMs = performance.now() - start
  const state = await page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState())
  expect(state).toBeDefined()
  expect(new Set(state?.tiles.map((tile) => tile.id)).size).toBe(state?.tiles.length)
  await testInfo.attach('quilt-client-measurements.json', {
    body: JSON.stringify({ traversalMs, ...state?.metrics, gridAlignmentEvidence: 'covered by periodic/grid domain tests' }, null, 2),
    contentType: 'application/json',
  })
})