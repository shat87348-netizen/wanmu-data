// 把 /api/** 动态转发到 runtimeConfig.apiTarget（默认取环境变量 NUXT_API_TARGET）。
// 取代原先写在 nuxt.config.ts routeRules 里的静态 proxy：routeRules 在构建时就固定了目标地址，
// 改地址必须重新构建镜像；这里换成运行时读取，容器启动时换一下环境变量、重启容器即可生效。
export default defineEventHandler((event) => {
  const target = String(useRuntimeConfig(event).apiTarget || '').replace(/\/$/, '')
  const requestUrl = getRequestURL(event)
  const rest = requestUrl.pathname.replace(/^\/api/, '') || '/'
  // proxyRequest 不会自动补回查询字符串；显式透传它，保证 taskId 等参数到达后端。
  return proxyRequest(event, `${target}${rest}${requestUrl.search}`)
})
