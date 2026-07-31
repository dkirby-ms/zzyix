import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PublicClientApplication } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import { loadRuntimeAuthConfig, type RuntimeAuthConfig } from '../config/runtimeConfig'
import { createMsalConfiguration } from './msalConfig'
import { AuthSessionProvider } from './AuthSessionProvider'

type AuthBootstrap = {
  config: RuntimeAuthConfig
  instance: PublicClientApplication
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [bootstrap, setBootstrap] = useState<AuthBootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const initializationRef = useRef<Promise<AuthBootstrap> | null>(null)

  useEffect(() => {
    let cancelled = false

    const initialize = async (): Promise<AuthBootstrap> => {
      const config = await loadRuntimeAuthConfig()
      const instance = new PublicClientApplication(createMsalConfiguration(config))
      await instance.initialize()
      const redirectResult = await instance.handleRedirectPromise()
      const account = redirectResult?.account ?? instance.getAllAccounts()[0]
      if (account) instance.setActiveAccount(account)
      return { config, instance }
    }

    initializationRef.current ??= initialize()
    const completeInitialization = async (): Promise<void> => {
      try {
        const nextBootstrap = await initializationRef.current
        if (!cancelled) setBootstrap(nextBootstrap)
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : 'Authentication could not be initialized')
        }
      }
    }

    void completeInitialization()
    return () => { cancelled = true }
  }, [])

  if (error) return <main className="auth-shell" role="alert">{error}</main>
  if (!bootstrap) return <main className="auth-shell">Preparing secure sign-in...</main>

  return (
    <MsalProvider instance={bootstrap.instance}>
      <AuthSessionProvider config={bootstrap.config}>{children}</AuthSessionProvider>
    </MsalProvider>
  )
}