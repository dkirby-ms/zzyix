import { decodeJwt } from 'jose'
import { expect, test } from '@playwright/test'

test('supports authenticated bootstrap, logout, and a fresh login', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()

  await page.getByRole('button', { name: 'Create Canvas' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Mosaic Atelier' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()
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

  await page.addInitScript(() => localStorage.setItem('zzyix:e2e-token-lifetime-seconds', '2'))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()
  await page.getByRole('button', { name: 'Create Canvas' }).click()
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })
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
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })
})

test('keeps protected content hidden when no authenticated session exists', async ({ context, page }) => {
  await context.clearCookies()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toHaveCount(0)
})