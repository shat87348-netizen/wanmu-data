import type { ModuleLookupScope } from '~/composables/useModuleLookup'

const lookupScopeForPath = (path: string): ModuleLookupScope | null => {
  if (path === '/dashboard') return 'dashboard'
  if (path === '/data-viz') return 'visualization'
  if (path === '/data-collection') return 'collection'
  if (path === '/satellite-management') return 'satellite'
  if (path === '/data-process') return 'processing'
  if (path === '/calibration') return 'calibration'
  if (path === '/alarm') return 'alarms'
  if (path === '/config/user') return 'user'
  if (path === '/config/log') return 'logs'
  if (path.startsWith('/config')) return 'system'
  return null
}

export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return

  const { isAuthenticated } = useSession()
  const scope = lookupScopeForPath(to.path)
  if (!isAuthenticated.value || !scope) return

  void useModuleLookup(scope).load().catch(() => undefined)
})
