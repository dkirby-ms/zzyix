import { describe, expect, it, vi } from 'vitest'
import { createAuthenticatedFetch, InteractionRequiredError } from './authenticatedFetch'

describe('createAuthenticatedFetch', () => {
  it('adds a bearer token without leaking it into the URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    const authenticatedFetch = createAuthenticatedFetch({
      acquireAccessToken: vi.fn(async () => 'secret-token'),
      onAuthLoss: vi.fn(),
      fetch: fetchMock,
    })

    await authenticatedFetch('https://api.example.test/sessions?view=mine')

    const request = fetchMock.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) throw new Error('Expected authenticated request')
    expect(request.headers.get('Authorization')).toBe('Bearer secret-token')
    expect(request.url).toBe('https://api.example.test/sessions?view=mine')
    expect(request.url).not.toContain('secret-token')
  })

  it('retries a 401 once with a forced token refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    const acquireAccessToken = vi.fn(async ({ forceRefresh } = {}) => forceRefresh ? 'renewed' : 'initial')
    const authenticatedFetch = createAuthenticatedFetch({
      acquireAccessToken,
      onAuthLoss: vi.fn(),
      fetch: fetchMock,
    })

    const response = await authenticatedFetch('https://api.example.test/me')

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(acquireAccessToken).toHaveBeenNthCalledWith(1)
    expect(acquireAccessToken).toHaveBeenNthCalledWith(2, { forceRefresh: true })
  })

  it('resends a POST body exactly once after forced token refresh', async () => {
    const bodies: string[] = []
    const authorizations: Array<string | null> = []
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (!(input instanceof Request)) throw new Error('Expected authenticated request')
      bodies.push(await input.text())
      authorizations.push(input.headers.get('Authorization'))
      return new Response(null, { status: bodies.length === 1 ? 401 : 200 })
    })
    const acquireAccessToken = vi.fn(async ({ forceRefresh } = {}) => forceRefresh ? 'renewed' : 'initial')
    const authenticatedFetch = createAuthenticatedFetch({
      acquireAccessToken,
      onAuthLoss: vi.fn(),
      fetch: fetchMock,
    })

    const response = await authenticatedFetch('https://api.example.test/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'private quilt' }),
    })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodies).toEqual(['{"name":"private quilt"}', '{"name":"private quilt"}'])
    expect(authorizations).toEqual(['Bearer initial', 'Bearer renewed'])
  })

  it('returns a second 401 without entering another renewal loop', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    const acquireAccessToken = vi.fn(async () => 'token')
    const onAuthLoss = vi.fn()
    const authenticatedFetch = createAuthenticatedFetch({
      acquireAccessToken,
      onAuthLoss,
      fetch: fetchMock,
    })

    const response = await authenticatedFetch('https://api.example.test/me')

    expect(response.status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(acquireAccessToken).toHaveBeenCalledTimes(2)
    expect(onAuthLoss).toHaveBeenCalledWith('authentication_failed')
  })

  it('signals interaction-required token acquisition failures', async () => {
    const onAuthLoss = vi.fn()
    const error = new InteractionRequiredError()
    const authenticatedFetch = createAuthenticatedFetch({
      acquireAccessToken: vi.fn(async () => { throw error }),
      onAuthLoss,
      fetch: vi.fn(),
    })

    await expect(authenticatedFetch('https://api.example.test/me')).rejects.toBe(error)
    expect(onAuthLoss).toHaveBeenCalledWith('interaction_required', error)
  })
})