import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose'
import type { AuthenticationConfig } from './config.js'
import { AuthenticationError, toAuthenticationError } from './errors.js'

export type VerifiedExternalIdentity = {
  kind: 'delegated_user' | 'app_agent'
  issuer: string
  subject: string
  expiresAt: Date
  scope: string[]
  roles: string[]
  applicationId?: string
  displayName?: string
  email?: string
}

export type TokenVerifier = (token: string) => Promise<VerifiedExternalIdentity>

const scopeValues = (payload: JWTPayload): string[] => {
  const claim = typeof payload.scp === 'string'
    ? payload.scp
    : typeof payload.scope === 'string'
      ? payload.scope
      : ''
  return Array.from(new Set(claim.split(/\s+/).filter(Boolean)))
}

const optionalStringClaim = (payload: JWTPayload, name: string): string | undefined => {
  const value = payload[name]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const roleValues = (payload: JWTPayload): string[] => {
  const claim = payload.roles
  if (!Array.isArray(claim)) {
    return []
  }

  return Array.from(new Set(claim.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

const toIdentity = (payload: JWTPayload, config: AuthenticationConfig): VerifiedExternalIdentity => {
  if (payload.iss !== config.trustedIssuer || !payload.sub || payload.exp === undefined) {
    throw new AuthenticationError('invalid_token')
  }

  const scope = scopeValues(payload)
  if (!scope.includes(config.requiredScope)) {
    throw new AuthenticationError('insufficient_scope')
  }

  const displayName = optionalStringClaim(payload, 'name')
  const email = optionalStringClaim(payload, 'email') ?? optionalStringClaim(payload, 'preferred_username')

  return {
    kind: 'delegated_user',
    issuer: payload.iss,
    subject: payload.sub,
    expiresAt: new Date(payload.exp * 1_000),
    scope,
    roles: [],
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
  }
}

const toAppIdentity = (payload: JWTPayload, config: AuthenticationConfig): VerifiedExternalIdentity => {
  if (payload.iss !== config.appTrustedIssuer || payload.exp === undefined) {
    throw new AuthenticationError('invalid_token')
  }

  const applicationId = optionalStringClaim(payload, 'azp') ?? optionalStringClaim(payload, 'appid')
  if (!applicationId) {
    throw new AuthenticationError('invalid_token')
  }

  const roles = roleValues(payload)
  if (!roles.includes(config.requiredAppRole)) {
    throw new AuthenticationError('insufficient_scope')
  }

  return {
    kind: 'app_agent',
    issuer: payload.iss,
    subject: `app:${applicationId}`,
    expiresAt: new Date(payload.exp * 1_000),
    scope: [],
    roles,
    applicationId,
  }
}

export const createTokenVerifier = (
  config: AuthenticationConfig,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(config.jwksUri, {
    timeoutDuration: config.jwksTimeoutMs,
    cacheMaxAge: config.jwksCacheMaxAgeMs,
    cooldownDuration: config.jwksCooldownMs,
  }),
): TokenVerifier => async (token) => {
  if (!token) {
    throw new AuthenticationError('authentication_required')
  }

  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: config.trustedIssuer,
      audience: config.audience,
      algorithms: [config.acceptedAlgorithm],
      requiredClaims: ['iss', 'sub', 'aud', 'exp'],
    })
    return toIdentity(payload, config)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    if (error instanceof joseErrors.JWTClaimValidationFailed && error.claim === 'scp') {
      throw new AuthenticationError('insufficient_scope', { cause: error })
    }
    throw toAuthenticationError(error)
  }
}

export const createAppTokenVerifier = (
  config: AuthenticationConfig,
  getKey: JWTVerifyGetKey = createRemoteJWKSet(config.jwksUri, {
    timeoutDuration: config.jwksTimeoutMs,
    cacheMaxAge: config.jwksCacheMaxAgeMs,
    cooldownDuration: config.jwksCooldownMs,
  }),
): TokenVerifier => async (token) => {
  if (!token) {
    throw new AuthenticationError('authentication_required')
  }

  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: config.appTrustedIssuer,
      audience: config.appAudience,
      algorithms: [config.acceptedAlgorithm],
      requiredClaims: ['iss', 'sub', 'aud', 'exp'],
    })
    return toAppIdentity(payload, config)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    throw toAuthenticationError(error)
  }
}