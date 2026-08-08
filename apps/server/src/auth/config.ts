const DEFAULT_JWKS_TIMEOUT_MS = 5_000
const DEFAULT_JWKS_CACHE_MAX_AGE_MS = 10 * 60_000
const DEFAULT_JWKS_COOLDOWN_MS = 30_000
const ASYMMETRIC_ALGORITHM_PATTERN = /^(?:RS|PS|ES)(?:256|384|512)$/

export type AuthenticationConfig = {
  trustedIssuer: string
  audience: string
  requiredScope: string
  appTrustedIssuer: string
  appAudience: string
  requiredAppRole: string
  acceptedAlgorithm: string
  jwksUri: URL
  jwksTimeoutMs: number
  jwksCacheMaxAgeMs: number
  jwksCooldownMs: number
  testIssuer: boolean
}

type AuthenticationEnvironment = Record<string, string | undefined>

const required = (environment: AuthenticationEnvironment, name: string): string => {
  const value = environment[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

const positiveInteger = (
  environment: AuthenticationEnvironment,
  name: string,
  defaultValue: number,
): number => {
  const value = environment[name]
  if (value === undefined) {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

const exactHttpsUrl = (value: string, name: string, allowHttp: boolean): URL => {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS`)
  }
  return url
}

export const loadAuthenticationConfig = (
  environment: AuthenticationEnvironment = process.env,
): AuthenticationConfig => {
  const nodeEnv = environment.NODE_ENV ?? 'development'
  const e2eTestMode = environment.E2E_TEST_MODE === 'true'
  const testIssuerConfigured = environment.AUTH_TEST_ISSUER === 'true'
  const testIssuer = nodeEnv === 'test' && e2eTestMode && testIssuerConfigured

  if (nodeEnv === 'production' && (e2eTestMode || testIssuerConfigured || environment.AUTH_TEST_JWKS_JSON)) {
    throw new Error('Production authentication cannot enable test issuer settings')
  }
  if (testIssuerConfigured && !testIssuer) {
    throw new Error('AUTH_TEST_ISSUER requires NODE_ENV=test and E2E_TEST_MODE=true')
  }

  const acceptedAlgorithm = required(environment, 'AUTH_ACCEPTED_ALGORITHM')
  if (!ASYMMETRIC_ALGORITHM_PATTERN.test(acceptedAlgorithm)) {
    throw new Error('AUTH_ACCEPTED_ALGORITHM must be one exact supported asymmetric algorithm')
  }

  const trustedIssuer = required(environment, 'AUTH_TRUSTED_ISSUER')
  const issuerUrl = exactHttpsUrl(trustedIssuer, 'AUTH_TRUSTED_ISSUER', testIssuer)
  if (issuerUrl.toString() !== trustedIssuer) {
    throw new Error('AUTH_TRUSTED_ISSUER must be a canonical URL')
  }

  return {
    trustedIssuer,
    audience: required(environment, 'AUTH_API_AUDIENCE'),
    requiredScope: required(environment, 'AUTH_REQUIRED_SCOPE'),
    appTrustedIssuer: environment.AUTH_AGENT_TRUSTED_ISSUER?.trim() || trustedIssuer,
    appAudience: environment.AUTH_AGENT_API_AUDIENCE?.trim() || required(environment, 'AUTH_API_AUDIENCE'),
    requiredAppRole: environment.AUTH_AGENT_REQUIRED_ROLE?.trim() || 'agent.runtime',
    acceptedAlgorithm,
    jwksUri: exactHttpsUrl(required(environment, 'AUTH_JWKS_URI'), 'AUTH_JWKS_URI', testIssuer),
    jwksTimeoutMs: positiveInteger(environment, 'AUTH_JWKS_TIMEOUT_MS', DEFAULT_JWKS_TIMEOUT_MS),
    jwksCacheMaxAgeMs: positiveInteger(
      environment,
      'AUTH_JWKS_CACHE_MAX_AGE_MS',
      DEFAULT_JWKS_CACHE_MAX_AGE_MS,
    ),
    jwksCooldownMs: positiveInteger(environment, 'AUTH_JWKS_COOLDOWN_MS', DEFAULT_JWKS_COOLDOWN_MS),
    testIssuer,
  }
}