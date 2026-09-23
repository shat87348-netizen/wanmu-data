export default defineNuxtRouteMiddleware(() => {
  const { isAuthenticated } = useSession()
  const isEmbeddedContent = useEmbedMode()

  if (isAuthenticated.value) return navigateTo('/dashboard', { replace: true })

  // iframe 内不展示子系统登录表单；由宿主发起子系统自己的 SSO 流程。
  if (isEmbeddedContent.value) {
    return navigateTo('/dashboard', { replace: true })
  }
})
