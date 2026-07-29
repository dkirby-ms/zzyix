export type AccessTokenProvider = (options?: { forceRefresh?: boolean }) => Promise<string>

export type AuthLossReason = 'interaction_required' | 'authentication_failed'

export type AuthenticatedFetchOptions = {
  acquireAccessToken: AccessTokenProvider
  onAuthLoss: (reason: AuthLossReason, error?: unknown) => void
  fetch?: typeof fetch
}

export class InteractionRequiredError extends Error {
  constructor(message = 'User interaction is required to continue authentication') {
    super(message)
    this.name = 'InteractionRequiredError'
  }
}

export const isInteractionRequiredError = (error: unknown): boolean =>
  error instanceof InteractionRequiredError ||
  (typeof error === 'object' && error !== null && 'errorCode' in error &&
    typeof error.errorCode === 'string' && error.errorCode.includes('interaction_required'))

export const createAuthenticatedFetch = ({
  acquireAccessToken,
  onAuthLoss,
  fetch: fetchImplementation = globalThis.fetch,
}: AuthenticatedFetchOptions): typeof fetch => {
  let renewal: Promise<string> | null = null

  const acquireRenewedToken = (): Promise<string> => {
    renewal ??= acquireAccessToken({ forceRefresh: true }).finally(() => {
      renewal = null
    })
    return renewal
  }

  return async (input, init = {}) => {
    const request = new Request(input, init)

    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(request.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return fetchImplementation(new Request(request.clone(), { headers }))
    }

    try {
      const response = await send(await acquireAccessToken())
      if (response.status !== 401) return response

      const retryResponse = await send(await acquireRenewedToken())
      if (retryResponse.status === 401) {
        onAuthLoss('authentication_failed')
      }
      return retryResponse
    } catch (error) {
      const reason = isInteractionRequiredError(error) ? 'interaction_required' : 'authentication_failed'
      onAuthLoss(reason, error)
      throw error
    }
  }
}