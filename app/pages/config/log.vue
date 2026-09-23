<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, reactive, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

type LogRecord = {
  id: number
  taskId?: string
  logTime?: string
  logLevel?: string
  logLevelName?: string
  logSource?: string
  operatorId?: string
  logContent?: string
  logDetail?: string
}

type LogPage = {
  pageNum?: number
  pageSize?: number
  total?: number
  records?: LogRecord[]
}

const { request } = useAdminApi()
const { taskId } = useTaskContext()
const toast = useToast()
const { load: loadLogsLookup, options: logOptions, label: logLabel } = useModuleLookup('logs')
const loading = ref(false)
const detailOpen = ref(false)
const detail = ref<LogRecord | null>(null)
const records = ref<LogRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const sources = ref<string[]>([])
const filters = reactive({ level: '', source: '', operator: '', keyword: '', startTime: '', endTime: '' })

const levelOptions = computed(() => [{ value: '', label: '全部级别' }, ...logOptions('logLevel')])

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const fromRecord = computed(() => total.value === 0 ? 0 : (page.value - 1) * pageSize + 1)
const toRecord = computed(() => Math.min(page.value * pageSize, total.value))

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').replace('Z', '')
  return date.toLocaleString('zh-CN', { hour12: false })
}

const levelText = (level?: string) => logLabel('logLevel', level, level || '-')
const levelClass = (level?: string) => `level-${String(level || '').toLowerCase()}`

const logColumns: TableColumn<LogRecord>[] = [
  { accessorKey: 'logTime', header: '时间' },
  { accessorKey: 'logLevel', header: '级别' },
  { accessorKey: 'logSource', header: '来源' },
  { accessorKey: 'operatorId', header: '操作人' },
  { accessorKey: 'logContent', header: '内容' },
  { accessorKey: 'logDetail', header: '详情' },
  { id: 'actions', header: '操作' }
]

const queryString = () => {
  const params = new URLSearchParams({ pageNum: String(page.value), pageSize: String(pageSize) })
  if (taskId.value) params.set('taskId', String(taskId.value))
  if (filters.level) params.set('logLevel', filters.level)
  if (filters.source) params.set('logSource', filters.source)
  if (filters.operator) params.set('operatorId', filters.operator)
  if (filters.keyword) params.set('keyword', filters.keyword)
  if (filters.startTime) params.set('startTime', new Date(filters.startTime).toISOString())
  if (filters.endTime) params.set('endTime', new Date(filters.endTime).toISOString())
  return params.toString()
}

const loadSources = async () => {
  try {
    const params = taskId.value ? `?taskId=${encodeURIComponent(String(taskId.value))}` : ''
    const data = await request<string[]>(`/system/logs/sources${params}`)
    sources.value = Array.isArray(data) ? data : []
  } catch {
    sources.value = []
  }
}

const loadLogs = async () => {
  loading.value = true
  try {
    const data = await request<LogPage>(`/system/logs?${queryString()}`)
    records.value = Array.isArray(data?.records) ? data.records : []
    total.value = Number(data?.total || 0)
  } catch (error) {
    records.value = []
    total.value = 0
    toast.add({ title: '日志列表加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    loading.value = false
  }
}

const search = async () => {
  page.value = 1
  await loadLogs()
}

const reset = async () => {
  Object.assign(filters, { level: '', source: '', operator: '', keyword: '', startTime: '', endTime: '' })
  await search()
}

const changePage = async (next: number) => {
  if (next < 1 || next > pageCount.value || next === page.value) return
  page.value = next
  await loadLogs()
}

const openDetail = async (record: LogRecord) => {
  detail.value = record
  detailOpen.value = true
  try {
    detail.value = await request<LogRecord>(`/system/logs/${encodeURIComponent(String(record.id))}`)
  } catch {
    // 列表已有摘要信息，详情接口不可用时仍可展示。
  }
}

onMounted(async () => {
  await Promise.all([loadSources(), loadLogs(), loadLogsLookup().catch(() => undefined)])
})
</script>

<template>
  <main class="log-page">
    <section class="log-card filter-card">
      <header class="card-header"><h2>筛选条件</h2></header>
      <form class="filter-grid" @submit.prevent="search">
        <label><span>级别</span><AppSelect v-model="filters.level"><option v-for="item in levelOptions" :key="item.value" :value="item.value">{{ item.label }}</option></AppSelect></label>
        <label><span>来源</span><AppSelect v-model="filters.source"><option value="">全部来源</option><option v-for="source in sources" :key="source" :value="source">{{ source }}</option></AppSelect></label>
        <label><span>操作人</span><UInput v-model.trim="filters.operator" type="text" autocomplete="off" placeholder="输入操作人" class="app-input" /></label>
        <label><span>起始时间</span><UInput v-model="filters.startTime" type="datetime-local" step="1" class="app-input" /></label>
        <label><span>结束时间</span><UInput v-model="filters.endTime" type="datetime-local" step="1" class="app-input" /></label>
        <label><span>关键字</span><UInput v-model.trim="filters.keyword" type="search" autocomplete="off" placeholder="搜索内容 / 详情" class="app-input" /></label>
        <div class="filter-actions"><UButton type="submit" class="primary-button" :disabled="loading"><UIcon name="i-lucide-search" />搜索</UButton><UButton type="button" class="outline-button" :disabled="loading" @click="reset"><UIcon name="i-lucide-rotate-ccw" />重置</UButton></div>
      </form>
    </section>

    <section class="log-card">
      <header class="card-header"><h2>日志列表</h2><div class="header-meta"><span>共 {{ total }} 条</span><UButton type="button" class="outline-button small" :disabled="loading" @click="loadLogs"><UIcon name="i-lucide-refresh-cw" />刷新</UButton></div></header>
      <div class="table-scroll">
        <UTable class="log-table" :data="records" :columns="logColumns" :loading="loading" empty="暂无日志">
          <template #logTime-cell="{ row }"><span class="time-cell">{{ formatTime(row.original.logTime) }}</span></template>
          <template #logLevel-cell="{ row }"><span :class="['level-tag', levelClass(row.original.logLevel)]">{{ row.original.logLevelName || levelText(row.original.logLevel) }}</span></template>
          <template #logSource-cell="{ row }">{{ row.original.logSource || '-' }}</template>
          <template #operatorId-cell="{ row }">{{ row.original.operatorId || '-' }}</template>
          <template #logContent-cell="{ row }"><span class="ellipsis-cell">{{ row.original.logContent || '-' }}</span></template>
          <template #logDetail-cell="{ row }"><span class="ellipsis-cell">{{ row.original.logDetail || '-' }}</span></template>
          <template #actions-cell="{ row }"><UButton type="button" variant="link" size="xs" @click="openDetail(row.original)">详情</UButton></template>
        </UTable>
      </div>
      <footer class="pagination"><span>{{ fromRecord }}-{{ toRecord }} / {{ total }}</span><UButton type="button" class="outline-button small" :disabled="loading || page <= 1" @click="changePage(page - 1)">上一页</UButton><span>{{ page }} / {{ pageCount }}</span><UButton type="button" class="outline-button small" :disabled="loading || page >= pageCount" @click="changePage(page + 1)">下一页</UButton></footer>
    </section>

    <Teleport to="body"><div v-if="detailOpen" class="modal-layer" @click.self="detailOpen = false"><section class="detail-modal" role="dialog" aria-modal="true" aria-labelledby="log-detail-title"><header class="modal-header"><h2 id="log-detail-title">日志详情</h2><UButton type="button" class="icon-button" aria-label="关闭" @click="detailOpen = false"><UIcon name="i-lucide-x" /></UButton></header><dl v-if="detail" class="detail-list"><div><dt>时间</dt><dd>{{ formatTime(detail.logTime) }}</dd></div><div><dt>级别</dt><dd><span :class="['level-tag', levelClass(detail.logLevel)]">{{ detail.logLevelName || levelText(detail.logLevel) }}</span></dd></div><div><dt>来源</dt><dd>{{ detail.logSource || '-' }}</dd></div><div><dt>操作人</dt><dd>{{ detail.operatorId || '-' }}</dd></div><div><dt>内容</dt><dd>{{ detail.logContent || '-' }}</dd></div><div><dt>详情</dt><dd class="detail-content">{{ detail.logDetail || '-' }}</dd></div></dl></section></div></Teleport>
  </main>
</template>

<style scoped>
.log-page { min-width: 0; }.log-card { overflow: hidden; margin-bottom: 14px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }.card-header { display: flex; min-height: 50px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--ui-border); }.card-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 14px; font-weight: 650; }.header-meta { display: flex; align-items: center; gap: 10px; color: var(--ui-text-muted); font-size: 12px; }.filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 14px; }.filter-grid label { display: grid; min-width: 0; gap: 6px; color: var(--ui-text-muted); font-size: 12px; }.filter-grid input, .filter-grid select { width: 100%; height: 32px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: 0; background: var(--ui-bg); color: var(--ui-text); padding: 0 8px; font-size: 12px; }.filter-grid input:focus, .filter-grid select:focus { border-color: var(--ui-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 22%, transparent); }.filter-actions { display: flex; align-items: end; gap: 8px; }.primary-button, .outline-button { display: inline-flex; height: 32px; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; border-radius: var(--ui-radius); font-size: 12px; cursor: pointer; }.primary-button { border: 1px solid var(--ui-primary); background: var(--ui-primary); color: white; }.outline-button { border: 1px solid var(--ui-border); background: transparent; color: var(--ui-text); }.small { height: 28px; padding: 0 8px; }.primary-button:disabled, .outline-button:disabled { opacity: .5; cursor: not-allowed; }.table-scroll { overflow: auto; }.log-table { width: 100%; min-width: 920px; border-collapse: collapse; table-layout: fixed; }.log-table th, .log-table td { height: 42px; padding: 7px 12px; border-bottom: 1px solid var(--ui-border-muted); color: var(--ui-text); text-align: left; font-size: 12px; }.log-table th { background: color-mix(in srgb, var(--ui-bg-muted) 65%, transparent); color: var(--ui-text-muted); font-weight: 600; }.log-table th:nth-child(1) { width: 170px; }.log-table th:nth-child(2) { width: 76px; }.log-table th:nth-child(3) { width: 130px; }.log-table th:nth-child(4) { width: 100px; }.log-table th:nth-child(7) { width: 68px; }.time-cell { color: var(--ui-text-muted) !important; font-variant-numeric: tabular-nums; }.ellipsis-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.level-tag { display: inline-flex; min-width: 42px; justify-content: center; padding: 2px 6px; border-radius: 2px; font-size: 11px; }.level-debug { background: #94a3b81f; color: var(--ui-text-muted); }.level-info { background: #38bdf81f; color: var(--ui-primary); }.level-warn { background: #fbbf241f; color: var(--ui-warning); }.level-error { background: #ef44441f; color: var(--ui-error); }.text-button { border: 0; background: transparent; color: var(--ui-primary); font-size: 12px; cursor: pointer; }.empty-cell { height: 120px !important; color: var(--ui-text-muted) !important; text-align: center !important; }.pagination { display: flex; min-height: 48px; align-items: center; justify-content: flex-end; gap: 8px; padding: 8px 12px; color: var(--ui-text-muted); font-size: 12px; }.modal-layer { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; background: #0000008c; padding: 16px; }.detail-modal { width: min(620px, 100%); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); box-shadow: 0 24px 72px #00000080; }.modal-header { display: flex; align-items: center; justify-content: space-between; min-height: 50px; padding: 8px 14px; border-bottom: 1px solid var(--ui-border); }.modal-header h2 { margin: 0; font-size: 15px; }.icon-button { display: grid; width: 28px; height: 28px; place-items: center; border: 0; border-radius: var(--ui-radius); background: transparent; color: var(--ui-text-muted); cursor: pointer; }.detail-list { display: grid; gap: 0; margin: 0; padding: 14px; }.detail-list > div { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ui-border-muted); font-size: 13px; }.detail-list > div:last-child { border-bottom: 0; }.detail-list dt { color: var(--ui-text-muted); }.detail-list dd { min-width: 0; margin: 0; color: var(--ui-text); word-break: break-word; }.detail-content { white-space: pre-wrap; }@media (max-width: 1024px) { .filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }@media (max-width: 720px) { .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }@media (max-width: 520px) { .filter-grid { grid-template-columns: 1fr; }.filter-actions { align-items: stretch; }.filter-actions button { flex: 1; } }
.log-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
}

.log-card:last-of-type {
  display: flex;
  min-height: 280px;
  flex: 1;
  flex-direction: column;
  margin-bottom: 0;
}

.log-card:last-of-type .table-scroll {
  min-height: 0;
  flex: 1;
}
</style>
