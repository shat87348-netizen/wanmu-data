const EMBED_MODE_STATE_KEY = 'integration-embedded-content-mode'

const isIframeRequest = () => {
  if (!import.meta.server) return false
  return useRequestHeaders(['sec-fetch-dest'])['sec-fetch-dest'] === 'iframe'
}

/**
 * Whether the current page is rendered as content inside a host iframe.
 *
 * The query parameter remains supported for the documented integration URL,
 * while the browser/request checks keep the mode stable after internal route
 * redirects that do not preserve query parameters.
 */
export const useEmbedMode = () => {
  const route = useRoute()
  const embeddedWindow = useState(EMBED_MODE_STATE_KEY, () => (
    import.meta.server ? isIframeRequest() : window.parent !== window
  ))

  if (import.meta.client) embeddedWindow.value = window.parent !== window

  return computed(() => route.query.embed === 'content' || embeddedWindow.value)
}
