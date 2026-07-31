import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTestOidcIssuer,
  TEST_OIDC_AUDIENCE,
  TEST_OIDC_SCOPE,
  type TestOidcIssuer,
} from '../../../../e2e/support/testOidcIssuer.js'

const testEnvironment = { NODE_ENV: 'test', E2E_TEST_MODE: 'true' }

describe('local test OIDC issuer', () => {
  let issuer: TestOidcIssuer | undefined

  afterEach(async () => {
    await issuer?.stop()
    issuer = undefined
  })

  it('issues realistic signed access tokens and publishes discovery metadata', async () => {
    issuer = await createTestOidcIssuer(0, testEnvironment)
    await issuer.start()

    const discovery = await fetch(`${issuer.issuer}.well-known/openid-configuration`).then((response) => response.json())
    const token = await issuer.issueToken({ subject: 'dev-alice' })
    const verified = await jwtVerify(token, createRemoteJWKSet(new URL(discovery.jwks_uri)), {
      issuer: issuer.issuer,
      audience: TEST_OIDC_AUDIENCE,
      algorithms: ['RS256'],
    })

    expect(verified.payload).toMatchObject({ sub: 'dev-alice', name: 'Alice', scp: TEST_OIDC_SCOPE })
  })

  it('preserves explicit and legacy test display names', async () => {
    issuer = await createTestOidcIssuer(0, testEnvironment)
    await issuer.start()
    const explicitToken = await issuer.issueToken({ subject: 'dev-bob', name: 'Robert' })
    const legacyToken = await issuer.issueToken({ subject: 'user-1' })

    expect(decodeJwt(explicitToken)).toMatchObject({ name: 'Robert' })
    expect(decodeJwt(legacyToken)).toMatchObject({ name: 'E2E Canvas User' })
  })

  it('supports overlapping key rotation and expired token tests', async () => {
    issuer = await createTestOidcIssuer(0, testEnvironment)
    await issuer.start()
    const firstToken = await issuer.issueToken({ subject: 'user-1' })
    const firstKid = decodeProtectedHeader(firstToken).kid

    await issuer.rotate()
    const rotatedToken = await issuer.issueToken({ subject: 'user-1' })
    expect(decodeProtectedHeader(rotatedToken).kid).not.toBe(firstKid)

    const getKey = createRemoteJWKSet(new URL(issuer.jwksUri), { cooldownDuration: 0 })
    await expect(jwtVerify(firstToken, getKey)).resolves.toBeDefined()
    await expect(jwtVerify(rotatedToken, getKey)).resolves.toBeDefined()

    const expired = await issuer.issueToken({ subject: 'user-1', expiresInSeconds: -1 })
    await expect(jwtVerify(expired, getKey)).rejects.toThrow()
  })

  it.each([
    { NODE_ENV: 'production', E2E_TEST_MODE: 'true' },
    { NODE_ENV: 'test', E2E_TEST_MODE: 'false' },
    { NODE_ENV: 'test' },
  ])('rejects issuer startup outside the double gate', async (environment) => {
    await expect(createTestOidcIssuer(0, environment)).rejects.toThrow(
      'Local OIDC issuer requires NODE_ENV=test and E2E_TEST_MODE=true',
    )
  })
})