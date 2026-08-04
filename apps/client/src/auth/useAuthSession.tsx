import { createContext, useContext } from 'react'
import type { MeResponse } from '../../../server/src/contracts'
import type { AccessTokenProvider, AuthLossReason } from '../network/authenticatedFetch'

export type AuthSessionStatus = 'loading' | 'signed_out' | 'authenticated' | 'error'

export type AuthSession = {
  status: AuthSessionStatus
  principal: MeResponse | null
  error: string | null
  postLogoutRedirectUri: string
  testIdentity?: {
    subject: string
    setSubject: (subject: string) => void
  }
  apiOrigin: string
  authenticatedFetch: typeof fetch
  acquireAccessToken: AccessTokenProvider
  login: () => Promise<void>
  logout: () => Promise<void>
  handleAuthLoss: (reason: AuthLossReason, error?: unknown) => void
}

export const AuthSessionContext = createContext<AuthSession | null>(null)

export const useAuthSession = (): AuthSession => {
  const session = useContext(AuthSessionContext)
  if (!session) throw new Error('useAuthSession must be used within AuthSessionProvider')
  return session
}