type RuntimeAppConfig = {
  syduThemeHostOrigins?: string
  ssoEnabled?: boolean | string
  ssoHostOrigins?: string
  ssoSystemKey?: string
}

let lastAuthRequiredAt = 0

const runtimeAppConfig = (): RuntimeAppConfig => {
  if (!import.meta.client) return {}
  return (window as Window & { __APP_CONFIG__?: RuntimeAppConfig }).__APP_CONFIG__ || {}
}

export const parseOrigins = (raw: unknown): Set<string> => new Set(
  String(raw ?? '').split(',')
    .map((value) => {
      try {
        const origin = new URL(value.trim()).origin
        return origin.startsWith('http://') || origin.startsWith('https://') ? origin : null
      } catch {
        return null
      }
    })
    .filter((origin): origin is string => Boolean(origin))
)

export const isEmbeddedWindow = () => import.meta.client && window.parent !== window

export const resolveThemeHostOrigins = () => {
  const buildValue = useRuntimeConfig().public.syduThemeHostOrigins
  return String(runtimeAppConfig().syduThemeHostOrigins || buildValue || '')
}

export const resolveSsoEnabled = () => {
  const config = useRuntimeConfig().public
  const value = runtimeAppConfig().ssoEnabled ?? config.ssoEnabled
  return value === true || String(value).toLowerCase() === 'true'
}

export const resolveSsoHostOrigins = () => {
  const config = useRuntimeConfig().public
  const runtime = runtimeAppConfig()
  return String(runtime.ssoHostOrigins || config.ssoHostOrigins || '')
}

export const resolveSsoSystemKey = () => {
  const config = useRuntimeConfig().public
  return String(runtimeAppConfig().ssoSystemKey || config.ssoSystemKey || 'data-processing').trim()
}

export const buildTrustedParentOrigins = (raw: unknown): Set<string> => {
  const origins = parseOrigins(raw)
  if (!isEmbeddedWindow() || !document.referrer) return origins

  try {
    origins.add(new URL(document.referrer).origin)
  } catch {
    // An invalid referrer cannot be trusted.
  }
  return origins
}

export const isTrustedParent = (event: MessageEvent, origins: Set<string>) => (
  origins.has(event.origin) && event.source === window.parent
)

export const notifyAuthRequired = (): boolean => {
  if (!isEmbeddedWindow() || !resolveSsoEnabled()) return false

  const origins = buildTrustedParentOrigins(resolveSsoHostOrigins())
  const systemKey = resolveSsoSystemKey()
  if (!origins.size || !systemKey) return false

  const now = Date.now()
  if (now - lastAuthRequiredAt < 3000) return true
  lastAuthRequiredAt = now

  const message = {
    type: 'AUTH_REQUIRED' as const,
    systemKey
  }
  origins.forEach(origin => window.parent.postMessage(message, origin))
  return true
}
