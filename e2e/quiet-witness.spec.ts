import { expect, test, type Page } from './support/multiUser'

const CANVAS_TEST_API_KEY = '__ZZYIX_E2E_CANVAS__'

type WitnessStudyEvent = {
  prototype: 'quiet-witness'
  type: string
  condition: 'no-signal' | 'one-signal'
  unaidedNotice?: 'noticed' | 'not-noticed'
  ratings?: {
    intrigue: number
    discomfort: number
    invisibility: number
    confusion: number
  }
  perceivedAuthorship?: 'artist' | 'fantome' | 'both' | 'unsure'
  constructs?: readonly string[]
}

type CanonicalSnapshot = {
  clientId: string
  ownershipIdentity: string
  sessionId: string | null
  mode: string
  connectionStatus: string
  revision: number
  resyncEvents: number
  collaboratorIds: string[]
  tiles: Array<{ id: string; color: string; placedBy?: string }>
  metrics: {
    retainedPatchCount: number
    retainedTileCount: number
    cursorCount: number
    optimisticCount: number
    undoCount: number
    undoAvailable: boolean
    undoDepth: number
    snapshotBytes: number
  }
  witness: WitnessSnapshot
}

type WitnessSnapshot = {
  gates: {
    prototypeFeatureEnabled: boolean
    consentedStudyEnabled: boolean
  }
  signalIds: string[]
  visible: boolean
  detailOpen: boolean
  studyEvents: WitnessStudyEvent[]
}

const readCanonicalState = (page: Page): Promise<CanonicalSnapshot> => page.evaluate((apiKey) => {
  const api = (window as unknown as Record<string, {
    getCanonicalState?: () => CanonicalSnapshot
  } | undefined>)[apiKey]
  if (!api?.getCanonicalState) throw new Error('Canvas canonical test API is unavailable.')
  return api.getCanonicalState()
}, CANVAS_TEST_API_KEY)

const readWitnessState = (page: Page): Promise<WitnessSnapshot> => page.evaluate((apiKey) => {
  const api = (window as unknown as Record<string, {
    getWitnessState?: () => WitnessSnapshot
  } | undefined>)[apiKey]
  if (!api?.getWitnessState) throw new Error('Witness test API is unavailable.')
  return api.getWitnessState()
}, CANVAS_TEST_API_KEY)

const enableWitnessFixture = (
  page: Page,
  studyCondition: WitnessSnapshot['gates'] & { studyCondition?: 'no-signal' | 'one-signal' } = {
    prototypeFeatureEnabled: true,
    consentedStudyEnabled: true,
    studyCondition: 'one-signal',
  },
): Promise<void> => page.evaluate(({ apiKey, gates }) => {
  const api = (window as unknown as Record<string, {
    setWitnessFixtureGates?: (gates: WitnessSnapshot['gates']) => void
  } | undefined>)[apiKey]
  if (!api?.setWitnessFixtureGates) throw new Error('Witness fixture controls are unavailable.')
  api.setWitnessFixtureGates(gates)
}, { apiKey: CANVAS_TEST_API_KEY, gates: studyCondition })

const startCanonicalMutationObserver = (page: Page): Promise<void> => page.evaluate((apiKey) => {
  const api = (window as unknown as Record<string, {
    startCanonicalMutationObserver?: () => void
  } | undefined>)[apiKey]
  if (!api?.startCanonicalMutationObserver) throw new Error('Canonical mutation observer is unavailable.')
  api.startCanonicalMutationObserver()
}, CANVAS_TEST_API_KEY)

const readCanonicalMutationTraffic = (page: Page): Promise<string[]> => page.evaluate((apiKey) => {
  const api = (window as unknown as Record<string, {
    getCanonicalMutationTraffic?: () => readonly string[]
  } | undefined>)[apiKey]
  if (!api?.getCanonicalMutationTraffic) throw new Error('Canonical mutation observer is unavailable.')
  return [...api.getCanonicalMutationTraffic()]
}, CANVAS_TEST_API_KEY)

const comparableCanonicalState = (state: CanonicalSnapshot) => ({
  ownershipIdentity: state.ownershipIdentity,
  sessionId: state.sessionId,
  mode: state.mode,
  revision: state.revision,
  resyncEvents: state.resyncEvents,
  collaboratorIds: [...state.collaboratorIds].sort(),
  tiles: state.tiles.map((tile) => ({ ...tile })).sort((left, right) => left.id.localeCompare(right.id)),
  metrics: {
    retainedPatchCount: state.metrics.retainedPatchCount,
    retainedTileCount: state.metrics.retainedTileCount,
    optimisticCount: state.metrics.optimisticCount,
    undoCount: state.metrics.undoCount,
    undoAvailable: state.metrics.undoAvailable,
    undoDepth: state.metrics.undoDepth,
    snapshotBytes: state.metrics.snapshotBytes,
  },
})

const comparableDurableCanonicalState = (state: CanonicalSnapshot) => ({
  ownershipIdentity: state.ownershipIdentity,
  sessionId: state.sessionId,
  mode: state.mode,
  revision: state.revision,
  tiles: state.tiles.map((tile) => ({ ...tile })).sort((left, right) => left.id.localeCompare(right.id)),
})

const comparableRehydratedCanonicalState = (state: CanonicalSnapshot) => ({
  ownershipIdentity: state.ownershipIdentity,
  sessionId: state.sessionId,
  mode: state.mode,
  revision: state.revision,
  resyncEvents: state.resyncEvents,
  collaboratorIds: [...state.collaboratorIds].sort(),
  tiles: state.tiles.map((tile) => ({ ...tile })).sort((left, right) => left.id.localeCompare(right.id)),
  metrics: {
    retainedTileCount: state.metrics.retainedTileCount,
    optimisticCount: state.metrics.optimisticCount,
    undoCount: state.metrics.undoCount,
    undoAvailable: state.metrics.undoAvailable,
    undoDepth: state.metrics.undoDepth,
  },
})

const isRelevantCanonicalMutation = (payload: string): boolean => /(?:quilt_)?(?:place_tile|remove_tile)|quilt_(?:patch_event|patch_state|patch_resync_required)|(?:cache|snapshot)_(?:invalidate|refresh|reload)|(?:client|collaborator|presence)_(?:joined|left|update)|resync_required/.test(payload)

const recordRelevantCanonicalTraffic = (page: Page): string[] => {
  const traffic: string[] = []
  page.on('request', (request) => {
    const payload = `${request.method()} ${request.url()} ${request.postData() ?? ''}`
    if (isRelevantCanonicalMutation(payload)) traffic.push(payload)
  })
  page.on('websocket', (socket) => {
    socket.on('framesent', (event) => {
      if (isRelevantCanonicalMutation(event.payload)) traffic.push(event.payload)
    })
    socket.on('framereceived', (event) => {
      if (isRelevantCanonicalMutation(event.payload)) traffic.push(event.payload)
    })
  })
  return traffic
}

test.setTimeout(60_000)

test('quiet witness stays local, attributable, and non-mutating across browsers', async ({ createMultiUserSession }) => {
  const session = await createMultiUserSession({ userCount: 2 })
  const [author, observer] = session.users

  await author.waitForConnection('connected')
  await observer.waitForConnection('connected')

  await author.setActiveTile({ shape: 'square', color: '#67aeb3', material: 'glass', rotation: 0, mirrored: false })
  const humanTile = await author.placeTile({ x: 10, y: 10 })
  await observer.waitForTile({ id: humanTile.id, placedBy: (await author.getState()).ownershipIdentity })

  const durableCanonicalBaseline = comparableDurableCanonicalState(await readCanonicalState(author.page))
  await author.page.reload()
  await expect(author.page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => comparableDurableCanonicalState(await readCanonicalState(author.page)), {
    message: 'reload should retain human-authored canonical state before witness fixture setup',
  }).toEqual(durableCanonicalBaseline)

  const preWitnessCanonicalBaseline = comparableCanonicalState(await readCanonicalState(author.page))
  await enableWitnessFixture(author.page, {
    prototypeFeatureEnabled: true,
    consentedStudyEnabled: true,
    studyCondition: 'no-signal',
  })
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({
    gates: { prototypeFeatureEnabled: true, consentedStudyEnabled: true },
    signalIds: [],
    visible: true,
  })
  await expect(author.page.getByRole('complementary', { name: 'Witness signal controls' })).toBeVisible()
  await expect(observer.page.getByRole('complementary', { name: 'Witness signal controls' })).toHaveCount(0)
  await expect.poll(async () => (await readCanonicalState(observer.page)).collaboratorIds, {
    message: 'the peer should finish stale collaborator cleanup from the reload before witness interactions begin',
    timeout: 20_000,
  }).toEqual([])

  expect(comparableCanonicalState(await readCanonicalState(author.page))).toEqual(preWitnessCanonicalBaseline)
  const authorBaseline = comparableCanonicalState(await readCanonicalState(author.page))
  const observerBaseline = comparableCanonicalState(await readCanonicalState(observer.page))
  const relevantTraffic = recordRelevantCanonicalTraffic(author.page)
  await startCanonicalMutationObserver(author.page)

  await author.page.getByRole('button', { name: 'I did not notice a witness signal' }).press('Enter')
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({
    studyEvents: expect.arrayContaining([
      expect.objectContaining({ type: 'unaided-notice', condition: 'no-signal', unaidedNotice: 'not-noticed' }),
    ]),
  })
  await author.page.getByRole('button', { name: 'Witness signal details' }).press('Enter')
  await expect(author.page.getByRole('dialog')).toContainText('Observed by Fantome, the resident.')
  await author.page.getByRole('button', { name: 'Close witness details' }).press('Enter')
  const noSignalEvents = (await readWitnessState(author.page)).studyEvents

  await enableWitnessFixture(author.page, {
    prototypeFeatureEnabled: true,
    consentedStudyEnabled: true,
    studyCondition: 'one-signal',
  })
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({
    gates: { prototypeFeatureEnabled: true, consentedStudyEnabled: true },
    signalIds: ['fantome-witness-01'],
    visible: true,
  })
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({
    studyEvents: expect.arrayContaining([
      expect.objectContaining({ type: 'condition-shown', condition: 'one-signal' }),
    ]),
  })
  await author.page.getByRole('button', { name: 'I noticed a witness signal' }).press('Enter')
  await author.page.getByRole('button', { name: 'Witness signal details' }).press('Enter')
  await expect(author.page.getByRole('dialog')).toContainText('This prototype signal did not change this mosaic.')
  await author.page.getByRole('button', { name: 'Close witness details' }).press('Enter')

  await author.page.getByRole('button', { name: 'Witness signals' }).press('Enter')
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({ signalIds: [], visible: false })
  await author.page.getByRole('button', { name: 'Reset prototype signals' }).press('Enter')
  await expect.poll(() => readWitnessState(author.page)).toMatchObject({
    signalIds: ['fantome-witness-01'],
    visible: true,
    detailOpen: false,
  })
  await author.page.getByRole('button', { name: 'I noticed a witness signal' }).press('Enter')

  for (const construct of ['intrigue', 'discomfort', 'invisibility', 'confusion']) {
    await author.page.getByRole('combobox', { name: construct }).selectOption('4')
  }
  await author.page.getByRole('combobox', { name: 'Perceived authorship' }).selectOption('artist')
  await author.page.getByRole('button', { name: 'Complete study condition' }).press('Enter')
  const studyEvents = [...noSignalEvents, ...(await readWitnessState(author.page)).studyEvents]
  expect(studyEvents.map((event) => event.type)).toEqual(expect.arrayContaining([
    'condition-shown', 'unaided-notice', 'detail-opened', 'hide', 'reset', 'condition-completed',
  ]))
  for (const event of studyEvents) {
    expect(['condition-shown', 'unaided-notice', 'detail-opened', 'hide', 'reset', 'condition-completed']).toContain(event.type)
    expect(event).toMatchObject({ prototype: 'quiet-witness' })
    expect(event.condition).toMatch(/^(no-signal|one-signal)$/)
    expect(JSON.stringify(event)).not.toMatch(/tile|canvas|raw|free.?text/i)
  }
  expect(studyEvents.find((event) => event.type === 'unaided-notice' && event.condition === 'no-signal')).toMatchObject({
    unaidedNotice: 'not-noticed',
  })
  const completedEvent = studyEvents.find((event) => event.type === 'condition-completed' && event.condition === 'one-signal')
  expect(completedEvent?.ratings).toEqual({ intrigue: 4, discomfort: 4, invisibility: 4, confusion: 4 })
  expect(completedEvent?.perceivedAuthorship).toBe('artist')
  expect(completedEvent?.constructs).toEqual([
    'intrigue',
    'discomfort',
    'invisibility',
    'confusion',
    'perceived-authorship',
  ])

  expect((await readCanonicalState(author.page)).witness).toMatchObject({ visible: true, detailOpen: false })

  expect(comparableCanonicalState(await readCanonicalState(author.page))).toEqual(authorBaseline)
  expect(comparableCanonicalState(await readCanonicalState(observer.page))).toEqual(observerBaseline)
  const interactionTraffic = [...relevantTraffic]
  const preReloadCanonicalState = await readCanonicalState(author.page)
  expect(preReloadCanonicalState.metrics.snapshotBytes).toBeGreaterThanOrEqual(0)
  await author.page.reload()
  await expect(author.page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => comparableRehydratedCanonicalState(await readCanonicalState(author.page)), {
    message: 'post-interaction reload should retain canonical state and stable local invariants',
  }).toEqual(comparableRehydratedCanonicalState(preReloadCanonicalState))
  const reloadedCanonicalState = await readCanonicalState(author.page)
  for (const state of [preReloadCanonicalState, reloadedCanonicalState]) {
    expect(state.metrics.retainedPatchCount).toBeGreaterThanOrEqual(0)
    expect(state.metrics.cursorCount).toBeGreaterThanOrEqual(0)
    expect(state.metrics.snapshotBytes).toBeGreaterThanOrEqual(0)
  }
  const postReloadTraffic = relevantTraffic.slice(interactionTraffic.length)
  expect(interactionTraffic).toEqual([])
  expect(postReloadTraffic.every((payload) => payload.includes('quilt_patch_state'))).toBe(true)
  await expect(readCanonicalMutationTraffic(author.page)).resolves.toEqual([])
})