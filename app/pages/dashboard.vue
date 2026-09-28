<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import type { LineSeriesOption, PieSeriesOption } from 'echarts/charts'

// 只注册本页实际用到的图表类型/组件，体积比整包 `import * as echarts from 'echarts'` 小得多。
echarts.use([LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

type EChartsOption = ComposeOption<LineSeriesOption | PieSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption>

definePageMeta({ middleware: 'auth' })

type CollectionView = 'line' | 'pie' | 'table'
type ProcessView = 'line' | 'table'

type ChartSeries = {
  systemName?: string
  dataTypeName?: string
  values?: number[]
}

type DashboardCollection = {
  summary?: {
    onlineAgentCount?: number
    dataRateMbps?: number
    senderCount?: number
    collectionCount?: number
    interfaceRateKbps?: number
  }
  lineChart?: {
    timePoints?: string[]
    series?: ChartSeries[]
  }
  table?: Array<{
    systemName?: string
    interfaceCount?: number
    protocols?: string[]
    collectionCount?: number
    interfaceRateKbps?: number
    statusName?: string
  }>
}

type DashboardProcessing = {
  summary?: {
    unhandledAlarmCount?: number
    processedCount?: number
    abnormalCount?: number
  }
  lineChart?: {
    timePoints?: string[]
    series?: ChartSeries[]
  }
  table?: Array<{
    dataTypeName?: string
    processedCount?: number
    deduplicatedCount?: number
    abnormalCount?: number
  }>
}

type CollectionTableRow = NonNullable<DashboardCollection['table']>[number]
type ProcessingTableRow = NonNullable<DashboardProcessing['table']>[number]

const collectionColumns: TableColumn<CollectionTableRow>[] = [
  { accessorKey: 'systemName', header: '发送方' },
  { accessorKey: 'interfaceCount', header: '接口数' },
  { accessorKey: 'protocols', header: '协议' },
  { accessorKey: 'collectionCount', header: '采集量' },
  { accessorKey: 'interfaceRateKbps', header: '流量' },
  { accessorKey: 'statusName', header: '状态' }
]

const processingColumns: TableColumn<ProcessingTableRow>[] = [
  { accessorKey: 'dataTypeName', header: '数据类型' },
  { accessorKey: 'processedCount', header: '处理数量' },
  { accessorKey: 'deduplicatedCount', header: '去重数量' },
  { accessorKey: 'abnormalCount', header: '异常数量' }
]

const collectionView = ref<CollectionView>('line')
const processView = ref<ProcessView>('line')
const collectionRange = ref('3h')
const processRange = ref('3h')
const collectionData = ref<DashboardCollection | null>(null)
const processingData = ref<DashboardProcessing | null>(null)
const collectionLoading = ref(false)
const processingLoading = ref(false)
const collectionChartRef = ref<HTMLElement | null>(null)
const processChartRef = ref<HTMLElement | null>(null)

const { request } = useAdminApi()
const { taskId } = useTaskContext()
const { load: loadDashboardLookup, options: dashboardOptions } = useModuleLookup('dashboard')

const timeRanges = computed(() => dashboardOptions('range'))

const collectionViews: Array<{ label: string, value: CollectionView }> = [
  { label: '折线图', value: 'line' },
  { label: '饼图', value: 'pie' },
  { label: '表格', value: 'table' }
]

const processViews: Array<{ label: string, value: ProcessView }> = [
  { label: '折线图', value: 'line' },
  { label: '表格', value: 'table' }
]

const processRangeLabel = computed(() => timeRanges.value.find(item => item.value === processRange.value)?.label || '近3小时')
const goTo = (path: string) => navigateTo(path)

const chartColors = ['#8abbdb', '#45ad8d', '#ecbe84', '#ee6767', '#9a7bd8', '#55c6c6']
const formatValue = (value: number | undefined, suffix = '') => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '--'
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}${suffix}`
}
const seriesName = (series: ChartSeries, index: number) => series.systemName || series.dataTypeName || `数据项 ${index + 1}`
const hasCollectionChartData = computed(() => Boolean(collectionData.value?.lineChart?.series?.length && collectionData.value.lineChart.timePoints?.length))
const hasProcessingChartData = computed(() => Boolean(processingData.value?.lineChart?.series?.length && processingData.value.lineChart.timePoints?.length))

const getLegendOption = (names: string[]) => ({
  show: names.length > 0,
  top: 10,
  left: 'center',
  icon: 'circle',
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 18,
  textStyle: { color: '#a9b7c7', fontSize: 11 }
})

let collectionChart: echarts.ECharts | null = null
let processingChart: echarts.ECharts | null = null

const disposeCollectionChart = () => {
  collectionChart?.dispose()
  collectionChart = null
}
const disposeProcessingChart = () => {
  processingChart?.dispose()
  processingChart = null
}

const drawCollectionChart = async () => {
  await nextTick()
  if (collectionView.value === 'table') {
    disposeCollectionChart()
    return
  }
  if (!collectionChartRef.value) return
  if (!collectionChart) collectionChart = echarts.init(collectionChartRef.value)

  const lineChart = collectionData.value?.lineChart
  const series = lineChart?.series || []
  const names = series.map(seriesName)
  const hasData = hasCollectionChartData.value
  const option: EChartsOption = collectionView.value === 'pie'
    ? {
        backgroundColor: 'transparent', color: chartColors, tooltip: { trigger: 'item' }, legend: getLegendOption(names),
        graphic: hasData ? [] : [{ type: 'text', left: 'center', top: 'middle', style: { text: collectionLoading.value ? '正在加载…' : '暂无采集统计数据', fill: '#7f91a4', fontSize: 13 } }],
        series: hasData ? [{
          type: 'pie', radius: ['42%', '67%'], center: ['50%', '58%'], avoidLabelOverlap: true,
          label: { color: '#a9b7c7', fontSize: 11 },
          data: series.map((item, index) => ({ name: seriesName(item, index), value: (item.values || []).reduce((sum, value) => sum + Number(value || 0), 0) }))
        }] : []
      }
    : {
        backgroundColor: 'transparent', color: chartColors, tooltip: { trigger: 'axis' }, legend: getLegendOption(names),
        grid: { left: 46, right: 18, top: 48, bottom: 30, containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: lineChart?.timePoints || [], axisLabel: { color: '#7f91a4', fontSize: 10 }, axisLine: { lineStyle: { color: '#314255' } } },
        yAxis: { type: 'value', axisLabel: { color: '#7f91a4', fontSize: 10 }, splitLine: { lineStyle: { color: '#ffffff12' } } },
        graphic: hasData ? [] : [{ type: 'text', left: 'center', top: 'middle', style: { text: collectionLoading.value ? '正在加载…' : '暂无采集统计数据', fill: '#7f91a4', fontSize: 13 } }],
        series: hasData ? series.map((item, index) => ({ name: seriesName(item, index), type: 'line', smooth: true, showSymbol: false, data: item.values || [] })) : []
      }
  collectionChart.setOption(option, { notMerge: true })
}

const drawProcessingChart = async () => {
  await nextTick()
  if (processView.value === 'table') {
    disposeProcessingChart()
    return
  }
  if (!processChartRef.value) return
  if (!processingChart) processingChart = echarts.init(processChartRef.value)

  const lineChart = processingData.value?.lineChart
  const series = lineChart?.series || []
  const names = series.map(seriesName)
  const hasData = hasProcessingChartData.value
  processingChart.setOption({
    backgroundColor: 'transparent', color: chartColors, tooltip: { trigger: 'axis' }, legend: getLegendOption(names),
    grid: { left: 46, right: 18, top: 48, bottom: 30, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: lineChart?.timePoints || [], axisLabel: { color: '#7f91a4', fontSize: 10 }, axisLine: { lineStyle: { color: '#314255' } } },
    yAxis: { type: 'value', axisLabel: { color: '#7f91a4', fontSize: 10 }, splitLine: { lineStyle: { color: '#ffffff12' } } },
    graphic: hasData ? [] : [{ type: 'text', left: 'center', top: 'middle', style: { text: processingLoading.value ? '正在加载…' : '暂无处理统计数据', fill: '#7f91a4', fontSize: 13 } }],
    series: hasData ? series.map((item, index) => ({ name: seriesName(item, index), type: 'line', smooth: true, showSymbol: false, data: item.values || [] })) : []
  }, { notMerge: true })
}

const loadCollection = async () => {
  const requestedTaskId = taskId.value
  if (!requestedTaskId) {
    collectionData.value = null
    await drawCollectionChart()
    return
  }

  collectionLoading.value = true
  try {
    const data = await request<DashboardCollection>(`/dashboard/collection?taskId=${encodeURIComponent(requestedTaskId)}&range=${encodeURIComponent(collectionRange.value)}`)
    if (taskId.value === requestedTaskId) collectionData.value = data || null
  } catch {
    if (taskId.value === requestedTaskId) collectionData.value = null
  } finally {
    if (taskId.value === requestedTaskId) collectionLoading.value = false
    await drawCollectionChart()
  }
}

const loadProcessing = async () => {
  const requestedTaskId = taskId.value
  if (!requestedTaskId) {
    processingData.value = null
    await drawProcessingChart()
    return
  }

  processingLoading.value = true
  try {
    const data = await request<DashboardProcessing>(`/dashboard/processing?taskId=${encodeURIComponent(requestedTaskId)}&range=${encodeURIComponent(processRange.value)}`)
    if (taskId.value === requestedTaskId) processingData.value = data || null
  } catch {
    if (taskId.value === requestedTaskId) processingData.value = null
  } finally {
    if (taskId.value === requestedTaskId) processingLoading.value = false
    await drawProcessingChart()
  }
}

const resizeCharts = () => {
  collectionChart?.resize()
  processingChart?.resize()
}

watch([taskId, collectionRange], () => { void loadCollection() }, { immediate: true })
watch([taskId, processRange], () => { void loadProcessing() }, { immediate: true })
watch([collectionView, collectionData, collectionLoading], () => { void drawCollectionChart() })
watch([processView, processingData, processingLoading], () => { void drawProcessingChart() })

onMounted(() => {
  window.addEventListener('resize', resizeCharts)
  void loadDashboardLookup().catch(() => undefined)
  void drawCollectionChart()
  void drawProcessingChart()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts)
  disposeCollectionChart()
  disposeProcessingChart()
})
</script>

<template>
  <main class="overview-page">
    <section class="overview-task-context" aria-label="当前试验任务">
      <div class="task-context-title">
        <UIcon name="i-lucide-flask-conical" aria-hidden="true" />
        <span>当前试验任务</span>
      </div>
      <AppExperimentTaskControl compact />
    </section>

    <section class="overview-stat-grid" aria-label="系统概览">
      <UButton type="button" class="overview-stat-card overview-stat-card--clickable" @click="goTo('/config/agents')">
        <UIcon name="i-lucide-network" />
        <div><p>在线采集代理</p><strong class="stat-value--blue">{{ formatValue(collectionData?.summary?.onlineAgentCount) }}</strong></div>
      </UButton>
      <article class="overview-stat-card">
        <UIcon name="i-lucide-chart-no-axes-combined" />
        <div><p>数据速率</p><strong class="stat-value--green">{{ formatValue(collectionData?.summary?.dataRateMbps) }}<small v-if="collectionData?.summary?.dataRateMbps !== undefined">Mbps</small></strong></div>
      </article>
      <UButton type="button" class="overview-stat-card overview-stat-card--clickable" @click="goTo('/alarm?status=unhandled')">
        <UIcon name="i-lucide-triangle-alert" />
        <div><p>未处理告警</p><strong class="stat-value--red">{{ formatValue(processingData?.summary?.unhandledAlarmCount) }}</strong></div>
      </UButton>
    </section>

    <section class="overview-grid">
      <article class="overview-card">
        <header class="overview-card-header">
          <h2>数据采集统计</h2>
          <div class="card-controls">
            <div class="view-switch" aria-label="数据采集统计时间范围">
              <UButton v-for="item in timeRanges" :key="item.value" type="button" :class="{ active: collectionRange === item.value }" @click="collectionRange = item.value">{{ item.label }}</UButton>
            </div>
            <div class="view-switch" aria-label="数据采集统计展示形式">
              <UButton v-for="item in collectionViews" :key="item.value" type="button" :class="{ active: collectionView === item.value }" @click="collectionView = item.value">{{ item.label }}</UButton>
            </div>
          </div>
        </header>

        <div class="summary-strip">
          <div><span>发送方</span><strong>{{ formatValue(collectionData?.summary?.senderCount) }}</strong></div>
          <div><span>采集量</span><strong>{{ formatValue(collectionData?.summary?.collectionCount) }}</strong></div>
          <div><span>接口流量</span><strong>{{ formatValue(collectionData?.summary?.interfaceRateKbps, collectionData?.summary?.interfaceRateKbps === undefined ? '' : ' KB/s') }}</strong></div>
        </div>

        <div v-if="collectionView === 'table'" class="table-wrap">
          <UTable class="overview-table" :data="collectionData?.table || []" :columns="collectionColumns" :loading="collectionLoading" empty="暂无采集统计数据">
            <template #systemName-cell="{ row }">{{ row.original.systemName || '--' }}</template>
            <template #interfaceCount-cell="{ row }">{{ formatValue(row.original.interfaceCount) }}</template>
            <template #protocols-cell="{ row }">{{ row.original.protocols?.join('、') || '--' }}</template>
            <template #collectionCount-cell="{ row }">{{ formatValue(row.original.collectionCount) }}</template>
            <template #interfaceRateKbps-cell="{ row }">{{ formatValue(row.original.interfaceRateKbps, row.original.interfaceRateKbps === undefined ? '' : ' KB/s') }}</template>
            <template #statusName-cell="{ row }">{{ row.original.statusName || '--' }}</template>
          </UTable>
        </div>
        <div v-else ref="collectionChartRef" class="overview-chart" aria-label="数据采集统计图表" />
      </article>

      <article class="overview-card">
        <header class="overview-card-header">
          <h2>数据处理统计</h2>
          <div class="card-controls">
            <div class="view-switch" aria-label="数据处理统计时间范围">
              <UButton v-for="item in timeRanges" :key="item.value" type="button" :class="{ active: processRange === item.value }" @click="processRange = item.value">{{ item.label }}</UButton>
            </div>
            <div class="view-switch" aria-label="数据处理统计展示形式">
              <UButton v-for="item in processViews" :key="item.value" type="button" :class="{ active: processView === item.value }" @click="processView = item.value">{{ item.label }}</UButton>
            </div>
          </div>
        </header>

        <div class="summary-strip processing-summary-strip">
          <div><span>{{ processRangeLabel }}处理</span><strong>{{ formatValue(processingData?.summary?.processedCount) }}</strong></div>
          <div><span>异常数据</span><strong>{{ formatValue(processingData?.summary?.abnormalCount) }}</strong></div>
        </div>

        <div v-if="processView === 'table'" class="table-wrap">
          <UTable class="overview-table" :data="processingData?.table || []" :columns="processingColumns" :loading="processingLoading" empty="暂无处理统计数据">
            <template #dataTypeName-cell="{ row }">{{ row.original.dataTypeName || '--' }}</template>
            <template #processedCount-cell="{ row }">{{ formatValue(row.original.processedCount) }}</template>
            <template #deduplicatedCount-cell="{ row }">{{ formatValue(row.original.deduplicatedCount) }}</template>
            <template #abnormalCount-cell="{ row }">{{ formatValue(row.original.abnormalCount) }}</template>
          </UTable>
        </div>
        <div v-else ref="processChartRef" class="overview-chart" aria-label="数据处理统计图表" />
      </article>
    </section>
  </main>
</template>

<style scoped>
.overview-page { display: grid; grid-template-rows: auto auto minmax(430px, 1fr); min-width: 0; gap: 14px; }
.overview-task-context { display: flex; min-height: 46px; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }
.task-context-title { display: inline-flex; min-width: 0; align-items: center; gap: 7px; color: var(--ui-text-muted); font-size: 12px; font-weight: 600; white-space: nowrap; }.task-context-title .i-lucide { width: 15px; height: 15px; color: var(--ui-primary); }
.overview-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.overview-stat-card, .overview-card { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }
.overview-stat-card { display: flex; align-items: center; min-height: 112px; gap: 14px; padding: 18px; color: var(--ui-text); text-align: left; }
button.overview-stat-card { width: 100%; cursor: pointer; }
.overview-stat-card--clickable:hover, .overview-stat-card--clickable:focus-visible { border-color: color-mix(in srgb, var(--ui-primary) 58%, var(--ui-border)); outline: none; }
.overview-stat-card .i-lucide { width: 22px; height: 22px; flex: none; color: var(--ui-text-muted); stroke-width: 1.7; }
.overview-stat-card p, .overview-stat-card strong { margin: 0; }
.overview-stat-card p { color: var(--ui-text-muted); font-size: 13px; }
.overview-stat-card strong { display: block; margin-top: 7px; font-size: 28px; font-weight: 600; line-height: 1; }
.overview-stat-card small { margin-left: 4px; font-size: 13px; font-weight: 500; }
.stat-value--blue { color: #8abbdb; }.stat-value--green { color: #45ad8d; }.stat-value--red { color: #ef443c; }
.overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.overview-card { min-width: 0; min-height: 430px; overflow: hidden; }
.overview-card-header { display: flex; align-items: center; justify-content: space-between; min-height: 54px; gap: 12px; padding: 8px 14px; border-bottom: 1px solid var(--ui-border); }
.overview-card-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 15px; font-weight: 650; }
.card-controls { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.view-switch { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-muted); }
.view-switch button { height: 26px; padding: 0 8px; border: 0; border-radius: calc(var(--ui-radius) - 2px); background: transparent; color: var(--ui-text-muted); font-size: 11px; cursor: pointer; }
.view-switch button.active { background: var(--ui-bg-elevated); color: var(--ui-text-highlighted); box-shadow: 0 1px 2px #00000035; }
.summary-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 14px; }
.processing-summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.summary-strip > div { min-width: 0; padding: 10px 12px; border: 1px solid var(--ui-border-muted); border-radius: var(--ui-radius); background: var(--ui-bg-muted); }
.summary-strip span, .summary-strip strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.summary-strip span { margin-bottom: 4px; color: var(--ui-text-muted); font-size: 11px; }.summary-strip strong { color: var(--ui-text-highlighted); font-size: 16px; font-weight: 650; }
.table-wrap { overflow: auto; }.overview-table { width: 100%; border-collapse: collapse; table-layout: fixed; }.overview-table th, .overview-table td { height: 40px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border-muted); color: var(--ui-text); font-size: 12px; text-align: left; }.overview-table th { color: var(--ui-text-muted); font-weight: 500; white-space: nowrap; }.empty-cell { height: 250px !important; color: var(--ui-text-dimmed) !important; text-align: center !important; }
.overview-chart { min-height: 270px; width: 100%; }
@media (max-width: 1200px) { .overview-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.overview-grid { grid-template-columns: 1fr; }.overview-card { min-height: 400px; } }
@media (max-width: 700px) { .overview-task-context { align-items: flex-start; flex-direction: column; }.overview-stat-grid { grid-template-columns: 1fr; }.overview-card-header { align-items: flex-start; flex-direction: column; }.card-controls { width: 100%; align-items: flex-start; flex-direction: column; }.view-switch { width: 100%; }.view-switch button { flex: 1; }.summary-strip { grid-template-columns: 1fr; } }
</style>
