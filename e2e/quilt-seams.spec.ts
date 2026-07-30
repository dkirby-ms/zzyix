import { expect, test } from '@playwright/test'
import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  QuiltProtocolHandshake,
  QuiltScopedSnapshotPayload,
  ServerToClientEvents,
  SubscribeQuiltAreaAck,
} from '../apps/server/src/contracts'
import { resetSharedCanvasState } from './support/testState'

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://127.0.0.1:3101'
const OIDC_ISSUER = 'http://127.0.0.1:3199/'
const TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'
type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const CLIENT_BUDGETS = {
  retainedPatches: 64,
  retainedTiles: 2_000,
  cursors: 64,
  sceneObjects: 64,
  drawCalls: 32,
  snapshotBytes: 262_144,
  frameTimeMs: 100,
} as const

const once = <T>(socket: TestSocket, event: keyof ServerToClientEvents): Promise<T> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 10_000)
  socket.once(event, (payload: unknown) => {
    clearTimeout(timeout)
    resolve(payload as T)
  })
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

const connect = async (quiltId: string, token: string): Promise<{ socket: TestSocket; protocol: QuiltProtocolHandshake }> => {
  const discovery = await fetch(new URL('/quilts/canonical', SERVER_URL), {
    headers: { authorization: `Bearer ${token}` },
  })
  expect(discovery.ok).toBe(true)
  const descriptor = await discovery.json() as { quiltId: string; generation: number; entryAttemptId: string }
  expect(descriptor.quiltId).toBe(quiltId)
  const socket: TestSocket = io(SERVER_URL, {
    auth: {
      token,
      quiltId,
      clientId: `seam-${crypto.randomUUID()}`,
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

const subscribe = (socket: TestSocket, quiltId: string, rooms: Array<{ requestId: string; row: number; column: number }>, cursors?: Parameters<ClientToServerEvents['subscribe_quilt_area']>[0]['cursors']): Promise<SubscribeQuiltAreaAck> =>
  new Promise((resolve) => socket.emit('subscribe_quilt_area', {
    quiltId,
    rooms: rooms.map((room) => ({ ...room, kind: 'aggregate', chunkIds: ['0:0'] })),
    cursors,
  }, resolve))

test('canonical room aliases stay deduplicated across one-axis seams, corners, repeated laps, and reconnect', async ({ request }, testInfo) => {
  const setup = await request.post(`${SERVER_URL}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': TOKEN },
    data: { externalSubject: `e2e-seam-owner-${crypto.randomUUID()}`, claimEnabled: true },
  })
  expect(setup.ok()).toBeTruthy()
  const { quiltId, externalSubject } = await setup.json() as {
    quiltId: string
    externalSubject: string
  }
  const ownerToken = await issueToken(externalSubject)
  const { socket, protocol } = await connect(quiltId, ownerToken)

  expect(protocol.selectedProtocolVersion).toBe(2)
  expect(protocol.topology?.topology).toBe('toroidal')
  expect(protocol.mutationEnabled).toBe(true)

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
  const { socket: reconnected } = await connect(quiltId, await issueToken(externalSubject))
  const recovered = await subscribe(reconnected, quiltId, [
    { requestId: 'reconnect-alias', row: -20_000, column: 20_000 },
  ], aliases.acceptedCursors)
  expect(recovered.acceptedCursors).toEqual(aliases.acceptedCursors)
  reconnected.disconnect()
})

test('client traversal stays finite across deterministic seams and multiple laps', async ({ page, request }, testInfo) => {
  await resetSharedCanvasState(request, { createCanonicalWorld: true })
  await page.addInitScript((subject) => localStorage.setItem('zzyix:e2e-subject', subject), `e2e-quilt-traversal-${crypto.randomUUID()}`)
  await page.goto('/')
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })

  const gridOff = await page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState())
  await page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.setGridEnabled(true))
  await expect.poll(async () => page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState().metrics.drawCalls ?? 0))
    .toBeGreaterThan(gridOff?.metrics.drawCalls ?? 0)
  const initial = await page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState())
  expect(initial?.grid.enabled).toBe(true)
  expect(initial?.grid.patternId).toBeDefined()

  const worldWidth = 998.4
  const worldHeight = 652.8
  const traversal = [
    { x: worldWidth - 0.1, y: worldHeight / 2 },
    { x: worldWidth + 0.1, y: worldHeight / 2 },
    { x: worldWidth - 0.1, y: worldHeight - 0.1 },
    { x: worldWidth + 0.1, y: worldHeight + 0.1 },
    { x: worldWidth * 4 + 0.1, y: worldHeight * -3 + 0.1 },
    { x: worldWidth * -5 - 0.1, y: worldHeight * 6 - 0.1 },
  ]
  const start = performance.now()
  for (const position of traversal) {
    await page.evaluate((nextPosition) => window.__ZZYIX_E2E_CANVAS__?.setCameraPan(nextPosition), position)
    await expect.poll(async () => page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState().cameraPan))
      .toEqual(position)
  }
  const traversalMs = performance.now() - start
  const state = await page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState())
  expect(state).toBeDefined()
  expect(new Set(state?.tiles.map((tile) => tile.id)).size).toBe(state?.tiles.length)
  expect(state?.grid).toEqual(initial?.grid)
  expect(state?.metrics.retainedPatchCount).toBeLessThanOrEqual(CLIENT_BUDGETS.retainedPatches)
  expect(state?.metrics.retainedTileCount).toBeLessThanOrEqual(CLIENT_BUDGETS.retainedTiles)
  expect(state?.metrics.cursorCount).toBeLessThanOrEqual(CLIENT_BUDGETS.cursors)
  expect(state?.metrics.optimisticCount).toBe(0)
  expect(state?.metrics.sceneObjectCount).toBeLessThanOrEqual(CLIENT_BUDGETS.sceneObjects)
  expect(state?.metrics.drawCalls).toBeLessThanOrEqual(CLIENT_BUDGETS.drawCalls)
  expect(state?.metrics.snapshotBytes).toBeLessThanOrEqual(CLIENT_BUDGETS.snapshotBytes)
  expect(state?.metrics.frameTimeMs).toBeLessThanOrEqual(CLIENT_BUDGETS.frameTimeMs)
  await testInfo.attach('quilt-client-measurements.json', {
    body: JSON.stringify({ traversalMs, budgets: CLIENT_BUDGETS, traversal, ...state?.metrics, grid: state?.grid }, null, 2),
    contentType: 'application/json',
  })
})