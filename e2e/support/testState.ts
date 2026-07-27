import { expect, type APIRequestContext } from '@playwright/test'

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://127.0.0.1:3101'
const TEST_RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'

export const resetSharedCanvasState = async (request: APIRequestContext): Promise<void> => {
  const response = await request.post(`${SERVER_URL}/test/reset`, {
    headers: {
      'x-zzyix-test-token': TEST_RESET_TOKEN,
      'content-type': 'application/json',
    },
    data: {
      createSession: false,
    },
  })

  expect(response.ok(), 'test reset endpoint should return 200').toBeTruthy()
}
