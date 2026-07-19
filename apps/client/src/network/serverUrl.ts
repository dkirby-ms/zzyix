const envServerUrl = import.meta.env.VITE_SERVER_URL

type RuntimeConfig = {
  VITE_SERVER_URL?: unknown
}

type RuntimeConfigWindow = Window & {
  __ZZYIX_RUNTIME_CONFIG__?: RuntimeConfig
}

const resolveRuntimeServerUrl = (): string => {
  if (typeof window === 'undefined') {
    return ''
  }

  const runtimeConfig = (window as RuntimeConfigWindow).__ZZYIX_RUNTIME_CONFIG__
  const configured = typeof runtimeConfig?.VITE_SERVER_URL === 'string' ? runtimeConfig.VITE_SERVER_URL.trim() : ''

  return configured
}

export const resolveServerUrl = (): string => {
  const runtimeConfigured = resolveRuntimeServerUrl()
  if (runtimeConfigured.length > 0) return runtimeConfigured

  const configured = typeof envServerUrl === 'string' ? envServerUrl.trim() : ''
  if (configured.length > 0) return configured

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return ''
}
