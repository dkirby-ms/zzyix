export type RuntimeAuthConfig = {
  authority: string
  clientId: string
  apiScope: string
  apiOrigin: string
  redirectUri: string
  postLogoutRedirectUri: string
}

const requiredKeys = [
  'authority',
  'clientId',
  'apiScope',
  'apiOrigin',
  'redirectUri',
  'postLogoutRedirectUri',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requireConfiguredString = (value: unknown, key: string): string => {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('${')) {
    throw new Error(`Runtime auth configuration field "${key}" is missing or unresolved`)
  }

  return value
}

const validateAbsoluteUrl = (value: string, key: string): URL => {
  const url = new URL(value)
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new Error(`Runtime auth configuration field "${key}" must use HTTPS outside loopback development`)
  }

  return url
}

const requireNormalizedOrigin = (value: string, key: string): string => {
  const url = validateAbsoluteUrl(value, key)
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`Runtime auth configuration field "${key}" must be an origin without a path, query, or fragment`)
  }

  return url.origin
}

const requireExactAbsoluteUrl = (value: string, key: string): string => {
  validateAbsoluteUrl(value, key)
  return value
}

export const parseRuntimeAuthConfig = (value: unknown): RuntimeAuthConfig => {
  if (!isRecord(value)) {
    throw new Error('Runtime auth configuration must be a JSON object')
  }

  const parsed = Object.fromEntries(
    requiredKeys.map((key) => [key, requireConfiguredString(value[key], key)]),
  ) as Pick<RuntimeAuthConfig, typeof requiredKeys[number]>

  return {
    ...parsed,
    authority: requireExactAbsoluteUrl(parsed.authority, 'authority').replace(/\/$/, ''),
    apiOrigin: requireNormalizedOrigin(parsed.apiOrigin, 'apiOrigin'),
    redirectUri: requireExactAbsoluteUrl(parsed.redirectUri, 'redirectUri'),
    postLogoutRedirectUri: requireExactAbsoluteUrl(parsed.postLogoutRedirectUri, 'postLogoutRedirectUri'),
  }
}

export const loadRuntimeAuthConfig = async (): Promise<RuntimeAuthConfig> => {
  const response = await fetch('/auth-config.json', { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Unable to load runtime auth configuration (${response.status})`)
  }

  return parseRuntimeAuthConfig(await response.json())
}