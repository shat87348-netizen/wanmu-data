<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

type DataAlarm = {
  id: number
  taskId?: string
  alarmTime?: string
  sourceName?: string
  alarmMsg?: string
  alarmLevel?: number
  alarmStatus?: number
  taskName?: string
  channelCode?: string
  triggerRule?: string
}
type SystemAlarm = {
  id: number
  alarmTime?: string
  objName?: string
  alarmType?: string
  alarmContent?: string
  alarmLevel?: number
  alarmStatus?: number
}
type PageResponse<T> = { total?: number, records?: T[], list?: T[] }
type RecordValue = Record<string, unknown>

const { request } = useAdminApi()
const { taskId } = useTaskContext()
const toast = useToast()
const { load: loadAlarmsLookup, options: alarmOptions, label: alarmLabel } = useModuleLookup('alarms')
const activeTab = ref<'data' | 'system'>('data')
const dataLoading = ref(false)
const systemLoading = ref(false)
const processing = ref(false)
const alarms = ref<DataAlarm[]>([])
const sources = ref<string[]>([])
const dataTotal = ref(0)
const selectedIds = ref<number[]>([])
const detail = ref<DataAlarm | null>(null)
const detailOpen = ref(false)
const monitor = ref<RecordValue>({})
const systemAlarms = ref<SystemAlarm[]>([])
const systemEvents = ref<RecordValue[]>([])
const filters = reactive({ source: '', keyword: '', level: '', status: '', startTime: '', endTime: '' })

const dataLevelOptions = computed(() => [{ value: '', label: '全部级别' }, ...alarmOptions('dataAlarmLevel')])
const dataStatusOptions = computed(() => [{ value: '', label: '全部状态' }, ...alarmOptions('dataAlarmStatus')])

const recordOf = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {}
const toArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : []
const valueOf = (record: RecordValue, keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}
const numberOf = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const dataRowsFrom = (value: unknown) => {
  if (Array.isArray(value)) return value as DataAlarm[]
  const record = recordOf(value)
  return toArray<DataAlarm>(record.records || record.list || record.data)
}
const totalFrom = (value: unknown, rows: unknown[]) => Number(recordOf(value).total ?? rows.length)

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value.replace('T', ' ').replace('Z', '') : date.toLocaleString('zh-CN', { hour12: false })
}
const dataLevelText = (level?: number) => alarmLabel('dataAlarmLevel', level)
const systemLevelText = (level?: number) => alarmLabel('systemAlarmLevel', level)
const levelClass = (level?: number) => Number(level) >= 4 ? 'level-critical' : Number(level) === 3 ? 'level-major' : Number(level) === 2 ? 'level-warning' : 'level-info'
const statusText = (value?: number) => alarmLabel('dataAlarmStatus', value)
const systemStatusText = (value?: number) => alarmLabel('systemAlarmStatus', value)
const statusClass = (value?: number) => Number(value) === 1 ? 'status-done' : 'status-pending'

const queryString = () => {
  const params = new URLSearchParams({ pageNum: '1', pageSize: '100' })
  if (taskId.value) params.set('taskId', String(taskId.value))
  if (filters.source) params.set('sourceName', filters.source)
  if (filters.keyword) params.set('keyword', filters.keyword)
  if (filters.level) params.set('alarmLevel', filters.level)
  if (filters.status) params.set('alarmStatus', filters.status)
  if (filters.startTime) params.set('startTime', new Date(filters.startTime).toISOString())
  if (filters.endTime) params.set('endTime', new Date(filters.endTime).toISOString())
  return params.toString()
}

const loadSources = async () => {
  try {
    const task = taskId.value ? `?taskId=${encodeURIComponent(String(taskId.value))}` : ''
    const data = await request<string[]>(`/alarms/data/sources${task}`)
    sources.value = Array.isArray(data) ? data : []
  } catch {
    sources.value = []
  }
}

const loadDataAlarms = async () => {
  dataLoading.value = true
  try {
    const data = await request<PageResponse<DataAlarm> | DataAlarm[]>(`/alarms/data?${queryString()}`)
    const rows = dataRowsFrom(data)
    alarms.value = rows
    dataTotal.value = totalFrom(data, rows)
    selectedIds.value = []
  } catch (error) {
    alarms.value = []
    dataTotal.value = 0
    toast.add({ title: '数据告警加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    dataLoading.value = false
  }
}

const search = async () => {
  await loadDataAlarms()
}

const reset = async () => {
  Object.assign(filters, { source: '', keyword: '', level: '', status: '', startTime: '', endTime: '' })
  await loadDataAlarms()
}

const toggleSelected = (id: number, checked: boolean) => {
  selectedIds.value = checked ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter(item => item !== id)
}
const allUnhandledIds = computed(() => alarms.value.filter(alarm => Number(alarm.alarmStatus) !== 1).map(alarm => alarm.id))
const allSelected = computed(() => allUnhandledIds.value.length > 0 && allUnhandledIds.value.every(id => selectedIds.value.includes(id)))
const toggleAll = (checked: boolean) => { selectedIds.value = checked ? allUnhandledIds.value : [] }

const setHandled = async (ids: number[]) => {
  const targetIds = ids.filter(Boolean)
  if (!targetIds.length) return
  processing.value = true
  try {
    await Promise.all(targetIds.map(id => request<void>('/alarms/data/status', { method: 'POST', body: { id, status: 1 } })))
    toast.add({ title: '告警已标记为已处理', color: 'success' })
    await loadDataAlarms()
  } catch (error) {
    toast.add({ title: '告警处理失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    processing.value = false
  }
}

const openDetail = async (alarm: DataAlarm) => {
  detail.value = alarm
  detailOpen.value = true
  try {
    detail.value = await request<DataAlarm>(`/alarms/data/${encodeURIComponent(String(alarm.id))}`)
  } catch {
    // 列表已包含告警摘要，详情请求失败时仍展示当前记录。
  }
}

const eventRows = computed(() => systemEvents.value.map((event, index) => ({
  id: Number(valueOf(event, ['id', 'eventId'])) || index,
  time: String(valueOf(event, ['alarmTime', 'time', 'eventTime', 'createdAt']) || ''),
  target: String(valueOf(event, ['objName', 'target', 'source', 'objectName']) || '-'),
  type: String(valueOf(event, ['alarmType', 'type', 'eventType']) || '-'),
  content: String(valueOf(event, ['alarmContent', 'content', 'message', 'description']) || '-'),
  level: Number(valueOf(event, ['alarmLevel', 'level', 'severity']) || 0),
  status: Number(valueOf(event, ['alarmStatus', 'status']) || 0)
})))

const metric = (keys: string[]) => valueOf(monitor.value, keys)
const metricText = (keys: string[], suffix = '') => {
  const value = metric(keys)
  return value === undefined ? '--' : `${value}${suffix}`
}
const metricPercent = (keys: string[]) => {
  const value = numberOf(metric(keys))
  if (value === null) return 0
  return Math.max(0, Math.min(100, value > 1 ? value : value * 100))
}
const systemSummary = computed(() => [
  { label: '运行状态', value: metricText(['statusName', 'systemStatus', 'serviceStatus']), icon: 'i-lucide-power', tone: 'success' },
  { label: '健康评分', value: metricText(['healthScore', 'score'], '%'), icon: 'i-lucide-heart-pulse', tone: 'success' },
  { label: '资源负载', value: metricText(['cpuUsage', 'cpuPercent', 'cpu'], '%'), icon: 'i-lucide-gauge', tone: 'neutral' },
  { label: '系统告警', value: String(systemAlarms.value.filter(alarm => Number(alarm.alarmStatus) !== 1).length), icon: 'i-lucide-server-crash', tone: 'warning' }
])
const healthItems = computed(() => [
  { label: 'CPU 负载', value: metricText(['cpuUsage', 'cpuPercent', 'cpu'], '%'), percent: metricPercent(['cpuUsage', 'cpuPercent', 'cpu']) },
  { label: '内存使用', value: metricText(['memoryUsage', 'memUsage', 'memoryPercent'], '%'), percent: metricPercent(['memoryUsage', 'memUsage', 'memoryPercent']) },
  { label: '磁盘空间', value: metricText(['diskUsage', 'diskPercent'], '%'), percent: metricPercent(['diskUsage', 'diskPercent']) },
  { label: '消息队列', value: metricText(['queueDepth', 'queueSize', 'pendingMessages']), percent: metricPercent(['queueUsage', 'queuePercent']) },
  { label: '数据库连接', value: metricText(['databaseLatency', 'dbLatency', 'databaseStatus']), percent: metricPercent(['databaseUsage', 'dbUsage']) },
  { label: '节点心跳', value: metricText(['agentStatus', 'agentHeartbeat', 'nodeHeartbeat']), percent: metricPercent(['heartbeatPercent', 'nodeHealth']) }
])

const loadSystem = async () => {
  systemLoading.value = true
  try {
    const [current, alarmsData, events] = await Promise.all([
      request<unknown>('/alarms/system-monitor/current'),
      request<unknown>('/alarms/system'),
      request<unknown>('/alarms/system-monitor/events')
    ])
    monitor.value = recordOf(current)
    systemAlarms.value = Array.isArray(alarmsData) ? alarmsData as SystemAlarm[] : toArray<SystemAlarm>(recordOf(alarmsData).records || recordOf(alarmsData).list || recordOf(alarmsData).data)
    systemEvents.value = toArray<RecordValue>(Array.isArray(events) ? events : recordOf(events).records || recordOf(events).list || recordOf(events).data)
  } catch (error) {
    monitor.value = {}
    systemAlarms.value = []
    systemEvents.value = []
    toast.add({ title: '系统告警加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    systemLoading.value = false
  }
}

watch(activeTab, (tab) => { if (tab === 'system') loadSystem() })
onMounted(async () => {
  await Promise.all([loadSources(), loadDataAlarms(), loadAlarmsLookup().catch(() => undefined)])
})
</script>

<template>
  <main class="alarm-page">
    <nav class="alarm-tabs" aria-label="告警类型"><UButton type="button" :class="{ active: activeTab === 'data' }" @click="activeTab = 'data'"><UIcon name="i-lucide-radar" />数据监测告警</UButton><UButton type="button" :class="{ active: activeTab === 'system' }" @click="activeTab = 'system'"><UIcon name="i-lucide-server-cog" />系统告警</UButton></nav>

    <template v-if="activeTab === 'data'">
      <section class="kpi-grid"><article class="kpi-card"><UIcon name="i-lucide-bell" /><div><span>告警总数</span><strong>{{ dataTotal }}</strong></div></article><article class="kpi-card error"><UIcon name="i-lucide-octagon-alert" /><div><span>严重告警</span><strong>{{ alarms.filter(item => Number(item.alarmLevel) >= 4).length }}</strong></div></article><article class="kpi-card warning"><UIcon name="i-lucide-triangle-alert" /><div><span>一般告警</span><strong>{{ alarms.filter(item => Number(item.alarmLevel) === 2 || Number(item.alarmLevel) === 3).length }}</strong></div></article><article class="kpi-card warning"><UIcon name="i-lucide-circle-alert" /><div><span>未处理</span><strong>{{ allUnhandledIds.length }}</strong></div></article></section>
      <section class="alarm-card">
        <header class="filter-bar"><div class="filter-fields"><AppSelect v-model="filters.source" aria-label="告警来源"><option value="">全部来源</option><option v-for="source in sources" :key="source" :value="source">{{ source }}</option></AppSelect><UInput v-model.trim="filters.keyword" type="search" autocomplete="off" placeholder="关键字" @keyup.enter="search" class="app-input" /><AppSelect v-model="filters.level" aria-label="告警级别"><option v-for="item in dataLevelOptions" :key="item.value" :value="item.value">{{ item.label }}</option></AppSelect><AppSelect v-model="filters.status" aria-label="处理状态"><option v-for="item in dataStatusOptions" :key="item.value" :value="item.value">{{ item.label }}</option></AppSelect><label class="time-filter"><span>时间范围</span><UInput v-model="filters.startTime" type="datetime-local" step="1" class="app-input" /><i>至</i><UInput v-model="filters.endTime" type="datetime-local" step="1" class="app-input" /></label><UButton type="button" class="primary-button" :disabled="dataLoading" @click="search"><UIcon name="i-lucide-search" />搜索</UButton><UButton type="button" class="outline-button" :disabled="dataLoading" @click="reset"><UIcon name="i-lucide-rotate-ccw" />重置</UButton></div><div class="filter-actions"><UButton type="button" class="outline-button" :disabled="processing || !allUnhandledIds.length" @click="setHandled(allUnhandledIds)">全部标记为已处理</UButton><UButton v-if="selectedIds.length" type="button" class="primary-button" :disabled="processing" @click="setHandled(selectedIds)">处理所选 {{ selectedIds.length }} 条</UButton><UButton type="button" class="outline-button small" :disabled="dataLoading" @click="loadDataAlarms"><UIcon name="i-lucide-refresh-cw" />刷新</UButton></div></header>
        <div class="table-scroll"><table class="alarm-table"><thead><tr><th class="check-cell"><UCheckbox :model-value="allSelected" :disabled="!allUnhandledIds.length" aria-label="选择未处理告警" @update:model-value="toggleAll(Boolean($event))" /></th><th>时间</th><th>来源</th><th>告警信息</th><th>级别</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-if="dataLoading"><td colspan="7" class="empty-cell">加载中...</td></tr><tr v-else-if="!alarms.length"><td colspan="7" class="empty-cell">暂无告警</td></tr><tr v-for="alarm in alarms" :key="alarm.id"><td class="check-cell"><UCheckbox :model-value="selectedIds.includes(alarm.id)" :disabled="Number(alarm.alarmStatus) === 1" aria-label="选择告警" @update:model-value="toggleSelected(alarm.id, Boolean($event))" /></td><td class="time-cell">{{ formatTime(alarm.alarmTime) }}</td><td>{{ alarm.sourceName || '-' }}</td><td class="ellipsis-cell">{{ alarm.alarmMsg || '-' }}</td><td><span :class="['level-tag', levelClass(alarm.alarmLevel)]">{{ dataLevelText(alarm.alarmLevel) }}</span></td><td><span :class="['status-tag', statusClass(alarm.alarmStatus)]">{{ statusText(alarm.alarmStatus) }}</span></td><td class="action-cell"><UButton type="button" class="text-button" @click="openDetail(alarm)">详情</UButton><UButton v-if="Number(alarm.alarmStatus) !== 1" type="button" class="text-button" :disabled="processing" @click="setHandled([alarm.id])">处理</UButton></td></tr></tbody></table></div>
      </section>
    </template>

    <template v-else>
      <section class="system-summary-grid"><article v-for="item in systemSummary" :key="item.label" :class="['system-summary-card', item.tone]"><UIcon :name="item.icon" /><div><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div></article></section>
      <section class="system-grid"><article class="alarm-card runtime-card"><header class="card-header"><h2><UIcon name="i-lucide-activity" />系统运行状况</h2></header><dl class="runtime-list"><div><dt>服务状态</dt><dd>{{ metricText(['statusName', 'systemStatus', 'serviceStatus']) }}</dd></div><div><dt>运行时长</dt><dd>{{ metricText(['uptime', 'uptimeText', 'runningTime']) }}</dd></div><div><dt>处理节点</dt><dd>{{ metricText(['onlineNodeCount', 'nodeCount', 'onlineNodes']) }}</dd></div><div><dt>数据库连接</dt><dd>{{ metricText(['databaseLatency', 'dbLatency', 'databaseStatus']) }}</dd></div><div><dt>消息队列</dt><dd>{{ metricText(['queueDepth', 'queueSize', 'pendingMessages']) }}</dd></div><div><dt>最近巡检</dt><dd>{{ metricText(['sampleTime', 'inspectTime', 'checkTime']) }}</dd></div></dl></article><article class="alarm-card health-card"><header class="card-header"><h2><UIcon name="i-lucide-heart-pulse" />健康状态</h2></header><div class="health-list"><div v-for="item in healthItems" :key="item.label" class="health-item"><div><span>{{ item.label }}</span><strong>{{ item.value }}</strong></div><div class="health-bar"><i :style="{ width: `${item.percent}%` }" /></div></div></div></article></section>
      <section class="alarm-card"><header class="card-header"><h2><UIcon name="i-lucide-server-crash" />系统告警事件</h2><UButton type="button" class="outline-button small" :disabled="systemLoading" @click="loadSystem"><UIcon name="i-lucide-refresh-cw" />刷新</UButton></header><div class="table-scroll"><table class="alarm-table"><thead><tr><th>时间</th><th>系统对象</th><th>类型</th><th>告警内容</th><th>级别</th><th>状态</th></tr></thead><tbody><tr v-if="systemLoading"><td colspan="6" class="empty-cell">加载中...</td></tr><tr v-else-if="!eventRows.length && !systemAlarms.length"><td colspan="6" class="empty-cell">暂无系统告警</td></tr><tr v-for="event in eventRows" :key="`event-${event.id}`"><td class="time-cell">{{ formatTime(event.time) }}</td><td>{{ event.target }}</td><td>{{ event.type }}</td><td class="ellipsis-cell">{{ event.content }}</td><td><span :class="['level-tag', levelClass(event.level)]">{{ systemLevelText(event.level) }}</span></td><td><span :class="['status-tag', statusClass(event.status)]">{{ systemStatusText(event.status) }}</span></td></tr><tr v-for="alarm in systemAlarms" :key="`alarm-${alarm.id}`"><td class="time-cell">{{ formatTime(alarm.alarmTime) }}</td><td>{{ alarm.objName || '-' }}</td><td>{{ alarm.alarmType || '-' }}</td><td class="ellipsis-cell">{{ alarm.alarmContent || '-' }}</td><td><span :class="['level-tag', levelClass(alarm.alarmLevel)]">{{ systemLevelText(alarm.alarmLevel) }}</span></td><td><span :class="['status-tag', statusClass(alarm.alarmStatus)]">{{ systemStatusText(alarm.alarmStatus) }}</span></td></tr></tbody></table></div></section>
    </template>

    <Teleport to="body"><div v-if="detailOpen" class="modal-layer" @click.self="detailOpen = false"><section class="detail-modal" role="dialog" aria-modal="true" aria-labelledby="alarm-detail-title"><header class="modal-header"><h2 id="alarm-detail-title">告警详情</h2><UButton type="button" class="icon-button" aria-label="关闭" @click="detailOpen = false"><UIcon name="i-lucide-x" /></UButton></header><dl v-if="detail" class="detail-list"><div><dt>时间</dt><dd>{{ formatTime(detail.alarmTime) }}</dd></div><div><dt>来源</dt><dd>{{ detail.sourceName || '-' }}</dd></div><div><dt>级别</dt><dd><span :class="['level-tag', levelClass(detail.alarmLevel)]">{{ dataLevelText(detail.alarmLevel) }}</span></dd></div><div><dt>状态</dt><dd><span :class="['status-tag', statusClass(detail.alarmStatus)]">{{ statusText(detail.alarmStatus) }}</span></dd></div><div><dt>告警信息</dt><dd>{{ detail.alarmMsg || '-' }}</dd></div><div><dt>任务</dt><dd>{{ detail.taskName || '-' }}</dd></div><div><dt>通道</dt><dd>{{ detail.channelCode || '-' }}</dd></div><div><dt>触发规则</dt><dd>{{ detail.triggerRule || '-' }}</dd></div></dl></section></div></Teleport>
  </main>
</template>

<style scoped>
.alarm-page { min-width: 0; }.alarm-tabs { display: flex; gap: 22px; height: 48px; align-items: end; margin-bottom: 14px; border-bottom: 1px solid var(--ui-border); }.alarm-tabs button { position: relative; display: inline-flex; height: 48px; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--ui-text-muted); font-size: 14px; cursor: pointer; }.alarm-tabs button.active { color: var(--ui-primary); font-weight: 650; }.alarm-tabs button.active::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; background: var(--ui-primary); content: ''; }.kpi-grid, .system-summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }.kpi-card, .system-summary-card, .alarm-card { overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }.kpi-card, .system-summary-card { display: flex; min-height: 100px; align-items: center; gap: 14px; padding: 16px; }.kpi-card > .i-lucide, .system-summary-card > .i-lucide { width: 24px; height: 24px; color: var(--ui-primary); }.kpi-card span, .system-summary-card span { color: var(--ui-text-muted); font-size: 12px; }.kpi-card strong, .system-summary-card strong { display: block; margin-top: 7px; color: var(--ui-text-highlighted); font-size: 25px; font-weight: 650; line-height: 1; }.kpi-card.error > .i-lucide, .kpi-card.error strong { color: var(--ui-error); }.kpi-card.warning > .i-lucide, .kpi-card.warning strong, .system-summary-card.warning > .i-lucide { color: var(--ui-warning); }.filter-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid var(--ui-border); }.filter-fields, .filter-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }.filter-fields select, .filter-fields input { height: 30px; min-width: 100px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: 0; background: var(--ui-bg); color: var(--ui-text); padding: 0 8px; font-size: 12px; }.filter-fields input[type="search"] { width: 152px; }.filter-fields select:focus, .filter-fields input:focus { border-color: var(--ui-primary); }.time-filter { display: flex; align-items: center; gap: 5px; color: var(--ui-text-muted); font-size: 11px; }.time-filter input { min-width: 154px; }.time-filter i { font-style: normal; }.primary-button, .outline-button { display: inline-flex; height: 30px; align-items: center; justify-content: center; gap: 5px; padding: 0 9px; border-radius: var(--ui-radius); font-size: 12px; white-space: nowrap; cursor: pointer; }.primary-button { border: 1px solid var(--ui-primary); background: var(--ui-primary); color: white; }.outline-button { border: 1px solid var(--ui-border); background: transparent; color: var(--ui-text); }.small { height: 28px; padding: 0 8px; }.primary-button:disabled, .outline-button:disabled { opacity: .5; cursor: not-allowed; }.table-scroll { overflow: auto; }.alarm-table { width: 100%; min-width: 880px; border-collapse: collapse; table-layout: fixed; }.alarm-table th, .alarm-table td { height: 42px; padding: 7px 10px; border-bottom: 1px solid var(--ui-border-muted); color: var(--ui-text); text-align: left; font-size: 12px; }.alarm-table th { background: color-mix(in srgb, var(--ui-bg-muted) 65%, transparent); color: var(--ui-text-muted); font-weight: 600; }.alarm-table th:nth-child(2) { width: 170px; }.alarm-table th:nth-child(3) { width: 140px; }.alarm-table th:nth-child(5), .alarm-table th:nth-child(6) { width: 78px; }.alarm-table th:last-child { width: 88px; }.check-cell { width: 42px; text-align: center !important; }.time-cell { color: var(--ui-text-muted) !important; font-variant-numeric: tabular-nums; }.ellipsis-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.level-tag, .status-tag { display: inline-flex; min-width: 45px; justify-content: center; padding: 2px 6px; border-radius: 2px; font-size: 11px; white-space: nowrap; }.level-critical { background: #ef44441f; color: var(--ui-error); }.level-major, .level-warning { background: #fbbf241f; color: var(--ui-warning); }.level-info { background: #38bdf81f; color: var(--ui-primary); }.status-done { background: #22c55e1f; color: var(--ui-success); }.status-pending { background: #fbbf241f; color: var(--ui-warning); }.action-cell { display: flex; gap: 7px; }.text-button { border: 0; background: transparent; color: var(--ui-primary); font-size: 12px; cursor: pointer; }.text-button:disabled { opacity: .5; cursor: not-allowed; }.empty-cell { height: 120px !important; color: var(--ui-text-muted) !important; text-align: center !important; }.system-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 14px; margin-bottom: 14px; }.card-header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border); }.card-header h2 { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--ui-text-highlighted); font-size: 14px; font-weight: 650; }.runtime-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; background: var(--ui-border-muted); }.runtime-list > div { display: grid; min-height: 72px; align-content: center; gap: 5px; padding: 10px; background: var(--ui-bg-elevated); }.runtime-list dt { color: var(--ui-text-muted); font-size: 11px; }.runtime-list dd { margin: 0; overflow: hidden; color: var(--ui-text); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.health-list { display: grid; gap: 0; padding: 2px 12px; }.health-item { padding: 9px 0; border-bottom: 1px solid var(--ui-border-muted); }.health-item:last-child { border-bottom: 0; }.health-item > div:first-child { display: flex; justify-content: space-between; color: var(--ui-text-muted); font-size: 12px; }.health-item strong { color: var(--ui-text); font-weight: 500; }.health-bar { height: 5px; overflow: hidden; margin-top: 7px; border-radius: 99px; background: var(--ui-border-muted); }.health-bar i { display: block; height: 100%; border-radius: inherit; background: var(--ui-primary); }.modal-layer { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; background: #0000008c; padding: 16px; }.detail-modal { width: min(600px, 100%); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); box-shadow: 0 24px 72px #00000080; }.modal-header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--ui-border); }.modal-header h2 { margin: 0; font-size: 15px; }.icon-button { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: var(--ui-radius); background: transparent; color: var(--ui-text-muted); cursor: pointer; }.detail-list { display: grid; margin: 0; padding: 14px; }.detail-list > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ui-border-muted); font-size: 13px; }.detail-list > div:last-child { border-bottom: 0; }.detail-list dt { color: var(--ui-text-muted); }.detail-list dd { margin: 0; color: var(--ui-text); word-break: break-word; }@media (max-width: 1180px) { .filter-bar { flex-direction: column; }.system-grid { grid-template-columns: 1fr; } }@media (max-width: 780px) { .kpi-grid, .system-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.time-filter { width: 100%; }.time-filter input { flex: 1; min-width: 0; } }@media (max-width: 480px) { .kpi-grid, .system-summary-grid, .runtime-list { grid-template-columns: 1fr; } }
.alarm-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}

.alarm-page > .alarm-card:last-of-type {
  display: flex;
  min-height: 280px;
  flex: 1;
  flex-direction: column;
}

.alarm-page > .alarm-card:last-of-type > .table-scroll {
  min-height: 0;
  flex: 1;
}

.alarm-page > .alarm-card:last-of-type .alarm-table {
  min-height: 100%;
}

.filter-fields {
  min-width: 0;
  flex: 1 1 auto;
}

.filter-fields > .app-select {
  width: 120px;
  flex: 0 0 120px;
}

.filter-fields > .app-input {
  width: 152px;
  flex: 0 0 152px;
}

.time-filter {
  flex: 0 0 auto;
}

.time-filter .app-input {
  width: 154px;
  flex: 0 0 154px;
}
</style>
