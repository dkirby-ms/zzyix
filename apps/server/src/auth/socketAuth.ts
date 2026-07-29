import type { ExtendedError, Socket } from 'socket.io'
import type {
  ClientToServerEvents,
  ConnectionAuth,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../contracts.js'
import type { PrincipalResolver } from './httpAuth.js'
import type { TokenVerifier } from './tokenVerifier.js'
import { AuthenticationError, toAuthenticationError } from './errors.js'

type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export type SocketAuthenticationErrorData = {
  code: string
  message: string
}

const socketError = (error: unknown): ExtendedError => {
  const authenticationError = toAuthenticationError(error)
  const result = new Error(authenticationError.message) as ExtendedError
  result.data = {
    code: authenticationError.code,
    message: authenticationError.message,
  } satisfies SocketAuthenticationErrorData
  return result
}

export const scheduleSocketExpiry = (
  socket: Pick<AuthenticatedSocket, 'disconnect'>,
  expiresAt: number,
  now: () => number = Date.now,
): ReturnType<typeof setTimeout> => {
  const timeout = setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt - now()))
  timeout.unref?.()
  return timeout
}

export const createSocketAuth = (
  verifyToken: TokenVerifier,
  resolvePrincipal: PrincipalResolver,
  now: () => number = Date.now,
) => async (socket: AuthenticatedSocket, next: (error?: ExtendedError) => void): Promise<void> => {
  try {
    const auth = socket.handshake.auth as Partial<ConnectionAuth>
    if (typeof auth.token !== 'string' || auth.token.length === 0) {
      throw new AuthenticationError('authentication_required')
    }
    const identity = await verifyToken(auth.token)
    const principal = await resolvePrincipal(identity)
    const tokenExpiresAt = principal.tokenExpiresAt.getTime()
    if (tokenExpiresAt <= now()) {
      throw new AuthenticationError('invalid_token')
    }
    Object.defineProperties(socket.data, {
      principalId: {
        configurable: false,
        enumerable: true,
        value: principal.principalId,
        writable: false,
      },
      tokenExpiresAt: {
        configurable: false,
        enumerable: true,
        value: tokenExpiresAt,
        writable: false,
      },
    })
    scheduleSocketExpiry(socket, tokenExpiresAt, now)
    next()
  } catch (error) {
    next(socketError(error))
  }
}