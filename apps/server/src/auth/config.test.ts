import { describe, expect, it } from 'vitest'
import { loadAuthenticationConfig } from './config.js'

const validEnvironment = {
  NODE_ENV: 'production',
  AUTH_TRUSTED_ISSUER: 'https://issuer.example.test/tenant/v2.0',
  AUTH_API_AUDIENCE: 'api://zzyix',
  AUTH_REQUIRED_SCOPE: 'quilt.access',
  AUTH_JWKS_URI: 'https://issuer.example.test/keys',
  AUTH_ACCEPTED_ALGORITHM: 'RS256',
}

describe('authentication configuration', () => {
  it('loads an exact asymmetric production configuration', () => {
    expect(loadAuthenticationConfig(validEnvironment)).toMatchObject({
      trustedIssuer: validEnvironment.AUTH_TRUSTED_ISSUER,
      audience: validEnvironment.AUTH_API_AUDIENCE,
      requiredScope: validEnvironment.AUTH_REQUIRED_SCOPE,
      appTrustedIssuer: validEnvironment.AUTH_TRUSTED_ISSUER,
      appAudience: validEnvironment.AUTH_API_AUDIENCE,
      requiredAppRole: 'agent.runtime',
      acceptedAlgorithm: 'RS256',
      testIssuer: false,
    })
  })

  it('allows overriding app-only token issuer, audience, and role', () => {
    const custom = loadAuthenticationConfig({
      ...validEnvironment,
      AUTH_AGENT_TRUSTED_ISSUER: 'https://agent-issuer.example.test/tenant/v2.0',
      AUTH_AGENT_API_AUDIENCE: 'api://agent-reader',
      AUTH_AGENT_REQUIRED_ROLE: 'agent.runtime.read',
    })

    expect(custom).toMatchObject({
      appTrustedIssuer: 'https://agent-issuer.example.test/tenant/v2.0',
      appAudience: 'api://agent-reader',
      requiredAppRole: 'agent.runtime.read',
    })
  })

  it.each([
    ['E2E mode', { E2E_TEST_MODE: 'true' }],
    ['test issuer', { AUTH_TEST_ISSUER: 'true' }],
    ['test key material', { AUTH_TEST_JWKS_JSON: '{}' }],
  ])('rejects %s in production', (_label, extra) => {
    expect(() => loadAuthenticationConfig({ ...validEnvironment, ...extra })).toThrow(
      'Production authentication cannot enable test issuer settings',
    )
  })

  it('requires the complete double gate for a local HTTP issuer', () => {
    const testEnvironment = {
      ...validEnvironment,
      NODE_ENV: 'test',
      E2E_TEST_MODE: 'true',
      AUTH_TEST_ISSUER: 'true',
      AUTH_TRUSTED_ISSUER: 'http://127.0.0.1:4242/',
      AUTH_JWKS_URI: 'http://127.0.0.1:4242/keys',
    }

    expect(loadAuthenticationConfig(testEnvironment).testIssuer).toBe(true)
    expect(() => loadAuthenticationConfig({ ...testEnvironment, E2E_TEST_MODE: 'false' })).toThrow(
      'AUTH_TEST_ISSUER requires NODE_ENV=test and E2E_TEST_MODE=true',
    )
  })

  it.each(['HS256', 'none', 'RS256,RS512'])('rejects unsafe or non-exact algorithm %s', (algorithm) => {
    expect(() => loadAuthenticationConfig({
      ...validEnvironment,
      AUTH_ACCEPTED_ALGORITHM: algorithm,
    })).toThrow('one exact supported asymmetric algorithm')
  })
})