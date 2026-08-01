import { expect, test } from '@playwright/test'
import { resetSharedCanvasState } from './support/testState'

test.beforeEach(async ({ request }) => {
  await resetSharedCanvasState(request, { createCanonicalWorld: true })
})

test('loads the client and connects to the isolated test server', async ({ page }) => {
  await page.addInitScript((subject) => localStorage.setItem('zzyix:e2e-subject', subject), `e2e-smoke-${crypto.randomUUID()}`)
  await page.goto('/')

  await expect(page.getByText('Mosaic Atelier')).toBeVisible()
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('region', { name: 'Canonical patch navigation' })).toBeVisible()
})
