const envServerUrl = import.meta.env.VITE_SERVER_URL

export const resolveServerUrl = (): string => {
  const configured = typeof envServerUrl === 'string' ? envServerUrl.trim() : ''
  if (configured.length > 0) {
    if (/^https?:\/\//i.test(configured)) {
      return configured.replace(/\/+$/, '')
    }

    // Support values like "localhost:3001" and normalize to an absolute URL.
    if (/^[a-z0-9.-]+(?::\d+)?$/i.test(configured)) {
      return `http://${configured}`
    }
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}
