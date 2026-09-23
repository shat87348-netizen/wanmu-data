import {
  buildTrustedParentOrigins,
  isTrustedParent,
  notifyAuthRequired,
  resolveSsoEnabled,
  resolveSsoHostOrigins,
  resolveSsoSystemKey
} from '~/utils/embedIntegration'

type SsoTokenMessage = {
  type: 'SSO_TOKEN'
  systemKey: string
  tokenId: string
}

const isSsoTokenMessage = (data: unknown): data is SsoTokenMessage => {
  if (!data || typeof data !== 'object') return false
  const message = data as Partial<SsoTokenMessage>
  return message.type === 'SSO_TOKEN'
    && typeof message.systemKey === 'string'
    && typeof message.tokenId === 'string'
}

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : '统一登录失败'
)

export default defineNuxtPlugin(() => {
  if (window.parent === window || !resolveSsoEnabled()) return

  const systemKey = resolveSsoSystemKey()
  const trustedOrigins = buildTrustedParentOrigins(resolveSsoHostOrigins())
  if (!systemKey || trustedOrigins.size === 0) {
    console.warn('[sso][child] 缺少 ssoSystemKey 或可信父系统 origin 配置')
    return
  }

  const { isAuthenticated, signIn, updateUser } = useSession()
  const { ssoLogin, userInfo } = useAuthApi()
  let loginInProgress = false
  let retryTimer: number | undefined

  const clearRetry = () => {
    if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    retryTimer = undefined
  }

  const requestToken = () => {
    if (isAuthenticated.value || loginInProgress) return
    notifyAuthRequired()
    scheduleRetry()
  }

  const scheduleRetry = () => {
    clearRetry()
    retryTimer = window.setTimeout(() => {
      if (!isAuthenticated.value && !loginInProgress) requestToken()
    }, 3500)
  }

  const handleMessage = async (event: MessageEvent<unknown>) => {
    if (
      isAuthenticated.value
      || loginInProgress
      || !isTrustedParent(event, trustedOrigins)
      || !isSsoTokenMessage(event.data)
      || event.data.systemKey !== systemKey
    ) return

    const tokenId = event.data.tokenId.trim()
    if (!tokenId) return

    loginInProgress = true
    clearRetry()
    try {
      const result = await ssoLogin(tokenId)
      if (!result?.token) throw new Error('SSO 登录接口未返回本系统令牌')

      signIn({ token: result.token, username: 'sso-user', name: '统一登录用户' })
      try {
        const remoteUser = (await userInfo())?.user
        if (remoteUser) {
          updateUser({
            username: remoteUser.username || 'sso-user',
            name: remoteUser.nickname || remoteUser.name || remoteUser.username || '统一登录用户'
          })
        }
      } catch {
        // 本地 JWT 已建立，用户信息补充失败不阻断进入业务页。
      }

      // 会话变为已登录后，嵌入布局会直接挂载目标业务页。
      loginInProgress = false
    } catch (error) {
      loginInProgress = false
      console.error('[sso][child] SSO 登录失败：', errorMessage(error))
      scheduleRetry()
    }
  }

  let stopAuthWatch = () => {}
  const dispose = () => {
    clearRetry()
    window.removeEventListener('message', handleMessage)
    stopAuthWatch()
  }

  window.addEventListener('message', handleMessage)
  window.addEventListener('pagehide', dispose, { once: true })

  stopAuthWatch = watch(isAuthenticated, (authenticated, wasAuthenticated) => {
    if (!authenticated && wasAuthenticated) {
      requestToken()
    }
  })

  if (!isAuthenticated.value) {
    requestToken()
  }
})
