import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../contracts.js'
import { AuthenticationError } from './errors.js'
import { createSocketAuth } from './socketAuth.js'

type TestSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

const socket = (token?: string): TestSocket => ({
  data: {},
  disconnect: vi.fn(),
  handshake: { auth: token ? { token } : {} },
} as unknown as TestSocket)

afterEach(() => vi.useRealTimers())

describe('Socket.IO authentication boundary', () => {
  it('rejects missing tokens before principal resolution', async () => {
    const verifyToken = vi.fn()
    const resolvePrincipal = vi.fn()
    const next = vi.fn()

    await createSocketAuth(verifyToken, resolvePrincipal)(socket(), next)

    expect(verifyToken).not.toHaveBeenCalled()
    expect(resolvePrincipal).not.toHaveBeenCalled()
    expect(next.mock.calls[0]?.[0]).toMatchObject({ data: { code: 'authentication_required' } })
  })

  it('rejects an inactive principal without attaching socket identity', async () => {
    const connection = socket('access-token')
    const verifyToken = vi.fn().mockResolvedValue({
      issuer: 'https://issuer.example/',
      subject: 'subject',
      expiresAt: new Date(Date.now() + 60_000),
      scope: ['access'],
    })
    const resolvePrincipal = vi.fn().mockRejectedValue(new AuthenticationError('principal_inactive'))
    const next = vi.fn()

    await createSocketAuth(verifyToken, resolvePrincipal)(connection, next)

    expect(connection.data.principalId).toBeUndefined()
    expect(next.mock.calls[0]?.[0]).toMatchObject({ data: { code: 'principal_inactive' } })
  })

  it('attaches server-derived identity and disconnects no later than token expiry', async () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-07-28T12:00:00.000Z')
    vi.setSystemTime(now)
    const connection = socket('access-token')
    const identity = {
      issuer: 'https://issuer.example/',
      subject: 'subject',
      expiresAt: new Date(now + 1_000),
      scope: ['access'],
    }
    const verifyToken = vi.fn().mockResolvedValue(identity)
    const resolvePrincipal = vi.fn().mockResolvedValue({
      principalId: '11111111-1111-4111-8111-111111111111',
      status: 'active',
      tokenExpiresAt: identity.expiresAt,
    })
    const next = vi.fn()

    await createSocketAuth(verifyToken, resolvePrincipal)(connection, next)

    expect(connection.data).toMatchObject({
      principalId: '11111111-1111-4111-8111-111111111111',
      tokenExpiresAt: now + 1_000,
    })
    expect(next).toHaveBeenCalledWith()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(connection.disconnect).toHaveBeenCalledWith(true)
  })
})