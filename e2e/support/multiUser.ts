import { expect, test as base, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createIsolatedSharedCanvas, resetSharedCanvasState, type ResetSharedCanvasOptions } from './testState'
import type { PlaceTileAck } from '../../apps/server/src/contracts'

const CANVAS_TEST_API_KEY = '__ZZYIX_E2E_CANVAS__'
const DEFAULT_CLIENT_URL = 'http://127.0.0.1:4173/'
const SERVER_TILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CanvasConnectionStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'
type CanvasMode = 'lobby' | 'canvas'
type CanvasSizePreset = NonNullable<ResetSharedCanvasOptions['canvasPreset']>

export type CanvasTileSnapshot = {
  id: string
  shape: 'square' | 'triangle' | 'rectangle' | 'l-shape'
  color: string
  material: 'ceramic' | 'glass' | 'stone'
  position: {
    x: number
    y: number
  }
  rotation: number
  mirrored: boolean
  placedBy?: string
}

export type CanvasStateSnapshot = {
  clientId: string
  sessionId: string | null
  mode: CanvasMode
  connectionStatus: CanvasConnectionStatus
  revision: number
  resyncEvents: number
  collaboratorIds: string[]
  activeTile: {
    shape: CanvasTileSnapshot['shape']
    color: string
    material: CanvasTileSnapshot['material']
    rotation: number
    mirrored: boolean
  }
  tiles: CanvasTileSnapshot[]
}

type CanvasTestApi = {
  getState: () => CanvasStateSnapshot
  joinSession: (sessionId: string) => void
  setActiveTile: (patch: Partial<CanvasStateSnapshot['activeTile']>) => void
  movePointer: (position: { x: number; y: number }) => void
  placeTileAt: (position: { x: number; y: number }) => void
  placeTileAtWithAck: (input: {
    position: { x: number; y: number }
    includeExpectedRevision?: boolean
    expectedRevisionOverride?: number
  }) => Promise<PlaceTileAck>
}

export type TileExpectation = {
  id?: string
  shape?: CanvasTileSnapshot['shape']
  color?: string
  material?: CanvasTileSnapshot['material']
  position?: {
    x: number
    y: number
  }
  rotation?: number
  mirrored?: boolean
  placedBy?: string
}

export type CanvasUser = {
  name: string
  context: BrowserContext
  page: Page
  open: () => Promise<void>
  joinSession: (sessionId: string) => Promise<void>
  getState: () => Promise<CanvasStateSnapshot>
  waitForConnection: (status?: CanvasConnectionStatus) => Promise<CanvasStateSnapshot>
  setActiveTile: (patch: Partial<CanvasStateSnapshot['activeTile']>) => Promise<void>
  placeTile: (position: { x: number; y: number }) => Promise<CanvasTileSnapshot>
  placeTileWithAck: (
    position: { x: number; y: number },
    options?: { includeExpectedRevision?: boolean; expectedRevisionOverride?: number },
  ) => Promise<PlaceTileAck>
  waitForTile: (expectation: TileExpectation) => Promise<CanvasTileSnapshot>
  expectTile: (expectation: TileExpectation) => Promise<CanvasTileSnapshot>
}

export type MultiUserSession = {
  sessionId: string
  users: CanvasUser[]
  close: () => Promise<void>
}

export type CreateMultiUserSessionOptions = {
  userCount?: number
  canvasPreset?: CanvasSizePreset
}

type CreateMultiUserSession = (options?: CreateMultiUserSessionOptions) => Promise<MultiUserSession>

const readCanvasState = async (page: Page): Promise<CanvasStateSnapshot> => page.evaluate((apiKey) => {
  const api = (window as unknown as Record<string, CanvasTestApi | undefined>)[apiKey]
  if (!api) {
    throw new Error('Canvas test API is unavailable. Check the e2e client flag and App bridge registration.')
  }

  return api.getState()
}, CANVAS_TEST_API_KEY)

const callCanvasApi = async <TArg, TResult = void>(
  page: Page,
  method: keyof Omit<CanvasTestApi, 'getState'>,
  argument: TArg,
): Promise<TResult> => {
  return page.evaluate(async ({ apiKey, methodName, payload }) => {
    const api = (window as unknown as Record<string, CanvasTestApi | undefined>)[apiKey]
    if (!api) {
      throw new Error('Canvas test API is unavailable. Check the e2e client flag and App bridge registration.')
    }

    const action = api[methodName]
    if (typeof action !== 'function') {
      throw new Error(`Canvas test API method ${methodName} is unavailable.`)
    }

    return Promise.resolve(action(payload as never) as TResult)
  }, {
    apiKey: CANVAS_TEST_API_KEY,
    methodName: method,
    payload: argument,
  })
}

const positionsMatch = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): boolean => Math.abs(actual.x - expected.x) < 1e-6 && Math.abs(actual.y - expected.y) < 1e-6

const tileMatches = (tile: CanvasTileSnapshot, expectation: TileExpectation): boolean => {
  if (expectation.id !== undefined && tile.id !== expectation.id) {
    return false
  }
  if (expectation.shape !== undefined && tile.shape !== expectation.shape) {
    return false
  }
  if (expectation.color !== undefined && tile.color !== expectation.color) {
    return false
  }
  if (expectation.material !== undefined && tile.material !== expectation.material) {
    return false
  }
  if (expectation.rotation !== undefined && tile.rotation !== expectation.rotation) {
    return false
  }
  if (expectation.mirrored !== undefined && tile.mirrored !== expectation.mirrored) {
    return false
  }
  if (expectation.placedBy !== undefined && tile.placedBy !== expectation.placedBy) {
    return false
  }
  if (expectation.position !== undefined) {
    if (!positionsMatch(tile.position, expectation.position)) {
      return false
    }
  }

  return true
}

const waitForState = async (
  page: Page,
  predicate: (state: CanvasStateSnapshot) => boolean,
  message: string,
): Promise<CanvasStateSnapshot> => {
  let match: CanvasStateSnapshot | undefined
  let lastState: CanvasStateSnapshot | undefined

  try {
    await expect.poll(async () => {
      const state = await readCanvasState(page)
      lastState = state
      if (predicate(state)) {
        match = state
        return true
      }

      return false
    }, { message }).toBe(true)
  } catch (error) {
    throw new Error(`${message}\nLast canvas state: ${JSON.stringify(lastState)}`, { cause: error })
  }

  return match as CanvasStateSnapshot
}

const waitForCanvasApi = async (page: Page): Promise<void> => {
  await expect.poll(async () => page.evaluate((apiKey) => {
    const api = (window as unknown as Record<string, CanvasTestApi | undefined>)[apiKey]
    return Boolean(api?.getState)
  }, CANVAS_TEST_API_KEY), {
    message: 'canvas test API should be registered',
  }).toBe(true)
}

const assertTile = (tile: CanvasTileSnapshot, expectation: TileExpectation): void => {
  if (expectation.id !== undefined) {
    expect(tile.id).toBe(expectation.id)
  }
  if (expectation.shape !== undefined) {
    expect(tile.shape).toBe(expectation.shape)
  }
  if (expectation.color !== undefined) {
    expect(tile.color).toBe(expectation.color)
  }
  if (expectation.material !== undefined) {
    expect(tile.material).toBe(expectation.material)
  }
  if (expectation.position !== undefined) {
    expect(tile.position.x).toBeCloseTo(expectation.position.x, 6)
    expect(tile.position.y).toBeCloseTo(expectation.position.y, 6)
  }
  if (expectation.rotation !== undefined) {
    expect(tile.rotation).toBeCloseTo(expectation.rotation, 6)
  }
  if (expectation.mirrored !== undefined) {
    expect(tile.mirrored).toBe(expectation.mirrored)
  }
  if (expectation.placedBy !== undefined) {
    expect(tile.placedBy).toBe(expectation.placedBy)
  }
}

const createCanvasUser = (
  context: BrowserContext,
  page: Page,
  name: string,
  clientUrl: string,
): CanvasUser => ({
  name,
  context,
  page,
  open: async () => {
    await page.goto(clientUrl)
    await waitForCanvasApi(page)
    await waitForState(page, (state) => state.mode === 'canvas', `${name} should enter the canonical canvas`)
    await waitForState(page, (state) => state.connectionStatus === 'connected', `${name} should connect to the canonical canvas`)
  },
  joinSession: async (sessionId: string) => {
    await callCanvasApi(page, 'joinSession', sessionId)
    await waitForState(page, (state) => state.mode === 'canvas' && state.sessionId === sessionId, `${name} should enter canvas mode`)
    await waitForState(page, (state) => state.connectionStatus === 'connected', `${name} should connect to the shared canvas`)
  },
  getState: async () => readCanvasState(page),
  waitForConnection: async (status: CanvasConnectionStatus = 'connected') =>
    waitForState(page, (state) => state.connectionStatus === status, `${name} should reach ${status} state`),
  setActiveTile: async (patch) => {
    await callCanvasApi(page, 'setActiveTile', patch)
    await waitForState(
      page,
      (state) => Object.entries(patch).every(([key, value]) => state.activeTile[key as keyof typeof state.activeTile] === value),
      `${name} should apply active tile changes`,
    )
  },
  placeTile: async (position) => {
    const before = await readCanvasState(page)
    const beforeTileIds = new Set(before.tiles.map((tile) => tile.id))
    const placingClientId = before.clientId
    const placingTileState = before.activeTile

    await callCanvasApi(page, 'placeTileAt', position)

    const state = await waitForState(
      page,
      (nextState) => nextState.tiles.some((tile) =>
        !beforeTileIds.has(tile.id)
        && SERVER_TILE_ID_PATTERN.test(tile.id)
        && tile.placedBy === placingClientId
        && tile.shape === placingTileState.shape
        && tile.color === placingTileState.color
        && tile.material === placingTileState.material
        && positionsMatch(tile.position, position)),
      `${name} should place a settled server tile`,
    )

    const placedTile = state.tiles.find((tile) =>
      !beforeTileIds.has(tile.id)
      && SERVER_TILE_ID_PATTERN.test(tile.id)
      && tile.placedBy === placingClientId
      && tile.shape === placingTileState.shape
      && tile.color === placingTileState.color
      && tile.material === placingTileState.material
      && positionsMatch(tile.position, position))
    expect(placedTile, `${name} should expose the newly placed authoritative tile`).toBeTruthy()

    return placedTile as CanvasTileSnapshot
  },
  placeTileWithAck: async (position, options) => callCanvasApi<
    {
      position: { x: number; y: number }
      includeExpectedRevision?: boolean
      expectedRevisionOverride?: number
    },
    PlaceTileAck
  >(page, 'placeTileAtWithAck', {
    position,
    includeExpectedRevision: options?.includeExpectedRevision ?? true,
    expectedRevisionOverride: options?.expectedRevisionOverride,
  }),
  waitForTile: async (expectation) => {
    const state = await waitForState(
      page,
      (nextState) => nextState.tiles.some((tile) => tileMatches(tile, expectation)),
      `${name} should observe the expected tile`,
    )

    const tile = state.tiles.find((entry) => tileMatches(entry, expectation))
    expect(tile, `${name} should expose the expected tile`).toBeTruthy()
    return tile as CanvasTileSnapshot
  },
  expectTile: async (expectation) => {
    const tile = await waitForState(
      page,
      (nextState) => nextState.tiles.some((entry) => tileMatches(entry, expectation)),
      `${name} should expose the expected tile for assertion`,
    ).then((state) => state.tiles.find((entry) => tileMatches(entry, expectation)) as CanvasTileSnapshot)

    assertTile(tile, expectation)
    return tile
  },
})

const closeContext = async (openContexts: Set<BrowserContext>, context: BrowserContext): Promise<void> => {
  if (!openContexts.has(context)) {
    return
  }

  openContexts.delete(context)
  await context.close()
}

const createSessionFactory = (
  browser: Browser,
  request: APIRequestContext,
  clientUrl: string,
  openContexts: Set<BrowserContext>,
): CreateMultiUserSession => async (options = {}) => {
  const userCount = options.userCount ?? 2
  expect(userCount).toBeGreaterThanOrEqual(2)
  const ownerExternalSubject = `e2e-browser-owner-${crypto.randomUUID()}`

  const { sessionId } = await createIsolatedSharedCanvas(request, {
    canvasPreset: options.canvasPreset ?? 'expanded',
    ownerExternalSubject,
  })

  const users: CanvasUser[] = []

  try {
    for (let index = 0; index < userCount; index += 1) {
      const context = await browser.newContext({
        storageState: {
          cookies: [],
          origins: [{
            origin: clientUrl,
            localStorage: [
              { name: 'zzyix:e2e-authenticated', value: 'true' },
              { name: 'zzyix:e2e-subject', value: index === 0 ? ownerExternalSubject : `e2e-browser-user-${index + 1}` },
            ],
          }],
        },
      })
      openContexts.add(context)
      const page = await context.newPage()
      const user = createCanvasUser(context, page, `user-${index + 1}`, clientUrl)
      await user.open()
      users.push(user)
    }
  } catch (error) {
    await Promise.all(Array.from(openContexts).map(async (context) => closeContext(openContexts, context)))
    throw error
  }

  return {
    sessionId,
    users,
    close: async () => {
      await Promise.all(users.map(async (user) => closeContext(openContexts, user.context)))
      await resetSharedCanvasState(request)
    },
  }
}

export const test = base.extend<{ createMultiUserSession: CreateMultiUserSession }>({
  createMultiUserSession: async ({ browser, request, baseURL }, use) => {
    const openContexts = new Set<BrowserContext>()
    const clientUrl = baseURL ?? DEFAULT_CLIENT_URL
    const createMultiUserSession = createSessionFactory(browser, request, clientUrl, openContexts)

    await use(createMultiUserSession)

    await Promise.all(Array.from(openContexts).map(async (context) => closeContext(openContexts, context)))
    await resetSharedCanvasState(request)
  },
})

export { expect }