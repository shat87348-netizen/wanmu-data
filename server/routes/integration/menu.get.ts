export default defineEventHandler((event) => {
  const requestUrl = getRequestURL(event)
  const systemKey = String(useRuntimeConfig(event).public.ssoSystemKey || 'data-processing')

  return {
    systemKey,
    label: '数据处理',
    icon: 'i-lucide-cpu',
    baseUrl: requestUrl.origin,
    defaultPath: '/dashboard',
    origin: requestUrl.origin,
    menus: [
      { label: '总览', icon: 'i-lucide-layout-dashboard', path: '/dashboard' },
      { label: '数据可视化', icon: 'i-lucide-line-chart', path: '/data-viz' },
      { label: '数据采集', icon: 'i-lucide-radio-tower', path: '/data-collection' },
      { label: '卫星管理', icon: 'i-lucide-satellite-dish', path: '/satellite-management' },
      { label: '数据处理', icon: 'i-lucide-cog', path: '/data-process' },
      { label: '数据校准', icon: 'i-lucide-sliders-horizontal', path: '/calibration' },
      { label: '告警管理', icon: 'i-lucide-bell-ring', path: '/alarm' },
      {
        label: '系统配置',
        icon: 'i-lucide-settings',
        children: [
          { label: '采集代理管理', icon: 'i-lucide-server', path: '/config/agents' },
          { label: '日志管理', icon: 'i-lucide-scroll-text', path: '/config/log' },
          { label: '用户管理', icon: 'i-lucide-users', path: '/config/user' }
        ]
      }
    ]
  }
})
