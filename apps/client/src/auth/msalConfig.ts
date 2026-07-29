import type { Configuration, RedirectRequest, SilentRequest } from '@azure/msal-browser'
import type { RuntimeAuthConfig } from '../config/runtimeConfig'

export const createMsalConfiguration = (config: RuntimeAuthConfig): Configuration => ({
  auth: {
    clientId: config.clientId,
    authority: config.authority,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
})

export const createLoginRequest = (config: RuntimeAuthConfig): RedirectRequest => ({
  scopes: [config.apiScope],
})

export const createTokenRequest = (
  config: RuntimeAuthConfig,
  account: SilentRequest['account'],
  forceRefresh = false,
): SilentRequest => ({
  account,
  scopes: [config.apiScope],
  forceRefresh,
})