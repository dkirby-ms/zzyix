import { expect, test } from '@playwright/test'
import { resetSharedCanvasState } from './support/testState'

test.beforeEach(async ({ request }) => {
  await resetSharedCanvasState(request)
})

test('loads the client and connects to the isolated test server', async ({ page }) => {
  await page.addInitScript((subject) => localStorage.setItem('zzyix:e2e-subject', subject), `e2e-smoke-${crypto.randomUUID()}`)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()

  await page.getByRole('button', { name: 'Create Canvas' }).click()
  await page.getByRole('button', { name: 'Claim Patch' }).click()

  await expect(page.getByText('Mosaic Atelier')).toBeVisible()
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })
})
