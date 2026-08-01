import { decodeJwt } from 'jose'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { io } from 'socket.io-client'
import { resetSharedCanvasState } from './support/testState'

const SERVER_URL = 'http://127.0.0.1:3101'
const TOKEN_URL = 'http://127.0.0.1:3199/token'
const TEST_RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'

test.beforeEach(async ({ request }) => {
  await resetSharedCanvasState(request, { createCanonicalWorld: true })
})

const requestAccessToken = async (request: APIRequestContext, subject: string): Promise<string> => {
  const response = await request.post(TOKEN_URL, { data: { subject } })
  expect(response.ok()).toBeTruthy()
  return (await response.json() as { access_token: string }).access_token
}

const apiPost = async (
  request: APIRequestContext,
  path: string,
  token: string,
  data: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await request.post(`${SERVER_URL}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    data,
  })
  return {
    status: response.status(),
    body: await response.json() as Record<string, unknown>,
  }
}

const apiGet = async (
  request: APIRequestContext,
  path: string,
  token: string,
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await request.get(`${SERVER_URL}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
  return {
    status: response.status(),
    body: await response.json() as Record<string, unknown>,
  }
}

test('assigns a stable patch on first sign-in and places without claim controls', async ({ page }) => {
  await page.addInitScript((subject) => {
    localStorage.removeItem('zzyix:e2e-authenticated')
    localStorage.setItem('zzyix:e2e-subject', subject)
  }, `e2e-product-workflow-${crypto.randomUUID()}`)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  const assignedPatch = page.getByText(/^Patch \d+, \d+$/)
  await expect(assignedPatch).toBeVisible()
  const assignedPatchLabel = await assignedPatch.textContent()
  await expect(page.getByRole('button', { name: /^Claim / })).toHaveCount(0)
  const canvas = page.locator('canvas')
  await canvas.hover()
  await canvas.click()
  await expect.poll(
    async () => page.evaluate(() => window.__ZZYIX_E2E_CANVAS__?.getState()?.tiles?.length ?? 0),
    { timeout: 15_000 },
  ).toBeGreaterThanOrEqual(1)

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mosaic Atelier' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(assignedPatchLabel!)).toBeVisible()
})

test('renews after signed token expiry and keeps protected state available', async ({ page }) => {
  let tokenRequests = 0
  const tokenGenerations = new Set<string>()
  let latestTokenExpiry = 0
  await page.route('http://127.0.0.1:3199/token', async (route) => {
    tokenRequests += 1
    const response = await route.fetch()
    const tokenResponse = await response.json() as { access_token: string }
    const claims = decodeJwt(tokenResponse.access_token)
    if (typeof claims.jti === 'string') tokenGenerations.add(claims.jti)
    if (typeof claims.exp === 'number') latestTokenExpiry = Math.max(latestTokenExpiry, claims.exp)
    await route.fulfill({ response, json: tokenResponse })
  })

  await page.addInitScript((subject) => {
    localStorage.setItem('zzyix:e2e-subject', subject)
    localStorage.setItem('zzyix:e2e-token-lifetime-seconds', '4')
  }, `e2e-renewal-${crypto.randomUUID()}`)
  await page.goto('/')
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => tokenRequests, {
    message: 'startup token acquisition should settle before measuring renewal',
  }).toBe(tokenGenerations.size)
  const beforeExpiry = tokenRequests
  const generationsBeforeExpiry = tokenGenerations.size
  const startupTokenExpiry = latestTokenExpiry

  await expect.poll(() => Date.now(), {
    message: 'all startup access token generations should reach expiry',
    timeout: 10_000,
  }).toBeGreaterThanOrEqual(startupTokenExpiry * 1_000)
  await expect.poll(() => tokenGenerations.size, {
    message: 'expiry should acquire at least one newly signed access token generation',
    timeout: 10_000,
  }).toBeGreaterThan(generationsBeforeExpiry)

  expect(tokenRequests - beforeExpiry).toBeGreaterThanOrEqual(1)
  expect(tokenRequests - beforeExpiry).toBeLessThanOrEqual(2)
  await expect(page.getByRole('complementary', { name: 'Tile palette controls' })).toBeVisible()
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
})

test('clears protected browser state when forced token renewal fails', async ({ page }) => {
  let rejectRenewal = false
  await page.route(TOKEN_URL, async (route) => {
    if (rejectRenewal) {
      await route.fulfill({ status: 503, json: { error: 'renewal unavailable' } })
      return
    }
    await route.continue()
  })

  await page.addInitScript((subject) => {
    localStorage.setItem('zzyix:e2e-subject', subject)
    localStorage.setItem('zzyix:e2e-token-lifetime-seconds', '2')
  }, `e2e-failed-renewal-${crypto.randomUUID()}`)
  await page.goto('/')
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  rejectRenewal = true

  await expect(page.getByText('Your secure session ended. Sign in again to continue.')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('complementary', { name: 'Tile palette controls' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('executes claim, transfer, and abandonment through authenticated browser HTTP routes', async ({ request }) => {
  const ownerSubject = `e2e-lifecycle-owner-${crypto.randomUUID()}`
  const recipientSubject = `e2e-lifecycle-recipient-${crypto.randomUUID()}`
  const setup = await request.post(`${SERVER_URL}/test/quilt/setup`, {
    headers: { 'x-zzyix-test-token': TEST_RESET_TOKEN },
    data: { externalSubject: ownerSubject, claimEnabled: true },
  })
  expect(setup.ok()).toBeTruthy()
  const { patchId, principalId: ownerPrincipalId } = await setup.json() as { patchId: string; principalId: string }
  const ownerToken = await requestAccessToken(request, ownerSubject)
  const recipientToken = await requestAccessToken(request, recipientSubject)

  const eligibleResponse = await apiGet(request, '/quilts/canonical/patches/eligible', recipientToken)
  expect(eligibleResponse.status).toBe(200)
  const eligible = eligibleResponse.body as { claimAllowed: boolean; patches: Array<{ patchId: string }> }
  expect(eligible.claimAllowed).toBe(true)
  expect(eligible.patches.length).toBeGreaterThan(0)
  const [claimCandidate] = eligible.patches
  expect(claimCandidate).toBeDefined()

  const claimed = await apiPost(request, '/ownership/claims', recipientToken, {
    operationId: crypto.randomUUID(), patchId: claimCandidate!.patchId,
  })
  expect(claimed).toMatchObject({ status: 200, body: { status: 'succeeded' } })

  const offered = await apiPost(request, '/ownership/transfers', recipientToken, {
    operationId: crypto.randomUUID(), patchId: claimCandidate!.patchId, recipientPrincipalId: ownerPrincipalId,
  })
  expect(offered.status).toBe(200)
  expect(offered.body.transferId).toEqual(expect.any(String))

  // Owner must release their existing canonical patch before accepting a transfer.
  const releasedOwnerPatch = await apiPost(request, '/ownership/abandon', ownerToken, {
    operationId: crypto.randomUUID(), patchId,
  })
  expect(releasedOwnerPatch).toMatchObject({ status: 200, body: { status: 'succeeded' } })

  const accepted = await apiPost(request, '/ownership/transfers/accept', ownerToken, {
    operationId: crypto.randomUUID(), transferId: offered.body.transferId as string,
  })
  expect(accepted).toMatchObject({ status: 200, body: { status: 'succeeded' } })

  const abandoned = await apiPost(request, '/ownership/abandon', ownerToken, {
    operationId: crypto.randomUUID(), patchId: claimCandidate!.patchId,
  })
  expect(abandoned).toMatchObject({ status: 200, body: { status: 'succeeded' } })
})

for (const transport of ['polling', 'websocket'] as const) {
  test(`rejects a non-exact live Socket.IO origin over ${transport}`, async () => {
    const socket = io(SERVER_URL, {
      autoConnect: false,
      reconnection: false,
      transports: [transport],
      extraHeaders: { origin: 'http://127.0.0.1:4173.evil.example' },
    })

    try {
      const outcome = await new Promise<'connected' | 'rejected'>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${transport} origin rejection timed out`)), 5_000)
        socket.once('connect', () => {
          clearTimeout(timeout)
          resolve('connected')
        })
        socket.once('connect_error', () => {
          clearTimeout(timeout)
          resolve('rejected')
        })
        socket.connect()
      })
      expect(outcome).toBe('rejected')
    } finally {
      socket.disconnect()
    }
  })
}

test('keeps protected content hidden when no authenticated session exists', async ({ context, page }) => {
  await context.clearCookies()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Canonical patch navigation' })).toHaveCount(0)
})