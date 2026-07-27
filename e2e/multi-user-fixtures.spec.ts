import { expect, test, type CanvasTileSnapshot, type CanvasUser } from './support/multiUser'

const toTileIdentity = (tile: CanvasTileSnapshot): string => [
  tile.id,
  tile.shape,
  tile.color,
  tile.material,
  tile.position.x.toFixed(6),
  tile.position.y.toFixed(6),
  tile.rotation.toFixed(6),
  tile.mirrored ? 'mirrored' : 'normal',
  tile.placedBy ?? 'unknown',
].join('|')

const collectIdentityCounts = (tiles: CanvasTileSnapshot[]): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const tile of tiles) {
    const identity = toTileIdentity(tile)
    counts.set(identity, (counts.get(identity) ?? 0) + 1)
  }

  return counts
}

const expectAcceptedTilesExactlyOnceAcrossUsers = async (users: CanvasUser[], expectedTiles: CanvasTileSnapshot[]): Promise<void> => {
  const expectedIdentityCounts = collectIdentityCounts(expectedTiles)

  for (const user of users) {
    const state = await user.getState()
    const actualIdentityCounts = collectIdentityCounts(state.tiles)

    expect(actualIdentityCounts).toEqual(expectedIdentityCounts)
  }
}

const expectTileObservedByPeer = async (
  observer: CanvasUser,
  tile: CanvasTileSnapshot,
  expectedPlacedBy: string,
): Promise<void> => {
  await observer.expectTile({
    id: tile.id,
    shape: tile.shape,
    color: tile.color,
    material: tile.material,
    position: tile.position,
    rotation: tile.rotation,
    mirrored: tile.mirrored,
    placedBy: expectedPlacedBy,
  })
}

test('sequential placements from two users converge to one authoritative tile set with exact-once retention', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2, canvasPreset: 'expanded' })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()

  expect(initialStateA.sessionId).toBe(session.sessionId)
  expect(initialStateB.sessionId).toBe(session.sessionId)
  expect(initialStateA.clientId).not.toBe(initialStateB.clientId)

  const clientA = initialStateA.clientId
  const clientB = initialStateB.clientId

  await userA.setActiveTile({
    shape: 'square',
    color: '#67aeb3',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  const placedTile = await userA.placeTile({ x: 0, y: 0 })

  expect(placedTile.shape).toBe('square')
  expect(placedTile.color).toBe('#67aeb3')
  expect(placedTile.material).toBe('glass')
  expect(placedTile.rotation).toBeCloseTo(Math.PI / 2, 6)
  expect(placedTile.mirrored).toBe(false)
  expect(placedTile.placedBy).toBe(clientA)

  await expectTileObservedByPeer(userB, placedTile, clientA)

  await userB.setActiveTile({
    shape: 'square',
    color: '#c35f7d',
    material: 'stone',
    rotation: Math.PI,
    mirrored: false,
  })

  const placedByB = await userB.placeTile({ x: 1.01, y: 0 })
  expect(placedByB.placedBy).toBe(clientB)

  await expectTileObservedByPeer(userA, placedByB, clientB)

  await userA.setActiveTile({
    shape: 'square',
    color: '#4b7fdd',
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  })

  const placedByAAgain = await userA.placeTile({ x: 2.02, y: 0 })
  expect(placedByAAgain.placedBy).toBe(clientA)

  await expectTileObservedByPeer(userB, placedByAAgain, clientA)

  await userB.setActiveTile({
    shape: 'square',
    color: '#2f9d7d',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  const placedByBAgain = await userB.placeTile({ x: 3.03, y: 0 })
  expect(placedByBAgain.placedBy).toBe(clientB)

  await expectTileObservedByPeer(userA, placedByBAgain, clientB)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [
    placedTile,
    placedByB,
    placedByAAgain,
    placedByBAgain,
  ])
})

test('near-simultaneous independent placements converge with exact-once authoritative retention', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2, canvasPreset: 'expanded' })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()
  const clientA = initialStateA.clientId
  const clientB = initialStateB.clientId

  await userA.setActiveTile({
    shape: 'square',
    color: '#8a5bc9',
    material: 'ceramic',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  await userB.setActiveTile({
    shape: 'l-shape',
    color: '#bf8d36',
    material: 'stone',
    rotation: Math.PI,
    mirrored: false,
  })

  const [ackA, ackB] = await Promise.all([
    userA.placeTileWithAck({ x: 0, y: 0 }, { includeExpectedRevision: false }),
    userB.placeTileWithAck({ x: 1.01, y: 0 }, { includeExpectedRevision: false }),
  ])

  expect(ackA.rejected).toBe(false)
  expect(ackB.rejected).toBe(false)

  if (ackA.rejected || ackB.rejected) {
    throw new Error(`Expected both near-simultaneous placements to be accepted. got A=${ackA.reason} B=${ackB.reason}`)
  }

  expect(ackA.placed.id).not.toBe(ackB.placed.id)

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })
  const placedByB = await userB.waitForTile({ id: ackB.placed.id })

  await expectTileObservedByPeer(userB, placedByA, clientA)
  await expectTileObservedByPeer(userA, placedByB, clientB)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA, placedByB])
})

test('stale revision rejection triggers resync and successful retry convergence', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2, canvasPreset: 'expanded' })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()
  const clientA = initialStateA.clientId
  const clientB = initialStateB.clientId

  await userA.setActiveTile({
    shape: 'square',
    color: '#6f92d1',
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  })

  await userB.setActiveTile({
    shape: 'square',
    color: '#d18a6f',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  const ackA = await userA.placeTileWithAck({ x: 0, y: 0 }, { includeExpectedRevision: true })
  expect(ackA.rejected).toBe(false)
  if (ackA.rejected) {
    throw new Error(`Expected seed placement to be accepted. got ${ackA.reason}`)
  }

  const staleAttempt = await userB.placeTileWithAck(
    { x: 1.01, y: 0 },
    { includeExpectedRevision: true, expectedRevisionOverride: 0 },
  )

  expect(staleAttempt.rejected).toBe(true)
  if (!staleAttempt.rejected) {
    throw new Error('Expected stale attempt to be rejected with STALE_REVISION')
  }
  expect(staleAttempt.reason).toBe('STALE_REVISION')

  await expect.poll(async () => (await userB.getState()).resyncEvents, {
    message: 'user B should receive a resync signal after stale revision rejection',
  }).toBeGreaterThan(0)

  await expect.poll(async () => (await userB.getState()).revision, {
    message: 'user B should converge to the updated authoritative revision before retry',
  }).toBeGreaterThanOrEqual(1)

  const retryPlacedTile = await userB.placeTile({ x: 1.01, y: 0 })

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })
  const placedByB = await userB.waitForTile({ id: retryPlacedTile.id })

  await expectTileObservedByPeer(userB, placedByA, clientA)
  await expectTileObservedByPeer(userA, placedByB, clientB)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA, placedByB])
})

test('out-of-order revision rejection allows clean retry and convergence', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2, canvasPreset: 'expanded' })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()
  const clientA = initialStateA.clientId
  const clientB = initialStateB.clientId

  await userA.setActiveTile({
    shape: 'square',
    color: '#4f78bf',
    material: 'ceramic',
    rotation: 0,
    mirrored: false,
  })

  await userB.setActiveTile({
    shape: 'square',
    color: '#bf7a4f',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  const ackA = await userA.placeTileWithAck({ x: 0, y: 0 }, { includeExpectedRevision: true })
  expect(ackA.rejected).toBe(false)
  if (ackA.rejected) {
    throw new Error(`Expected seed placement to be accepted. got ${ackA.reason}`)
  }

  await userB.waitForTile({ id: ackA.placed.id })

  const beforeOutOfOrder = await userB.getState()
  const outOfOrderRevision = beforeOutOfOrder.revision + 5
  const resyncEventsBefore = beforeOutOfOrder.resyncEvents

  const outOfOrderAttempt = await userB.placeTileWithAck(
    { x: 1.01, y: 0 },
    {
      includeExpectedRevision: true,
      expectedRevisionOverride: outOfOrderRevision,
    },
  )

  expect(outOfOrderAttempt.rejected).toBe(true)
  if (!outOfOrderAttempt.rejected) {
    throw new Error('Expected out-of-order attempt to be rejected with OUT_OF_ORDER_REVISION')
  }
  expect(outOfOrderAttempt.reason).toBe('OUT_OF_ORDER_REVISION')

  await expect.poll(async () => (await userB.getState()).resyncEvents, {
    message: 'out-of-order place_tile rejection should not force full-canvas resync',
  }).toBe(resyncEventsBefore)

  const retryPlacedTile = await userB.placeTile({ x: 1.01, y: 0 })

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })
  const placedByB = await userB.waitForTile({ id: retryPlacedTile.id })

  await expectTileObservedByPeer(userB, placedByA, clientA)
  await expectTileObservedByPeer(userA, placedByB, clientB)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA, placedByB])
})