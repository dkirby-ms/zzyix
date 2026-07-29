import { describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { buildMeResponse, createHttpAuth, getPrincipalContext, sendResourceNotFound } from './httpAuth.js'

const createResponse = () => {
  const response = {
    setHeader: vi.fn(),
    getHeader: vi.fn().mockReturnValue('request-1'),
    status: vi.fn(),
    json: vi.fn(),
  }
  response.status.mockReturnValue(response)
  return response as unknown as Response
}

describe('HTTP authentication boundary', () => {
  it('rejects missing credentials before token verification or principal resolution', async () => {
    const verifyToken = vi.fn()
    const resolvePrincipal = vi.fn()
    const middleware = createHttpAuth(verifyToken, resolvePrincipal)
    const request = {
      id: 'request-1',
      header: vi.fn().mockReturnValue(undefined),
    } as unknown as Request
    const response = createResponse()
    const next = vi.fn() as NextFunction

    await middleware(request, response, next)

    expect(verifyToken).not.toHaveBeenCalled()
    expect(resolvePrincipal).not.toHaveBeenCalled()
    expect(response.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer')
    expect(response.status).toHaveBeenCalledWith(401)
    expect(response.json).toHaveBeenCalledWith({
      code: 'authentication_required',
      message: 'Authentication is required.',
      requestId: 'request-1',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches an immutable server-derived principal after verification and resolution', async () => {
    const identity = {
      issuer: 'https://issuer.example/',
      subject: 'external-subject',
      expiresAt: new Date('2026-07-28T12:00:00.000Z'),
      scope: ['access'],
    }
    const principal = {
      principalId: '11111111-1111-4111-8111-111111111111',
      status: 'active' as const,
      tokenExpiresAt: identity.expiresAt,
    }
    const verifyToken = vi.fn().mockResolvedValue(identity)
    const resolvePrincipal = vi.fn().mockResolvedValue(principal)
    const middleware = createHttpAuth(verifyToken, resolvePrincipal)
    const request = {
      id: 'request-2',
      header: vi.fn().mockReturnValue('Bearer access-token'),
    } as unknown as Request
    const response = createResponse()
    const next = vi.fn() as NextFunction

    await middleware(request, response, next)

    expect(verifyToken).toHaveBeenCalledWith('access-token')
    expect(resolvePrincipal).toHaveBeenCalledWith(identity)
    expect(getPrincipalContext(request)).toEqual(principal)
    expect(Object.isFrozen(getPrincipalContext(request))).toBe(true)
    expect(next).toHaveBeenCalledOnce()
  })

  it('projects /me without external or internal authority identifiers', () => {
    const response = buildMeResponse({ displayName: 'Ada', email: 'ada@example.test' })

    expect(response).toEqual({
      profile: { displayName: 'Ada', email: 'ada@example.test' },
      capabilities: {
        createSession: true,
        claimPatch: false,
        transferPatch: false,
        deleteAccount: false,
        mutateProtocolV2: false,
      },
    })
    expect(response).not.toHaveProperty('principalId')
    expect(response).not.toHaveProperty('subject')
    expect(response).not.toHaveProperty('issuer')
  })

  it('uses the same response for hidden and unknown resources', () => {
    const hiddenResponse = createResponse()
    const unknownResponse = createResponse()

    sendResourceNotFound(hiddenResponse, 'request-hidden')
    sendResourceNotFound(unknownResponse, 'request-unknown')

    expect(hiddenResponse.status).toHaveBeenCalledWith(404)
    expect(unknownResponse.status).toHaveBeenCalledWith(404)
    const hiddenBody = vi.mocked(hiddenResponse.json).mock.calls[0]?.[0]
    const unknownBody = vi.mocked(unknownResponse.json).mock.calls[0]?.[0]
    expect({ ...hiddenBody, requestId: 'redacted' }).toEqual({ ...unknownBody, requestId: 'redacted' })
  })
})