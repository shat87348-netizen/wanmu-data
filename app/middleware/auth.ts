export default defineNuxtRouteMiddleware((to) => {
  const { isAuthenticated, canAccessPage, firstAccessiblePage } = useSession()
  const isEmbeddedContent = useEmbedMode()

  if (!isAuthenticated.value) {
    // iframe SSO 由客户端插件处理；这里允许内容页先进入等待态。
    if (isEmbeddedContent.value) return
    return navigateTo('/login')
  }

  // 页面级权限：登录后由 /auth/routes 返回的路径控制；暂不处理按钮权限。
  if (!canAccessPage(to.path) && firstAccessiblePage.value && firstAccessiblePage.value !== to.path) {
    return navigateTo({ path: firstAccessiblePage.value, query: to.query })
  }
})
