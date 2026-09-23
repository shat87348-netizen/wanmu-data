import {
  applySyduTheme,
  isThemeResponse,
  requestTheme
} from '~/utils/mainTheme'
import {
  buildTrustedParentOrigins,
  isTrustedParent,
  parseOrigins,
  resolveThemeHostOrigins
} from '~/utils/embedIntegration'

export default defineNuxtPlugin(() => {
  if (window.parent === window) return

  const rawOrigins = resolveThemeHostOrigins()
  if (!parseOrigins(rawOrigins).size) return

  const trustedOrigins = buildTrustedParentOrigins(rawOrigins)
  // const requestId = crypto.randomUUID()
  const requestId = '08c355b3-ef1d-44ea-bb75-819e00b18463';
  let applied = false

  const handleMessage = async (event: MessageEvent<unknown>) => {
    if (
      applied
      || !isTrustedParent(event, trustedOrigins)
      || !isThemeResponse(event.data)
      || event.data.requestId !== requestId
    ) return

    applied = true
    await applySyduTheme(event.data.payload)
    dispose()
  }

  const dispose = () => window.removeEventListener('message', handleMessage)

  window.addEventListener('message', handleMessage)
  window.addEventListener('pagehide', dispose, { once: true })
  requestTheme(trustedOrigins, requestId)
})
