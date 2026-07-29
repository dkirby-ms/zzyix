import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { PrincipalContext } from './principalContext.js'
import type { TokenVerifier, VerifiedExternalIdentity } from './tokenVerifier.js'
import { AuthenticationError, toAuthenticationError } from './errors.js'
import type { MeResponse, SafePrincipalProfile } from '../contracts.js'

export type PrincipalResolver = (identity: VerifiedExternalIdentity) => Promise<PrincipalContext>

export type AuthenticatedRequest = Request & {
  principal: PrincipalContext
}

export type SafeErrorResponse = {
  code: string
  message: string
  requestId: string
}

const bearerToken = (authorization: string | undefined): string => {
  if (!authorization) {
    throw new AuthenticationError('authentication_required')
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization)
  if (!match) {
    throw new AuthenticationError('invalid_token')
  }

  return match[1]
}

export const sendAuthenticationError = (
  response: Response,
  requestId: string,
  error: unknown,
): void => {
  const authenticationError = toAuthenticationError(error)
  if (authenticationError.status === 401) {
    response.setHeader('WWW-Authenticate', 'Bearer')
  }
  response.status(authenticationError.status).json({
    code: authenticationError.code,
    message: authenticationError.message,
    requestId,
  } satisfies SafeErrorResponse)
}

export const createHttpAuth = (
  verifyToken: TokenVerifier,
  resolvePrincipal: PrincipalResolver,
): RequestHandler => async (request: Request, response: Response, next: NextFunction) => {
  try {
    const identity = await verifyToken(bearerToken(request.header('authorization')))
    const principal = await resolvePrincipal(identity)
    Object.defineProperty(request, 'principal', {
      configurable: false,
      enumerable: false,
      value: Object.freeze(principal),
      writable: false,
    })
    next()
  } catch (error) {
    sendAuthenticationError(response, response.getHeader('x-request-id')?.toString() ?? randomUUID(), error)
  }
}

export const getPrincipalContext = (request: Request): PrincipalContext =>
  (request as AuthenticatedRequest).principal

export const buildMeResponse = (profile: SafePrincipalProfile): MeResponse => ({
  profile,
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
})

export const sendResourceNotFound = (response: Response, requestId: string): void => {
  response.status(404).json({
    code: 'resource_not_found',
    message: 'Resource not found.',
    requestId,
  } satisfies SafeErrorResponse)
}