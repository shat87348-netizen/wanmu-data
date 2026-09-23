<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

type RawRecord = Record<string, unknown>
type AgentInstance = {
  id: string
  protocol: string
  status: string
  rxRate: number | null
  rxMessages: number | null
  rxBytes: number | null
  errorCount: number | null
  lastError: string
}
type Agent = {
  id: string
  label: string
  host: string
  status: string
  firstSeen: string
  lastHeartbeat: string
  version: string
  os: string
  protocols: string[]
  cpuUsage: number | null
  memUsage: number | null
  instances: AgentInstance[]
  events: Array<{ id: string, protocol: string, message: string, time: string }>
}

const { request } = useAdminApi()
const toast = useToast()
const loading = ref(false)
const detailLoading = ref(false)
const deleting = ref(false)
const agents = ref<Agent[]>([])
const selectedId = ref('')

const valueOf = (record: RawRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

const stringOf = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value)
const numberOf = (value: unknown) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}
const asArray = (value: unknown) => Array.isArray(value) ? value : []
const recordOf = (value: unknown): RawRecord => value && typeof value === 'object' ? value as RawRecord : {}
const asRecordList = (value: unknown) => asArray(value).map(recordOf)

const normalizeStatus = (value: unknown) => {
  const status = stringOf(value, 'UNKNOWN').toUpperCase()
  if (['RUNNING', 'ONLINE', 'ACTIVE'].includes(status)) return 'ONLINE'
  if (['ERROR', 'BLOCKED', 'FAILED'].includes(status)) return 'ERROR'
  if (['STOPPED', 'OFFLINE', 'INACTIVE'].includes(status)) return 'OFFLINE'
  return status
}

const normalizeInstance = (item: RawRecord, index: number): AgentInstance => ({
  id: stringOf(valueOf(item, ['interfaceInstanceId', 'instanceId', 'id']), `instance-${index}`),
  protocol: stringOf(valueOf(item, ['protocol', 'protocolType', 'name', 'type']), '-'),
  status: normalizeStatus(valueOf(item, ['state', 'status'])),
  rxRate: numberOf(valueOf(item, ['rxRate', 'rate', 'currentRate'])),
  rxMessages: numberOf(valueOf(item, ['rxMessages', 'receivedMessages'])),
  rxBytes: numberOf(valueOf(item, ['rxBytes', 'receivedBytes'])),
  errorCount: numberOf(valueOf(item, ['errorCount', 'errors'])),
  lastError: stringOf(valueOf(item, ['lastError', 'errorMessage']))
})

const normalizeAgent = (item: RawRecord): Agent => {
  const instances = asRecordList(valueOf(item, ['instances', 'interfaceInstances', 'channels'])).map(normalizeInstance)
  const rawProtocols = asArray(valueOf(item, ['protocols', 'protocolList', 'collectProtocols']))
  const protocols = [...new Set([...rawProtocols.map(value => typeof value === 'object' ? stringOf(valueOf(recordOf(value), ['protocol', 'name', 'type'])) : stringOf(value)), ...instances.map(instance => instance.protocol)].filter(Boolean))]
  const rawEvents = asRecordList(valueOf(item, ['communicationEvents', 'interfaceEvents', 'events', 'exceptions']))
  const id = stringOf(valueOf(item, ['agentId', 'id', 'name']))
  const explicitStatus = valueOf(item, ['status', 'state'])
  const status = explicitStatus ? normalizeStatus(explicitStatus) : instances.some(instance => instance.status === 'ERROR') ? 'ERROR' : instances.some(instance => instance.status === 'ONLINE') ? 'ONLINE' : 'OFFLINE'

  return {
    id,
    label: id ? id.replace(/^AGENT-/i, '采集代理-') : '采集代理',
    host: stringOf(valueOf(item, ['host', 'ipAddress', 'ip']), '-'),
    status,
    firstSeen: stringOf(valueOf(item, ['firstSeen', 'registerTime', 'createdAt'])),
    lastHeartbeat: stringOf(valueOf(item, ['lastHeartbeat', 'heartbeatTime', 'lastSeen'])),
    version: stringOf(valueOf(item, ['version', 'agentVersion']), '-'),
    os: [valueOf(item, ['os', 'operatingSystem', 'platform']), valueOf(item, ['arch', 'architecture'])].filter(Boolean).map(String).join(' / ') || '-',
    protocols,
    cpuUsage: numberOf(valueOf(item, ['cpuUsage', 'cpu'])),
    memUsage: numberOf(valueOf(item, ['memUsage', 'memoryUsage', 'mem'])),
    instances,
    events: rawEvents.map((event, index) => ({
      id: stringOf(valueOf(event, ['id', 'eventId']), `event-${index}`),
      protocol: stringOf(valueOf(event, ['protocol', 'interfaceProtocol', 'source']), '-'),
      message: stringOf(valueOf(event, ['message', 'description', 'detail', 'errorMessage']), '-'),
      time: stringOf(valueOf(event, ['time', 'timestamp', 'eventTime', 'createdAt']))
    }))
  }
}

const listFrom = (data: unknown): RawRecord[] => {
  if (Array.isArray(data)) return data.map(recordOf)
  const record = recordOf(data)
  return asRecordList(record.data || record.items || record.agents)
}

const selectedAgent = computed(() => agents.value.find(agent => agent.id === selectedId.value) || agents.value[0] || null)
const stats = computed(() => ({
  total: agents.value.length,
  online: agents.value.filter(agent => agent.status === 'ONLINE').length,
  error: agents.value.filter(agent => agent.status === 'ERROR').length,
  protocols: new Set(agents.value.flatMap(agent => agent.protocols)).size
}))

const formatTime = (value: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}
const formatNumber = (value: number | null) => value === null ? '-' : value.toLocaleString('zh-CN')
const formatRate = (value: number | null) => value === null ? '-' : `${value.toLocaleString('zh-CN')} 条/s`
const formatBytes = (value: number | null) => {
  if (value === null) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = Math.max(0, value)
  let index = 0
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
  return `${size.toFixed(size >= 100 || Number.isInteger(size) ? 0 : 1)} ${units[index]}`
}
const formatPercent = (value: number | null) => value === null ? '-' : `${Math.round((value > 1 ? value : value * 100) * 10) / 10}%`
const progressWidth = (value: number | null) => value === null ? '0%' : `${Math.max(0, Math.min(100, value > 1 ? value : value * 100))}%`
const statusText = (status: string) => ({ ONLINE: '运行中', OFFLINE: '停止', ERROR: '异常', UNKNOWN: '未知' }[status] || status)
const statusClass = (status: string) => `status-${status.toLowerCase()}`

const agentColumns: TableColumn<Agent>[] = [
  { accessorKey: 'label', header: '采集代理' },
  { accessorKey: 'host', header: '主机' },
  { accessorKey: 'status', header: '状态' },
  { id: 'instances', header: '接口' },
  { accessorKey: 'lastHeartbeat', header: '心跳' }
]

const loadAgents = async () => {
  loading.value = true
  try {
    const data = await request<unknown>('/agent-registry')
    agents.value = listFrom(data).map(normalizeAgent).filter(agent => agent.id)
    if (!agents.value.some(agent => agent.id === selectedId.value)) selectedId.value = agents.value[0]?.id || ''
  } catch (error) {
    agents.value = []
    selectedId.value = ''
    toast.add({ title: '采集代理列表加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    loading.value = false
  }
}

const selectAgent = async (agent: Agent) => {
  selectedId.value = agent.id
  detailLoading.value = true
  try {
    const data = await request<unknown>(`/agent-registry/${encodeURIComponent(agent.id)}`)
    const detail = normalizeAgent(recordOf(data))
    const index = agents.value.findIndex(item => item.id === agent.id)
    if (index >= 0 && detail.id) agents.value.splice(index, 1, detail)
  } catch {
    // 代理注册中心详情不可用时，保留列表接口已返回的信息。
  } finally {
    detailLoading.value = false
  }
}

const removeAgent = async () => {
  const agent = selectedAgent.value
  if (!agent || !window.confirm(`确定删除采集代理“${agent.label}”吗？`)) return
  deleting.value = true
  try {
    await request<void>(`/agent-registry/${encodeURIComponent(agent.id)}`, { method: 'DELETE' })
    toast.add({ title: '采集代理已删除', color: 'success' })
    await loadAgents()
  } catch (error) {
    toast.add({ title: '采集代理删除失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    deleting.value = false
  }
}

onMounted(loadAgents)
</script>

<template>
  <main class="agent-page">
    <section class="stats-grid" aria-label="采集代理概况">
      <article class="stat-card"><span>采集代理总数</span><strong>{{ stats.total }}</strong></article>
      <article class="stat-card success"><span>在线采集代理</span><strong>{{ stats.online }}</strong></article>
      <article class="stat-card error"><span>异常采集代理</span><strong>{{ stats.error }}</strong></article>
      <article class="stat-card"><span>采集协议</span><strong>{{ stats.protocols }}</strong></article>
    </section>

    <section class="agent-workspace">
      <article class="agent-card agent-list-card">
        <header class="card-header"><h2>采集代理列表</h2><UButton type="button" class="outline-button small" :disabled="loading" @click="loadAgents"><UIcon name="i-lucide-refresh-cw" />刷新</UButton></header>
        <div class="table-scroll"><UTable class="agent-table" :data="agents" :columns="agentColumns" :loading="loading" empty="暂无采集代理" @select="(_event, row) => selectAgent(row.original)"><template #label-cell="{ row }"><span class="agent-name">{{ row.original.label }}</span></template><template #status-cell="{ row }"><span :class="['status-tag', statusClass(row.original.status)]"><i />{{ statusText(row.original.status) }}</span></template><template #instances-cell="{ row }">{{ row.original.instances.length }}</template><template #lastHeartbeat-cell="{ row }"><span class="time-cell">{{ formatTime(row.original.lastHeartbeat) }}</span></template></UTable></div>
      </article>

      <article class="agent-card detail-card">
        <header class="card-header"><h2>{{ selectedAgent?.label || '采集代理详情' }}</h2><div class="detail-actions"><span v-if="selectedAgent" :class="['status-tag', statusClass(selectedAgent.status)]"><i />{{ statusText(selectedAgent.status) }}</span><UButton type="button" class="outline-button small" disabled title="后端暂未提供采集实例启停接口">停止</UButton><UButton type="button" class="primary-button small" disabled title="后端暂未提供采集实例重启接口">重启</UButton><UButton type="button" class="outline-button small danger" :disabled="!selectedAgent || deleting" @click="removeAgent">删除</UButton></div></header>
        <div v-if="detailLoading" class="detail-state"><UIcon name="i-lucide-loader-circle" class="spin-icon" />加载中...</div>
        <div v-else-if="!selectedAgent" class="detail-state">暂无采集代理数据</div>
        <template v-else>
          <div class="meta-grid"><div><span>主机</span><strong>{{ selectedAgent.host }}</strong></div><div><span>首次注册</span><strong>{{ formatTime(selectedAgent.firstSeen) }}</strong></div><div><span>最后心跳</span><strong>{{ formatTime(selectedAgent.lastHeartbeat) }}</strong></div><div><span>采集协议</span><strong>{{ selectedAgent.protocols.join('、') || '-' }}</strong></div><div><span>版本</span><strong>{{ selectedAgent.version }}</strong></div><div><span>运行环境</span><strong>{{ selectedAgent.os }}</strong></div></div>
          <div class="resource-grid"><div><div class="resource-label"><span>CPU</span><span>{{ formatPercent(selectedAgent.cpuUsage) }}</span></div><div class="resource-bar"><i :style="{ width: progressWidth(selectedAgent.cpuUsage) }" /></div></div><div><div class="resource-label"><span>内存</span><span>{{ formatPercent(selectedAgent.memUsage) }}</span></div><div class="resource-bar"><i :style="{ width: progressWidth(selectedAgent.memUsage) }" /></div></div></div>
          <section class="instance-section"><h3>采集接口实例</h3><div v-if="!selectedAgent.instances.length" class="inner-empty">暂无采集接口实例</div><div v-for="instance in selectedAgent.instances" :key="instance.id" class="instance-item"><div class="instance-head"><strong>{{ instance.protocol }}</strong><span :class="['status-tag', statusClass(instance.status)]"><i />{{ statusText(instance.status) }}</span></div><div class="instance-metrics"><span>速率 {{ formatRate(instance.rxRate) }}</span><span>消息 {{ formatNumber(instance.rxMessages) }}</span><span>字节 {{ formatBytes(instance.rxBytes) }}</span><span>异常 {{ formatNumber(instance.errorCount) }}</span></div><p v-if="instance.lastError" class="instance-error">{{ instance.lastError }}</p></div></section>
          <section class="event-section"><h3>接口通信异常事件</h3><div v-if="!selectedAgent.events.length" class="inner-empty">暂无接口通信异常事件</div><div v-for="event in selectedAgent.events" :key="event.id" class="event-row"><i /><div><strong>{{ event.protocol }}</strong><span>{{ event.message }}</span></div><time>{{ formatTime(event.time) }}</time></div></section>
        </template>
      </article>
    </section>
  </main>
</template>

<style scoped>
.agent-page { min-width: 0; }.stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }.stat-card, .agent-card { overflow: hidden; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }.stat-card { min-height: 106px; padding: 18px; }.stat-card span { color: var(--ui-text-muted); font-size: 13px; }.stat-card strong { display: block; margin-top: 10px; color: var(--ui-primary); font-size: 28px; font-weight: 650; line-height: 1; }.stat-card.success strong { color: var(--ui-success); }.stat-card.error strong { color: var(--ui-error); }.agent-workspace { display: grid; grid-template-columns: minmax(400px, .9fr) minmax(510px, 1.1fr); align-items: start; gap: 14px; }.card-header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border); }.card-header h2, .instance-section h3, .event-section h3 { margin: 0; color: var(--ui-text-highlighted); font-size: 14px; font-weight: 650; }.primary-button, .outline-button { display: inline-flex; height: 32px; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; border-radius: var(--ui-radius); font-size: 12px; cursor: pointer; }.primary-button { border: 1px solid var(--ui-primary); background: var(--ui-primary); color: white; }.outline-button { border: 1px solid var(--ui-border); background: transparent; color: var(--ui-text); }.small { height: 28px; padding: 0 8px; }.danger { color: var(--ui-error); }.primary-button:disabled, .outline-button:disabled { opacity: .5; cursor: not-allowed; }.detail-actions { display: flex; align-items: center; gap: 5px; }.table-scroll { overflow: auto; }.agent-table { width: 100%; min-width: 570px; border-collapse: collapse; table-layout: fixed; }.agent-table th, .agent-table td { height: 43px; padding: 7px 9px; border-bottom: 1px solid var(--ui-border-muted); color: var(--ui-text); text-align: left; font-size: 12px; }.agent-table th { background: color-mix(in srgb, var(--ui-bg-muted) 65%, transparent); color: var(--ui-text-muted); font-weight: 600; }.agent-table th:nth-child(1) { width: 120px; }.agent-table th:nth-child(2) { width: 120px; }.agent-table th:nth-child(3) { width: 72px; }.agent-table th:nth-child(4) { width: 54px; }.agent-table th:nth-child(5) { width: 155px; }.agent-table tbody tr { cursor: pointer; }.agent-table tbody tr:hover td, .agent-table tbody tr.active td { background: color-mix(in srgb, var(--ui-primary) 12%, var(--ui-bg-elevated)); }.agent-table tbody tr.active td:first-child { box-shadow: inset 3px 0 0 var(--ui-primary); }.agent-name { overflow: hidden; color: var(--ui-text-highlighted) !important; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }.status-tag { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 11px; }.status-tag i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }.status-online { color: var(--ui-success); }.status-error { color: var(--ui-error); }.status-offline, .status-unknown { color: var(--ui-text-muted); }.time-cell { overflow: hidden; color: var(--ui-text-muted) !important; text-overflow: ellipsis; white-space: nowrap; }.empty-cell, .detail-state, .inner-empty { min-height: 88px; color: var(--ui-text-muted); text-align: center; font-size: 12px; }.empty-cell { height: 120px !important; }.detail-state { display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 360px; }.spin-icon { animation: spin 1s linear infinite; }.meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; border-bottom: 1px solid var(--ui-border); background: var(--ui-border); }.meta-grid > div { display: grid; min-height: 72px; align-content: center; gap: 5px; padding: 10px; background: var(--ui-bg-elevated); }.meta-grid span { color: var(--ui-text-muted); font-size: 11px; }.meta-grid strong { overflow: hidden; color: var(--ui-text); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }.resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 14px 12px; }.resource-label { display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--ui-text-muted); font-size: 12px; }.resource-bar { height: 6px; overflow: hidden; border-radius: 99px; background: var(--ui-border-muted); }.resource-bar i { display: block; height: 100%; border-radius: inherit; background: var(--ui-primary); }.instance-section, .event-section { padding: 0 12px 14px; }.instance-section h3, .event-section h3 { padding: 10px 0; border-bottom: 1px solid var(--ui-border-muted); font-size: 13px; }.inner-empty { display: grid; min-height: 64px; place-items: center; }.instance-item { padding: 10px 0; border-bottom: 1px solid var(--ui-border-muted); }.instance-head, .instance-metrics, .event-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }.instance-head strong { font-size: 13px; }.instance-metrics { flex-wrap: wrap; justify-content: flex-start; margin-top: 7px; color: var(--ui-text-muted); font-size: 11px; }.instance-error { margin: 7px 0 0; color: var(--ui-error); font-size: 11px; }.event-row { padding: 9px 0; border-bottom: 1px solid var(--ui-border-muted); }.event-row > i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--ui-error); }.event-row > div { display: grid; min-width: 0; flex: 1; gap: 3px; }.event-row strong { font-size: 12px; }.event-row span, .event-row time { overflow: hidden; color: var(--ui-text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.event-row time { flex: none; }@keyframes spin { to { transform: rotate(360deg); } }@media (max-width: 1160px) { .agent-workspace { grid-template-columns: 1fr; }.agent-list-card { min-height: 220px; } }@media (max-width: 760px) { .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.detail-actions { flex-wrap: wrap; justify-content: flex-end; } }@media (max-width: 480px) { .stats-grid, .meta-grid, .resource-grid { grid-template-columns: 1fr; }.card-header { align-items: flex-start; }.detail-actions { max-width: 170px; } }
.agent-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}

.agent-workspace {
  align-items: stretch;
  min-height: 360px;
  flex: 1;
}

.agent-workspace > .agent-card {
  display: flex;
  flex-direction: column;
}

.agent-list-card .table-scroll {
  min-height: 0;
  flex: 1;
}
</style>
