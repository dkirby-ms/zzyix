import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgentReadRouter } from './agentReads.js'
import { ResourceNotFoundError } from '../db/repository.js'

const PRINCIPAL_ID = '11111111-1111-4111-8111-111111111111'
const QUILT_ID = '40000000-0000-4000-8000-000000000001'
const PATCH_ID = '50000000-0000-4000-8000-000000000001'

const loadQuiltContext = vi.fn()
const loadPatchSnapshot = vi.fn()
const loadPatchOperationsAfter = vi.fn()
const isAgentAssignedPatch = vi.fn().mockResolvedValue(true)
const isAgentAssignedQuilt = vi.fn().mockResolvedValue(true)

const app = express()
app.use((_req, res, next) => {
  res.setHeader('x-request-id', 'agent-read-test-request')
  next()
})
app.use((request, _response, next) => {
  Object.defineProperty(request, 'principal', {
    configurable: true,
    enumerable: false,
    value: Object.freeze({ principalId: PRINCIPAL_ID, status: 'active', tokenExpiresAt: new Date() }),
    writable: false,
  })
  next()
})
app.use('/internal/v1/agent', createAgentReadRouter({
  loadQuiltContext,
  loadPatchSnapshot,
  loadPatchOperationsAfter,
  isAgentAssignedPatch,
  isAgentAssignedQuilt,
}))
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(500).json({
    code: 'internal_error',
    message: String(error),
    requestId: 'agent-read-test-request',
  })
})

let baseUrl = ''
const server = createServer(app)

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
})

beforeEach(() => {
  vi.clearAllMocks()
  isAgentAssignedPatch.mockResolvedValue(true)
  isAgentAssignedQuilt.mockResolvedValue(true)
})

describe('agent read routes', () => {
  it('rejects invalid quilt identifiers', async () => {
    const response = await fetch(`${baseUrl}/internal/v1/agent/quilts/not-a-uuid/context`)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'invalid_request',
      requestId: 'agent-read-test-request',
    })
    expect(loadQuiltContext).not.toHaveBeenCalled()
  })

  it('returns 404 when quilt delivery context is unavailable', async () => {
    loadQuiltContext.mockResolvedValueOnce(null)

    const response = await fetch(`${baseUrl}/internal/v1/agent/quilts/${QUILT_ID}/context`)

    expect(response.status).toBe(404)
    expect(loadQuiltContext).toHaveBeenCalledWith({ quiltId: QUILT_ID, principalId: PRINCIPAL_ID })
  })

  it('returns a principal-scoped quilt delivery context', async () => {
    loadQuiltContext.mockResolvedValueOnce({
      topology: {
        quiltId: QUILT_ID,
        protocolVersion: 2,
        topology: 'bounded',
        patchRows: 1,
        patchColumns: 1,
        patchWidth: 10,
        patchHeight: 10,
      },
      principalId: PRINCIPAL_ID,
      patches: [],
    })

    const response = await fetch(`${baseUrl}/internal/v1/agent/quilts/${QUILT_ID}/context`)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      principalId: PRINCIPAL_ID,
      topology: { quiltId: QUILT_ID },
    })
  })

  it('rejects invalid snapshot surface values', async () => {
    const response = await fetch(`${baseUrl}/internal/v1/agent/patches/${PATCH_ID}/snapshot?surface=raw`)

    expect(response.status).toBe(400)
    expect(loadPatchSnapshot).not.toHaveBeenCalled()
  })

  it('maps unauthorized or missing snapshots to the stable 404 response', async () => {
    loadPatchSnapshot.mockRejectedValueOnce(new ResourceNotFoundError())

    const response = await fetch(`${baseUrl}/internal/v1/agent/patches/${PATCH_ID}/snapshot`)

    expect(response.status).toBe(404)
  })

  it('enforces replay limits and returns bounded event replay payloads', async () => {
    loadPatchOperationsAfter.mockResolvedValueOnce([
      { eventId: '1', opSeq: 1, opType: 'tile_placed', payload: {}, createdAt: 1, chunkIds: [] },
      { eventId: '2', opSeq: 2, opType: 'tile_removed', payload: {}, createdAt: 2, chunkIds: [] },
    ])

    const response = await fetch(`${baseUrl}/internal/v1/agent/patches/${PATCH_ID}/events?afterOpSeq=0&limit=1`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      operations: [
        { eventId: '1', opSeq: 1, opType: 'tile_placed', payload: {}, createdAt: 1, chunkIds: [] },
      ],
    })
    expect(loadPatchOperationsAfter).toHaveBeenCalledWith(PATCH_ID, 0, PRINCIPAL_ID, 1)
  })

  it('hides patches outside the active agent assignment', async () => {
    isAgentAssignedPatch.mockResolvedValueOnce(false)

    const response = await fetch(`${baseUrl}/internal/v1/agent/patches/${PATCH_ID}/events?afterOpSeq=0`)

    expect(response.status).toBe(404)
    expect(loadPatchOperationsAfter).not.toHaveBeenCalled()
  })

  it('rejects replay requests with out-of-range limits', async () => {
    const response = await fetch(`${baseUrl}/internal/v1/agent/patches/${PATCH_ID}/events?afterOpSeq=0&limit=501`)

    expect(response.status).toBe(400)
    expect(loadPatchOperationsAfter).not.toHaveBeenCalled()
  })
})
