<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 只注册本页实际用到的图表类型/组件，体积比整包 `import * as echarts from 'echarts'` 小得多。
echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

definePageMeta({ middleware: 'auth' })

type TabKey = 'task' | 'realtime' | 'processed' | 'telemetry' | 'paramConfig'
type ProcessingOverview = {
  todayProcessedCount?: number
  deduplicatedCount?: number
}
type ProcessingRealtime = {
  processRate?: string
  cpuUsage?: string
  memoryUsage?: string
}
type ProcessingLogRecord = {
  id?: number
  taskId?: string
  processTaskId?: number
  logTime?: string
  logLevel?: number
  logLevelName?: string
  logContent?: string
  createTime?: string
}
type ProcessingLogPage = {
  pageNum?: number
  pageSize?: number
  total?: number
  records?: ProcessingLogRecord[]
}
type ProcessingLogRow = {
  id: number
  logTime: string
  level: 'INFO' | 'WARN' | 'ERROR'
  message: string
}
type RealtimeTelemetryRecord = {
  interfaceId?: number
  time?: string
  satelliteCode?: string
  channelName?: string
  rawLength?: number
  rawFrame?: string
  checkResult?: number
  checkResultName?: string
}
type InvalidTelemetryRecord = {
  interfaceId?: number
  receiveTime?: string
  satelliteCode?: string
  channelCode?: string
  rawLength?: number
  rawFrame?: string
  checkResult?: number
  checkResultName?: string
  uniqueCode?: string
}
type FrameRow = {
  id: string
  interfaceId: number | null
  timestamp: string
  satelliteCode: string
  channel: string
  rawLength: number | null
  rawFrame: string
  checkResult: number
  checkResultName: string
}
type MonitorRow = {
  item: string
  value: string
  description: string
}
type RuleConfigKey = 'parameterRangeCheckEnabled'
type ProcessingRuleConfig = {
  parameterRangeCheckEnabled?: number
}

type CollectionInterface = {
  id?: number
  interfaceName?: string
}

type CollectionInterfacePage = {
  records?: CollectionInterface[]
}

type TelemetryRow = {
  id: number
  timestamp: string
  satelliteId: string
  channel: string
  paramName: string
  telemetryCode: string
  paramValue: string
  numericValue: number
  sourceInterface: string
  deduplicated: boolean
  timeMode: 'REALTIME' | 'DELAYED'
  frameCheck: 'UNKNOWN' | 'CORRECT' | 'ERROR'
  framePreview: string
  processTime: string
}

type ProcessedTelemetryRecord = {
  interfaceId?: number
  satelliteId?: string
  parameter?: string
  parameterValue?: unknown
  status?: string
  stateIndex?: number | null
  deduplication?: '原始' | '去重'
  processTime?: string
}

type ProcessedTelemetryRow = {
  id: string
  interfaceId: number | null
  satelliteId: string
  parameter: string
  parameterValue: string
  status: string
  stateIndex: number | null
  deduplication: '原始' | '去重'
  processTime: string
}

type ParamConfig = {
  id: number
  deviceSatelliteId: number
  satelliteId: string
  deviceName?: string
  sequence: number
  bitWidth: number
  telemetryName: string
  telemetryCode: string
  formulaType: string
  formulaDescription: string
  processParam: string
  decimalPlaces: number
  normalValue: string
  warningValue: string
  statusInfo: string
  relatedCommand: string
  system: string
  controlChannel: number
  mergeChannelCount: number
  delayChannel: number
  storageTelemetry: boolean
  alarmFlag: boolean
  calibrationFormula: string
}

type DeviceSatellite = {
  id: number
  code?: string
  name?: string
  type: '1' | '2'
}

type RuleItem = {
  id: number
  key: RuleConfigKey
  ruleName: string
  description: string
  enabled: boolean
}

type ParameterScope = 'satellite' | 'device'

const tabs: Array<{ key: TabKey, label: string }> = [
  { key: 'task', label: '处理任务' },
  { key: 'realtime', label: '数据实时监控' },
  { key: 'processed', label: '处理后数据' },
  { key: 'telemetry', label: '遥测数据' },
  { key: 'paramConfig', label: '参数解析配置' }
]
const activeTab = ref<TabKey>('task')
const { request } = useAdminApi()
const { session } = useSession()
const { taskId } = useTaskContext()
const toast = useToast()
const { load: loadProcessingLookup } = useModuleLookup('processing')
const isFrameModalOpen = ref(false)
const selectedFrameRow = ref<FrameRow | null>(null)
const isColumnPickerOpen = ref(false)
const activeParameterScope = ref<ParameterScope>('satellite')
const isQuerying = ref(false)
const isRefreshing = ref(false)
const realtimeMonitorLoading = ref(false)
const realtimeTelemetryLoading = ref(false)
const invalidFrameLoading = ref(false)
const logLoading = ref(false)
const ruleLoading = ref(false)
const ruleSavingKey = ref<RuleConfigKey | null>(null)

const stats = reactive({ todayProcessed: 0, deduped: 0 })
const realtimeMonitor = reactive({
  processRate: '',
  cpuUsage: '',
  memoryUsage: ''
})

const rules = ref<RuleItem[]>([
  { id: 1, key: 'parameterRangeCheckEnabled', ruleName: '参数值范围检查', description: '超出配置正常值范围的参数自动标记预警', enabled: false }
])
const savedRuleConfig = ref<ProcessingRuleConfig | null>(null)

const telemetryRows = ref<TelemetryRow[]>([])
const processedRows = ref<ProcessedTelemetryRow[]>([])
const processedLoading = ref(false)
const collectionInterfaces = ref<CollectionInterface[]>([])
const selectedRealtimeInterfaceId = ref<number | null>(null)
const realtimeTelemetryRows = ref<FrameRow[]>([])
const invalidFrameRows = ref<FrameRow[]>([])
const paramConfigs = ref<ParamConfig[]>([])
const deviceSatellites = ref<DeviceSatellite[]>([])
const selectedParameterSourceId = ref<number | null>(null)
const deviceSatellitesLoading = ref(false)
const paramConfigLoading = ref(false)
const ruleImporting = ref(false)
const ruleImportInput = ref<HTMLInputElement | null>(null)

const parameterColumns = [
  { key: 'sequence', label: '序号' }, { key: 'bitWidth', label: '位宽' },
  { key: 'telemetryName', label: '遥测名称' }, { key: 'telemetryCode', label: '遥测代号' }, { key: 'formulaType', label: '公式类型' },
  { key: 'formulaDescription', label: '处理公式' }, { key: 'processParam', label: '处理参数' }, { key: 'decimalPlaces', label: '小数位数' },
  { key: 'alarmFlag', label: '是否报警' }, { key: 'normalValue', label: '正常值范围' }, { key: 'warningValue', label: '预警值范围' },
  { key: 'statusInfo', label: '状态跳变信息' }, { key: 'relatedCommand', label: '相关命令' }, { key: 'system', label: '所属系统' },
  { key: 'controlChannel', label: '控制波道' }, { key: 'mergeChannelCount', label: '合并处理波道数' }, { key: 'delayChannel', label: '延时波道' },
  { key: 'storageTelemetry', label: '存储遥测' }, { key: 'calibrationFormula', label: '校准公式' }
]

const queryForm = reactive({ satellite: '', channel: '', param: '', startTime: '', endTime: '', timeMode: '', frameCheck: '' })
const processedColumnOptions = [
  { key: 'satelliteId', label: '卫星ID' }, { key: 'parameter', label: '参数' }, { key: 'parameterValue', label: '参数值' },
  { key: 'status', label: '状态' }, { key: 'interfaceId', label: '采集接口ID' }, { key: 'deduplication', label: '去重' }, { key: 'processTime', label: '处理时间' }
]
const visibleProcessedColumns = ref(processedColumnOptions.map(column => column.key))
const selectedQueryView = ref<'curve' | 'table'>('curve')
const queryRows = ref<TelemetryRow[]>([])
const satelliteOptions = computed(() => [...new Set(telemetryRows.value.map(row => row.satelliteId))])
const parameterSources = computed(() => deviceSatellites.value.filter(item => item.type === (activeParameterScope.value === 'satellite' ? '1' : '2')))
const selectedParameterSource = computed(() => parameterSources.value.find(item => item.id === selectedParameterSourceId.value) || null)
const channelOptions = computed(() => [...new Set(telemetryRows.value.map(row => row.channel))])
const parameterOptions = computed(() => [...new Set(telemetryRows.value.map(row => row.telemetryCode))])
const activeParameterColumns = computed(() => [
  { key: activeParameterScope.value === 'satellite' ? 'satelliteId' : 'deviceName', label: activeParameterScope.value === 'satellite' ? '卫星' : '设备' },
  ...parameterColumns
])
const activeParameterTitle = computed(() => activeParameterScope.value === 'satellite' ? '卫星参数解析配置' : '设备参数解析配置')
const activeParameterActionLabel = computed(() => activeParameterScope.value === 'satellite' ? '卫星' : '设备')
const filteredQueryRows = computed(() => queryRows.value.filter((row) => {
  if (queryForm.satellite && row.satelliteId !== queryForm.satellite) return false
  if (queryForm.channel && row.channel !== queryForm.channel) return false
  if (queryForm.param && row.telemetryCode !== queryForm.param) return false
  if (queryForm.timeMode && row.timeMode !== queryForm.timeMode) return false
  if (queryForm.frameCheck && row.frameCheck !== queryForm.frameCheck) return false
  return true
}))

const logs = ref<ProcessingLogRow[]>([])
const recentLogs = computed(() => logs.value.slice(0, 3))
const formatValue = (value: unknown) => value === undefined || value === null || value === '' ? '-' : String(value)
const levelColor = (level: string) => level === 'ERROR' ? 'error' : level === 'WARN' ? 'warning' : 'info'
const frameColor = (value: number) => value === 2 ? 'error' : value === 1 ? 'success' : 'neutral'
const frameLabel = (value: number, label?: string) => label || (value === 2 ? '错误' : value === 1 ? '正确' : '未知')
const monitorRows = computed<MonitorRow[]>(() => [
  { item: '处理速率', value: formatValue(realtimeMonitor.processRate), description: '上一秒成功处理的 PDXP 数据量' },
  { item: 'CPU使用率', value: formatValue(realtimeMonitor.cpuUsage), description: '数据处理服务进程 CPU 使用率' },
  { item: '内存使用', value: formatValue(realtimeMonitor.memoryUsage), description: '数据处理服务 JVM 已使用内存' }
])

const overviewPath = () => taskId.value
  ? `/processing/overview?taskId=${encodeURIComponent(taskId.value)}`
  : '/processing/overview'
const realtimePath = () => taskId.value
  ? `/processing/realtime?taskId=${encodeURIComponent(taskId.value)}`
  : ''
const realtimeTelemetryPath = () => {
  const params = new URLSearchParams({ taskId: taskId.value })
  if (selectedRealtimeInterfaceId.value) params.set('interfaceId', String(selectedRealtimeInterfaceId.value))
  return `/processing/realtime/telemetry?${params.toString()}`
}
const invalidFramePath = () => `/processing/realtime/invalid?taskId=${encodeURIComponent(taskId.value)}`
const processedPath = () => `/processing/processed?taskId=${encodeURIComponent(taskId.value)}`
const logsPath = () => taskId.value
  ? `/processing/logs?taskId=${encodeURIComponent(taskId.value)}&pageNum=1&pageSize=20`
  : '/processing/logs?pageNum=1&pageSize=20'
const collectionInterfacesPath = () => {
  const params = new URLSearchParams({ pageNum: '1', pageSize: '100' })
  if (taskId.value) params.set('taskId', String(taskId.value))
  return `/collection/interfaces?${params.toString()}`
}

const isDemoSession = computed(() => session.value?.token?.startsWith('demo-') || false)

const nonNegativeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

const loadOverview = async () => {
  if (isDemoSession.value) return

  try {
    const data = await request<ProcessingOverview>(overviewPath())
    stats.todayProcessed = nonNegativeNumber(data?.todayProcessedCount)
    stats.deduped = nonNegativeNumber(data?.deduplicatedCount)
  } catch (error) {
    toast.add({ title: '处理总览加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const loadRealtimeMonitor = async () => {
  if (isDemoSession.value) return
  if (!taskId.value) {
    realtimeMonitor.processRate = ''
    realtimeMonitor.cpuUsage = ''
    realtimeMonitor.memoryUsage = ''
    return
  }

  const requestedTaskId = taskId.value
  realtimeMonitorLoading.value = true
  try {
    const data = await request<ProcessingRealtime>(realtimePath())
    if (taskId.value !== requestedTaskId) return

    realtimeMonitor.processRate = data?.processRate || ''
    realtimeMonitor.cpuUsage = data?.cpuUsage || ''
    realtimeMonitor.memoryUsage = data?.memoryUsage || ''
  } catch (error) {
    toast.add({ title: '实时处理监控加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId) realtimeMonitorLoading.value = false
  }
}

const normalizeFrameRow = (
  row: RealtimeTelemetryRecord | InvalidTelemetryRecord,
  index: number,
  source: 'realtime' | 'invalid'
): FrameRow => {
  const rawLength = Number(row.rawLength)
  const interfaceId = Number(row.interfaceId)
  const checkResult = Number(row.checkResult)
  const timestamp = source === 'realtime'
    ? String((row as RealtimeTelemetryRecord).time || '')
    : String((row as InvalidTelemetryRecord).receiveTime || '')
  const channel = source === 'realtime'
    ? String((row as RealtimeTelemetryRecord).channelName || '')
    : String((row as InvalidTelemetryRecord).channelCode || '')
  const uniqueCode = source === 'invalid' ? (row as InvalidTelemetryRecord).uniqueCode : ''

  return {
    id: String(uniqueCode || `${source}-${interfaceId}-${timestamp}-${index}`),
    interfaceId: Number.isFinite(interfaceId) ? interfaceId : null,
    timestamp: formatValue(timestamp),
    satelliteCode: formatValue(row.satelliteCode),
    channel: formatValue(channel),
    rawLength: Number.isFinite(rawLength) ? rawLength : null,
    rawFrame: String(row.rawFrame || ''),
    checkResult: Number.isFinite(checkResult) ? checkResult : 0,
    checkResultName: String(row.checkResultName || '')
  }
}

const loadRealtimeTelemetry = async () => {
  if (isDemoSession.value) return
  if (!taskId.value) {
    realtimeTelemetryRows.value = []
    return
  }

  const requestedTaskId = taskId.value
  const requestedInterfaceId = selectedRealtimeInterfaceId.value
  realtimeTelemetryLoading.value = true
  try {
    const data = await request<RealtimeTelemetryRecord[]>(realtimeTelemetryPath())
    if (taskId.value !== requestedTaskId || selectedRealtimeInterfaceId.value !== requestedInterfaceId) return

    realtimeTelemetryRows.value = Array.isArray(data)
      ? data.map((row, index) => normalizeFrameRow(row, index, 'realtime'))
      : []
  } catch (error) {
    if (selectedRealtimeInterfaceId.value === requestedInterfaceId) realtimeTelemetryRows.value = []
    toast.add({ title: '实时遥测数据加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (selectedRealtimeInterfaceId.value === requestedInterfaceId) realtimeTelemetryLoading.value = false
  }
}

const loadInvalidFrames = async () => {
  if (isDemoSession.value) return
  if (!taskId.value) {
    invalidFrameRows.value = []
    return
  }

  const requestedTaskId = taskId.value
  invalidFrameLoading.value = true
  try {
    const data = await request<InvalidTelemetryRecord[]>(invalidFramePath())
    if (taskId.value !== requestedTaskId) return
    invalidFrameRows.value = Array.isArray(data)
      ? data.map((row, index) => normalizeFrameRow(row, index, 'invalid'))
      : []
  } catch (error) {
    invalidFrameRows.value = []
    toast.add({ title: '帧检查异常数据加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    invalidFrameLoading.value = false
  }
}

const formatLogTime = (value?: string) => value
  ? value.slice(0, 19).replace('T', ' ')
  : '-'

const logLevelText = (level?: number, levelName?: string): ProcessingLogRow['level'] => {
  if (Number(level) === 3 || levelName === '错误') return 'ERROR'
  if (Number(level) === 2 || levelName === '警告') return 'WARN'
  return 'INFO'
}

const loadLogs = async () => {
  if (isDemoSession.value) return

  const requestedTaskId = taskId.value
  logLoading.value = true
  try {
    const data = await request<ProcessingLogPage>(logsPath())
    if (taskId.value !== requestedTaskId) return

    logs.value = Array.isArray(data?.records)
      ? data.records.map((log, index) => ({
          id: Number(log.id ?? index),
          logTime: formatLogTime(log.logTime || log.createTime),
          level: logLevelText(log.logLevel, log.logLevelName),
          message: log.logContent || ''
        }))
      : []
  } catch (error) {
    toast.add({ title: '处理日志加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId) logLoading.value = false
  }
}

const applyRuleConfig = (config: ProcessingRuleConfig) => {
  savedRuleConfig.value = { ...config }
  rules.value.forEach((rule) => {
    rule.enabled = Number(config[rule.key]) === 1
  })
}

const ruleConfigPayload = (): ProcessingRuleConfig => ({
  parameterRangeCheckEnabled: rules.value.find(rule => rule.key === 'parameterRangeCheckEnabled')?.enabled ? 1 : 0
})

const loadRuleConfig = async () => {
  if (isDemoSession.value) return
  if (!taskId.value) {
    ruleLoading.value = false
    ruleSavingKey.value = null
    savedRuleConfig.value = null
    rules.value.forEach(rule => { rule.enabled = false })
    return
  }

  const requestedTaskId = taskId.value
  ruleLoading.value = true
  try {
    const data = await request<ProcessingRuleConfig>(`/processing/rule-config?taskId=${encodeURIComponent(requestedTaskId)}`)
    if (taskId.value === requestedTaskId && data) applyRuleConfig(data)
  } catch (error) {
    toast.add({ title: '处理规则加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId) ruleLoading.value = false
  }
}

const updateRule = async (rule: RuleItem) => {
  if (!taskId.value) {
    toast.add({ title: '请先选择试验任务', color: 'warning' })
    return
  }
  if (ruleLoading.value || ruleSavingKey.value) return

  const previousValue = rule.enabled
  rule.enabled = !previousValue
  if (isDemoSession.value) return

  const requestedTaskId = taskId.value
  ruleSavingKey.value = rule.key
  try {
    const data = await request<ProcessingRuleConfig>('/processing/rule-config/update', {
      method: 'POST',
      body: { taskId: requestedTaskId, ...ruleConfigPayload() }
    })
    if (taskId.value === requestedTaskId && data) applyRuleConfig(data)
  } catch (error) {
    if (taskId.value === requestedTaskId) rule.enabled = previousValue
    toast.add({ title: '处理规则保存失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (ruleSavingKey.value === rule.key) ruleSavingKey.value = null
  }
}

const loadCollectionInterfaces = async () => {
  if (isDemoSession.value) return

  const requestedTaskId = taskId.value
  try {
    const data = await request<CollectionInterfacePage>(collectionInterfacesPath())
    if (taskId.value !== requestedTaskId) return

    collectionInterfaces.value = Array.isArray(data?.records)
      ? data.records.filter(item => item.interfaceName)
      : []
    if (!collectionInterfaces.value.some(item => Number(item.id) === selectedRealtimeInterfaceId.value)) {
      selectedRealtimeInterfaceId.value = null
    }
  } catch (error) {
    collectionInterfaces.value = []
    selectedRealtimeInterfaceId.value = null
    toast.add({ title: '采集接口加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const refreshTaskData = async () => {
  await Promise.all([loadOverview(), loadRealtimeMonitor(), loadLogs(), loadRuleConfig(), loadCollectionInterfaces(), loadDeviceSatellites(), loadProcessingLookup().catch(() => undefined)])
}

const sourceLabelFor = (source: DeviceSatellite) => source.name || source.code || `ID ${source.id}`

const normalizeParamConfig = (row: Record<string, unknown>, source: DeviceSatellite): ParamConfig => ({
  id: Number(row.id || 0),
  deviceSatelliteId: Number(row.deviceSatelliteId || source.id),
  satelliteId: source.type === '1' ? sourceLabelFor(source) : '',
  deviceName: source.type === '2' ? sourceLabelFor(source) : '',
  sequence: Number(row.tableIndex || 0),
  bitWidth: Number(row.bitWidth || 0),
  telemetryName: String(row.telemetryName || ''),
  telemetryCode: String(row.telemetryCode || ''),
  formulaType: String(row.formulaType || ''),
  formulaDescription: String(row.formulaDesc || ''),
  processParam: String(row.processParam || ''),
  decimalPlaces: Number(row.decimalPlaces || 0),
  normalValue: String(row.normalValue || ''),
  warningValue: String(row.warningValue || ''),
  statusInfo: String(row.stateChangeInfo || ''),
  relatedCommand: String(row.commandCode || ''),
  system: String(row.systemName || ''),
  controlChannel: Number(row.controlChannel || 0),
  mergeChannelCount: Number(row.mergeChannelCount || 0),
  delayChannel: Number(row.delayChannel || 0),
  storageTelemetry: String(row.storeFlag) === '1',
  alarmFlag: String(row.alarmFlag) === '1',
  calibrationFormula: String(row.calibrationFormula || '')
})

const loadProcessed = async () => {
  if (isDemoSession.value) return
  if (!taskId.value) {
    processedRows.value = []
    return
  }

  const requestedTaskId = taskId.value
  processedLoading.value = true
  try {
    const data = await request<ProcessedTelemetryRecord[]>(processedPath())
    if (taskId.value !== requestedTaskId) return
    processedRows.value = Array.isArray(data)
      ? data.map((row, index) => ({
          id: `${row.interfaceId ?? 'all'}-${row.satelliteId || ''}-${row.parameter || ''}-${row.processTime || ''}-${index}`,
          interfaceId: Number.isFinite(Number(row.interfaceId)) ? Number(row.interfaceId) : null,
          satelliteId: String(row.satelliteId || ''),
          parameter: String(row.parameter || ''),
          parameterValue: formatValue(row.parameterValue),
          status: String(row.status || ''),
          stateIndex: row.stateIndex === null || row.stateIndex === undefined ? null : Number(row.stateIndex),
          deduplication: row.deduplication === '去重' ? '去重' : '原始',
          processTime: formatLogTime(row.processTime)
        }))
      : []
  } catch (error) {
    if (taskId.value === requestedTaskId) processedRows.value = []
    toast.add({ title: '处理后数据加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId) processedLoading.value = false
  }
}

const loadParameterConfigs = async () => {
  if (!taskId.value || !selectedParameterSource.value) {
    paramConfigs.value = []
    return
  }

  const requestedTaskId = taskId.value
  const source = selectedParameterSource.value
  paramConfigLoading.value = true
  try {
    const params = new URLSearchParams({ taskId: requestedTaskId, deviceSatelliteId: String(source.id) })
    const data = await request<unknown[]>(`/processing/rules?${params.toString()}`)
    if (taskId.value === requestedTaskId && selectedParameterSourceId.value === source.id) {
      paramConfigs.value = Array.isArray(data)
        ? data.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map(item => normalizeParamConfig(item, source))
        : []
    }
  } catch (error) {
    paramConfigs.value = []
    toast.add({ title: `${activeParameterActionLabel.value}参数加载失败`, description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId && selectedParameterSourceId.value === source.id) paramConfigLoading.value = false
  }
}

const selectDefaultParameterSource = () => {
  const first = parameterSources.value[0]
  selectedParameterSourceId.value = first?.id || null
}

const loadDeviceSatellites = async () => {
  if (!taskId.value) {
    deviceSatellites.value = []
    selectedParameterSourceId.value = null
    paramConfigs.value = []
    return
  }

  const requestedTaskId = taskId.value
  deviceSatellitesLoading.value = true
  try {
    const data = await request<unknown[]>(`/processing/device-satellites?taskId=${encodeURIComponent(requestedTaskId)}`)
    if (taskId.value !== requestedTaskId) return

    deviceSatellites.value = Array.isArray(data)
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

    if (!parameterSources.value.some(item => item.id === selectedParameterSourceId.value)) selectDefaultParameterSource()
    await loadParameterConfigs()
  } catch (error) {
    deviceSatellites.value = []
    selectedParameterSourceId.value = null
    paramConfigs.value = []
    toast.add({ title: '卫星/设备列表加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    if (taskId.value === requestedTaskId) deviceSatellitesLoading.value = false
  }
}

const switchParameterScope = (scope: ParameterScope) => {
  if (activeParameterScope.value === scope) return
  activeParameterScope.value = scope
  selectDefaultParameterSource()
  void loadParameterConfigs()
}

const selectParameterSource = (id: number) => {
  selectedParameterSourceId.value = id
  void loadParameterConfigs()
}

const openConfigUpload = () => {
  if (!taskId.value) {
    toast.add({ title: '请先选择试验任务', color: 'warning' })
    return
  }
  ruleImportInput.value?.click()
}

const uploadParameterConfig = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !taskId.value) return

  const body = new FormData()
  body.append('taskId', taskId.value)
  body.append('type', activeParameterScope.value === 'satellite' ? '1' : '2')
  body.append('file', file)

  ruleImporting.value = true
  try {
    const importedCount = await request<number>('/processing/rules/import', { method: 'POST', body })
    toast.add({ title: `${activeParameterActionLabel.value}参数导入成功`, description: `已导入 ${Number(importedCount || 0)} 条参数`, color: 'success' })
    await loadDeviceSatellites()
  } catch (error) {
    toast.add({ title: `${activeParameterActionLabel.value}参数导入失败`, description: error instanceof Error ? error.message : '请检查 Excel 格式后重试', color: 'error' })
  } finally {
    input.value = ''
    ruleImporting.value = false
  }
}

const runQuery = () => {
  queryRows.value = [...telemetryRows.value]
}

const resetQuery = () => Object.assign(queryForm, { satellite: '', channel: '', param: '', startTime: '', endTime: '', timeMode: '', frameCheck: '' })

const openFrame = (row: FrameRow) => {
  selectedFrameRow.value = row
  isFrameModalOpen.value = true
}

const closeFrame = () => {
  isFrameModalOpen.value = false
  selectedFrameRow.value = null
}

const refreshRealtime = async () => {
  isRefreshing.value = true
  try {
    await Promise.all([loadRealtimeTelemetry(), loadInvalidFrames(), loadRealtimeMonitor(), loadLogs()])
  } finally {
    isRefreshing.value = false
  }
}

const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const updateChart = () => {
  if (!chart) return
  const rows = filteredQueryRows.value
  chart.setOption({
    backgroundColor: 'transparent',
    color: ['#8abbd9', '#45ad8d', '#ecbe84'],
    grid: { left: 46, right: 18, top: 28, bottom: 30 },
    tooltip: { trigger: 'axis' },
    legend: { show: rows.length > 0, top: 0, textStyle: { color: '#a9b7c7', fontSize: 11 } },
    xAxis: { type: 'category', boundaryGap: false, data: rows.map(row => row.timestamp.slice(11, 19)), axisLabel: { color: '#7f91a4', fontSize: 10 }, axisLine: { lineStyle: { color: '#314255' } } },
    yAxis: { type: 'value', axisLabel: { color: '#7f91a4', fontSize: 10 }, splitLine: { lineStyle: { color: '#ffffff12' } } },
    graphic: rows.length ? [] : [{ type: 'text', left: 'center', top: 'middle', style: { text: '暂无数据', fill: '#7f91a4', fontSize: 13 } }],
    series: rows.length ? [{ name: rows[0]?.telemetryCode, type: 'line', smooth: true, showSymbol: false, data: rows.map(row => row.numericValue) }] : []
  }, { notMerge: true })
}

const initChart = () => {
  if (!chartRef.value) return
  chart?.dispose()
  chart = echarts.init(chartRef.value)
  updateChart()
}

const resizeChart = () => chart?.resize()

watch([activeTab, filteredQueryRows, selectedQueryView], async () => {
  if (activeTab.value === 'telemetry' && selectedQueryView.value === 'curve') {
    await nextTick()
    if (!chart) initChart()
    else updateChart()
  } else if (chart) {
    chart.dispose()
    chart = null
  }
})

watch(taskId, () => {
  void refreshTaskData()
  if (activeTab.value === 'realtime') void refreshRealtime()
  if (activeTab.value === 'processed') void loadProcessed()
})

watch(selectedRealtimeInterfaceId, () => {
  if (activeTab.value === 'realtime') void loadRealtimeTelemetry()
})

watch(activeTab, (tab) => {
  if (tab === 'realtime') void refreshRealtime()
  if (tab === 'processed') void loadProcessed()
})

onMounted(() => {
  window.addEventListener('resize', resizeChart)
  void refreshTaskData()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div class="data-process-page">
    <div class="stats-row">
      <section class="stat-card"><div><span>今日处理量</span><strong class="stat-green">{{ stats.todayProcessed }}<small>条</small></strong></div></section>
      <section class="stat-card"><div><span>去重数据</span><strong class="stat-amber">{{ stats.deduped }}<small>条</small></strong></div></section>
    </div>

    <div class="tabs" role="tablist">
      <UButton v-for="tab in tabs" :key="tab.key" type="button" :class="['tab-button', { active: activeTab === tab.key }]" @click="activeTab = tab.key">{{ tab.label }}</UButton>
    </div>

    <section v-if="activeTab === 'task'" class="task-layout">
      <div class="task-side">
        <article class="data-card"><header class="card-header"><h2>处理规则配置</h2></header><div class="rules-list"><div v-for="rule in rules" :key="rule.id" class="rule-item"><div class="rule-meta"><strong>{{ rule.ruleName }}</strong><span>{{ rule.description }}</span></div><UButton type="button" :class="['switch', { enabled: rule.enabled }]" :aria-pressed="rule.enabled" :disabled="ruleLoading || Boolean(ruleSavingKey)" @click="updateRule(rule)"><i /></UButton></div></div></article>
        <article class="data-card compact-card"><header class="card-header"><h2>实时处理监控</h2></header><div :class="['monitor-grid', { loading: realtimeMonitorLoading }]"><div v-for="row in monitorRows" :key="row.item"><span>{{ row.item }}</span><strong>{{ row.value }}</strong></div></div></article>
        <article class="data-card compact-card"><header class="card-header"><h2>处理日志</h2></header><div :class="['log-list', { loading: logLoading }]"><div v-for="log in recentLogs" :key="log.id" class="log-line"><span :class="['tag', levelColor(log.level)]">{{ log.level }}</span><time>{{ log.logTime }}</time><span>{{ log.message }}</span></div><div v-if="logLoading && !recentLogs.length" class="log-empty">正在加载…</div><div v-else-if="!recentLogs.length" class="log-empty">暂无处理日志</div></div></article>
      </div>
    </section>

    <section v-else-if="activeTab === 'realtime'" class="realtime-content">
      <div class="realtime-filter-bar">
        <label for="realtime-interface-filter">采集接口</label>
        <AppSelect id="realtime-interface-filter" v-model="selectedRealtimeInterfaceId">
          <option :value="null">全部采集接口</option>
          <option v-for="item in collectionInterfaces" :key="item.id || item.interfaceName" :value="Number(item.id)">{{ item.interfaceName }}</option>
        </AppSelect>
      </div>
      <div class="realtime-screen-grid">
      <article class="data-card realtime-card"><header class="card-header"><h2>实时遥测数据</h2><UButton type="button" class="outline-button small" :disabled="isRefreshing" @click="refreshRealtime">{{ isRefreshing ? '刷新中…' : '刷新' }}</UButton></header><div class="table-wrap"><table class="process-table"><thead><tr><th>时间</th><th>卫星</th><th>通道</th><th>原始帧</th></tr></thead><tbody><tr v-if="realtimeTelemetryLoading"><td colspan="4" class="empty-state">正在加载实时遥测数据…</td></tr><template v-else><tr v-for="row in realtimeTelemetryRows" :key="row.id"><td>{{ row.timestamp }}</td><td><span class="tag info">{{ row.satelliteCode }}</span></td><td>{{ row.channel }}</td><td class="frame-preview" @click="openFrame(row)">{{ row.rawFrame || '-' }}</td></tr><tr v-if="!realtimeTelemetryRows.length"><td colspan="4" class="empty-state">暂无实时遥测数据</td></tr></template></tbody></table></div></article>
      <article class="data-card realtime-card"><header class="card-header"><h2>处理队列状态</h2></header><div class="table-wrap"><table class="process-table"><thead><tr><th>监控项</th><th>当前值</th><th>状态</th><th>说明</th></tr></thead><tbody><tr v-if="realtimeMonitorLoading"><td colspan="4" class="empty-state">正在加载处理队列状态…</td></tr><template v-else><tr v-for="row in monitorRows" :key="row.item"><td>{{ row.item }}</td><td class="highlight-value">{{ row.value }}</td><td><span class="tag info">实时</span></td><td>{{ row.description }}</td></tr></template></tbody></table></div></article>
      <article class="data-card realtime-card"><header class="card-header"><h2>帧检查异常</h2></header><div class="table-wrap"><table class="process-table"><thead><tr><th>时间</th><th>卫星</th><th>通道</th><th>帧检</th><th>原始帧</th></tr></thead><tbody><tr v-if="invalidFrameLoading"><td colspan="5" class="empty-state">正在加载帧检查异常…</td></tr><template v-else><tr v-for="row in invalidFrameRows" :key="row.id"><td>{{ row.timestamp }}</td><td>{{ row.satelliteCode }}</td><td>{{ row.channel }}</td><td><span :class="['tag', frameColor(row.checkResult)]">{{ frameLabel(row.checkResult, row.checkResultName) }}</span></td><td class="frame-preview" @click="openFrame(row)">{{ row.rawFrame || '-' }}</td></tr><tr v-if="!invalidFrameRows.length"><td colspan="5" class="empty-state">暂无帧检查异常</td></tr></template></tbody></table></div></article>
      <article class="data-card realtime-card"><header class="card-header"><h2>最新处理日志</h2></header><div class="table-wrap"><table class="process-table"><thead><tr><th>时间</th><th>级别</th><th>信息</th></tr></thead><tbody><tr v-if="logLoading"><td colspan="3" class="empty-state">正在加载…</td></tr><template v-else><tr v-for="log in logs" :key="log.id"><td>{{ log.logTime }}</td><td><span :class="['tag', levelColor(log.level)]">{{ log.level }}</span></td><td>{{ log.message }}</td></tr><tr v-if="!logs.length"><td colspan="3" class="empty-state">暂无处理日志</td></tr></template></tbody></table></div></article>
      </div>
    </section>

    <section v-else-if="activeTab === 'processed'" class="single-card data-card"><header class="card-header"><h2>处理后遥测数据</h2><div class="header-actions"><div class="column-picker"><UButton type="button" class="outline-button small" @click.stop="isColumnPickerOpen = !isColumnPickerOpen">列设置 ▾</UButton><div v-if="isColumnPickerOpen" class="column-picker-panel" @click.stop><label v-for="column in processedColumnOptions" :key="column.key"><UCheckbox v-model="visibleProcessedColumns" :value="column.key" />{{ column.label }}</label></div></div><UButton type="button" class="outline-button small" :disabled="processedLoading" @click="loadProcessed">{{ processedLoading ? '刷新中…' : '刷新' }}</UButton></div></header><div class="table-wrap"><table class="process-table wide-table"><thead><tr><th v-for="column in processedColumnOptions.filter(item => visibleProcessedColumns.includes(item.key))" :key="column.key">{{ column.label }}</th></tr></thead><tbody><tr v-if="processedLoading && !processedRows.length"><td :colspan="visibleProcessedColumns.length" class="empty-state">正在加载处理后数据…</td></tr><tr v-for="row in processedRows" :key="row.id"><td v-if="visibleProcessedColumns.includes('satelliteId')"><span class="tag info">{{ row.satelliteId || '-' }}</span></td><td v-if="visibleProcessedColumns.includes('parameter')"><span class="tag primary">{{ row.parameter || '-' }}</span></td><td v-if="visibleProcessedColumns.includes('parameterValue')" class="highlight-value">{{ row.parameterValue }}</td><td v-if="visibleProcessedColumns.includes('status')"><span class="tag success">{{ row.status || '-' }}</span></td><td v-if="visibleProcessedColumns.includes('interfaceId')">{{ row.interfaceId ?? '-' }}</td><td v-if="visibleProcessedColumns.includes('deduplication')"><span :class="['tag', row.deduplication === '去重' ? 'warning' : 'neutral']">{{ row.deduplication }}</span></td><td v-if="visibleProcessedColumns.includes('processTime')">{{ row.processTime }}</td></tr><tr v-if="!processedLoading && !processedRows.length"><td :colspan="visibleProcessedColumns.length" class="empty-state">暂无数据</td></tr></tbody></table></div></section>

    <section v-else-if="activeTab === 'telemetry'" class="telemetry-content"><article class="data-card query-card"><header class="card-header"><h2>参数查询</h2></header><div class="query-grid"><label>卫星<AppSelect v-model="queryForm.satellite"><option value="">全部卫星</option><option v-for="item in satelliteOptions" :key="item" :value="item">{{ item }}</option></AppSelect></label><label>通道<AppSelect v-model="queryForm.channel"><option value="">全部通道</option><option v-for="item in channelOptions" :key="item" :value="item">{{ item }}</option></AppSelect></label><label>参数（多选）<AppSelect v-model="queryForm.param"><option value="">输入或选择遥测参数</option><option v-for="item in parameterOptions" :key="item" :value="item">{{ item }}</option></AppSelect></label><label>起始时间<UInput v-model="queryForm.startTime" type="datetime-local" class="app-input" /></label><label>结束时间<UInput v-model="queryForm.endTime" type="datetime-local" class="app-input" /></label><label>实时/延时<AppSelect v-model="queryForm.timeMode"><option value="">全部</option><option value="REALTIME">实时</option><option value="DELAYED">延时</option></AppSelect></label><label>帧检查结果<AppSelect v-model="queryForm.frameCheck"><option value="">全部</option><option value="UNKNOWN">未知</option><option value="CORRECT">正确</option><option value="ERROR">错误</option></AppSelect></label><div class="query-actions"><UButton type="button" class="primary-button" :disabled="isQuerying" @click="runQuery">{{ isQuerying ? '查询中…' : '查询' }}</UButton><UButton type="button" class="outline-button" @click="resetQuery">重置</UButton></div></div></article><article class="data-card query-result-card"><header class="card-header"><h2>查询结果</h2></header><div class="result-tabs"><UButton type="button" :class="{ active: selectedQueryView === 'curve' }" @click="selectedQueryView = 'curve'">曲线</UButton><UButton type="button" :class="{ active: selectedQueryView === 'table' }" @click="selectedQueryView = 'table'">表格</UButton></div><div v-if="selectedQueryView === 'curve'" ref="chartRef" class="param-query-chart" /><div v-else class="table-wrap"><table class="process-table"><thead><tr><th>遥测代号</th><th>时间戳</th><th>值</th></tr></thead><tbody><tr v-for="row in filteredQueryRows" :key="row.id"><td>{{ row.telemetryCode }}</td><td>{{ row.timestamp }}</td><td class="highlight-value">{{ row.paramValue }}</td></tr><tr v-if="!filteredQueryRows.length"><td colspan="3" class="empty-state">暂无数据</td></tr></tbody></table></div></article></section>

    <section v-else class="single-card data-card">
      <header class="card-header">
        <h2>{{ activeParameterTitle }}</h2>
        <div class="header-actions">
          <UButton type="button" class="outline-button small" :disabled="ruleImporting" @click="openConfigUpload">{{ ruleImporting ? '上传中…' : `上传${activeParameterActionLabel}配置` }}</UButton>
        </div>
      </header>
      <nav class="parameter-scope-tabs" aria-label="参数配置分类">
        <UButton type="button" :class="{ active: activeParameterScope === 'satellite' }" @click="switchParameterScope('satellite')">卫星</UButton>
        <UButton type="button" :class="{ active: activeParameterScope === 'device' }" @click="switchParameterScope('device')">设备</UButton>
      </nav>
      <nav class="satellite-tabs" :aria-label="`${activeParameterActionLabel}筛选`">
        <span v-if="deviceSatellitesLoading" class="parameter-source-empty">正在读取{{ activeParameterActionLabel }}列表…</span>
        <span v-else-if="!parameterSources.length" class="parameter-source-empty">暂无{{ activeParameterActionLabel }}，请先上传配置</span>
        <UButton v-for="item in parameterSources" v-else :key="item.id" type="button" :class="{ active: selectedParameterSourceId === item.id }" @click="selectParameterSource(item.id)">{{ sourceLabelFor(item) }}</UButton>
      </nav>
      <input ref="ruleImportInput" class="file-input" type="file" accept=".xls,.xlsx" @change="uploadParameterConfig">
      <div class="table-wrap">
        <table class="process-table wide-table param-table">
          <thead><tr><th v-for="column in activeParameterColumns" :key="column.key">{{ column.label }}</th></tr></thead>
          <tbody>
            <tr v-if="paramConfigLoading"><td colspan="20" class="empty-state">正在加载参数配置…</td></tr>
            <tr v-else-if="!selectedParameterSource"><td colspan="20" class="empty-state">请先选择{{ activeParameterActionLabel }}</td></tr>
            <tr v-else-if="!paramConfigs.length"><td colspan="20" class="empty-state">暂无参数配置</td></tr>
            <template v-else><tr v-for="row in paramConfigs" :key="row.id"><td>{{ activeParameterScope === 'satellite' ? row.satelliteId : row.deviceName }}</td><td>{{ row.sequence }}</td><td>{{ row.bitWidth }}</td><td>{{ row.telemetryName }}</td><td>{{ row.telemetryCode }}</td><td>{{ row.formulaType }}</td><td>{{ row.formulaDescription }}</td><td>{{ row.processParam }}</td><td>{{ row.decimalPlaces }}</td><td><span :class="['tag', row.alarmFlag ? 'warning' : 'neutral']">{{ row.alarmFlag ? '是' : '否' }}</span></td><td>{{ row.normalValue || '-' }}</td><td>{{ row.warningValue || '-' }}</td><td>{{ row.statusInfo || '-' }}</td><td>{{ row.relatedCommand || '-' }}</td><td>{{ row.system || '-' }}</td><td>{{ row.controlChannel || '-' }}</td><td>{{ row.mergeChannelCount }}</td><td>{{ row.delayChannel }}</td><td><span :class="['tag', row.storageTelemetry ? 'info' : 'neutral']">{{ row.storageTelemetry ? '是' : '否' }}</span></td><td>{{ row.calibrationFormula || '-' }}</td></tr></template>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="isFrameModalOpen && selectedFrameRow" class="modal-layer" @click.self="closeFrame"><section class="modal frame-modal" role="dialog" aria-modal="true"><header class="modal-header"><h3>原始帧数据{{ selectedFrameRow.rawLength ? `（${selectedFrameRow.rawLength} 字节）` : '' }}</h3><UButton type="button" class="icon-button" @click="closeFrame"><UIcon name="i-lucide-x" /></UButton></header><div class="modal-body"><div class="frame-view-meta"><span>卫星：{{ selectedFrameRow.satelliteCode }}</span><span>帧检：<b :class="{ 'error-text': selectedFrameRow.checkResult === 2 }">{{ frameLabel(selectedFrameRow.checkResult, selectedFrameRow.checkResultName) }}</b></span></div><pre class="frame-hex-dump">{{ selectedFrameRow.rawFrame || '暂无原始帧数据' }}</pre></div><footer class="modal-footer"><UButton type="button" class="primary-button" @click="closeFrame">关闭</UButton></footer></section></div>
  </div>
</template>

<style scoped>
.data-process-page { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 16px; color: var(--ui-text); }
.stats-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.stat-card, .data-card { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }
.stat-card { display: flex; align-items: center; gap: 12px; min-height: 86px; padding: 15px 18px; }
.stat-card > div { min-width: 0; }
.stat-card span, .stat-card em { display: block; color: var(--ui-text-muted); font-size: 12px; font-style: normal; }
.stat-card strong { display: block; margin-top: 4px; font-size: 25px; line-height: 1; }
.stat-card small { margin-left: 4px; font-size: 12px; font-weight: 400; }
.stat-card em { margin-top: 6px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.stat-blue { color: #8abbd9; }.stat-green { color: #45ad8d; }.stat-amber { color: #ecbe84; }.stat-red { color: #ef443c; }
.spin-icon { animation: spin 2s linear infinite; }
.tabs { display: flex; min-height: 38px; border-bottom: 1px solid var(--ui-border); overflow-x: auto; }
.tab-button { position: relative; flex: none; border: 0; background: transparent; color: var(--ui-text-muted); cursor: pointer; padding: 0 16px; font-size: 13px; }
.tab-button:hover, .tab-button.active { color: var(--ui-primary); }.tab-button.active::after { content: ''; position: absolute; right: 12px; bottom: -1px; left: 12px; height: 2px; background: var(--ui-primary); }
.task-layout { min-width: 0; }.task-side { display: grid; gap: 16px; }
.card-header { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 5px 12px; border-bottom: 1px solid var(--ui-border-muted); }.card-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 13px; font-weight: 600; }.header-actions { display: flex; align-items: center; gap: 8px; }
.table-wrap { overflow: auto; }.process-table { width: 100%; min-width: 520px; border-collapse: collapse; text-align: left; }.process-table th { padding: 7px 10px; color: var(--ui-text-muted); background: var(--ui-bg-muted); font-size: 11px; font-weight: 600; white-space: nowrap; }.process-table td { padding: 8px 10px; border-top: 1px solid var(--ui-border-muted); color: var(--ui-text); font-size: 12px; line-height: 16px; white-space: nowrap; }.task-table { min-width: 640px; }.empty-state { height: 96px; color: var(--ui-text-muted) !important; text-align: center; }.action-cell { display: flex; gap: 10px; }.text-button { border: 0; background: transparent; color: var(--ui-primary); cursor: pointer; padding: 0; font-size: 12px; }.text-button:hover { text-decoration: underline; }.text-button.danger { color: var(--ui-error); }.text-button.muted { color: var(--ui-text-dimmed); cursor: not-allowed; }.primary-button, .outline-button { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; border: 1px solid var(--ui-primary); border-radius: var(--ui-radius); cursor: pointer; padding: 0 11px; color: #fff; background: var(--ui-primary); font-size: 12px; }.primary-button:hover { filter: brightness(1.08); }.primary-button.small, .outline-button.small { min-height: 24px; padding: 0 8px; font-size: 11px; }.outline-button { color: var(--ui-primary); background: transparent; border-color: var(--ui-border); }.outline-button:hover { border-color: var(--ui-primary); }.primary-button:disabled, .outline-button:disabled { opacity: .55; cursor: wait; }
.rules-list { display: flex; flex-direction: column; gap: 2px; padding: 5px 8px; }.rule-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 4px; border-bottom: 1px solid var(--ui-border-muted); }.rule-item:last-child { border-bottom: 0; }.rule-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }.rule-meta strong { color: var(--ui-text); font-size: 13px; font-weight: 500; }.rule-meta span { color: var(--ui-text-muted); font-size: 11px; }.switch { position: relative; flex: none; width: 30px; height: 17px; border: 0; border-radius: 10px; background: var(--ui-border-accented); cursor: pointer; padding: 0; }.switch:disabled { cursor: wait; opacity: .65; }.switch i { position: absolute; top: 3px; left: 3px; width: 11px; height: 11px; border-radius: 50%; background: var(--ui-bg-elevated); transition: transform .18s; }.switch.enabled { background: var(--ui-primary); }.switch.enabled i { transform: translateX(13px); }
.compact-card .card-header { min-height: 36px; }.monitor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 4px 12px 8px; transition: opacity .16s; }.monitor-grid.loading { opacity: .55; }.monitor-grid > div { display: grid; gap: 2px; padding: 8px 6px; }.monitor-grid span { color: var(--ui-text-muted); font-size: 11px; }.monitor-grid strong { color: var(--ui-text-highlighted); font-size: 13px; font-weight: 600; }.log-list { display: grid; gap: 7px; padding: 10px 12px 12px; transition: opacity .16s; }.log-list.loading { opacity: .55; }.log-line { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--ui-text-muted); font-size: 11px; }.log-line time { flex: none; color: var(--ui-text-dimmed); }.log-line > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.log-empty { padding: 8px 0; color: var(--ui-text-muted); font-size: 11px; text-align: center; }
.tag { display: inline-flex; align-items: center; min-height: 18px; border: 1px solid var(--ui-border); border-radius: 3px; padding: 0 5px; font-size: 10px; line-height: 16px; }.tag.primary { color: var(--ui-primary); border-color: color-mix(in srgb, var(--ui-primary) 45%, transparent); }.tag.success { color: var(--ui-success); border-color: color-mix(in srgb, var(--ui-success) 45%, transparent); }.tag.warning { color: var(--ui-warning); border-color: color-mix(in srgb, var(--ui-warning) 45%, transparent); }.tag.error { color: var(--ui-error); border-color: color-mix(in srgb, var(--ui-error) 45%, transparent); }.tag.info { color: var(--ui-info); border-color: color-mix(in srgb, var(--ui-info) 45%, transparent); }.tag.neutral { color: var(--ui-text-muted); }.highlight-value { color: var(--ui-text-highlighted) !important; font-weight: 600; }.frame-preview { color: var(--ui-primary) !important; cursor: pointer; font-family: SFMono-Regular, Consolas, monospace; }.frame-preview:hover { text-decoration: underline; }
.realtime-content { display: grid; gap: 10px; }.realtime-filter-bar { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 6px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }.realtime-filter-bar label { color: var(--ui-text-muted); font-size: 12px; }.realtime-filter-bar select { width: 220px; min-height: 30px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: none; background: var(--ui-bg-elevated); color: var(--ui-text); padding: 0 8px; font-size: 12px; }.realtime-filter-bar select:focus { border-color: var(--ui-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 22%, transparent); }.realtime-screen-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: minmax(250px, calc(50vh - 146px)); gap: 10px; }.realtime-card { min-width: 0; min-height: 0; overflow: hidden; }.realtime-card .table-wrap { height: calc(100% - 43px); }.realtime-card .process-table th, .realtime-card .process-table td { padding: 4px 8px; font-size: 11px; }
.single-card { min-width: 0; overflow: visible; }.wide-table { min-width: 1500px; }.param-table { min-width: 2200px; }.query-card, .query-result-card { overflow: visible; }.query-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: end; padding: 13px 14px 14px; }.query-grid label, .satellite-filter { display: grid; gap: 6px; color: var(--ui-text-muted); font-size: 11px; }.query-grid input, .query-grid select, .satellite-filter select, .modal-body input, .modal-body select { width: 100%; min-height: 30px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: none; background: var(--ui-bg-elevated); color: var(--ui-text); padding: 0 8px; font-size: 12px; }.query-grid input:focus, .query-grid select:focus, .satellite-filter select:focus, .modal-body input:focus, .modal-body select:focus { border-color: var(--ui-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 22%, transparent); }.query-actions { display: flex; align-items: center; gap: 8px; min-height: 30px; }.result-tabs { display: flex; gap: 4px; padding: 8px 12px 0; border-bottom: 1px solid var(--ui-border-muted); }.result-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ui-text-muted); cursor: pointer; padding: 4px 10px 7px; font-size: 12px; }.result-tabs button.active { color: var(--ui-primary); border-color: var(--ui-primary); }.param-query-chart { width: 100%; height: 360px; }.satellite-filter { display: flex; align-items: center; gap: 10px; margin: 12px 14px 10px; }.satellite-filter select { width: 220px; }.column-picker { position: relative; }.column-picker-panel { position: absolute; z-index: 50; top: calc(100% + 6px); right: 0; display: flex; flex-direction: column; gap: 2px; width: 160px; max-height: 280px; overflow: auto; padding: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); box-shadow: 0 16px 40px #00000060; }.column-picker-panel label { display: flex; align-items: center; gap: 8px; padding: 5px 6px; color: var(--ui-text); cursor: pointer; font-size: 12px; }.column-picker-panel label:hover { background: var(--ui-bg-muted); }
.modal-layer { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; padding: 20px; background: #00000080; }.modal { width: min(560px, 100%); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); box-shadow: 0 18px 48px #00000080; }.wide-modal { width: min(1040px, 100%); }.frame-modal { width: min(760px, 100%); }.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--ui-border); }.modal-header h3 { margin: 0; color: var(--ui-text-highlighted); font-size: 14px; }.icon-button { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: transparent; color: var(--ui-text-muted); cursor: pointer; }.modal-body { display: grid; gap: 13px; padding: 16px; }.modal-body label { display: grid; gap: 6px; color: var(--ui-text); font-size: 12px; }.param-form { grid-template-columns: repeat(3, minmax(0, 1fr)); max-height: 60vh; overflow: auto; }.checkbox-field { display: flex !important; align-items: center; grid-template-columns: auto 1fr; }.checkbox-field input { width: auto; min-height: auto; }.frame-view-meta { display: flex; gap: 20px; color: var(--ui-text-muted); font-size: 12px; }.error-text { color: var(--ui-error); }.frame-hex-dump { max-height: 420px; overflow: auto; margin: 0; border-radius: var(--ui-radius); background: var(--ui-bg-muted); color: var(--ui-text-highlighted); padding: 12px 14px; font: 12px/1.6 SFMono-Regular, Consolas, monospace; }.modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--ui-border); }
.parameter-scope-tabs { display: flex; min-height: 40px; align-items: end; gap: 4px; overflow-x: auto; padding: 0 12px; border-bottom: 1px solid var(--ui-border-muted); background: var(--ui-bg-muted); }.parameter-scope-tabs button { position: relative; height: 40px; flex: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ui-text-muted); cursor: pointer; padding: 0 14px; font-size: 12px; white-space: nowrap; }.parameter-scope-tabs button:hover, .parameter-scope-tabs button.active { color: var(--ui-primary); }.parameter-scope-tabs button.active { border-bottom-color: var(--ui-primary); font-weight: 600; }
.parameter-source-empty { align-self: center; padding: 0 11px; color: var(--ui-text-muted); font-size: 12px; }.file-input { display: none; }
.satellite-tabs { display: flex; min-height: 36px; align-items: end; gap: 4px; overflow-x: auto; padding: 0 12px; border-bottom: 1px solid var(--ui-border-muted); }.satellite-tabs button { position: relative; height: 36px; flex: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ui-text-muted); cursor: pointer; padding: 0 11px; font-size: 12px; white-space: nowrap; }.satellite-tabs button:hover, .satellite-tabs button.active { color: var(--ui-primary); }.satellite-tabs button.active { border-bottom-color: var(--ui-primary); font-weight: 600; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1200px) { .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }.task-layout { grid-template-columns: 1fr; }.query-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .stats-row { gap: 10px; }.stat-card { padding: 12px; }.realtime-filter-bar { align-items: flex-start; flex-direction: column; }.realtime-filter-bar select { width: 100%; }.realtime-screen-grid { grid-template-columns: 1fr; grid-auto-rows: 280px; }.query-grid { grid-template-columns: 1fr; }.param-form { grid-template-columns: 1fr; }.tab-button { padding: 0 11px; } }
</style>
