<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

type CollectionInterface = {
  id?: number
  taskId?: string
  interfaceName?: string
  interfaceType?: number
  sendFrom?: string
  messageContent?: string
  transferType?: number
  transferProtocol?: number
  transferProtocolName?: string
  rpcEnabled?: number
  rpcEnabledName?: string
  host?: string
  port?: number
  status?: number
  enabled?: number
  protocolConfigId?: number
  protocolConfigName?: string
  remark?: string
  dataPacketCount?: number
}

type CollectionInterfacePage = {
  records?: CollectionInterface[]
}

type CollectionOverview = {
  interfaceTotal?: number
  onlineTotal?: number
  todayCollectionCount?: number
}

type CollectionEventsOverview = {
  infoTotal?: number
  warningTotal?: number
  errorTotal?: number
  criticalTotal?: number
}

type CollectionEvent = {
  id?: number
  logTime?: string
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  logLevelName?: string
  logSource?: string
  operatorId?: string
  logContent?: string
  logDetail?: string
}

type ProtocolConfig = {
  id?: number
  taskId?: string
  configName?: string
  protocolType?: number
  dataSourceType?: number
  configDesc?: string
  configParams?: Record<string, unknown>
  parserClass?: string | null
  enabled?: number
}

type DeviceSatellite = {
  id: number
  code?: string
  name?: string
  type: '1' | '2'
}

type ProtocolRule = Record<string, unknown>

type ProtocolSourceScope = 'satellite' | 'device'

const activeTab = ref<'interface' | 'protocol'>('interface')
const { request } = useAdminApi()
const { taskId } = useTaskContext()
const toast = useToast()
const { loading: optionLoading, load: loadCollectionLookup, options: collectionOptions, label: collectionLabel } = useModuleLookup('collection')
const interfaceTypeFilter = ref('')
const transferTypeFilter = ref('')
const interfaces = ref<CollectionInterface[]>([])
const interfacesLoading = ref(false)
const collectionOverview = ref<CollectionOverview | null>(null)
const collectionEventsOverview = ref<CollectionEventsOverview | null>(null)
const collectionOverviewLoading = ref(false)
const collectionEventsData = ref<unknown>(null)
const collectionEventsLoading = ref(false)
let collectionRefreshTimer: ReturnType<typeof setInterval> | undefined
const refreshCollectionData = () => {
  void loadCollectionOverview(true)
  void loadCollectionEvents(true)
}
const startCollectionRefresh = () => {
  if (collectionRefreshTimer) return
  collectionRefreshTimer = setInterval(refreshCollectionData, 3000)
}
const stopCollectionRefresh = () => {
  if (!collectionRefreshTimer) return
  clearInterval(collectionRefreshTimer)
  collectionRefreshTimer = undefined
}
// 标签页切到后台时暂停 3 秒轮询，切回来立即补一次刷新，避免看着页面时没有任何变化，
// 只是省掉不在看这页时白白发的请求。
const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    stopCollectionRefresh()
  } else {
    refreshCollectionData()
    startCollectionRefresh()
  }
}
let collectionOverviewSilentRefreshing = false
let collectionEventsSilentRefreshing = false
const isInterfaceDialogOpen = ref(false)
const submitting = ref(false)
const interfaceActionId = ref<number | null>(null)
const editingInterfaceId = ref<number | null>(null)
const editingInterfaceStatus = ref(0)
const protocolConfigs = ref<ProtocolConfig[]>([])
const isProtocolDialogOpen = ref(false)
const protocolSubmitting = ref(false)
const protocolActionId = ref<number | null>(null)
const editingProtocolId = ref<number | null>(null)
const protocolParserClass = ref<string | null>(null)
const protocolExtraParams = ref<Record<string, unknown>>({})
const protocolSourcesLoading = ref(false)
const protocolRulesLoading = ref(false)
const protocolSources = ref<DeviceSatellite[]>([])
const selectedProtocolSourceId = ref<number | null>(null)
const protocolRules = ref<ProtocolRule[]>([])
const protocolSourceScope = ref<ProtocolSourceScope>('satellite')
const interfaceForm = reactive({
  interfaceName: '',
  interfaceType: '',
  sendFrom: '',
  messageContent: '',
  transferType: '',
  transferProtocol: '',
  rpcEnabled: '0',
  protocolConfigId: '',
  host: '',
  port: '',
  enabled: true,
  remark: ''
})
const protocolForm = reactive({
  configName: '',
  protocolType: '',
  dataSourceType: '',
  configDesc: '',
  enabled: true
})
const pdxpHeader = reactive({
  ver: '',
  mid: '',
  sid: '',
  did: '',
  bid: '',
  no: '',
  flag: '',
  res: ''
})

const protocolOptions = computed(() => protocolConfigs.value.filter(item => item.id !== undefined && item.id !== null))
const protocolSourceOptions = computed(() => protocolSources.value.filter(item => item.type === (protocolSourceScope.value === 'satellite' ? '1' : '2')))
const selectedProtocolSource = computed(() => protocolSourceOptions.value.find(item => item.id === selectedProtocolSourceId.value) || null)
const isPdxpProtocol = computed(() => Number(protocolForm.protocolType) === 2)

const valueOrDash = (value: unknown) => value === undefined || value === null || value === '' ? '-' : String(value)
const formatAddress = (item: CollectionInterface) => item.host ? `${item.host}${item.port === undefined || item.port === null || item.port === '' ? '' : `:${item.port}`}` : '-'
const packetCount = (item: CollectionInterface) => valueOrDash(item.dataPacketCount)
const traffic = () => '-'
const formatCount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '--'
const overviewMetrics = computed(() => ({
  totalInterfaces: formatCount(collectionOverview.value?.interfaceTotal),
  onlineInterfaces: formatCount(collectionOverview.value?.onlineTotal),
  abnormalInterfaces: collectionOverview.value
    ? formatCount(Math.max(0, Number(collectionOverview.value.interfaceTotal || 0) - Number(collectionOverview.value.onlineTotal || 0)))
    : '--',
  todayCollection: formatCount(collectionOverview.value?.todayCollectionCount)
}))
const collectionEvents = computed<CollectionEvent[]>(() => {
  const payload = collectionEventsData.value
  if (Array.isArray(payload)) return payload.filter((item): item is CollectionEvent => Boolean(item && typeof item === 'object'))
  return []
})
const eventLevel = (event: CollectionEvent) => String(event.logLevel || '').trim().toLowerCase()
const eventKind = (event: CollectionEvent) => {
  const level = eventLevel(event)
  if (level.includes('严重') || level.includes('critical') || level.includes('fatal')) return 'critical'
  if (level.includes('错误') || level.includes('error')) return 'error'
  if (level.includes('警告') || level.includes('warning') || level.includes('warn')) return 'warning'
  return 'info'
}
const eventMetrics = computed(() => ({
  info: Number(collectionEventsOverview.value?.infoTotal || 0),
  warning: Number(collectionEventsOverview.value?.warningTotal || 0),
  error: Number(collectionEventsOverview.value?.errorTotal || 0),
  critical: Number(collectionEventsOverview.value?.criticalTotal || 0)
}))
const eventTitle = (event: CollectionEvent) => asText(event.logContent || '接口事件')
const eventTime = (event: CollectionEvent) => asText(event.logTime)
const eventSource = (event: CollectionEvent) => asText(event.logSource)
const statusLabel = (status: unknown) => collectionLabel('status', status)
const statusClass = (status: unknown) => `status-${Number(status)}`
const protocolOptionLabel = (item: ProtocolConfig) => item.configName || `配置 #${item.id}`
const sourceLabel = (item: DeviceSatellite) => item.name || item.code || `ID ${item.id}`
const protocolId = (item: ProtocolConfig) => {
  const id = Number(item.id)
  return Number.isInteger(id) && id > 0 ? id : null
}
const protocolEnabled = (item: ProtocolConfig) => item.enabled === true || Number(item.enabled) === 1
const interfaceId = (item: CollectionInterface) => {
  const id = Number(item.id)
  return Number.isInteger(id) && id > 0 ? id : null
}
const interfaceEnabled = (item: CollectionInterface) => Number(item.enabled) === 1
const asObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
const asText = (value: unknown) => value === undefined || value === null ? '' : String(value)
const processingModeLabel = (value: unknown) => {
  if (Number(value) === 0) return '处理'
  if (Number(value) === 1) return '转发'
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'PROCESS' || normalized === 'PROCESSING' || normalized === '1') return '处理'
  if (normalized === 'FORWARD' || normalized === 'FORWARDING' || normalized === '2') return '转发'
  return '-'
}
const interfaceProcessingMode = (item: CollectionInterface) => item.rpcEnabled

const taskQuery = () => taskId.value ? `?taskId=${encodeURIComponent(taskId.value)}` : ''

const interfacesPath = () => {
  const params = new URLSearchParams({ pageNum: '1', pageSize: '100' })
  if (taskId.value) params.set('taskId', taskId.value)
  if (interfaceTypeFilter.value) params.set('interfaceType', interfaceTypeFilter.value)
  if (transferTypeFilter.value) params.set('transferType', transferTypeFilter.value)
  return `/collection/interfaces?${params.toString()}`
}

const loadInterfaces = async () => {
  interfacesLoading.value = true
  try {
    const data = await request<CollectionInterfacePage>(interfacesPath())
    interfaces.value = Array.isArray(data?.records) ? data.records : []
  } catch (error) {
    interfaces.value = []
    toast.add({ title: '采集接口加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    interfacesLoading.value = false
  }
}

const loadCollectionOverview = async (silent = false) => {
  if (silent && collectionOverviewSilentRefreshing) return
  const requestedTaskId = taskId.value
  if (silent) collectionOverviewSilentRefreshing = true
  else collectionOverviewLoading.value = true
  try {
    if (!requestedTaskId) {
      collectionOverview.value = null
      return
    }
    const data = await request<CollectionOverview>(`/collection/overview${taskQuery()}`)
    if (taskId.value === requestedTaskId) collectionOverview.value = data || null
  } catch (error) {
    if (!silent && taskId.value === requestedTaskId) {
      collectionOverview.value = null
      toast.add({ title: '采集概览加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
    }
  } finally {
    if (silent) collectionOverviewSilentRefreshing = false
    else if (taskId.value === requestedTaskId) collectionOverviewLoading.value = false
  }
}

const loadCollectionEvents = async (silent = false) => {
  if (silent && collectionEventsSilentRefreshing) return
  const requestedTaskId = taskId.value
  if (silent) collectionEventsSilentRefreshing = true
  else collectionEventsLoading.value = true
  try {
    const [overview, events] = await Promise.all([
      request<CollectionEventsOverview>(`/collection/events/overview${taskQuery()}`),
      request<CollectionEvent[]>(`/collection/events${taskQuery()}`)
    ])
    if (taskId.value === requestedTaskId) {
      collectionEventsOverview.value = overview || null
      collectionEventsData.value = Array.isArray(events) ? events : []
    }
  } catch (error) {
    if (!silent && taskId.value === requestedTaskId) {
      collectionEventsData.value = null
      collectionEventsOverview.value = null
      toast.add({ title: '接口事件加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
    }
  } finally {
    if (silent) collectionEventsSilentRefreshing = false
    else if (taskId.value === requestedTaskId) collectionEventsLoading.value = false
  }
}

const loadOptions = async () => {
  try {
    const [, protocols] = await Promise.all([
      loadCollectionLookup(),
      request<ProtocolConfig[]>(`/collection/protocols${taskQuery()}`)
    ])
    protocolConfigs.value = Array.isArray(protocols) ? protocols : []
  } catch (error) {
    toast.add({ title: '接口配置选项加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const loadProtocolSources = async (loadRules = true) => {
  if (!taskId.value) {
    protocolSources.value = []
    selectedProtocolSourceId.value = null
    if (loadRules) protocolRules.value = []
    return
  }

  protocolSourcesLoading.value = true
  try {
    const data = await request<unknown[]>(`/processing/device-satellites?taskId=${encodeURIComponent(taskId.value)}`)
    protocolSources.value = Array.isArray(data)
      ? data
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map(item => ({
          id: Number(item.id),
          code: typeof item.code === 'string' ? item.code : '',
          name: typeof item.name === 'string' ? item.name : '',
          type: String(item.type) === '2' ? '2' : '1'
        }))
        .filter(item => Number.isFinite(item.id) && item.id > 0)
      : []
    selectDefaultProtocolSource()
    if (loadRules) await loadProtocolRules()
  } catch (error) {
    protocolSources.value = []
    selectedProtocolSourceId.value = null
    if (loadRules) protocolRules.value = []
    toast.add({ title: '卫星/设备列表加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolSourcesLoading.value = false
  }
}

const loadProtocolRules = async () => {
  const source = selectedProtocolSource.value
  if (!taskId.value || !source) {
    protocolRules.value = []
    return
  }

  protocolRulesLoading.value = true
  try {
    const params = new URLSearchParams({ taskId: taskId.value, deviceSatelliteId: String(source.id) })
    const data = await request<unknown[]>(`/processing/rules?${params.toString()}`)
    protocolRules.value = Array.isArray(data)
      ? data.filter((item): item is ProtocolRule => Boolean(item && typeof item === 'object'))
      : []
  } catch (error) {
    protocolRules.value = []
    toast.add({ title: '参数解析配置加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolRulesLoading.value = false
  }
}

const selectDefaultProtocolSource = () => {
  if (protocolSourceOptions.value.some(item => item.id === selectedProtocolSourceId.value)) return
  selectedProtocolSourceId.value = protocolSourceOptions.value[0]?.id || null
}

const switchProtocolSourceScope = (scope: ProtocolSourceScope) => {
  if (protocolSourceScope.value === scope) return
  protocolSourceScope.value = scope
  selectDefaultProtocolSource()
  void loadProtocolRules()
}

const selectProtocolSource = (id: number) => {
  selectedProtocolSourceId.value = id
  void loadProtocolRules()
}

const resetProtocolForm = () => {
  Object.assign(protocolForm, { configName: '', protocolType: '', dataSourceType: '', configDesc: '', enabled: true })
  Object.assign(pdxpHeader, { ver: '', mid: '', sid: '', did: '', bid: '', no: '', flag: '', res: '' })
  editingProtocolId.value = null
  protocolParserClass.value = null
  protocolExtraParams.value = {}
  protocolSourceScope.value = 'satellite'
  selectedProtocolSourceId.value = null
  protocolRules.value = []
}

const openCreateProtocol = async () => {
  if (!taskId.value) {
    toast.add({ title: '请先选择试验任务', color: 'warning' })
    return
  }
  resetProtocolForm()
  isProtocolDialogOpen.value = true
  await loadCollectionLookup()
  await loadProtocolSources()
}

const fillProtocolForm = (config: ProtocolConfig) => {
  const configParams = asObject(config.configParams)
  const pdxphead = asObject(configParams.pdxphead)
  const { fields, pdxphead: _pdxphead, ...extraParams } = configParams

  Object.assign(protocolForm, {
    configName: asText(config.configName),
    protocolType: config.protocolType === undefined || config.protocolType === null ? '' : String(config.protocolType),
    dataSourceType: config.dataSourceType === undefined || config.dataSourceType === null ? '' : String(config.dataSourceType),
    configDesc: asText(config.configDesc),
    enabled: protocolEnabled(config)
  })
  Object.assign(pdxpHeader, {
    ver: asText(pdxphead.ver),
    mid: asText(pdxphead.mid),
    sid: asText(pdxphead.sid),
    did: asText(pdxphead.did),
    bid: asText(pdxphead.bid),
    no: asText(pdxphead.no),
    flag: asText(pdxphead.flag),
    res: asText(pdxphead.res)
  })
  protocolExtraParams.value = extraParams
  protocolParserClass.value = config.parserClass || null
  protocolRules.value = Array.isArray(fields)
    ? fields.filter((item): item is ProtocolRule => Boolean(item && typeof item === 'object')).map(item => ({ ...item }))
    : []
}

const openEditProtocol = async (item: ProtocolConfig) => {
  const id = protocolId(item)
  if (!id) {
    toast.add({ title: '该协议配置缺少有效标识，无法编辑', color: 'error' })
    return
  }

  resetProtocolForm()
  editingProtocolId.value = id
  isProtocolDialogOpen.value = true
  protocolSubmitting.value = true
  try {
    const [config] = await Promise.all([
      request<ProtocolConfig>(`/collection/protocols/${id}`),
      loadCollectionLookup()
    ])
    fillProtocolForm(config)
    await loadProtocolSources(false)
  } catch (error) {
    isProtocolDialogOpen.value = false
    toast.add({ title: '协议配置详情加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolSubmitting.value = false
  }
}

const closeProtocolDialog = () => {
  if (!protocolSubmitting.value) {
    isProtocolDialogOpen.value = false
    editingProtocolId.value = null
  }
}

// 表格只呈现可编辑的部分字段；提交时必须保留查询结果中的完整规则。
const protocolField = (rule: ProtocolRule): ProtocolRule => ({ ...rule })

const saveProtocol = async () => {
  const source = selectedProtocolSource.value
  const protocolType = Number(protocolForm.protocolType)
  const dataSourceType = Number(protocolForm.dataSourceType)
  if (!protocolForm.configName.trim() || !source || !Number.isInteger(protocolType) || !Number.isInteger(dataSourceType)) {
    toast.add({ title: '请填写配置名称、协议类型、数据类型并选择卫星或设备', color: 'warning' })
    return
  }

  const configParams: Record<string, unknown> = { ...protocolExtraParams.value, fields: protocolRules.value.map(protocolField) }
  if (isPdxpProtocol.value) {
    configParams.pdxphead = Object.fromEntries(
      Object.entries(pdxpHeader).map(([key, value]) => [key, value.trim() || null])
    )
  }

  const body: Record<string, unknown> = {
    taskId: taskId.value,
    configName: protocolForm.configName.trim(),
    protocolType,
    dataSourceType,
    configDesc: protocolForm.configDesc.trim(),
    configParams,
    enabled: protocolForm.enabled ? 1 : 0
  }
  if (editingProtocolId.value) body.id = editingProtocolId.value
  if (protocolParserClass.value) body.parserClass = protocolParserClass.value

  protocolSubmitting.value = true
  try {
    const editing = Boolean(editingProtocolId.value)
    await request<void>(editing ? '/collection/protocols/update' : '/collection/protocols/create', { method: 'POST', body })
    toast.add({ title: editing ? '协议配置已更新' : '协议配置已创建', color: 'success' })
    isProtocolDialogOpen.value = false
    await loadOptions()
  } catch (error) {
    toast.add({ title: editingProtocolId.value ? '协议配置更新失败' : '协议配置创建失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolSubmitting.value = false
  }
}

const toggleProtocolEnabled = async (item: ProtocolConfig) => {
  const id = protocolId(item)
  if (!id) {
    toast.add({ title: '该协议配置缺少有效标识，无法更新状态', color: 'error' })
    return
  }

  const enabled = protocolEnabled(item) ? 0 : 1
  protocolActionId.value = id
  try {
    await request<void>('/collection/protocols/enabled', { method: 'POST', body: { id, enabled } })
    item.enabled = enabled
    toast.add({ title: enabled ? '协议配置已启用' : '协议配置已停用', color: 'success' })
  } catch (error) {
    toast.add({ title: '协议配置状态更新失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolActionId.value = null
  }
}

const deleteProtocol = async (item: ProtocolConfig) => {
  const id = protocolId(item)
  if (!id) {
    toast.add({ title: '该协议配置缺少有效标识，无法删除', color: 'error' })
    return
  }
  if (import.meta.client && !window.confirm(`确定删除协议配置“${protocolOptionLabel(item)}”吗？`)) return

  protocolActionId.value = id
  try {
    await request<void>('/collection/protocols/delete', { method: 'POST', body: { id } })
    toast.add({ title: '协议配置已删除', color: 'success' })
    await loadOptions()
  } catch (error) {
    toast.add({ title: '协议配置删除失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    protocolActionId.value = null
  }
}

const resetInterfaceForm = () => {
  Object.assign(interfaceForm, {
    interfaceName: '',
    interfaceType: '',
    sendFrom: '',
    messageContent: '',
    transferType: '',
    transferProtocol: '',
    rpcEnabled: '0',
    protocolConfigId: '',
    host: '',
    port: '',
    enabled: true,
    remark: ''
  })
  editingInterfaceId.value = null
  editingInterfaceStatus.value = 0
}

const openCreateInterface = async () => {
  resetInterfaceForm()
  isInterfaceDialogOpen.value = true
  await loadOptions()
}

const closeInterfaceDialog = () => {
  if (!submitting.value) {
    isInterfaceDialogOpen.value = false
    editingInterfaceId.value = null
  }
}

const fillInterfaceForm = (item: CollectionInterface) => {
  Object.assign(interfaceForm, {
    interfaceName: asText(item.interfaceName),
    interfaceType: item.interfaceType === undefined || item.interfaceType === null ? '' : String(item.interfaceType),
    sendFrom: asText(item.sendFrom),
    messageContent: asText(item.messageContent),
    transferType: item.transferType === undefined || item.transferType === null ? '' : String(item.transferType),
    transferProtocol: item.transferProtocol === undefined || item.transferProtocol === null ? '' : String(item.transferProtocol),
    rpcEnabled: Number(item.rpcEnabled) === 1 ? '1' : '0',
    protocolConfigId: item.protocolConfigId === undefined || item.protocolConfigId === null ? '' : String(item.protocolConfigId),
    host: asText(item.host),
    port: item.port === undefined || item.port === null ? '' : String(item.port),
    enabled: interfaceEnabled(item),
    remark: asText(item.remark)
  })
  const status = Number(item.status)
  editingInterfaceStatus.value = Number.isInteger(status) ? status : 0
}

const openEditInterface = async (item: CollectionInterface) => {
  const id = interfaceId(item)
  if (!id) {
    toast.add({ title: '该采集接口缺少有效标识，无法编辑', color: 'error' })
    return
  }

  resetInterfaceForm()
  editingInterfaceId.value = id
  isInterfaceDialogOpen.value = true
  submitting.value = true
  try {
    const [detail] = await Promise.all([
      request<CollectionInterface>(`/collection/interfaces/${id}`),
      loadOptions()
    ])
    fillInterfaceForm(detail)
  } catch (error) {
    isInterfaceDialogOpen.value = false
    editingInterfaceId.value = null
    toast.add({ title: '采集接口详情加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    submitting.value = false
  }
}

const saveInterface = async () => {
  const port = Number(interfaceForm.port)
  const protocolConfigId = Number(interfaceForm.protocolConfigId)
  const rpcEnabled = Number(interfaceForm.rpcEnabled)
  const transferProtocol = Number(interfaceForm.transferProtocol)
  if (!taskId.value || !interfaceForm.interfaceName.trim() || !interfaceForm.interfaceType || !interfaceForm.transferType || !interfaceForm.host.trim() || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(protocolConfigId) || protocolConfigId < 1 || !Number.isInteger(rpcEnabled)) {
    toast.add({ title: '请填写任务、接口名称、类型、传输方式、地址、端口并选择协议配置', color: 'warning' })
    return
  }

  const body: Record<string, unknown> = {
    taskId: taskId.value,
    interfaceName: interfaceForm.interfaceName.trim(),
    interfaceType: Number(interfaceForm.interfaceType),
    transferType: Number(interfaceForm.transferType),
    protocolConfigId,
    host: interfaceForm.host.trim(),
    port,
    status: editingInterfaceId.value ? editingInterfaceStatus.value : 0,
    enabled: interfaceForm.enabled ? 1 : 0,
    rpcEnabled
  }
  if (interfaceForm.sendFrom.trim()) body.sendFrom = interfaceForm.sendFrom.trim()
  if (interfaceForm.messageContent.trim()) body.messageContent = interfaceForm.messageContent.trim()
  if (Number.isInteger(transferProtocol) && transferProtocol > 0) body.transferProtocol = transferProtocol
  if (interfaceForm.remark.trim()) body.remark = interfaceForm.remark.trim()

  submitting.value = true
  try {
    const editing = Boolean(editingInterfaceId.value)
    if (editingInterfaceId.value) body.id = editingInterfaceId.value
    await request<void>(editing ? '/collection/interfaces/update' : '/collection/interfaces/create', { method: 'POST', body })
    toast.add({ title: editing ? '采集接口已更新' : '采集接口已创建', color: 'success' })
    isInterfaceDialogOpen.value = false
    await loadInterfaces()
  } catch (error) {
    toast.add({ title: editingInterfaceId.value ? '采集接口更新失败' : '采集接口创建失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    submitting.value = false
  }
}

const toggleInterfaceEnabled = async (item: CollectionInterface) => {
  const id = interfaceId(item)
  if (!id) {
    toast.add({ title: '该采集接口缺少有效标识，无法更新状态', color: 'error' })
    return
  }

  const enabled = interfaceEnabled(item) ? 0 : 1
  interfaceActionId.value = id
  try {
    await request<void>('/collection/interfaces/enabled', { method: 'POST', body: { id, enabled } })
    item.enabled = enabled
    toast.add({ title: enabled ? '采集接口已启用' : '采集接口已禁用', color: 'success' })
  } catch (error) {
    toast.add({ title: '采集接口状态更新失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    interfaceActionId.value = null
  }
}

const deleteInterface = async (item: CollectionInterface) => {
  const id = interfaceId(item)
  if (!id) {
    toast.add({ title: '该采集接口缺少有效标识，无法删除', color: 'error' })
    return
  }
  if (import.meta.client && !window.confirm(`确定删除采集接口“${asText(item.interfaceName) || `#${id}`}”吗？`)) return

  interfaceActionId.value = id
  try {
    await request<void>('/collection/interfaces/delete', { method: 'POST', body: { id } })
    toast.add({ title: '采集接口已删除', color: 'success' })
    await loadInterfaces()
  } catch (error) {
    toast.add({ title: '采集接口删除失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    interfaceActionId.value = null
  }
}

onMounted(() => {
  void loadInterfaces()
  void loadOptions()
  void loadCollectionOverview(true)
  void loadCollectionEvents(true)
  if (document.visibilityState !== 'hidden') startCollectionRefresh()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

watch(taskId, () => {
  void loadInterfaces()
  void loadOptions()
  void loadCollectionOverview(true)
  void loadCollectionEvents(true)
})

onUnmounted(() => {
  stopCollectionRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <main class="data-collection-page">
    <section class="collection-stat-grid" aria-label="采集概况">
      <article class="stat-card stat-card--blue">
        <div><p>采集接口总数</p><strong>{{ collectionOverviewLoading ? '--' : overviewMetrics.totalInterfaces }}</strong></div>
      </article>
      <article class="stat-card stat-card--green">
        <div><p>在线接口</p><strong>{{ collectionOverviewLoading ? '--' : overviewMetrics.onlineInterfaces }}</strong></div>
      </article>
      <article class="stat-card stat-card--red">
        <div><p>异常接口</p><strong>{{ collectionOverviewLoading ? '--' : overviewMetrics.abnormalInterfaces }}</strong></div>
      </article>
      <article class="stat-card stat-card--amber">
        <div><p>今日采集量</p><strong>{{ collectionOverviewLoading ? '--' : overviewMetrics.todayCollection }}</strong></div>
      </article>
    </section>

    <nav class="collection-tabs" aria-label="数据采集功能">
      <UButton
        type="button"
        :class="{ 'is-active': activeTab === 'interface' }"
        @click="activeTab = 'interface'"
      >接口管理</UButton>
      <UButton
        type="button"
        :class="{ 'is-active': activeTab === 'protocol' }"
        @click="activeTab = 'protocol'"
      >协议配置</UButton>
    </nav>

    <template v-if="activeTab === 'interface'">
      <div class="collection-workspace">
        <section class="collection-card interface-card">
          <header class="card-header">
            <h2>采集接口管理</h2>
            <div class="header-actions">
              <label class="filter-select">
                <AppSelect v-model="interfaceTypeFilter" aria-label="接口类型" @change="loadInterfaces"><option value="">接口类型</option><option v-for="option in collectionOptions('interfaceType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect>
                <UIcon name="i-lucide-chevron-down" />
              </label>
              <label class="filter-select">
                <AppSelect v-model="transferTypeFilter" aria-label="传输方式" @change="loadInterfaces"><option value="">传输方式</option><option v-for="option in collectionOptions('transferType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect>
                <UIcon name="i-lucide-chevron-down" />
              </label>
              <UButton type="button" class="outline-button icon-only" :disabled="interfacesLoading" aria-label="刷新采集接口" title="刷新" @click="loadInterfaces"><UIcon name="i-lucide-refresh-cw" /></UButton>
              <UButton type="button" class="primary-button" @click="openCreateInterface"><UIcon name="i-lucide-plus" />新增接口</UButton>
            </div>
          </header>
          <div class="table-scroll">
            <table class="collection-table interface-table">
              <thead>
                <tr>
                  <th>发送方</th><th>信息内容</th><th>接口名称</th><th>类型</th>
                  <th>传输方式</th><th>传输协议</th><th>处理方式</th><th>地址</th><th>状态</th>
                  <th>数据包</th><th>流量</th><th>启用</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="interfacesLoading"><td colspan="13" class="empty-cell">加载中...</td></tr>
                <tr v-else-if="!interfaces.length"><td colspan="13" class="empty-cell">暂无采集接口</td></tr>
                <tr v-for="item in interfaces" :key="item.id || item.interfaceName">
                  <td>{{ valueOrDash(item.sendFrom) }}</td>
                  <td class="ellipsis-cell">{{ valueOrDash(item.messageContent) }}</td>
                  <td>{{ valueOrDash(item.interfaceName) }}</td>
                  <td>{{ collectionLabel('interfaceType', item.interfaceType) }}</td>
                  <td>{{ collectionLabel('transferType', item.transferType) }}</td>
                  <td>{{ collectionLabel('transferProtocol', item.transferProtocol, valueOrDash(item.transferProtocol)) }}</td>
                  <td>{{ processingModeLabel(interfaceProcessingMode(item)) }}</td>
                  <td class="address-cell">{{ formatAddress(item) }}</td>
                  <td><span :class="['status-tag', statusClass(item.status)]">{{ statusLabel(item.status) }}</span></td>
                  <td>{{ packetCount(item) }}</td>
                  <td>{{ traffic(item) }}</td>
                  <td>
                    <UButton
                      type="button"
                      :class="['interface-enabled-switch', { 'is-enabled': interfaceEnabled(item) }]"
                      :aria-label="interfaceEnabled(item) ? '禁用采集接口' : '启用采集接口'"
                      :aria-pressed="interfaceEnabled(item)"
                      :disabled="interfaceActionId === interfaceId(item)"
                      @click="toggleInterfaceEnabled(item)"
                    ><i></i></UButton>
                  </td>
                  <td class="interface-action-cell">
                    <UButton type="button" class="table-action" :disabled="interfaceActionId === interfaceId(item)" @click="openEditInterface(item)">编辑</UButton>
                    <UButton type="button" class="table-action table-action--danger" :disabled="interfaceActionId === interfaceId(item)" @click="deleteInterface(item)">删除</UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="collection-card event-card">
          <header class="card-header">
            <h2>接口事件监控</h2>
            <UButton type="button" class="outline-button" :disabled="collectionEventsLoading" @click="loadCollectionEvents"><UIcon name="i-lucide-refresh-cw" :class="{ 'spin-icon': collectionEventsLoading }" />刷新</UButton>
          </header>
          <div class="event-summary">
            <div><span>信息</span><strong>{{ collectionEventsLoading ? '--' : eventMetrics.info }}</strong></div>
            <div><span>警告</span><strong>{{ collectionEventsLoading ? '--' : eventMetrics.warning }}</strong></div>
            <div><span>错误</span><strong>{{ collectionEventsLoading ? '--' : eventMetrics.error }}</strong></div>
            <div><span>严重</span><strong>{{ collectionEventsLoading ? '--' : eventMetrics.critical }}</strong></div>
          </div>
          <div v-if="collectionEventsLoading" class="event-empty-state">
            <UIcon name="i-lucide-loader-circle" class="spin-icon" />
            <span>正在读取接口事件...</span>
          </div>
          <div v-else-if="!collectionEvents.length" class="event-empty-state">
            <UIcon name="i-lucide-list-tree" />
            <span>暂无接口事件</span>
          </div>
          <div v-else class="event-list">
            <article v-for="(event, index) in collectionEvents" :key="String(event.id ?? index)" :class="['event-item', `event-item--${eventKind(event)}`]">
              <span class="event-item__dot"></span>
              <div class="event-item__content"><strong>{{ eventTitle(event) }}</strong><small v-if="eventSource(event)">{{ eventSource(event) }}</small></div>
              <time v-if="eventTime(event)">{{ eventTime(event) }}</time>
            </article>
          </div>
        </section>
      </div>
    </template>

    <section v-else class="collection-card protocol-card">
      <header class="card-header">
        <h2>协议解析配置</h2>
        <UButton type="button" class="primary-button" @click="openCreateProtocol"><UIcon name="i-lucide-plus" />新增配置</UButton>
      </header>
      <div class="table-scroll">
        <table class="collection-table protocol-table">
          <thead>
            <tr><th>配置名称</th><th>协议类型</th><th>描述</th><th>启用</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-if="!protocolConfigs.length"><td colspan="5" class="empty-cell">暂无协议配置</td></tr>
            <tr v-for="item in protocolConfigs" :key="item.id || item.configName">
              <td>{{ valueOrDash(item.configName) }}</td>
              <td>{{ collectionLabel('protocolType', item.protocolType) }}</td>
              <td>{{ valueOrDash(item.configDesc) }}</td>
              <td>
                <UButton
                  type="button"
                  :class="['protocol-enabled-switch', { 'is-enabled': protocolEnabled(item) }]"
                  :aria-label="protocolEnabled(item) ? '停用协议配置' : '启用协议配置'"
                  :aria-pressed="protocolEnabled(item)"
                  :disabled="protocolActionId === protocolId(item)"
                  @click="toggleProtocolEnabled(item)"
                ><i></i></UButton>
              </td>
              <td class="protocol-action-cell">
                <UButton type="button" class="table-action" :disabled="protocolActionId === protocolId(item)" @click="openEditProtocol(item)">编辑</UButton>
                <UButton type="button" class="table-action table-action--danger" :disabled="protocolActionId === protocolId(item)" @click="deleteProtocol(item)">删除</UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="isProtocolDialogOpen" class="modal-layer" @click.self="closeProtocolDialog">
        <section class="interface-dialog protocol-dialog" role="dialog" aria-modal="true" aria-labelledby="protocol-dialog-title">
          <header class="modal-header">
            <div><h2 id="protocol-dialog-title">{{ editingProtocolId ? '编辑协议配置' : '新增协议配置' }}</h2><p>{{ editingProtocolId ? '更新协议配置及其帧头、参数解析规则' : '选择参数解析配置中的卫星或设备，作为协议解析字段来源' }}</p></div>
            <UButton type="button" class="icon-button" aria-label="关闭" :disabled="protocolSubmitting" @click="closeProtocolDialog"><UIcon name="i-lucide-x" /></UButton>
          </header>
          <form class="interface-form" @submit.prevent="saveProtocol">
            <div class="form-grid">
              <label class="form-field"><span>配置名称 <b>*</b></span><UInput v-model.trim="protocolForm.configName" type="text" autocomplete="off" maxlength="100" placeholder="请输入配置名称" class="app-input" /></label>
              <label class="form-field"><span>协议类型 <b>*</b></span><AppSelect v-model="protocolForm.protocolType"><option value="" disabled>请选择协议类型</option><option v-for="option in collectionOptions('protocolType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect></label>
              <label class="form-field"><span>数据类型 <b>*</b></span><AppSelect v-model="protocolForm.dataSourceType"><option value="" disabled>请选择数据类型</option><option v-for="option in collectionOptions('dataSourceType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect></label>
              <label class="form-field"><span>描述</span><UInput v-model.trim="protocolForm.configDesc" type="text" autocomplete="off" maxlength="200" placeholder="请输入描述" class="app-input" /></label>
            </div>

            <section v-if="isPdxpProtocol" class="pdxp-header-section" aria-label="PDXP 帧头配置">
              <header><div><h3>帧头配置</h3><p>填写 PDXP 数据包帧头的固定字段；留空字段将按空值提交。</p></div><span>PDXP</span></header>
              <div class="pdxp-header-scroll">
                <table class="pdxp-header-table">
                  <thead><tr><th>字段名</th><th>标识</th><th>值</th></tr></thead>
                  <tbody>
                    <tr><td>版本</td><td>VER</td><td><UInput v-model.trim="pdxpHeader.ver" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>任务标志</td><td>MID</td><td><UInput v-model.trim="pdxpHeader.mid" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>信源地址</td><td>SID</td><td><UInput v-model.trim="pdxpHeader.sid" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>信宿地址</td><td>DID</td><td><UInput v-model.trim="pdxpHeader.did" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>数据标志</td><td>BID</td><td><UInput v-model.trim="pdxpHeader.bid" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>包序号</td><td>NO</td><td><UInput v-model.trim="pdxpHeader.no" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>处理标志</td><td>FLAG</td><td><UInput v-model.trim="pdxpHeader.flag" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                    <tr><td>保留</td><td>RES</td><td><UInput v-model.trim="pdxpHeader.res" autocomplete="off" placeholder="请输入值" class="app-input" /></td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section class="protocol-source-section" aria-label="参数解析配置来源">
              <header><div><h3>参数解析配置来源 <b>*</b></h3><p>所选对象的参数规则将用于此协议配置。</p></div><span v-if="protocolRulesLoading" class="source-loading"><UIcon name="i-lucide-loader-circle" class="spin-icon" />读取规则中...</span></header>
              <nav class="protocol-source-tabs" aria-label="来源类型">
                <UButton type="button" :class="{ active: protocolSourceScope === 'satellite' }" @click="switchProtocolSourceScope('satellite')">卫星</UButton>
                <UButton type="button" :class="{ active: protocolSourceScope === 'device' }" @click="switchProtocolSourceScope('device')">设备</UButton>
              </nav>
              <div v-if="protocolSourcesLoading" class="protocol-source-empty">正在读取{{ protocolSourceScope === 'satellite' ? '卫星' : '设备' }}列表...</div>
              <div v-else-if="!protocolSourceOptions.length" class="protocol-source-empty">暂无可选{{ protocolSourceScope === 'satellite' ? '卫星' : '设备' }}，请先在参数解析配置中上传配置</div>
              <div v-else class="protocol-source-list">
                <UButton v-for="item in protocolSourceOptions" :key="item.id" type="button" :class="['protocol-source-item', { active: item.id === selectedProtocolSourceId }]" @click="selectProtocolSource(item.id)">
                  <span>{{ sourceLabel(item) }}</span><small v-if="item.code && item.code !== item.name">{{ item.code }}</small><UIcon v-if="item.id === selectedProtocolSourceId" name="i-lucide-check" />
                </UButton>
              </div>
            </section>

            <section class="protocol-rules-section" aria-label="参数解析配置">
              <header>
                <div><h3>参数解析配置 <b>*</b></h3><p>来自“数据处理 / 参数解析配置 / {{ protocolSourceScope === 'satellite' ? '卫星' : '设备' }} / {{ selectedProtocolSource ? sourceLabel(selectedProtocolSource) : '未选择' }}”，可直接修改后用于本协议。</p></div>
                <span v-if="selectedProtocolSource" class="rule-count">{{ protocolRules.length }} 条规则</span>
              </header>
              <div v-if="protocolRulesLoading" class="protocol-source-empty">正在读取参数解析配置...</div>
              <div v-else-if="!selectedProtocolSource" class="protocol-source-empty">请先选择卫星或设备</div>
              <div v-else-if="!protocolRules.length" class="protocol-source-empty">该{{ protocolSourceScope === 'satellite' ? '卫星' : '设备' }}暂无参数解析配置</div>
              <div v-else class="protocol-rules-scroll">
                <table class="protocol-rules-table">
                  <thead>
                    <tr>
                      <th>序号</th><th>位宽</th><th>遥测名称</th><th>遥测代号</th><th>公式类型</th><th>公式描述</th><th>处理参数</th><th>小数位数</th><th>是否报警</th><th>正常值</th><th>预警值</th><th>状态信息</th><th>相关指令</th><th>所属系统</th><th>控制波道</th><th>合并波道</th><th>延时波道</th><th>存储遥测</th><th>校准公式</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(rule, index) in protocolRules" :key="String(rule.id || index)">
                      <td><UInput v-model="rule.tableIndex" inputmode="numeric" aria-label="序号" class="app-input" /></td>
                      <td><UInput v-model="rule.bitWidth" inputmode="numeric" aria-label="位宽" class="app-input" /></td>
                      <td><UInput v-model="rule.telemetryName" aria-label="遥测名称" class="app-input" /></td>
                      <td><UInput v-model="rule.telemetryCode" aria-label="遥测代号" class="app-input" /></td>
                      <td><UInput v-model="rule.formulaType" aria-label="公式类型" class="app-input" /></td>
                      <td><UInput v-model="rule.formulaDesc" aria-label="公式描述" class="app-input" /></td>
                      <td><UInput v-model="rule.processParam" aria-label="处理参数" class="app-input" /></td>
                      <td><UInput v-model="rule.decimalPlaces" inputmode="numeric" aria-label="小数位数" class="app-input" /></td>
                      <td><AppSelect v-model="rule.alarmFlag" aria-label="是否报警"><option value="1">是</option><option value="0">否</option></AppSelect></td>
                      <td><UInput v-model="rule.normalValue" aria-label="正常值" class="app-input" /></td>
                      <td><UInput v-model="rule.warningValue" aria-label="预警值" class="app-input" /></td>
                      <td><UInput v-model="rule.stateChangeInfo" aria-label="状态信息" class="app-input" /></td>
                      <td><UInput v-model="rule.commandCode" aria-label="相关指令" class="app-input" /></td>
                      <td><UInput v-model="rule.systemName" aria-label="所属系统" class="app-input" /></td>
                      <td><UInput v-model="rule.controlChannel" aria-label="控制波道" class="app-input" /></td>
                      <td><UInput v-model="rule.mergeChannelCount" inputmode="numeric" aria-label="合并波道" class="app-input" /></td>
                      <td><UInput v-model="rule.delayChannel" inputmode="numeric" aria-label="延时波道" class="app-input" /></td>
                      <td><AppSelect v-model="rule.storeFlag" aria-label="存储遥测"><option value="1">是</option><option value="0">否</option></AppSelect></td>
                      <td><UInput v-model="rule.calibrationFormula" aria-label="校准公式" class="app-input" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <label class="switch-field protocol-enabled"><USwitch v-model="protocolForm.enabled" /><span>启用配置</span></label>
            <footer class="dialog-footer"><UButton type="button" class="outline-button" :disabled="protocolSubmitting" @click="closeProtocolDialog">取消</UButton><UButton type="submit" class="primary-button" :disabled="protocolSubmitting || protocolSourcesLoading || protocolRulesLoading"><UIcon v-if="protocolSubmitting" name="i-lucide-loader-circle" class="spin-icon" />{{ protocolSubmitting ? '保存中...' : editingProtocolId ? '保存修改' : '确定' }}</UButton></footer>
          </form>
        </section>
      </div>

      <div v-if="isInterfaceDialogOpen" class="modal-layer" @click.self="closeInterfaceDialog">
        <section class="interface-dialog" role="dialog" aria-modal="true" aria-labelledby="interface-dialog-title">
          <header class="modal-header">
            <div><h2 id="interface-dialog-title">{{ editingInterfaceId ? '编辑采集接口' : '新增采集接口' }}</h2><p>{{ editingInterfaceId ? '更新数据来源、传输链路和协议解析方式' : '配置数据来源、传输链路和协议解析方式' }}</p></div>
            <UButton type="button" class="icon-button" aria-label="关闭" :disabled="submitting" @click="closeInterfaceDialog"><UIcon name="i-lucide-x" /></UButton>
          </header>
          <form class="interface-form" @submit.prevent="saveInterface">
            <div v-if="optionLoading" class="form-loading"><UIcon name="i-lucide-loader-circle" />正在读取配置选项...</div>
            <div class="form-grid">
              <label class="form-field"><span>接口名称 <b>*</b></span><UInput v-model.trim="interfaceForm.interfaceName" type="text" autocomplete="off" maxlength="100" placeholder="请输入接口名称" class="app-input" /></label>
              <label class="form-field"><span>接口类型 <b>*</b></span><AppSelect v-model="interfaceForm.interfaceType"><option value="" disabled>请选择接口类型</option><option v-for="option in collectionOptions('interfaceType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect></label>
              <label class="form-field"><span>发送方</span><UInput v-model.trim="interfaceForm.sendFrom" type="text" autocomplete="off" maxlength="100" placeholder="如：测控中心" class="app-input" /></label>
              <label class="form-field"><span>信息内容</span><UInput v-model.trim="interfaceForm.messageContent" type="text" autocomplete="off" maxlength="200" placeholder="如：实时遥测" class="app-input" /></label>
              <label class="form-field"><span>传输方式 <b>*</b></span><AppSelect v-model="interfaceForm.transferType"><option value="" disabled>请选择传输方式</option><option v-for="option in collectionOptions('transferType')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect></label>
              <label class="form-field"><span>传输协议</span><AppSelect v-model="interfaceForm.transferProtocol"><option value="">请选择传输协议</option><option v-for="option in collectionOptions('transferProtocol')" :key="option.value" :value="String(option.value)">{{ option.label }}</option></AppSelect></label>
              <label class="form-field"><span>处理方式 <b>*</b></span><AppSelect v-model="interfaceForm.rpcEnabled"><option value="0">处理</option><option value="1">转发</option></AppSelect></label>
              <label class="form-field"><span>远端地址 <b>*</b></span><UInput v-model.trim="interfaceForm.host" type="text" autocomplete="off" maxlength="255" placeholder="IP 地址或域名" class="app-input" /></label>
              <label class="form-field"><span>端口 <b>*</b></span><UInput v-model="interfaceForm.port" type="number" min="1" max="65535" inputmode="numeric" placeholder="1-65535" class="app-input" /></label>
              <label class="form-field form-field--wide"><span>协议配置 <b>*</b></span><AppSelect v-model="interfaceForm.protocolConfigId"><option value="" disabled>请选择协议配置</option><option v-for="config in protocolOptions" :key="config.id" :value="String(config.id)">{{ protocolOptionLabel(config) }}</option></AppSelect></label>
              <label class="form-field form-field--wide"><span>备注</span><UTextarea v-model.trim="interfaceForm.remark" rows="2" maxlength="500" placeholder="可选，填写链路用途或其他说明" class="app-input" /></label>
            </div>
            <div class="switch-grid">
              <label class="switch-field"><USwitch v-model="interfaceForm.enabled" /><span>启用接口</span></label>
            </div>
            <footer class="dialog-footer"><UButton type="button" class="outline-button" :disabled="submitting" @click="closeInterfaceDialog">取消</UButton><UButton type="submit" class="primary-button" :disabled="submitting || optionLoading"><UIcon v-if="submitting" name="i-lucide-loader-circle" class="spin-icon" />{{ submitting ? '保存中...' : editingInterfaceId ? '保存修改' : '保存接口' }}</UButton></footer>
          </form>
        </section>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.data-collection-page {
  display: flex;
  min-width: 0;
  min-height: 100%;
  flex-direction: column;
}

.collection-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.stat-card,
.collection-card {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.stat-card {
  display: flex;
  align-items: center;
  min-height: 112px;
  gap: 14px;
  padding: 18px;
}

.stat-card p,
.stat-card strong {
  margin: 0;
}

.stat-card p {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.stat-card strong {
  display: block;
  margin-top: 7px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
}

.stat-card--blue strong { color: #8abbdB; }
.stat-card--green strong { color: #45ad8d; }
.stat-card--red strong { color: #ef443c; }
.stat-card--amber strong { color: #ecbe84; }

.collection-tabs {
  display: flex;
  align-items: end;
  gap: 26px;
  height: 54px;
  margin-top: 14px;
  border-bottom: 1px solid var(--ui-border);
}

.collection-tabs button {
  position: relative;
  height: 54px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 14px;
  cursor: pointer;
}

.collection-tabs button.is-active {
  color: var(--ui-primary);
  font-weight: 600;
}

.collection-tabs button.is-active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  content: '';
  background: var(--ui-primary);
}

.collection-workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
  min-height: 360px;
  flex: 1;
  gap: 12px;
  margin-top: 12px;
}

.interface-card,
.event-card,
.protocol-card {
  display: flex;
  flex-direction: column;
}

.interface-card .table-scroll,
.protocol-card .table-scroll {
  min-height: 0;
  flex: 1;
}

.interface-card .collection-table,
.protocol-card .collection-table {
  min-height: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--ui-border);
}

.card-header h2 {
  margin: 0;
  color: var(--ui-text-highlighted);
  font-size: 15px;
  font-weight: 650;
}

.header-actions {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.filter-select {
  position: relative;
  display: flex;
  align-items: center;
  width: 116px;
  height: 32px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
}

.filter-select select {
  width: 100%;
  height: 100%;
  padding: 0 26px 0 9px;
  border: 0;
  outline: none;
  appearance: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.filter-select .i-lucide {
  position: absolute;
  right: 8px;
  width: 13px;
  height: 13px;
  color: var(--ui-text-muted);
  pointer-events: none;
}

.primary-button,
.outline-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: var(--ui-radius);
  font-size: 12px;
  cursor: pointer;
}

.primary-button {
  border: 1px solid var(--ui-primary);
  background: var(--ui-primary);
  color: white;
}

.outline-button {
  border: 1px solid var(--ui-border);
  background: transparent;
  color: var(--ui-text);
}

.primary-button:disabled,
.outline-button:disabled,
.icon-button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.icon-only {
  width: 32px;
  padding: 0;
}

.table-scroll { overflow: auto; }

.collection-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.collection-table th,
.collection-table td {
  box-sizing: border-box;
  height: 32px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ui-border-muted);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 400;
  text-align: left;
  vertical-align: middle;
}

.collection-table tr {
  height: 32px;
}

.collection-table th {
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.interface-table { min-width: 1130px; }

.ellipsis-cell,
.address-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag,
.enabled-tag {
  display: inline-flex;
  min-width: 40px;
  justify-content: center;
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 11px;
  white-space: nowrap;
}

.status-0,
.is-disabled {
  background: #94a3b81f;
  color: var(--ui-text-muted);
}

.status-1,
.is-enabled {
  background: #34d3991f;
  color: var(--ui-success);
}

.status-2 {
  background: #ef44441f;
  color: var(--ui-error);
}

.empty-cell {
  height: 305px !important;
  color: var(--ui-text-dimmed) !important;
  text-align: center !important;
}

.event-card { min-height: 360px; }

.event-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding: 16px 14px 12px;
}

.event-summary span,
.event-summary strong {
  display: block;
}

.event-summary span {
  color: var(--ui-text-muted);
  font-size: 11px;
}

.event-summary strong {
  margin-top: 6px;
  color: var(--ui-text-highlighted);
  font-size: 18px;
  font-weight: 600;
}

.event-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 235px;
  flex: 1;
  gap: 10px;
  color: var(--ui-text-dimmed);
  font-size: 12px;
}

.event-empty-state .i-lucide {
  width: 34px;
  height: 34px;
  stroke-width: 1.35;
}

.event-list {
  min-height: 235px;
  max-height: 360px;
  overflow: auto;
  padding: 0 14px 12px;
}

.event-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  min-height: 48px;
  gap: 8px;
  border-bottom: 1px solid var(--ui-border-muted);
}

.event-item__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-primary);
}

.event-item--warning .event-item__dot { background: #ecbe84; }
.event-item--error .event-item__dot { background: var(--ui-error); }
.event-item--critical .event-item__dot { background: #d84a62; }

.event-item__content {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.event-item__content strong,
.event-item__content small,
.event-item time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-item__content strong { color: var(--ui-text); font-size: 12px; font-weight: 500; }
.event-item__content small,
.event-item time { color: var(--ui-text-muted); font-size: 11px; }
.event-item time { max-width: 132px; }

.protocol-card {
  min-height: 360px;
  flex: 1;
  margin-top: 12px;
}
.protocol-table .empty-cell { height: 340px !important; }

.protocol-enabled-switch,
.interface-enabled-switch {
  position: relative;
  width: 28px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--ui-border);
  cursor: pointer;
  transition: background .15s ease;
  vertical-align: middle;
}

.protocol-enabled-switch i,
.interface-enabled-switch i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: white;
  transition: transform .15s ease;
}

.protocol-enabled-switch.is-enabled,
.interface-enabled-switch.is-enabled { background: var(--ui-primary); }
.protocol-enabled-switch.is-enabled i,
.interface-enabled-switch.is-enabled i { transform: translateX(12px); }
.protocol-enabled-switch:focus-visible,
.interface-enabled-switch:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.protocol-enabled-switch:disabled,
.interface-enabled-switch:disabled,
.table-action:disabled { cursor: not-allowed; opacity: .55; }

.protocol-action-cell,
.interface-action-cell { white-space: nowrap; }

.table-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-primary);
  cursor: pointer;
  font-size: 12px;
}

.table-action + .table-action { margin-left: 12px; }
.table-action--danger { color: var(--ui-error); }

.modal-layer {
  position: fixed;
  z-index: 70;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: #0000008c;
}

.interface-dialog {
  display: flex;
  width: min(760px, 100%);
  max-height: min(760px, calc(100vh - 32px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
  box-shadow: 0 24px 72px #00000080;
}

.protocol-dialog { width: min(1280px, 100%); max-height: min(880px, calc(100vh - 32px)); }

.modal-header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--ui-border);
}

.modal-header h2,
.modal-header p {
  margin: 0;
}

.modal-header h2 {
  color: var(--ui-text-highlighted);
  font-size: 15px;
  font-weight: 650;
}

.modal-header p {
  margin-top: 3px;
  color: var(--ui-text-muted);
  font-size: 11px;
}

.icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.interface-form {
  overflow: auto;
  padding: 14px;
}

.form-loading {
  display: flex;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.form-loading .i-lucide,
.spin-icon {
  animation: spin 1s linear infinite;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-field {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.form-field > span {
  color: var(--ui-text-muted);
  font-size: 12px;
}

.form-field b {
  color: var(--ui-error);
  font-weight: 500;
}

.form-field input,
.form-field select,
.form-field textarea {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  outline: 0;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 12px;
}

.form-field input,
.form-field select {
  height: 34px;
  padding: 0 9px;
}

.form-field textarea {
  min-height: 58px;
  padding: 8px 9px;
  resize: vertical;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  border-color: var(--ui-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 22%, transparent);
}

.form-field--wide { grid-column: 1 / -1; }

.pdxp-header-section {
  margin-top: 16px;
  border-top: 1px solid var(--ui-primary);
  border-bottom: 1px solid var(--ui-border-muted);
  padding: 12px 0;
}

.pdxp-header-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.pdxp-header-section h3,
.pdxp-header-section p { margin: 0; }
.pdxp-header-section h3 { color: var(--ui-primary); font-size: 13px; font-weight: 600; }
.pdxp-header-section p { margin-top: 4px; color: var(--ui-text-muted); font-size: 11px; }
.pdxp-header-section > header > span { color: var(--ui-primary); font-size: 11px; font-weight: 600; }

.pdxp-header-scroll { overflow-x: auto; }
.pdxp-header-table { width: 100%; min-width: 520px; border-collapse: collapse; }
.pdxp-header-table th,
.pdxp-header-table td {
  height: 37px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--ui-border-muted);
  color: var(--ui-text);
  font-size: 12px;
  text-align: left;
}
.pdxp-header-table th { color: var(--ui-text-muted); font-size: 11px; font-weight: 600; }
.pdxp-header-table td:nth-child(1) { width: 28%; }
.pdxp-header-table td:nth-child(2) { width: 18%; color: var(--ui-text-muted); }
.pdxp-header-table input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  outline: 0;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 12px;
}
.pdxp-header-table input:focus { border-color: var(--ui-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 20%, transparent); }

.protocol-source-section {
  margin-top: 16px;
  border-top: 1px solid var(--ui-border-muted);
  border-bottom: 1px solid var(--ui-border-muted);
  padding: 13px 0;
}

.protocol-source-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.protocol-source-section h3,
.protocol-source-section p { margin: 0; }

.protocol-source-section h3 {
  color: var(--ui-text-highlighted);
  font-size: 13px;
  font-weight: 600;
}

.protocol-source-section h3 b { color: var(--ui-error); font-weight: 500; }

.protocol-source-section header p,
.rule-count,
.source-loading {
  margin-top: 4px;
  color: var(--ui-text-muted);
  font-size: 11px;
}

.source-loading {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 5px;
  margin-top: 0;
}

.protocol-source-tabs {
  display: flex;
  gap: 18px;
  margin-top: 12px;
  border-bottom: 1px solid var(--ui-border-muted);
}

.protocol-source-tabs button {
  position: relative;
  height: 30px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 12px;
}

.protocol-source-tabs button.active { color: var(--ui-primary); }
.protocol-source-tabs button.active::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; content: ''; background: var(--ui-primary); }

.protocol-source-list {
  display: flex;
  min-height: 64px;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
}

.protocol-source-item {
  display: inline-flex;
  min-width: 132px;
  min-height: 48px;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg);
  color: var(--ui-text);
  cursor: pointer;
  text-align: left;
}

.protocol-source-item span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.protocol-source-item small { color: var(--ui-text-muted); font-size: 10px; }
.protocol-source-item .i-lucide { width: 14px; height: 14px; margin-left: auto; color: var(--ui-primary); }
.protocol-source-item:hover, .protocol-source-item.active { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 10%, var(--ui-bg)); }

.protocol-source-empty {
  display: grid;
  min-height: 64px;
  place-items: center;
  padding: 12px;
  color: var(--ui-text-dimmed);
  font-size: 12px;
  text-align: center;
}

.rule-count { padding-top: 10px; }
.protocol-enabled { margin-top: 14px; }

.protocol-rules-section { margin-top: 16px; }

.protocol-rules-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.protocol-rules-section h3,
.protocol-rules-section p { margin: 0; }
.protocol-rules-section h3 { color: var(--ui-text-highlighted); font-size: 13px; font-weight: 600; }
.protocol-rules-section h3 b { color: var(--ui-error); font-weight: 500; }
.protocol-rules-section p { margin-top: 4px; color: var(--ui-text-muted); font-size: 11px; }
.protocol-rules-section .rule-count { flex: none; margin-top: 0; padding-top: 0; color: var(--ui-text-muted); font-size: 11px; }

.protocol-rules-scroll {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--ui-border-muted);
}

.protocol-rules-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  background: var(--ui-bg);
}

.protocol-rules-table th,
.protocol-rules-table td {
  height: 37px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--ui-border-muted);
  border-right: 1px solid var(--ui-border-muted);
  color: var(--ui-text);
  font-size: 11px;
  white-space: nowrap;
}

.protocol-rules-table th {
  position: sticky;
  z-index: 1;
  top: 0;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  font-weight: 600;
}

.protocol-rules-table tr:last-child td { border-bottom: 0; }

.protocol-rules-table input,
.protocol-rules-table select {
  width: 96px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 2px;
  outline: 0;
  background: transparent;
  color: var(--ui-text);
  font-size: 11px;
}

.protocol-rules-table input:hover,
.protocol-rules-table select:hover { border-color: var(--ui-border); }
.protocol-rules-table input:focus,
.protocol-rules-table select:focus { border-color: var(--ui-primary); background: var(--ui-bg-elevated); }
.protocol-rules-table td:nth-child(1) input,
.protocol-rules-table td:nth-child(2) input,
.protocol-rules-table td:nth-child(8) input,
.protocol-rules-table td:nth-child(16) input,
.protocol-rules-table td:nth-child(17) input { width: 56px; }
.protocol-rules-table td:nth-child(9) select,
.protocol-rules-table td:nth-child(18) select { width: 58px; }

.switch-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 14px;
}

.switch-field {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-text);
  font-size: 12px;
  cursor: pointer;
}

.switch-field input {
  position: absolute;
  opacity: 0;
}

.switch-field i {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: var(--ui-border);
  transition: background .15s ease;
}

.switch-field i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  content: '';
  background: white;
  transition: transform .15s ease;
}

.switch-field input:checked + i { background: var(--ui-primary); }
.switch-field input:checked + i::after { transform: translateX(12px); }
.switch-field input:focus-visible + i { outline: 2px solid var(--ui-primary); outline-offset: 2px; }

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--ui-border-muted);
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1180px) {
  .collection-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .collection-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 600px) {
  .header-actions { flex-wrap: wrap; justify-content: flex-end; }
  .form-grid { grid-template-columns: 1fr; }
  .form-field--wide { grid-column: auto; }
}
</style>
