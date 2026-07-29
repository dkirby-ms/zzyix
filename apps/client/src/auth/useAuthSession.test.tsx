import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountInfo, AuthenticationResult } from '@azure/msal-browser'
import type { RuntimeAuthConfig } from '../config/runtimeConfig'
import { AuthSessionProvider } from './AuthSessionProvider'
import { useAuthSession } from './useAuthSession'

const { useMsalMock } = vi.hoisted(() => ({
  useMsalMock: vi.fn(),
}))

vi.mock('@azure/msal-react', () => ({
  useMsal: useMsalMock,
}))

const config: RuntimeAuthConfig = {
  authority: 'https://tenant.ciamlogin.com/tenant.onmicrosoft.com',
  clientId: 'spa-client-id',
  apiScope: 'api://zzyix/access_as_user',
  apiOrigin: 'https://api.example.test',
  redirectUri: 'https://app.example.test/auth/callback',
  postLogoutRedirectUri: 'https://app.example.test/signed-out',
  canonicalEntryEnabled: true,
}

const account: AccountInfo = {
  homeAccountId: 'home',
  localAccountId: 'local',
  environment: 'tenant',
  tenantId: 'tenant',
  username: 'user@example.test',
}

const createAuthenticationResult = (accessToken = 'access-token'): AuthenticationResult => ({
  authority: config.authority,
  uniqueId: 'unique',
  tenantId: account.tenantId,
  scopes: [config.apiScope],
  account,
  idToken: 'id-token',
  idTokenClaims: {},
  accessToken,
  fromCache: false,
  expiresOn: new Date(Date.now() + 60_000),
  tokenType: 'Bearer',
  correlationId: 'correlation',
})

const SessionProbe = () => {
  const session = useAuthSession()
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="profile">{session.principal?.profile.displayName ?? ''}</span>
      <button type="button" onClick={() => void session.login()}>Login</button>
      <button type="button" onClick={() => void session.logout()}>Logout</button>
      <button
        type="button"
        onClick={() => {
          void Promise.all([
            session.acquireAccessToken({ forceRefresh: true }),
            session.acquireAccessToken({ forceRefresh: true }),
          ])
        }}
      >
        Renew twice
      </button>
    </div>
  )
}

const createInstance = () => ({
  getActiveAccount: vi.fn(() => account as AccountInfo | null),
  acquireTokenSilent: vi.fn(async () => createAuthenticationResult()),
  loginRedirect: vi.fn(async () => undefined),
  logoutRedirect: vi.fn(async () => undefined),
})

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not load /me until an MSAL account exists', async () => {
    const instance = createInstance()
    instance.getActiveAccount.mockReturnValue(null)
    useMsalMock.mockReturnValue({ instance, accounts: [], inProgress: 'none' })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    render(
      <AuthSessionProvider config={config}>
        <SessionProbe />
      </AuthSessionProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed_out'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hydrates the safe principal from authenticated /me only', async () => {
    const instance = createInstance()
    useMsalMock.mockReturnValue({ instance, accounts: [account], inProgress: 'none' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      profile: { displayName: 'Ada' },
      commands: {
        createSession: true,
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(
      <AuthSessionProvider config={config}>
        <SessionProbe />
      </AuthSessionProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('profile')).toHaveTextContent('Ada')
    const request = fetchMock.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) throw new Error('Expected /me Request')
    expect(request.url).toBe(`${config.apiOrigin}/me`)
    expect(request.headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('does not bootstrap repeatedly when MSAL returns equivalent account objects', async () => {
    const instance = createInstance()
    instance.getActiveAccount.mockImplementation(() => ({ ...account }))
    useMsalMock.mockReturnValue({ instance, accounts: [account], inProgress: 'none' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      profile: { displayName: 'Ada' },
      commands: {
        createSession: true,
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(
      <AuthSessionProvider config={config}>
        <SessionProbe />
      </AuthSessionProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('uses runtime scope for login, account logout, and coalesced forced renewal', async () => {
    let resolveRenewal: ((result: AuthenticationResult) => void) | undefined
    const instance = createInstance()
    instance.acquireTokenSilent
      .mockResolvedValueOnce(createAuthenticationResult())
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRenewal = resolve }))
    useMsalMock.mockReturnValue({ instance, accounts: [account], inProgress: 'none' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      profile: { displayName: 'Ada' },
      commands: {
        createSession: true,
        claimPatch: true,
        createTransfer: true,
        acceptTransfer: true,
        cancelTransfer: true,
        abandonPatch: true,
        requestAccountDeletion: true,
        recoverAccount: true,
      },
    }), { status: 200 }))

    render(
      <AuthSessionProvider config={config}>
        <SessionProbe />
      </AuthSessionProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
      screen.getByRole('button', { name: 'Logout' }).click()
      screen.getByRole('button', { name: 'Renew twice' }).click()
      await Promise.resolve()
    })

    expect(instance.loginRedirect).toHaveBeenCalledWith({ scopes: [config.apiScope] })
    expect(instance.logoutRedirect).toHaveBeenCalledWith({
      account,
      postLogoutRedirectUri: config.postLogoutRedirectUri,
    })
    expect(instance.acquireTokenSilent).toHaveBeenCalledTimes(2)
    expect(instance.acquireTokenSilent).toHaveBeenLastCalledWith(expect.objectContaining({
      account,
      scopes: [config.apiScope],
      forceRefresh: true,
    }))

    await act(async () => {
      resolveRenewal?.(createAuthenticationResult('renewed-token'))
    })
  })
})
