import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { instance, loadRuntimeAuthConfigMock, publicClientApplicationMock } = vi.hoisted(() => ({
  instance: {
    initialize: vi.fn(async () => undefined),
    handleRedirectPromise: vi.fn(),
    getAllAccounts: vi.fn(() => []),
    setActiveAccount: vi.fn(),
  },
  loadRuntimeAuthConfigMock: vi.fn(),
  publicClientApplicationMock: vi.fn(),
}))

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: class {
    constructor(configuration: unknown) {
      publicClientApplicationMock(configuration)
      return instance
    }
  },
}))

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="msal-provider">{children}</div>,
}))

vi.mock('../config/runtimeConfig', () => ({
  loadRuntimeAuthConfig: loadRuntimeAuthConfigMock,
}))

vi.mock('./AuthSessionProvider', () => ({
  AuthSessionProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="session-provider">{children}</div>,
}))

import { AuthProvider } from './AuthProvider'

const runtimeConfig = {
  authority: 'https://tenant.ciamlogin.com/tenant.onmicrosoft.com',
  clientId: 'spa-client-id',
  apiScope: 'api://zzyix/access_as_user',
  apiOrigin: 'https://api.example.test',
  redirectUri: 'https://app.example.test/auth/callback',
  postLogoutRedirectUri: 'https://app.example.test/signed-out',
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadRuntimeAuthConfigMock.mockResolvedValue(runtimeConfig)
    instance.initialize.mockResolvedValue(undefined)
    instance.handleRedirectPromise.mockResolvedValue(null)
    instance.getAllAccounts.mockReturnValue([])
  })

  afterEach(() => {
    cleanup()
  })

  it('loads runtime config, completes redirect handling, and composes providers', async () => {
    const account = { homeAccountId: 'home' }
    instance.handleRedirectPromise.mockResolvedValue({ account })

    render(<AuthProvider><span>protected child</span></AuthProvider>)

    expect(screen.getByText('Preparing secure sign-in...')).toBeInTheDocument()
    await screen.findByText('protected child')

    expect(loadRuntimeAuthConfigMock).toHaveBeenCalledTimes(1)
    expect(publicClientApplicationMock).toHaveBeenCalledWith(expect.objectContaining({
      auth: expect.objectContaining({
        clientId: runtimeConfig.clientId,
        authority: runtimeConfig.authority,
      }),
      cache: { cacheLocation: 'sessionStorage' },
    }))
    expect(instance.initialize).toHaveBeenCalledTimes(1)
    expect(instance.handleRedirectPromise).toHaveBeenCalledTimes(1)
    expect(instance.setActiveAccount).toHaveBeenCalledWith(account)
    expect(screen.getByTestId('msal-provider')).toBeInTheDocument()
    expect(screen.getByTestId('session-provider')).toBeInTheDocument()
  })

  it('fails closed when runtime authentication initialization fails', async () => {
    loadRuntimeAuthConfigMock.mockRejectedValue(new Error('runtime config unavailable'))

    render(<AuthProvider><span>protected child</span></AuthProvider>)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('runtime config unavailable'))
    expect(screen.queryByText('protected child')).not.toBeInTheDocument()
    expect(publicClientApplicationMock).not.toHaveBeenCalled()
  })
})
