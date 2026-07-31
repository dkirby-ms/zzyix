import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { MeResponse } from '../../../server/src/contracts'
import { createAuthenticatedFetch, InteractionRequiredError, type AuthLossReason } from '../network/authenticatedFetch'
import { AuthSessionContext, type AuthSession, type AuthSessionStatus } from './useAuthSession'

const TEST_SESSION_KEY = 'zzyix:e2e-authenticated'
const TEST_SUBJECT_KEY = 'zzyix:e2e-subject'
const TEST_TOKEN_LIFETIME_KEY = 'zzyix:e2e-token-lifetime-seconds'
const TEST_ISSUER = import.meta.env.VITE_TEST_OIDC_ISSUER as string | undefined
const TEST_TOKEN_URL = import.meta.env.VITE_TEST_OIDC_TOKEN_URL as string | undefined
const API_ORIGIN = location.origin

const requestToken = async (subject: string): Promise<string> => {
  if (!TEST_TOKEN_URL && !TEST_ISSUER) {
    throw new Error('VITE_TEST_OIDC_TOKEN_URL or VITE_TEST_OIDC_ISSUER is required in E2E test mode')
  }
  const configuredLifetime = Number(localStorage.getItem(TEST_TOKEN_LIFETIME_KEY) ?? 300)
  const expiresInSeconds = Number.isFinite(configuredLifetime) && configuredLifetime > 0 ? configuredLifetime : 300
  const tokenUrl = TEST_TOKEN_URL
    ? new URL(TEST_TOKEN_URL, location.origin)
    : new URL('token', TEST_ISSUER)
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, expiresInSeconds }),
  })
  if (!response.ok) throw new Error(`Local test token request failed (${response.status})`)
  return (await response.json() as { access_token: string }).access_token
}

export const TestAuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthSessionStatus>('loading')
  const [principal, setPrincipal] = useState<MeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testSubject, setTestSubject] = useState(() => localStorage.getItem(TEST_SUBJECT_KEY) ?? 'dev-alice')
  const tokenRef = useRef<string | null>(null)

  const handleAuthLoss = useCallback((reason: AuthLossReason): void => {
    tokenRef.current = null
    setPrincipal(null)
    setError(reason === 'interaction_required' ? null : 'Your secure session ended. Sign in again to continue.')
    setStatus(reason === 'interaction_required' ? 'signed_out' : 'error')
  }, [])

  const acquireAccessToken = useCallback(async ({ forceRefresh = false } = {}): Promise<string> => {
    if (localStorage.getItem(TEST_SESSION_KEY) !== 'true') throw new InteractionRequiredError()
    const normalizedSubject = testSubject.trim()
    if (!normalizedSubject) throw new InteractionRequiredError('Choose a local test user before signing in')
    if (!tokenRef.current || forceRefresh) tokenRef.current = await requestToken(normalizedSubject)
    return tokenRef.current
  }, [testSubject])

  const selectTestSubject = useCallback((nextSubject: string): void => {
    setTestSubject(nextSubject)
    localStorage.removeItem(TEST_SESSION_KEY)
    tokenRef.current = null
    setPrincipal(null)
    setError(null)
    setStatus('signed_out')
    const normalizedSubject = nextSubject.trim()
    if (normalizedSubject) localStorage.setItem(TEST_SUBJECT_KEY, normalizedSubject)
    else localStorage.removeItem(TEST_SUBJECT_KEY)
  }, [])

  const authenticatedFetch = useMemo(() => createAuthenticatedFetch({
    acquireAccessToken,
    onAuthLoss: handleAuthLoss,
  }), [acquireAccessToken, handleAuthLoss])

  useEffect(() => {
    let cancelled = false
    if (localStorage.getItem(TEST_SESSION_KEY) !== 'true') {
      setStatus('signed_out')
      return () => { cancelled = true }
    }

    const bootstrap = async (): Promise<void> => {
      try {
        const response = await authenticatedFetch(`${API_ORIGIN}/me`)
        if (!response.ok) throw new Error(`Unable to load account (${response.status})`)
        const nextPrincipal = await response.json() as MeResponse
        if (!cancelled) {
          setPrincipal(nextPrincipal)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) handleAuthLoss('authentication_failed')
      }
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [authenticatedFetch, handleAuthLoss])

  const login = useCallback(async (): Promise<void> => {
    localStorage.setItem(TEST_SESSION_KEY, 'true')
    setStatus('loading')
    const response = await authenticatedFetch(`${API_ORIGIN}/me`)
    if (!response.ok) throw new Error(`Unable to load account (${response.status})`)
    setPrincipal(await response.json() as MeResponse)
    setStatus('authenticated')
  }, [authenticatedFetch])

  const logout = useCallback(async (): Promise<void> => {
    localStorage.removeItem(TEST_SESSION_KEY)
    tokenRef.current = null
    setPrincipal(null)
    setStatus('signed_out')
  }, [])

  const value = useMemo<AuthSession>(() => ({
    status,
    principal,
    error,
    testIdentity: { subject: testSubject, setSubject: selectTestSubject },
    apiOrigin: API_ORIGIN,
    authenticatedFetch,
    acquireAccessToken,
    login,
    logout,
    handleAuthLoss,
  }), [acquireAccessToken, authenticatedFetch, error, handleAuthLoss, login, logout, principal, selectTestSubject, status, testSubject])

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
}