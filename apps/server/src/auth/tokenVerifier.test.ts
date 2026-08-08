import { createServer, type Server } from 'node:http'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWK,
  type JWTHeaderParameters,
  type JWTPayload,
} from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AuthenticationConfig } from './config.js'
import { AuthenticationError } from './errors.js'
import { createAppTokenVerifier, createTokenVerifier } from './tokenVerifier.js'

const issuer = 'https://issuer.example.test/tenant/v2.0'
const audience = 'api://zzyix'
const requiredScope = 'quilt.access'

type SigningKey = {
  kid: string
  algorithm: 'RS256' | 'RS512'
  privateKey: CryptoKey
  publicJwk: JWK
}

const generateSigningKey = async (kid: string, algorithm: SigningKey['algorithm'] = 'RS256'): Promise<SigningKey> => {
  const { privateKey, publicKey } = await generateKeyPair(algorithm)
  return {
    kid,
    algorithm,
    privateKey,
    publicJwk: { ...await exportJWK(publicKey), kid, alg: algorithm, use: 'sig' },
  }
}

const signToken = async (
  key: SigningKey,
  payload: JWTPayload = {},
  header: JWTHeaderParameters = {},
): Promise<string> => {
  const defaultExpiry = Math.floor(Date.now() / 1_000) + 5 * 60
  return new SignJWT({
  scp: requiredScope,
  name: 'Canvas User',
  email: 'canvas@example.test',
  iss: issuer,
  sub: 'external-subject-1',
  aud: audience,
  iat: Math.floor(Date.now() / 1_000),
  nbf: Math.floor(Date.now() / 1_000),
  exp: defaultExpiry,
  ...payload,
})
  .setProtectedHeader({ alg: key.algorithm, kid: key.kid, ...header })
  .sign(key.privateKey)
}

const configFor = (jwksUri = new URL('https://issuer.example.test/keys')): AuthenticationConfig => ({
  trustedIssuer: issuer,
  audience,
  requiredScope,
  appTrustedIssuer: issuer,
  appAudience: audience,
  appJwksUri: jwksUri,
  requiredAppRole: 'agent.runtime',
  acceptedAlgorithm: 'RS256',
  jwksUri,
  jwksTimeoutMs: 200,
  jwksCacheMaxAgeMs: 60_000,
  jwksCooldownMs: 0,
  testIssuer: false,
})

describe('access token verification', () => {
  let trustedKey: SigningKey
  let otherKey: SigningKey

  beforeAll(async () => {
    trustedKey = await generateSigningKey('trusted-key')
    otherKey = await generateSigningKey('other-key')
  })

  const verifierFor = (keys: SigningKey[]) => createTokenVerifier(
    configFor(),
    createLocalJWKSet({ keys: keys.map((key) => key.publicJwk) }),
  )

  it('returns only canonical identity and provisioning metadata', async () => {
    const identity = await verifierFor([trustedKey])(await signToken(trustedKey, { unrelated: 'discarded' }))

    expect(identity).toMatchObject({
      kind: 'delegated_user',
      issuer,
      subject: 'external-subject-1',
      scope: [requiredScope],
      roles: [],
      displayName: 'Canvas User',
      email: 'canvas@example.test',
    })
    expect(identity.expiresAt).toBeInstanceOf(Date)
    expect(identity).not.toHaveProperty('unrelated')
  })

  it.each([
    ['issuer', { iss: 'https://wrong.example.test/' }],
    ['audience', { aud: 'api://wrong' }],
    ['scope', { scp: 'other.scope' }],
    ['expiration', { exp: Math.floor(Date.now() / 1_000) - 1 }],
    ['not-before', { nbf: Math.floor(Date.now() / 1_000) + 60 }],
  ])('rejects a token with wrong %s', async (_label, payload) => {
    const token = await signToken(trustedKey, payload)
    await expect(verifierFor([trustedKey])(token)).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('maps missing scope to a stable forbidden error', async () => {
    const token = await signToken(trustedKey, { scp: undefined })

    await expect(verifierFor([trustedKey])(token)).rejects.toMatchObject({
      code: 'insufficient_scope',
      status: 403,
    })
  })

  it('verifies app-only tokens by role and app identity instead of delegated scopes', async () => {
    const token = await signToken(trustedKey, {
      scp: undefined,
      scope: undefined,
      roles: ['agent.runtime', 'extra.role'],
      azp: '00000000-0000-0000-0000-000000000999',
    })

    await expect(createAppTokenVerifier(configFor(), createLocalJWKSet({ keys: [trustedKey.publicJwk] }))(token))
      .resolves
      .toMatchObject({
        kind: 'app_agent',
        issuer,
        subject: 'app:00000000-0000-0000-0000-000000000999',
        applicationId: '00000000-0000-0000-0000-000000000999',
        roles: ['agent.runtime', 'extra.role'],
        scope: [],
      })
  })

  it('rejects app-only tokens that do not include the required role even when delegated scope is present', async () => {
    const token = await signToken(trustedKey, {
      roles: ['other.role'],
      scp: requiredScope,
      azp: '00000000-0000-0000-0000-000000000998',
    })

    await expect(createAppTokenVerifier(configFor(), createLocalJWKSet({ keys: [trustedKey.publicJwk] }))(token))
      .rejects
      .toMatchObject({ code: 'insufficient_scope', status: 403 })
  })

  it.each([
    ['issuer', { iss: 'https://wrong.example.test/' }],
    ['audience', { aud: 'api://wrong' }],
    ['expiration', { exp: Math.floor(Date.now() / 1_000) - 1 }],
  ])('rejects app-only tokens with wrong %s', async (_label, payload) => {
    const token = await signToken(trustedKey, {
      roles: ['agent.runtime'],
      azp: '00000000-0000-0000-0000-000000000997',
      ...payload,
    })

    await expect(createAppTokenVerifier(configFor(), createLocalJWKSet({ keys: [trustedKey.publicJwk] }))(token))
      .rejects
      .toMatchObject({ code: 'invalid_token' })
  })

  it('rejects app-only tokens signed with an unaccepted algorithm', async () => {
    const rs512Key = await generateSigningKey('rs512-agent-key', 'RS512')
    const token = await signToken(rs512Key, {
      roles: ['agent.runtime'],
      azp: '00000000-0000-0000-0000-000000000996',
      scope: undefined,
      scp: undefined,
    })

    await expect(createAppTokenVerifier(configFor(), createLocalJWKSet({ keys: [rs512Key.publicJwk] }))(token))
      .rejects
      .toMatchObject({ code: 'invalid_token' })
  })

  it('rejects wrong algorithms, signatures, unknown keys, and malformed tokens', async () => {
    const rs512Key = await generateSigningKey('rs512-key', 'RS512')
    await expect(verifierFor([trustedKey])(await signToken(rs512Key))).rejects.toMatchObject({ code: 'invalid_token' })
    await expect(verifierFor([trustedKey])(await signToken(otherKey, {}, { kid: trustedKey.kid }))).rejects.toMatchObject({
      code: 'invalid_token',
    })
    await expect(verifierFor([trustedKey])(await signToken(otherKey))).rejects.toMatchObject({ code: 'invalid_token' })
    await expect(verifierFor([trustedKey])('not-a-jwt')).rejects.toMatchObject({ code: 'invalid_token' })
  })
})

describe('remote JWKS rotation and outage behavior', () => {
  let server: Server
  let url: URL
  let firstKey: SigningKey
  let rotatedKey: SigningKey
  let keys: JWK[]
  let available = true

  beforeAll(async () => {
    firstKey = await generateSigningKey('first-key')
    rotatedKey = await generateSigningKey('rotated-key')
    keys = [firstKey.publicJwk]
    server = createServer((_request, response) => {
      if (!available) {
        response.writeHead(503).end()
        return
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ keys }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test JWKS server')
    }
    url = new URL(`http://127.0.0.1:${address.port}/keys`)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  })

  it('accepts overlapping rotated keys after an unknown-key refresh', async () => {
    const verifier = createTokenVerifier(configFor(url))
    await expect(verifier(await signToken(firstKey))).resolves.toMatchObject({ subject: 'external-subject-1' })

    keys = [firstKey.publicJwk, rotatedKey.publicJwk]
    await expect(verifier(await signToken(rotatedKey))).resolves.toMatchObject({ subject: 'external-subject-1' })
    await expect(verifier(await signToken(firstKey))).resolves.toMatchObject({ subject: 'external-subject-1' })
  })

  it('uses a cached trusted key during outage but fails closed for unknown keys', async () => {
    const verifier = createTokenVerifier(configFor(url))
    await verifier(await signToken(firstKey))
    available = false

    await expect(verifier(await signToken(firstKey))).resolves.toMatchObject({ subject: 'external-subject-1' })
    const unknownKey = await generateSigningKey('outage-key')
    await expect(verifier(await signToken(unknownKey))).rejects.toMatchObject({ code: 'invalid_token' })
    available = true
  })
})