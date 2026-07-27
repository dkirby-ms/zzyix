import { expect, test } from '@playwright/test'
import { resetSharedCanvasState } from './support/testState'

test.beforeEach(async ({ request }) => {
  await resetSharedCanvasState(request)
})

test('loads the client and connects to the isolated test server', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Choose a Canvas' })).toBeVisible()

  await page.getByRole('button', { name: 'Create Canvas' }).click()

  await expect(page.getByText('Mosaic Atelier')).toBeVisible()
  await expect(page.locator('.connection-badge[data-state="connected"]')).toBeVisible({ timeout: 15_000 })
})
