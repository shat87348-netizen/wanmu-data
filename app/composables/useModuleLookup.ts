export type LookupValue = string | number

export type LookupOption = {
  value: LookupValue
  label: string
}

export type ModuleLookup = Record<string, LookupOption[]>

export type ModuleLookupScope =
  | 'auth'
  | 'experiment'
  | 'dashboard'
  | 'user'
  | 'system'
  | 'collection'
  | 'visualization'
  | 'processing'
  | 'calibration'
  | 'alarms'
  | 'logs'
  | 'satellite'

const lookupPaths: Record<ModuleLookupScope, string> = {
  auth: '/auth/findData',
  experiment: '/experiment/tasks/findData',
  dashboard: '/dashboard/findData',
  user: '/system/users/findData',
  system: '/system/findData',
  collection: '/collection/findData',
  visualization: '/visualization/findData',
  processing: '/processing/findData',
  calibration: '/calibration/findData',
  alarms: '/alarms/findData',
  logs: '/system/logs/findData',
  satellite: '/satellite-management/findData'
}

const toOption = (value: unknown): LookupOption | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  if ((typeof item.value !== 'string' && typeof item.value !== 'number') || typeof item.label !== 'string') return null
  return { value: item.value, label: item.label }
}

const normalizeLookup = (payload: unknown): ModuleLookup => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}

  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([key, values]) => [
      key,
      Array.isArray(values) ? values.map(toOption).filter((item): item is LookupOption => item !== null) : []
    ])
  )
}

export const useModuleLookup = (scope: ModuleLookupScope) => {
  const { request } = useAdminApi()
  const lookup = useState<ModuleLookup>(`module-lookup:${scope}`, () => ({}))
  const loading = useState<boolean>(`module-lookup-loading:${scope}`, () => false)
  const loaded = useState<boolean>(`module-lookup-loaded:${scope}`, () => false)

  const options = (key: string) => lookup.value[key] || []
  const label = (key: string, value: unknown, fallback = '-') => {
    const option = options(key).find(item => String(item.value) === String(value))
    return option?.label || fallback
  }

  const load = async (force = false) => {
    if (loaded.value && !force) return lookup.value
    if (loading.value) return lookup.value

    loading.value = true
    try {
      lookup.value = normalizeLookup(await request<unknown>(lookupPaths[scope]))
      loaded.value = true
      return lookup.value
    } finally {
      loading.value = false
    }
  }

  return { lookup, loading, load, options, label }
}
