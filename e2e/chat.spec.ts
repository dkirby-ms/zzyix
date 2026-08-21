import { expect, test } from '@playwright/test'
import { resetSharedCanvasState } from './support/testState'

test.beforeEach(async ({ request }) => {
  await resetSharedCanvasState(request, { createCanonicalWorld: true })
})

const signInAs = async (page: Parameters<typeof test>[0] extends never ? never : import('@playwright/test').Page, subject: string): Promise<void> => {
  await page.addInitScript((userSubject) => {
    localStorage.setItem('zzyix:e2e-subject', userSubject)
    localStorage.setItem('zzyix:e2e-authenticated', 'true')
  }, subject)
  await page.goto('/')
  await expect(page.locator('.status-indicator.status-connected').first()).toBeVisible({ timeout: 15_000 })
}

test('opens chat, shows the empty state, sends a message, and rejects invalid bodies', async ({ page }) => {
  await signInAs(page, `e2e-chat-smoke-${crypto.randomUUID()}`)

  await expect(page.getByRole('heading', { name: 'Chat' })).toBeVisible()
  await expect(page.getByText('No messages yet. Start the conversation.')).toBeVisible()

  const composer = page.getByLabel('Message')
  await composer.fill('hello from the browser')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('hello from the browser')).toBeVisible()

  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Enter a message before sending.')).toBeVisible()
  await composer.fill('x'.repeat(2001))
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Messages must be 2000 characters or fewer.')).toBeVisible()
})

test('keeps an unsent draft through a disconnect and sends after reconnect', async ({ page, context }) => {
  await signInAs(page, `e2e-chat-reconnect-${crypto.randomUUID()}`)
  const composer = page.getByLabel('Message')
  await composer.fill('draft survives reconnect')

  await context.setOffline(true)
  await expect(page.getByText('Disconnected')).toBeVisible({ timeout: 10_000 })
  await expect(composer).toHaveValue('draft survives reconnect')

  await context.setOffline(false)
  await expect(page.getByText('Live')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('draft survives reconnect')).toBeVisible()
})