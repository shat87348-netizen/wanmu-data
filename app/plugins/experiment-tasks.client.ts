/**
 * 试验任务属于整个应用会话的上下文，而不是某个页面的上下文。
 * 认证完成后仅加载一次；切换页面时 useState 会继续复用同一份任务和 taskId。
 */
export default defineNuxtPlugin(() => {
  const { isAuthenticated } = useSession()
  const { loadTasks } = useExperimentTask()

  let hasStartedForSession = false
  const start = (force = false) => {
    if (!isAuthenticated.value || hasStartedForSession) return

    hasStartedForSession = true
    void loadTasks(force)
  }

  const stop = watch(isAuthenticated, (authenticated, wasAuthenticated) => {
    if (authenticated) {
      // 同一 SPA 会话重新登录时刷新一次，避免复用上一位用户的任务列表。
      const isNewLogin = wasAuthenticated === false
      if (isNewLogin) hasStartedForSession = false
      start(isNewLogin)
    }
  }, { immediate: true })

  if (import.meta.client) window.addEventListener('pagehide', stop, { once: true })
})
