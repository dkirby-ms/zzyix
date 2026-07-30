import { expect, type APIRequestContext } from '@playwright/test'

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://127.0.0.1:3101'
const TEST_RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'

export type ResetSharedCanvasOptions = {
  createCanonicalWorld?: boolean
  ownerExternalSubject?: string
}

export type ResetSharedCanvasResult = {
  reset: true
  canonical?: {
    quiltId: string
    patchId: string
    generation: number
  }
}

export const resetSharedCanvasState = async (
  request: APIRequestContext,
  options: ResetSharedCanvasOptions = {},
): Promise<ResetSharedCanvasResult> => {
  const response = await request.post(`${SERVER_URL}/test/reset`, {
    headers: {
      'x-zzyix-test-token': TEST_RESET_TOKEN,
      'content-type': 'application/json',
    },
    data: {
      createCanonicalWorld: options.createCanonicalWorld ?? false,
      ownerExternalSubject: options.ownerExternalSubject,
    },
  })

  expect(response.ok(), 'test reset endpoint should return 200').toBeTruthy()

  return (await response.json()) as ResetSharedCanvasResult
}

export const createIsolatedCanonicalQuilt = async (
  request: APIRequestContext,
  options: ResetSharedCanvasOptions = {},
): Promise<{ quiltId: string }> => {
  const result = await resetSharedCanvasState(request, {
    createCanonicalWorld: true,
    ownerExternalSubject: options.ownerExternalSubject,
  })

  expect(result.canonical, 'test reset should seed a canonical quilt').toBeTruthy()

  return { quiltId: result.canonical!.quiltId }
}
