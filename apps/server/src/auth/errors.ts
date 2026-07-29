export const authenticationErrorCodes = [
  'authentication_required',
  'invalid_token',
  'insufficient_scope',
  'principal_inactive',
] as const

export type AuthenticationErrorCode = (typeof authenticationErrorCodes)[number]

const safeMessages: Record<AuthenticationErrorCode, string> = {
  authentication_required: 'Authentication is required.',
  invalid_token: 'The access token is invalid.',
  insufficient_scope: 'The access token does not grant the required scope.',
  principal_inactive: 'The account is not active.',
}

export class AuthenticationError extends Error {
  readonly code: AuthenticationErrorCode
  readonly status: 401 | 403

  constructor(code: AuthenticationErrorCode, options?: ErrorOptions) {
    super(safeMessages[code], options)
    this.name = 'AuthenticationError'
    this.code = code
    this.status = code === 'insufficient_scope' || code === 'principal_inactive' ? 403 : 401
  }
}

export const toAuthenticationError = (error: unknown): AuthenticationError =>
  error instanceof AuthenticationError
    ? error
    : new AuthenticationError('invalid_token', { cause: error })