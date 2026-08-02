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
  const expectedIdentityCounts = Array.from(collectIdentityCounts(expectedTiles)).sort(([left], [right]) => left.localeCompare(right))

  for (const user of users) {
    await expect.poll(async () => {
      const state = await user.getState()
      return {
        identities: Array.from(collectIdentityCounts(state.tiles)).sort(([left], [right]) => left.localeCompare(right)),
        optimisticCount: state.metrics.optimisticCount,
      }
    }, { message: `${user.name} should converge to exact authoritative tile state` }).toEqual({
      identities: expectedIdentityCounts,
      optimisticCount: 0,
    })
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

test('simultaneous first logins receive distinct stable patch assignments', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 3, automaticAssignments: true })

  const assignmentLabels = await Promise.all(session.users.map(async (user) => {
    const assignment = user.page.getByText(/^Patch \d+, \d+$/)
    await expect(assignment).toBeVisible()
    await expect(user.page.getByRole('button', { name: /^Claim / })).toHaveCount(0)
    return assignment.textContent()
  }))

  expect(new Set(assignmentLabels).size).toBe(session.users.length)

  await Promise.all(session.users.map(async (user, index) => {
    await user.open()
    await expect(user.page.getByText(assignmentLabels[index]!)).toBeVisible()
  }))
})

test('owner placements converge for collaborators while non-owner mutation is denied', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()

  expect(initialStateA.sessionId).toBe(session.sessionId)
  expect(initialStateB.sessionId).toBe(session.sessionId)
  expect(initialStateA.clientId).not.toBe(initialStateB.clientId)

  const ownerA = initialStateA.ownershipIdentity

  await userA.setActiveTile({
    shape: 'square',
    color: '#67aeb3',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: false,
  })

  const placedTile = await userA.placeTile({ x: 10, y: 10 })

  expect(placedTile.shape).toBe('square')
  expect(placedTile.color).toBe('#67aeb3')
  expect(placedTile.material).toBe('glass')
  expect(placedTile.rotation).toBeCloseTo(Math.PI / 2, 6)
  expect(placedTile.mirrored).toBe(false)
  expect(placedTile.placedBy).toBe(ownerA)

  await expectTileObservedByPeer(userB, placedTile, ownerA)

  await userB.setActiveTile({
    shape: 'square',
    color: '#c35f7d',
    material: 'stone',
    rotation: Math.PI,
    mirrored: false,
  })

  const deniedByB = await userB.placeTileWithAck({ x: 11.01, y: 10 })
  expect(deniedByB).toMatchObject({ rejected: true, reason: 'PLACEMENT_REJECTED' })

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedTile])
})

test('sequential placements preserve previously visible tiles without viewport movement', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [owner, collaborator] = session.users

  await owner.waitForConnection('connected')
  await collaborator.waitForConnection('connected')

  const firstAck = await owner.placeTileWithAck({ x: 10, y: 10 })
  if (firstAck.rejected) throw new Error(`Expected first placement to succeed. got ${firstAck.reason}`)
  expect(firstAck.rejected).toBe(false)
  const firstTile = await owner.waitForTile({ id: firstAck.placed.id })
  await collaborator.waitForTile({ id: firstTile.id })

  const secondAck = await owner.placeTileWithAck({ x: 11.01, y: 10 })
  if (secondAck.rejected) throw new Error(`Expected second placement to succeed. got ${secondAck.reason}`)
  expect(secondAck.rejected).toBe(false)
  const secondTile = await owner.waitForTile({ id: secondAck.placed.id })

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [firstTile, secondTile])
})

test('near-simultaneous owner and non-owner placements preserve authorization and convergence', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const ownerA = initialStateA.ownershipIdentity

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
    userA.placeTileWithAck({ x: 10, y: 10 }, { includeExpectedRevision: false }),
    userB.placeTileWithAck({ x: 11.01, y: 10 }, { includeExpectedRevision: false }),
  ])

  expect(ackA.rejected).toBe(false)
  expect(ackB).toMatchObject({ rejected: true, reason: 'PLACEMENT_REJECTED' })

  if (ackA.rejected) {
    throw new Error(`Expected owner placement to be accepted. got ${ackA.reason}`)
  }

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })

  await expectTileObservedByPeer(userB, placedByA, ownerA)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA])
})

test('stale revision rejection triggers resync and successful retry convergence', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const ownerA = initialStateA.ownershipIdentity

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

  const ackA = await userA.placeTileWithAck({ x: 10, y: 10 }, { includeExpectedRevision: true })
  expect(ackA.rejected).toBe(false)
  if (ackA.rejected) {
    throw new Error(`Expected seed placement to be accepted. got ${ackA.reason}`)
  }

  const staleAttempt = await userA.placeTileWithAck(
    { x: 11.01, y: 10 },
    { includeExpectedRevision: true, expectedRevisionOverride: 0 },
  )

  expect(staleAttempt.rejected).toBe(true)
  if (!staleAttempt.rejected) {
    throw new Error('Expected stale attempt to be rejected with STALE_REVISION')
  }
  expect(staleAttempt.reason).toBe('STALE_REVISION')

  await expect.poll(async () => (await userA.getState()).resyncEvents, {
    message: 'the owner should receive a resync signal after stale revision rejection',
  }).toBeGreaterThan(0)

  await expect.poll(async () => (await userA.getState()).revision, {
    message: 'the owner should converge to the updated authoritative revision before retry',
  }).toBeGreaterThanOrEqual(1)

  const retryPlacedTile = await userA.placeTile({ x: 11.01, y: 10 })

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })
  const placedByAAgain = await userB.waitForTile({ id: retryPlacedTile.id })

  await expectTileObservedByPeer(userB, placedByA, ownerA)
  expect(placedByAAgain.placedBy).toBe(ownerA)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA, placedByAAgain])
})

test('out-of-order revision rejection allows clean retry and convergence', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const ownerA = initialStateA.ownershipIdentity

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

  const ackA = await userA.placeTileWithAck({ x: 10, y: 10 }, { includeExpectedRevision: true })
  expect(ackA.rejected).toBe(false)
  if (ackA.rejected) {
    throw new Error(`Expected seed placement to be accepted. got ${ackA.reason}`)
  }

  await userB.waitForTile({ id: ackA.placed.id })

  const beforeOutOfOrder = await userB.getState()
  const outOfOrderRevision = beforeOutOfOrder.revision + 5
  const resyncEventsBefore = beforeOutOfOrder.resyncEvents

  const outOfOrderAttempt = await userA.placeTileWithAck(
    { x: 11.01, y: 10 },
    {
      includeExpectedRevision: true,
      expectedRevisionOverride: outOfOrderRevision,
    },
  )

  expect(outOfOrderAttempt.rejected).toBe(true)
  if (!outOfOrderAttempt.rejected) {
    throw new Error('Expected out-of-order attempt to be rejected with OUT_OF_ORDER_REVISION')
  }
  expect(outOfOrderAttempt.reason).toBe('STALE_REVISION')

  await expect.poll(async () => (await userB.getState()).resyncEvents, {
    message: 'out-of-order place_tile rejection should not force full-canvas resync',
  }).toBe(resyncEventsBefore)

  const retryPlacedTile = await userA.placeTile({ x: 11.01, y: 10 })

  const placedByA = await userA.waitForTile({ id: ackA.placed.id })
  const placedByAAgain = await userB.waitForTile({ id: retryPlacedTile.id })

  await expectTileObservedByPeer(userB, placedByA, ownerA)
  expect(placedByAAgain.placedBy).toBe(ownerA)

  await expectAcceptedTilesExactlyOnceAcrossUsers(session.users, [placedByA, placedByAAgain])
})

test('new tile shapes can be placed and persist through the full stack', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [user] = session.users

  await user.waitForConnection('connected')

  const newShapes = ['large-square', 'circle', 'right-triangle', 'large-right-triangle'] as const

  for (const [index, shape] of newShapes.entries()) {
    await user.setActiveTile({ shape, color: '#5a8fd4', material: 'ceramic' })
    const tile = await user.placeTile({ x: 10 + index * 5, y: 10 })
    expect(tile.shape).toBe(shape)
  }
})