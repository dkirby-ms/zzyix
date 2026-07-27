import { expect, type APIRequestContext } from '@playwright/test'

const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://127.0.0.1:3101'
const TEST_RESET_TOKEN = process.env.E2E_RESET_TOKEN ?? 'zzyix-e2e-token'

type CanvasSizePreset = 'classic' | 'expanded' | 'vast'

export type ResetSharedCanvasOptions = {
  createSession?: boolean
  canvasPreset?: CanvasSizePreset
}

export type ResetSharedCanvasResult = {
  reset: true
  session?: {
    id: string
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
      createSession: options.createSession ?? false,
      canvasPreset: options.canvasPreset,
    },
  })

  expect(response.ok(), 'test reset endpoint should return 200').toBeTruthy()

  return (await response.json()) as ResetSharedCanvasResult
}

export const createIsolatedSharedCanvas = async (
  request: APIRequestContext,
  options: Omit<ResetSharedCanvasOptions, 'createSession'> = {},
): Promise<{ sessionId: string }> => {
  const result = await resetSharedCanvasState(request, {
    createSession: true,
    canvasPreset: options.canvasPreset,
  })

  const sessionId = result.session?.id
  expect(sessionId, 'test reset should seed a shared canvas session').toBeTruthy()

  return { sessionId: sessionId as string }
}
