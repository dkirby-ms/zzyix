export const parseExactHttpsOrigin = (name, value) => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('*')) {
    throw new Error(`${name} must be a nonempty origin without wildcards`)
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid absolute URL`)
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.pathname !== '/'
    || parsed.search !== ''
    || parsed.hash !== ''
  ) {
    throw new Error(`${name} must be an absolute HTTPS origin with no credentials, path, query, or fragment`)
  }

  return parsed.origin
}

export const validateDeploymentOrigins = ({ apiOrigin, redirectUri, corsOrigin }) => {
  const normalizedApiOrigin = parseExactHttpsOrigin('AUTH_API_ORIGIN', apiOrigin)
  const normalizedRedirectOrigin = new URL(redirectUri).origin
  if (normalizedApiOrigin !== normalizedRedirectOrigin) {
    throw new Error('AUTH_API_ORIGIN must match the client redirect origin')
  }

  if (corsOrigin) {
    const normalizedCorsOrigin = parseExactHttpsOrigin('SERVER_CORS_ORIGIN', corsOrigin)
    if (normalizedCorsOrigin !== normalizedApiOrigin) {
      throw new Error('SERVER_CORS_ORIGIN must match AUTH_API_ORIGIN for same-origin deployment')
    }
  }
}