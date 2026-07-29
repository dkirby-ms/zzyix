import { describe, expect, it } from 'vitest'
import type { RuntimeAuthConfig } from '../config/runtimeConfig'
import { createLoginRequest, createMsalConfiguration, createTokenRequest } from './msalConfig'

const runtimeConfig: RuntimeAuthConfig = {
  authority: 'https://tenant.ciamlogin.com/tenant.onmicrosoft.com',
  clientId: 'spa-client-id',
  apiScope: 'api://zzyix/access_as_user',
  apiOrigin: 'https://api.example.test',
  redirectUri: 'https://app.example.test/auth/callback',
  postLogoutRedirectUri: 'https://app.example.test/signed-out',
  canonicalEntryEnabled: true,
}

describe('MSAL configuration', () => {
  it('uses runtime configuration and session-scoped MSAL storage', () => {
    const config = createMsalConfiguration(runtimeConfig)

    expect(config.auth).toMatchObject({
      clientId: runtimeConfig.clientId,
      authority: runtimeConfig.authority,
      redirectUri: runtimeConfig.redirectUri,
      postLogoutRedirectUri: runtimeConfig.postLogoutRedirectUri,
    })
    expect(config.cache?.cacheLocation).toBe('sessionStorage')
    expect(JSON.stringify(config)).not.toContain('clientSecret')
  })

  it('requests only the runtime API scope for login and silent acquisition', () => {
    const account = {
      homeAccountId: 'home',
      localAccountId: 'local',
      environment: 'tenant',
      tenantId: 'tenant',
      username: 'user',
    }

    expect(createLoginRequest(runtimeConfig).scopes).toEqual([runtimeConfig.apiScope])
    expect(createTokenRequest(runtimeConfig, account, true)).toMatchObject({
      account,
      scopes: [runtimeConfig.apiScope],
      forceRefresh: true,
    })
  })
})