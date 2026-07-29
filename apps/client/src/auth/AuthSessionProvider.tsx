import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import type { MeResponse } from '../../../server/src/contracts'
import type { RuntimeAuthConfig } from '../config/runtimeConfig'
import {
  createAuthenticatedFetch,
  InteractionRequiredError,
  type AccessTokenProvider,
  type AuthLossReason,
} from '../network/authenticatedFetch'
import { createLoginRequest, createTokenRequest } from './msalConfig'
import { AuthSessionContext, type AuthSession, type AuthSessionStatus } from './useAuthSession'

export const AuthSessionProvider = ({ config, children }: { config: RuntimeAuthConfig; children: ReactNode }) => {
  const { instance, accounts } = useMsal()
  const [status, setStatus] = useState<AuthSessionStatus>('loading')
  const [principal, setPrincipal] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const renewalRef = useRef<Promise<string> | null>(null)
  const account = instance.getActiveAccount() ?? accounts[0] ?? null

  const handleAuthLoss = useCallback((reason: AuthLossReason, _error?: unknown): void => {
    setPrincipal(null)
    setError(reason === 'interaction_required' ? null : 'Your secure session ended. Sign in again to continue.')
    setStatus(reason === 'interaction_required' ? 'signed_out' : 'error')
  }, [])

  const acquireAccessToken = useCallback<AccessTokenProvider>(async ({ forceRefresh = false } = {}) => {
    if (!account) throw new InteractionRequiredError()
    if (forceRefresh && renewalRef.current) return renewalRef.current

    const acquisition = instance.acquireTokenSilent(createTokenRequest(config, account, forceRefresh))
      .then((result) => result.accessToken)
      .catch((acquisitionError: unknown) => {
        if (acquisitionError instanceof InteractionRequiredAuthError) {
          throw new InteractionRequiredError(acquisitionError.message)
        }
        throw acquisitionError
      })
    if (!forceRefresh) return acquisition

    renewalRef.current = acquisition.finally(() => { renewalRef.current = null })
    return renewalRef.current
  }, [account, config, instance])

  const authenticatedFetch = useMemo(() => createAuthenticatedFetch({
    acquireAccessToken,
    onAuthLoss: handleAuthLoss,
  }), [acquireAccessToken, handleAuthLoss])

  useEffect(() => {
    let cancelled = false
    setPrincipal(null)
    setError(null)

    if (!account) {
      setStatus('signed_out')
      return () => { cancelled = true }
    }

    setStatus('loading')
    const bootstrapPrincipal = async (): Promise<void> => {
      try {
        const response = await authenticatedFetch(`${config.apiOrigin}/me`)
        if (response.status === 403) {
          handleAuthLoss('authentication_failed')
          return
        }
        if (!response.ok) throw new Error(`Unable to load account (${response.status})`)
        const nextPrincipal = await response.json() as MeResponse
        if (!cancelled) {
          setPrincipal(nextPrincipal)
          setStatus('authenticated')
        }
      } catch (bootstrapError) {
        if (!cancelled && !(bootstrapError instanceof InteractionRequiredError)) {
          handleAuthLoss('authentication_failed', bootstrapError)
        }
      }
    }

    void bootstrapPrincipal()
    return () => { cancelled = true }
  }, [account, authenticatedFetch, config.apiOrigin, handleAuthLoss])

  const login = useCallback(async (): Promise<void> => {
    await instance.loginRedirect(createLoginRequest(config))
  }, [config, instance])

  const logout = useCallback(async (): Promise<void> => {
    setPrincipal(null)
    setStatus('signed_out')
    await instance.logoutRedirect({
      account: account ?? undefined,
      postLogoutRedirectUri: config.postLogoutRedirectUri,
    })
  }, [account, config.postLogoutRedirectUri, instance])

  const value = useMemo<AuthSession>(() => ({
    status,
    principal,
    error,
    apiOrigin: config.apiOrigin,
    authenticatedFetch,
    acquireAccessToken,
    login,
    logout,
    handleAuthLoss,
  }), [
    acquireAccessToken,
    authenticatedFetch,
    config.apiOrigin,
    error,
    handleAuthLoss,
    login,
    logout,
    principal,
    status,
  ])

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}