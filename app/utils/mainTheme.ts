import { nextTick } from 'vue'
import {
  buildTrustedParentOrigins,
  isTrustedParent,
  parseOrigins,
  resolveThemeHostOrigins
} from '~/utils/embedIntegration'

export const SYDU_THEME_CHANNEL = 'sydu.iframe-theme' as const
export const SYDU_THEME_VERSION = 1 as const

export type SyduThemeMode = 'light' | 'dark' | 'deep-dark'

export type SyduThemePayload = {
  themeCode: string
  mode: SyduThemeMode
  colors: {
    primary: string
    secondary: string
    success: string
    info: string
    warning: string
    error: string
    neutral: string
  }
  radius: string
  cssVariables: Record<string, string>
}

const ALLOWED_CSS = new Set([
  '--ui-primary', '--ui-secondary', '--ui-success', '--ui-info',
  '--ui-warning', '--ui-error', '--ui-text', '--ui-text-dimmed',
  '--ui-text-muted', '--ui-text-toned', '--ui-text-highlighted', '--ui-text-inverted',
  '--ui-bg', '--ui-bg-muted', '--ui-bg-elevated', '--ui-bg-accented', '--ui-bg-inverted',
  '--ui-border', '--ui-border-muted', '--ui-border-accented', '--ui-border-inverted'
])

const isValidPayload = (payload: unknown): payload is SyduThemePayload => {
  if (!payload || typeof payload !== 'object') return false
  const theme = payload as Partial<SyduThemePayload>
  const colors = theme.colors
  return typeof theme.themeCode === 'string'
    && typeof theme.mode === 'string'
    && ['light', 'dark', 'deep-dark'].includes(theme.mode)
    && typeof colors === 'object'
    && colors !== null
    && ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral']
      .every(name => typeof colors[name as keyof typeof colors] === 'string')
    && typeof theme.radius === 'string'
    && typeof theme.cssVariables === 'object'
    && theme.cssVariables !== null
}

export const isThemeResponse = (data: unknown): data is {
  channel: typeof SYDU_THEME_CHANNEL
  version: typeof SYDU_THEME_VERSION
  type: 'theme.response'
  requestId: string
  payload: SyduThemePayload
} => {
  if (!data || typeof data !== 'object') return false
  const message = data as Record<string, unknown>
  return message.channel === SYDU_THEME_CHANNEL
    && message.version === SYDU_THEME_VERSION
    && message.type === 'theme.response'
    && typeof message.requestId === 'string'
    && isValidPayload(message.payload)
}

export const applySyduTheme = async (theme: SyduThemePayload) => {
  updateAppConfig({ ui: { colors: { ...theme.colors } } } as Parameters<typeof updateAppConfig>[0])

  const mode = theme.mode === 'light' ? 'light' : 'dark'
  const colorMode = useColorMode()
  colorMode.preference = mode

  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  root.classList.toggle('sydu-deep-dark', theme.mode === 'deep-dark')
  root.style.colorScheme = mode
  root.dataset.syduThemeCode = theme.themeCode
  await nextTick()

  root.style.setProperty('--ui-radius', theme.radius)
  Object.entries(theme.cssVariables).forEach(([name, value]) => {
    if (ALLOWED_CSS.has(name)) root.style.setProperty(name, value)
  })
}

export const requestTheme = (origins: Set<string>, requestId: string) => {
  const message = {
    channel: SYDU_THEME_CHANNEL,
    version: SYDU_THEME_VERSION,
    type: 'theme.request' as const,
    requestId
  }
  origins.forEach(origin => window.parent.postMessage(message, origin))
}
