const envServerUrl = import.meta.env.VITE_SERVER_URL

export const resolveServerUrl = (): string => {
  const configured = typeof envServerUrl === 'string' ? envServerUrl.trim() : ''
  if (configured.length > 0) return configured

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}
