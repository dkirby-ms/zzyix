import { describe, expect, it } from 'vitest'

import { parseRuntimeAuthConfig } from './runtimeConfig'

const validConfig = {
  authority: 'https://tenant.ciamlogin.com/tenant.onmicrosoft.com/',
  clientId: 'client-id',
  apiScope: 'api://api-id/access_as_user',
  apiOrigin: 'https://app.example.com/',
  redirectUri: 'https://app.example.com/auth/callback/',
  postLogoutRedirectUri: 'https://app.example.com/signed-out/',
  canonicalEntryEnabled: true,
}

describe('parseRuntimeAuthConfig', () => {
  it('preserves exact registered redirect and logout URIs', () => {
    const parsed = parseRuntimeAuthConfig(validConfig)

    expect(parsed.redirectUri).toBe(validConfig.redirectUri)
    expect(parsed.postLogoutRedirectUri).toBe(validConfig.postLogoutRedirectUri)
  })

  it('normalizes only values whose contract requires normalization', () => {
    const parsed = parseRuntimeAuthConfig(validConfig)

    expect(parsed.authority).toBe('https://tenant.ciamlogin.com/tenant.onmicrosoft.com')
    expect(parsed.apiOrigin).toBe('https://app.example.com')
  })

  it('rejects a public API origin with a path', () => {
    expect(() => parseRuntimeAuthConfig({ ...validConfig, apiOrigin: 'https://app.example.com/api' }))
      .toThrow('must be an origin without a path, query, or fragment')
  })

  it('allows HTTP only for loopback development URLs', () => {
    expect(() => parseRuntimeAuthConfig({ ...validConfig, redirectUri: 'http://app.example.com/' }))
      .toThrow('must use HTTPS outside loopback development')

    expect(parseRuntimeAuthConfig({
      ...validConfig,
      apiOrigin: 'http://localhost:5173/',
      redirectUri: 'http://localhost:5173/',
      postLogoutRedirectUri: 'http://localhost:5173/',
    }).redirectUri).toBe('http://localhost:5173/')
  })

  it.each([
    ['missing', undefined],
    ['string-valued', 'true'],
    ['unresolved', '${FEATURE_CANONICAL_ENTRY_ENABLED}'],
  ])('rejects a %s canonical entry gate', (_label, canonicalEntryEnabled) => {
    expect(() => parseRuntimeAuthConfig({ ...validConfig, canonicalEntryEnabled }))
      .toThrow('canonicalEntryEnabled" must be a JSON boolean')
  })
})