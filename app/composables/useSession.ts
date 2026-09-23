import { notifyAuthRequired } from '~/utils/embedIntegration'

type SessionUser = {
  username: string
  name: string
}

type Session = {
  token: string
  user: SessionUser
  /**
   * null 表示后台暂未返回页面范围，保持现有全页面可见；
   * 空数组则表示已明确没有可访问页面。
   */
  pagePaths: string[] | null
}

type SignInPayload = {
  token: string
  username: string
  name?: string
}

const SESSION_STORAGE_KEY = 'data-processing-session'

const readStoredSession = (): Session | null => {
  if (!import.meta.client) return null

  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null

    const stored = JSON.parse(raw) as Partial<Session>
    if (
      typeof stored.token !== 'string'
      || !stored.token
      || !stored.user
      || typeof stored.user.username !== 'string'
      || typeof stored.user.name !== 'string'
    ) return null

    return {
      token: stored.token,
      user: stored.user,
      pagePaths: Array.isArray(stored.pagePaths) ? stored.pagePaths : null
    }
  } catch {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

// 后端动态路由尚未配置完整，暂时允许访问全部已实现页面。
const PAGE_PERMISSION_ENABLED = false

const appPagePaths = [
  '/dashboard',
  '/data-viz',
  '/data-collection',
  '/satellite-management',
  '/data-process',
  '/calibration',
  '/alarm',
  '/config/agents',
  '/config/log',
  '/config/user'
]

const normalizePath = (path: string) => {
  const cleanPath = path.split('?')[0]?.replace(/\/$/, '') || '/'
  return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`
}

export const useSession = () => {
  const sessionCookie = useCookie<Session | null>('data-processing-session', {
    default: () => null,
    sameSite: 'lax'
  })
  const session = useState<Session | null>('data-processing-session-state', () => sessionCookie.value)
  const sessionExpiredPromptOpen = useState('session-expired-prompt-open', () => false)

  if (import.meta.client && !session.value) {
    const storedSession = readStoredSession()
    if (storedSession) session.value = storedSession
  }

  const persistSession = (nextSession: Session | null) => {
    session.value = nextSession
    sessionCookie.value = nextSession
    if (import.meta.client) {
      if (nextSession) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession))
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
      }
    }
  }

  const isAuthenticated = computed(() => Boolean(session.value?.token))
  const user = computed(() => session.value?.user ?? null)
  const pagePaths = computed(() => session.value?.pagePaths ?? null)

  const signIn = ({ token, username, name }: SignInPayload) => {
    persistSession({
      token,
      user: { username, name: name || username },
      pagePaths: null
    })
  }

  const updateUser = (nextUser: Partial<SessionUser>) => {
    if (!session.value) return
    persistSession({
      ...session.value,
      user: { ...session.value.user, ...nextUser }
    })
  }

  const setPagePaths = (paths: string[]) => {
    if (!session.value) return
    persistSession({
      ...session.value,
      pagePaths: [...new Set(paths.filter(Boolean).map(normalizePath))]
    })
  }

  /** 页面级授权入口；后续可在此扩展为 permission code 校验。 */
  const canAccessPage = (path: string) => {
    if (!PAGE_PERMISSION_ENABLED) return true

    const allowedPaths = session.value?.pagePaths
    if (allowedPaths === null || allowedPaths === undefined) return true

    const target = normalizePath(path)
    return allowedPaths.some(allowedPath => (
      target === allowedPath || target.startsWith(`${allowedPath}/`)
    ))
  }

  const firstAccessiblePage = computed(() => (
    appPagePaths.find(path => canAccessPage(path)) ?? null
  ))

  const signOut = () => {
    persistSession(null)
  }

  const handleSessionExpired = async () => {
    if (!import.meta.client || sessionExpiredPromptOpen.value || !session.value) return

    sessionExpiredPromptOpen.value = true
    try {
      if (notifyAuthRequired()) {
        signOut()
        return
      }
      window.alert('登录状态已失效，请重新登录')
      signOut()
      await navigateTo('/login', { replace: true })
    } finally {
      sessionExpiredPromptOpen.value = false
    }
  }

  return {
    session,
    isAuthenticated,
    user,
    pagePaths,
    signIn,
    updateUser,
    setPagePaths,
    canAccessPage,
    firstAccessiblePage,
    signOut,
    handleSessionExpired
  }
}
