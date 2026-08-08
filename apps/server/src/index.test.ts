import { createServer } from 'node:http'
import express from 'express'
import { describe, expect, it } from 'vitest'
import {
  buildClientUpgradeRequiredSocketError,
  isOriginAllowed,
  isSupportedCanonicalConnectionAuth,
  registerAgentReadRoutes,
  resolveCorsOrigin,
} from './index.js'

describe('authoritative handler semantics', () => {
  it('registers the worker read router before the first canonical discovery request', async () => {
    const targetApp = express()
    registerAgentReadRoutes(targetApp, true)
    const server = createServer(targetApp)

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to bind worker route test server')

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/v1/agent/quilts/40000000-0000-4000-8000-000000000001/context`)
      expect(response.status).toBe(401)
      expect((await response.json()).code).toBe('authentication_required')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('rejects unsupported socket versions with the exact safe upgrade payload', () => {
    const supported = {
      token: 'token',
      quiltId: '10000000-0000-4000-8000-000000000001',
      clientId: 'client-1',
      schemaVersion: '2.0.0' as const,
      protocolVersion: 2 as const,
      canonicalGeneration: 2,
      entryAttemptId: '20000000-0000-4000-8000-000000000001',
    }
    expect(isSupportedCanonicalConnectionAuth(supported)).toBe(true)
    expect(isSupportedCanonicalConnectionAuth({ ...supported, schemaVersion: '1.0.0' as never })).toBe(false)
    expect(isSupportedCanonicalConnectionAuth({ ...supported, quiltId: '' })).toBe(false)
    expect(buildClientUpgradeRequiredSocketError().data).toEqual({
      code: 'client_upgrade_required',
      message: 'This client version is no longer supported.',
      minimumSchemaVersion: '2.0.0',
      minimumProtocolVersion: 2,
    })
  })

  it('uses safe CORS defaults when wildcard is missing or configured', () => {
    expect(resolveCorsOrigin(undefined)).toBe('http://localhost:5173')
    expect(resolveCorsOrigin('*')).toBe('http://localhost:5173')
    expect(resolveCorsOrigin('https://a.example.com')).toBe('https://a.example.com')
    expect(resolveCorsOrigin('https://a.example.com, https://b.example.com')).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ])
    expect(resolveCorsOrigin('*, https://b.example.com')).toBe('https://b.example.com')
  })

  it('parses multiple configured CORS origins for request-origin matching', () => {
    const allowed = resolveCorsOrigin('https://a.example.com, https://b.example.com')

    expect(Array.isArray(allowed)).toBe(true)
    expect(allowed).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('matches request origin only when present in allow-list', () => {
    const allowList = resolveCorsOrigin('https://a.example.com, https://b.example.com')

    expect(isOriginAllowed('https://a.example.com', allowList)).toBe(true)
    expect(isOriginAllowed('https://b.example.com', allowList)).toBe(true)
    expect(isOriginAllowed('https://c.example.com', allowList)).toBe(false)
  })

  it('does not match partial origin strings', () => {
    expect(isOriginAllowed('https://good.example.com.evil.net', 'https://good.example.com')).toBe(false)
    expect(isOriginAllowed('https://good.example.com', 'https://good.example.com')).toBe(true)
  })

})
