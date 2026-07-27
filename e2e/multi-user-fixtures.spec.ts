import { expect, test } from './support/multiUser'

test('creates isolated users on one shared canvas and synchronizes tile state without sleeps', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2, canvasPreset: 'expanded' })
  const [userA, userB] = session.users

  await userA.waitForConnection('connected')
  await userB.waitForConnection('connected')

  const initialStateA = await userA.getState()
  const initialStateB = await userB.getState()

  expect(initialStateA.sessionId).toBe(session.sessionId)
  expect(initialStateB.sessionId).toBe(session.sessionId)
  expect(initialStateA.clientId).not.toBe(initialStateB.clientId)

  await userA.setActiveTile({
    shape: 'l-shape',
    color: '#67aeb3',
    material: 'glass',
    rotation: Math.PI / 2,
    mirrored: true,
  })

  const placedTile = await userA.placeTile({ x: 0, y: 0 })

  expect(placedTile.shape).toBe('l-shape')
  expect(placedTile.color).toBe('#67aeb3')
  expect(placedTile.material).toBe('glass')
  expect(placedTile.rotation).toBeCloseTo(Math.PI / 2, 6)
  expect(placedTile.mirrored).toBe(true)
  expect(placedTile.placedBy).toBe(initialStateA.clientId)

  const observedTile = await userB.expectTile({
    id: placedTile.id,
    shape: 'l-shape',
    color: '#67aeb3',
    material: 'glass',
    position: placedTile.position,
    rotation: placedTile.rotation,
    mirrored: placedTile.mirrored,
    placedBy: initialStateA.clientId,
  })

  expect(observedTile.id).toBe(placedTile.id)
})