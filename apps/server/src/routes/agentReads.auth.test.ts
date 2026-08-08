import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHttpAuth } from '../auth/httpAuth.js'
import { AuthenticationError } from '../auth/errors.js'
import type { VerifiedExternalIdentity } from '../auth/tokenVerifier.js'
import { createAgentReadRouter } from './agentReads.js'

const PRINCIPAL_ID = '11111111-1111-4111-8111-111111111111'
const QUILT_ID = '40000000-0000-4000-8000-000000000001'
const PATCH_ID = '50000000-0000-4000-8000-000000000001'

const loadQuiltContext = vi.fn()
const loadPatchSnapshot = vi.fn()
const loadPatchOperationsAfter = vi.fn()
const isAgentAssignedPatch = vi.fn().mockResolvedValue(true)
const isAgentAssignedQuilt = vi.fn().mockResolvedValue(true)

const verifyToken = vi.fn(async (token: string): Promise<VerifiedExternalIdentity> => {
  const expiresAt = new Date(Date.now() + 60_000)
  if (token === 'app-token') {
    return {
      kind: 'app_agent',
      issuer: 'https://issuer.example/',
      subject: 'app:44444444-4444-4444-8444-444444444444',
      applicationId: '44444444-4444-4444-8444-444444444444',
      expiresAt,
      scope: [],
      roles: ['agent.runtime'],
    }
  }

  if (token === 'delegated-token') {
    return {
      kind: 'delegated_user',
      issuer: 'https://issuer.example/',
      subject: 'subject-a',
      expiresAt,
      scope: ['quilt.access'],
      roles: [],
    }
  }

  throw new AuthenticationError('invalid_token')
})

const resolvePrincipal = vi.fn(async (identity: VerifiedExternalIdentity) => {
  if (identity.kind !== 'app_agent') {
    throw new AuthenticationError('insufficient_scope')
  }
  return { principalId: PRINCIPAL_ID, status: 'active' as const, tokenExpiresAt: identity.expiresAt }
})

const app = express()
app.use((_req, res, next) => {
  res.setHeader('x-request-id', 'agent-read-auth-test-request')
  next()
})
app.use('/internal/v1/agent', createHttpAuth(verifyToken, resolvePrincipal), createAgentReadRouter({
  loadQuiltContext,
  loadPatchSnapshot,
  loadPatchOperationsAfter,
  isAgentAssignedPatch,
  isAgentAssignedQuilt,
}))

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
  loadQuiltContext.mockResolvedValue({
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
    patches: [{ patchId: PATCH_ID, row: 0, column: 0, state: 'active', ownerPrincipalId: PRINCIPAL_ID }],
  })
})

describe('agent read route auth boundary', () => {
  it('rejects delegated tokens for internal worker routes', async () => {
    const response = await fetch(`${baseUrl}/internal/v1/agent/quilts/${QUILT_ID}/context`, {
      headers: { authorization: 'Bearer delegated-token' },
    })

    expect(response.status).toBe(403)
    expect(loadQuiltContext).not.toHaveBeenCalled()
  })

  it('accepts app-role tokens for internal worker routes', async () => {
    const response = await fetch(`${baseUrl}/internal/v1/agent/quilts/${QUILT_ID}/context`, {
      headers: { authorization: 'Bearer app-token' },
    })

    expect(response.status).toBe(200)
    expect(loadQuiltContext).toHaveBeenCalledWith({ quiltId: QUILT_ID, principalId: PRINCIPAL_ID })
  })
})
