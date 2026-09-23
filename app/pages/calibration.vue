<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'

definePageMeta({ middleware: 'auth' })

type CalibrationChannel = {
  id: number
  taskId?: string
  channelName?: string
  channelType?: number
  channelTypeName?: string
  calibrationFormula?: string
  normalRange?: string
  detectMethod?: number
  detectMethodName?: string
  sigmaValue?: number
  fluctuationRate?: number
  chauvenetCoef?: number
  minSampleCount?: number
  iterateCount?: number
  sampleWindow?: number
  dynamicUpdate?: number
  autoClean?: number
  enabled?: number
  enabledName?: string
  channelStatus?: number
  channelStatusName?: string
}

type CalibrationRecord = {
  id: number
  taskId?: string
  channelId?: number
  channelName?: string
  outlierCount?: number
}

type CalibrationRecordDetail = {
  id?: number
  parameterName?: string
  tmSymbol?: string
  telemetryValue?: number
  detail?: string
  createTime?: string
}

type PageResponse<T> = {
  pageNum?: number
  pageSize?: number
  total?: number
  records?: T[]
}

type RecordDetailResponse = {
  record?: CalibrationRecord
  details?: PageResponse<CalibrationRecordDetail>
}

const channelColumns: TableColumn<CalibrationChannel>[] = [
  { accessorKey: 'channelName', header: '通道名称' },
  { accessorKey: 'calibrationFormula', header: '公式' },
  { accessorKey: 'channelType', header: '类型' },
  { accessorKey: 'normalRange', header: '范围' },
  { accessorKey: 'detectMethod', header: '算法' },
  { accessorKey: 'channelStatus', header: '状态' },
  { id: 'actions', header: '操作' }
]

const recordColumns: TableColumn<CalibrationRecord>[] = [
  { accessorKey: 'channelName', header: '通道名称' },
  { accessorKey: 'outlierCount', header: '累计检出野值' },
  { id: 'actions', header: '操作' }
]

const detailColumns: TableColumn<CalibrationRecordDetail>[] = [
  { accessorKey: 'createTime', header: '时间' },
  { accessorKey: 'parameterName', header: '参数名称' },
  { accessorKey: 'tmSymbol', header: '遥测代号' },
  { accessorKey: 'telemetryValue', header: '遥测值' },
  { accessorKey: 'detail', header: '异常说明' }
]

const { request } = useAdminApi()
const { taskId } = useTaskContext()
const toast = useToast()
const isChannelDialogOpen = ref(false)
const isEditingChannel = ref(false)
const channelLoading = ref(false)
const recordLoading = ref(false)
const savingChannel = ref(false)
const detailLoading = ref(false)
const detailOpen = ref(false)
const channels = ref<CalibrationChannel[]>([])
const records = ref<CalibrationRecord[]>([])
const recordTotal = ref(0)
const recordPage = ref(1)
const recordPageSize = 20
const outlierCount = ref<number | null>(null)
const recordDetail = ref<CalibrationRecord | null>(null)
const recordDetailRows = ref<CalibrationRecordDetail[]>([])
const { load: loadCalibrationLookup, options: calibrationOptions, label: calibrationLabel } = useModuleLookup('calibration')
const channelTypes = computed(() => calibrationOptions('channelType'))
const detectMethods = computed(() => calibrationOptions('detectMethod'))
const channelForm = reactive({
  id: null as number | null,
  channelName: '',
  channelType: '',
  calibrationFormula: '',
  normalRange: '',
  detectMethod: '',
  fluctuationRate: 10,
  sigmaValue: 3,
  sampleWindow: 100,
  dynamicUpdate: false,
  chauvenetCoef: 0.5,
  minSampleCount: 10,
  iterateCount: 1,
  autoClean: false,
  enabled: true,
  channelStatus: 1
})

const closeChannelDialog = () => {
  isChannelDialogOpen.value = false
}

const resetChannelForm = () => {
  Object.assign(channelForm, {
    id: null,
    channelName: '',
    channelType: '',
    calibrationFormula: '',
    normalRange: '',
    detectMethod: '',
    fluctuationRate: 10,
    sigmaValue: 3,
    sampleWindow: 100,
    dynamicUpdate: false,
    chauvenetCoef: 0.5,
    minSampleCount: 10,
    iterateCount: 1,
    autoClean: false,
    enabled: true,
    channelStatus: 1
  })
}

const requireTaskId = () => {
  const value = taskId.value.trim()
  return value || null
}

const loadOverview = async () => {
  const currentTaskId = requireTaskId()
  if (!currentTaskId) {
    outlierCount.value = null
    return
  }
  try {
    const data = await request<{ outlierCount?: number }>(`/calibration/overview?taskId=${encodeURIComponent(String(currentTaskId))}`)
    outlierCount.value = Number(data?.outlierCount || 0)
  } catch (error) {
    outlierCount.value = null
    toast.add({ title: '校准概况加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const loadChannels = async () => {
  const currentTaskId = requireTaskId()
  if (!currentTaskId) {
    channels.value = []
    return
  }
  channelLoading.value = true
  try {
    const data = await request<CalibrationChannel[]>(`/calibration/channels?taskId=${encodeURIComponent(String(currentTaskId))}`)
    channels.value = Array.isArray(data) ? data : []
  } catch (error) {
    channels.value = []
    toast.add({ title: '校准通道加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    channelLoading.value = false
  }
}

const loadRecords = async () => {
  const currentTaskId = requireTaskId()
  if (!currentTaskId) {
    records.value = []
    recordTotal.value = 0
    return
  }
  recordLoading.value = true
  try {
    const params = new URLSearchParams({
      taskId: String(currentTaskId),
      pageNum: String(recordPage.value),
      pageSize: String(recordPageSize)
    })
    const data = await request<PageResponse<CalibrationRecord>>(`/calibration/records?${params.toString()}`)
    records.value = Array.isArray(data?.records) ? data.records : []
    recordTotal.value = Number(data?.total || 0)
  } catch (error) {
    records.value = []
    recordTotal.value = 0
    toast.add({ title: '校准记录加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    recordLoading.value = false
  }
}

const loadPage = async () => {
  await Promise.all([loadOverview(), loadChannels(), loadRecords()])
}

const openCreateChannel = () => {
  if (!requireTaskId()) {
    toast.add({ title: '请先选择试验任务', color: 'warning' })
    return
  }
  isEditingChannel.value = false
  resetChannelForm()
  isChannelDialogOpen.value = true
}

const applyChannelToForm = (channel: CalibrationChannel) => {
  Object.assign(channelForm, {
    id: channel.id,
    channelName: channel.channelName || '',
    channelType: channel.channelType === undefined ? '' : String(channel.channelType),
    calibrationFormula: channel.calibrationFormula || '',
    normalRange: channel.normalRange || '',
    detectMethod: channel.detectMethod === undefined ? '' : String(channel.detectMethod),
    fluctuationRate: Number(channel.fluctuationRate ?? 10),
    sigmaValue: Number(channel.sigmaValue ?? 3),
    sampleWindow: Number(channel.sampleWindow ?? 100),
    dynamicUpdate: Number(channel.dynamicUpdate) === 1,
    chauvenetCoef: Number(channel.chauvenetCoef ?? 0.5),
    minSampleCount: Number(channel.minSampleCount ?? 10),
    iterateCount: Number(channel.iterateCount ?? 1),
    autoClean: Number(channel.autoClean) === 1,
    enabled: Number(channel.enabled) === 1,
    channelStatus: Number(channel.channelStatus ?? 1)
  })
}

const editChannel = async (channel: CalibrationChannel) => {
  isEditingChannel.value = true
  applyChannelToForm(channel)
  isChannelDialogOpen.value = true
  try {
    const detail = await request<CalibrationChannel>(`/calibration/channels/${encodeURIComponent(String(channel.id))}`)
    applyChannelToForm(detail)
  } catch {
    // 列表已经返回完整配置，详情失败时仍允许使用列表数据编辑。
  }
}

const channelPayload = () => ({
  ...(channelForm.id ? { id: channelForm.id } : {}),
  taskId: requireTaskId(),
  channelName: channelForm.channelName.trim(),
  channelType: Number(channelForm.channelType),
  calibrationFormula: channelForm.calibrationFormula.trim(),
  normalRange: channelForm.normalRange.trim(),
  detectMethod: Number(channelForm.detectMethod),
  sigmaValue: Number(channelForm.sigmaValue),
  fluctuationRate: Number(channelForm.fluctuationRate),
  chauvenetCoef: 0.5,
  minSampleCount: Number(channelForm.minSampleCount),
  iterateCount: Number(channelForm.iterateCount),
  sampleWindow: Number(channelForm.sampleWindow),
  dynamicUpdate: channelForm.dynamicUpdate ? 1 : 0,
  autoClean: channelForm.autoClean ? 1 : 0,
  enabled: channelForm.enabled ? 1 : 0,
  channelStatus: channelForm.enabled ? Number(channelForm.channelStatus || 1) : 0
})

const saveChannel = async () => {
  if (!requireTaskId()) {
    toast.add({ title: '请先选择试验任务', color: 'warning' })
    return
  }
  if (!channelForm.channelName.trim() || !channelForm.channelType || !channelForm.calibrationFormula.trim() || !channelForm.normalRange.trim() || !channelForm.detectMethod) {
    toast.add({ title: '请填写通道名称、数据类型、校准公式、正常范围和检测方法', color: 'warning' })
    return
  }
  if (channelForm.detectMethod === '1' && (channelForm.sigmaValue < 1 || channelForm.sigmaValue > 5 || channelForm.sampleWindow < 3)) {
    toast.add({ title: '莱特准则参数不符合范围要求', color: 'warning' })
    return
  }
  if (channelForm.detectMethod === '2' && (channelForm.fluctuationRate <= 0 || channelForm.fluctuationRate > 100)) {
    toast.add({ title: '阈值百分比必须大于 0 且不超过 100', color: 'warning' })
    return
  }
  if (channelForm.detectMethod === '3' && (channelForm.minSampleCount < 3 || channelForm.iterateCount < 1 || channelForm.iterateCount > 3)) {
    toast.add({ title: '肖维涅法参数不符合范围要求', color: 'warning' })
    return
  }
  savingChannel.value = true
  try {
    await request<void>(isEditingChannel.value ? '/calibration/channels/update' : '/calibration/channels/create', {
      method: 'POST',
      body: channelPayload()
    })
    toast.add({ title: isEditingChannel.value ? '校准通道已更新' : '校准通道已创建', color: 'success' })
    closeChannelDialog()
    await loadChannels()
  } catch (error) {
    toast.add({ title: isEditingChannel.value ? '校准通道更新失败' : '校准通道创建失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    savingChannel.value = false
  }
}

const deleteChannel = async (channel: CalibrationChannel) => {
  if (import.meta.client && !window.confirm(`确定删除校准通道“${channel.channelName || `#${channel.id}`}”吗？`)) return
  try {
    await request<void>('/calibration/channels/delete', { method: 'POST', body: { id: channel.id } })
    toast.add({ title: '校准通道已删除', color: 'success' })
    await loadChannels()
  } catch (error) {
    toast.add({ title: '校准通道删除失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const openRecordDetail = async (record: CalibrationRecord) => {
  const currentTaskId = requireTaskId()
  if (!currentTaskId) return
  detailOpen.value = true
  detailLoading.value = true
  recordDetail.value = record
  recordDetailRows.value = []
  try {
    const params = new URLSearchParams({ taskId: String(currentTaskId), pageNum: '1', pageSize: '100' })
    const data = await request<RecordDetailResponse>(`/calibration/records/${encodeURIComponent(String(record.id))}?${params.toString()}`)
    recordDetail.value = data?.record || record
    recordDetailRows.value = Array.isArray(data?.details?.records) ? data.details.records : []
  } catch (error) {
    toast.add({ title: '校准记录详情加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    detailLoading.value = false
  }
}

const changeRecordPage = async (page: number) => {
  recordPage.value = Math.max(1, page)
  await loadRecords()
}

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

watch(taskId, async () => {
  recordPage.value = 1
  await loadPage()
})

onMounted(async () => {
  await Promise.all([loadCalibrationLookup().catch(() => undefined), loadPage()])
})
</script>

<template>
  <main class="calibration-page">
    <section class="calibration-stats" aria-label="校准概况">
      <article class="stat-card stat-card--green">
        <p>今日校准数据</p>
        <strong>--<small>条</small></strong>
      </article>
      <article class="stat-card stat-card--red">
        <p>累计检测野值</p>
        <strong>{{ outlierCount ?? '--' }}</strong>
      </article>
      <article class="stat-card stat-card--amber">
        <p>清洗数据</p>
        <strong>--</strong>
      </article>
    </section>

    <div class="calibration-workspace">
      <section class="calibration-card">
        <header class="card-header">
          <h2>校准通道配置</h2>
          <UButton type="button" class="primary-button" @click="openCreateChannel"><UIcon name="i-lucide-plus" />添加通道</UButton>
        </header>
        <div class="table-wrap">
          <UTable class="calibration-table channel-table" :data="channels" :columns="channelColumns" :loading="channelLoading" empty="暂无校准通道">
            <template #channelName-cell="{ row }">{{ row.original.channelName || '-' }}</template>
            <template #calibrationFormula-cell="{ row }">{{ row.original.calibrationFormula || '-' }}</template>
            <template #channelType-cell="{ row }">{{ row.original.channelTypeName || calibrationLabel('channelType', row.original.channelType) }}</template>
            <template #normalRange-cell="{ row }">{{ row.original.normalRange || '-' }}</template>
            <template #detectMethod-cell="{ row }">{{ row.original.detectMethodName || calibrationLabel('detectMethod', row.original.detectMethod) }}</template>
            <template #channelStatus-cell="{ row }"><span :class="['status-tag', Number(row.original.channelStatus) === 1 ? 'success' : Number(row.original.channelStatus) === 2 ? 'error' : 'neutral']">{{ row.original.channelStatusName || calibrationLabel('channelStatus', row.original.channelStatus) }}</span></template>
            <template #actions-cell="{ row }"><div class="action-cell"><UButton type="button" variant="link" size="xs" @click="editChannel(row.original)">编辑</UButton><UButton type="button" color="error" variant="link" size="xs" @click="deleteChannel(row.original)">删除</UButton></div></template>
          </UTable>
        </div>
      </section>

      <section class="calibration-card">
        <header class="card-header">
          <h2>校准记录</h2>
          <div class="record-toolbar"><span>共 {{ recordTotal }} 条</span><UButton type="button" class="icon-button" title="上一页" :disabled="recordLoading || recordPage <= 1" @click="changeRecordPage(recordPage - 1)"><UIcon name="i-lucide-chevron-left" /></UButton><b>第 {{ recordPage }} 页</b><UButton type="button" class="icon-button" title="下一页" :disabled="recordLoading || recordPage * recordPageSize >= recordTotal" @click="changeRecordPage(recordPage + 1)"><UIcon name="i-lucide-chevron-right" /></UButton></div>
        </header>
        <div class="table-wrap">
          <UTable class="calibration-table log-table" :data="records" :columns="recordColumns" :loading="recordLoading" empty="暂无校准记录">
            <template #channelName-cell="{ row }">{{ row.original.channelName || '-' }}</template>
            <template #outlierCount-cell="{ row }">{{ Number(row.original.outlierCount || 0) }}</template>
            <template #actions-cell="{ row }"><UButton type="button" variant="link" size="xs" @click="openRecordDetail(row.original)">详情</UButton></template>
          </UTable>
        </div>
      </section>
    </div>
  </main>

  <Teleport to="body">
    <div v-if="isChannelDialogOpen" class="dialog-backdrop" @click.self="closeChannelDialog">
      <section class="channel-dialog" role="dialog" aria-modal="true" aria-labelledby="channel-dialog-title">
        <header class="dialog-header">
          <h2 id="channel-dialog-title">{{ isEditingChannel ? '编辑通道' : '添加通道' }}</h2>
          <UButton type="button" class="dialog-close" aria-label="关闭" @click="closeChannelDialog">
            <UIcon name="i-lucide-x" />
          </UButton>
        </header>

        <div class="dialog-body">
          <div class="form-grid">
            <label class="form-field">
              <span>通道名称 <b>*</b></span>
              <UInput v-model="channelForm.channelName" type="text" placeholder="请输入通道名称" class="app-input" />
            </label>
            <label class="form-field">
              <span>数据类型 <b>*</b></span>
              <AppSelect v-model="channelForm.channelType">
                <option value="" disabled>请选择类型</option>
                <option v-for="item in channelTypes" :key="item.value" :value="String(item.value)">{{ item.label }}</option>
              </AppSelect>
            </label>
          </div>

          <div class="form-grid">
            <label class="form-field">
              <span>校准公式 <b>*</b></span>
              <UInput v-model="channelForm.calibrationFormula" type="text" placeholder="请输入校准公式" class="app-input" />
            </label>
            <label class="form-field">
              <span>正常范围 <b>*</b></span>
              <UInput v-model="channelForm.normalRange" type="text" placeholder="如：0~36V" class="app-input" />
            </label>
          </div>

          <div class="form-divider"><span>野值检测算法配置</span></div>

          <label class="form-field">
            <span>野值检测方法 <b>*</b></span>
            <AppSelect v-model="channelForm.detectMethod">
              <option value="" disabled>请选择野值检测方法</option>
              <option v-for="item in detectMethods" :key="item.value" :value="String(item.value)">{{ item.label }}</option>
            </AppSelect>
          </label>

          <template v-if="channelForm.detectMethod === '2'">
            <label class="form-field">
              <span>阈值百分比（%）</span>
              <UInput v-model="channelForm.fluctuationRate" type="number" min="0.01" max="100" step="0.01" placeholder="请输入阈值百分比" class="app-input" />
            </label>
          </template>

          <template v-else-if="channelForm.detectMethod === '1'">
            <div class="form-grid">
              <label class="form-field">
                <span>σ倍数</span>
                <UInput v-model="channelForm.sigmaValue" type="number" min="1" max="5" step="1" placeholder="请输入σ倍数" class="app-input" />
              </label>
              <label class="form-field">
                <span>样本窗口</span>
                <UInput v-model="channelForm.sampleWindow" type="number" min="3" placeholder="请输入样本窗口" class="app-input" />
              </label>
            </div>
            <label class="switch-field"><USwitch v-model="channelForm.dynamicUpdate" /><span>动态更新</span><em>随新数据更新</em></label>
          </template>

          <template v-else-if="channelForm.detectMethod === '3'">
            <div class="form-grid">
              <label class="form-field">
                <span>肖维涅系数</span>
                <UInput v-model="channelForm.chauvenetCoef" type="number" disabled class="app-input" />
              </label>
              <label class="form-field">
                <span>最小样本数</span>
                <UInput v-model="channelForm.minSampleCount" type="number" min="3" placeholder="请输入最小样本数" class="app-input" />
              </label>
            </div>
            <label class="form-field">
              <span>迭代次数</span>
              <AppSelect v-model="channelForm.iterateCount"><option :value="1">1次</option><option :value="2">2次</option><option :value="3">3次</option></AppSelect>
            </label>
          </template>

          <div class="switch-grid">
            <label class="switch-field"><USwitch v-model="channelForm.autoClean" /><span>自动清洗</span><em>自动剔除异常数据</em></label>
            <label class="switch-field"><USwitch v-model="channelForm.enabled" /><span>启用</span><em>启用该通道</em></label>
          </div>
        </div>

        <footer class="dialog-footer">
          <UButton type="button" class="dialog-button" :disabled="savingChannel" @click="closeChannelDialog">取消</UButton>
          <UButton type="button" class="dialog-button dialog-button--primary" :disabled="savingChannel" @click="saveChannel">{{ savingChannel ? '保存中...' : '确定' }}</UButton>
        </footer>
      </section>
    </div>

    <div v-if="detailOpen" class="dialog-backdrop" @click.self="detailOpen = false">
      <section class="channel-dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="record-detail-title">
        <header class="dialog-header">
          <div><h2 id="record-detail-title">校准记录详情</h2><p>{{ recordDetail?.channelName || '-' }} · 累计野值 {{ Number(recordDetail?.outlierCount || 0) }}</p></div>
          <UButton type="button" class="dialog-close" aria-label="关闭" @click="detailOpen = false"><UIcon name="i-lucide-x" /></UButton>
        </header>
        <div class="detail-table-wrap">
          <UTable class="calibration-table detail-table" :data="recordDetailRows" :columns="detailColumns" :loading="detailLoading" empty="暂无野值明细">
            <template #createTime-cell="{ row }">{{ formatTime(row.original.createTime) }}</template>
            <template #parameterName-cell="{ row }">{{ row.original.parameterName || '-' }}</template>
            <template #tmSymbol-cell="{ row }">{{ row.original.tmSymbol || '-' }}</template>
            <template #telemetryValue-cell="{ row }">{{ row.original.telemetryValue ?? '-' }}</template>
            <template #detail-cell="{ row }">{{ row.original.detail || '-' }}</template>
          </UTable>
        </div>
        <footer class="dialog-footer"><UButton type="button" class="dialog-button" @click="detailOpen = false">关闭</UButton></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.calibration-page {
  display: flex;
  width: 100%;
  max-width: none;
  min-width: 0;
  min-height: 100%;
  flex: 1 1 auto;
  flex-direction: column;
}

.calibration-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.stat-card,
.calibration-card {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
}

.stat-card {
  min-height: 108px;
  padding: 20px;
}

.stat-card p,
.stat-card strong { margin: 0; }

.stat-card p {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.stat-card strong {
  display: block;
  margin-top: 10px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
}

.stat-card small {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
}

.stat-card--green strong { color: #45ad8d; }
.stat-card--red strong { color: #ef443c; }
.stat-card--amber strong { color: #ecbe84; }

.calibration-workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 430px;
  flex: 1;
  gap: 12px;
  margin-top: 14px;
}

.calibration-card {
  display: flex;
  min-height: 430px;
  flex-direction: column;
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

.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--ui-primary);
  border-radius: var(--ui-radius);
  background: var(--ui-primary);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.primary-button .i-lucide { width: 15px; height: 15px; }

.record-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ui-text-muted);
  font-size: 12px;
}

.record-toolbar b { color: var(--ui-text); font-weight: 400; }

.icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  padding: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  cursor: pointer;
}

.icon-button:disabled,
.dialog-button:disabled { opacity: .45; cursor: not-allowed; }
.icon-button .i-lucide { width: 15px; height: 15px; }

.table-wrap {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.calibration-table {
  width: 100%;
  min-height: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.calibration-table th,
.calibration-table td {
  height: 44px;
  padding: 9px 13px;
  border-bottom: 1px solid var(--ui-border-muted);
  color: var(--ui-text);
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}

.calibration-table th {
  color: var(--ui-text-muted);
  white-space: nowrap;
}

.calibration-table td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.channel-table { min-width: 640px; }
.log-table { min-width: 420px; }

.action-cell { display: flex; align-items: center; gap: 10px; }
.text-button { padding: 0; border: 0; background: transparent; color: var(--ui-primary); font-size: 12px; cursor: pointer; }
.text-button.danger { color: var(--ui-error); }

.status-tag {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  color: var(--ui-text-muted);
}

.status-tag.success { border-color: color-mix(in srgb, var(--ui-success) 40%, transparent); color: var(--ui-success); }
.status-tag.error { border-color: color-mix(in srgb, var(--ui-error) 40%, transparent); color: var(--ui-error); }

.empty-cell {
  height: 330px !important;
  color: var(--ui-text-dimmed) !important;
  text-align: center !important;
}

.dialog-backdrop {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 55%);
}

.channel-dialog {
  width: min(700px, calc(100vw - 48px));
  max-height: min(760px, calc(100dvh - 48px));
  overflow: auto;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  background: var(--ui-bg-elevated);
  box-shadow: 0 18px 44px rgb(0 0 0 / 38%);
}

.dialog-header,
.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 0 20px;
  border-bottom: 1px solid var(--ui-border);
}

.dialog-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 18px; font-weight: 650; }
.dialog-header p { margin: 5px 0 0; color: var(--ui-text-muted); font-size: 12px; }

.dialog-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.dialog-close .i-lucide { width: 20px; height: 20px; }

.dialog-body { padding: 20px; }

.form-grid,
.switch-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }

.form-field { display: block; margin-bottom: 16px; }
.form-field > span { display: block; margin-bottom: 7px; color: var(--ui-text); font-size: 13px; }
.form-field b { color: var(--ui-error); font-weight: 400; }

.form-field input,
.form-field select {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius);
  outline: none;
  background: var(--ui-bg);
  color: var(--ui-text);
  font-size: 13px;
}

.form-field input:focus,
.form-field select:focus { border-color: var(--ui-primary); }
.form-field input:disabled { opacity: .65; cursor: not-allowed; }

.form-divider { display: flex; align-items: center; gap: 10px; margin: 8px 0 18px; color: var(--ui-primary); font-size: 13px; }
.form-divider::before,
.form-divider::after { height: 1px; content: ''; flex: 1; background: color-mix(in srgb, var(--ui-primary) 50%, var(--ui-border)); }

.switch-field { display: flex; align-items: center; min-height: 36px; gap: 8px; margin: 0 0 16px; cursor: pointer; }
.switch-field input { position: absolute; opacity: 0; }
.switch-field i { position: relative; width: 30px; height: 17px; border-radius: 999px; background: var(--ui-text-dimmed); transition: background .15s; }
.switch-field i::after { position: absolute; top: 3px; left: 3px; width: 11px; height: 11px; border-radius: 50%; content: ''; background: white; transition: transform .15s; }
.switch-field input:checked + i { background: var(--ui-primary); }
.switch-field input:checked + i::after { transform: translateX(13px); }
.switch-field span { color: var(--ui-text); font-size: 13px; }
.switch-field em { color: var(--ui-text-muted); font-size: 12px; font-style: normal; }

.dialog-footer { justify-content: flex-end; gap: 10px; min-height: 64px; border-top: 1px solid var(--ui-border); border-bottom: 0; }
.dialog-button { height: 34px; min-width: 76px; padding: 0 14px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: transparent; color: var(--ui-text); font-size: 13px; cursor: pointer; }
.dialog-button--primary { border-color: var(--ui-primary); background: var(--ui-primary); color: white; }

.detail-dialog { width: min(1040px, calc(100vw - 48px)); }
.detail-table-wrap { max-height: min(560px, calc(100dvh - 190px)); overflow: auto; }
.detail-table { min-width: 900px; }
.detail-table th:last-child,
.detail-table td:last-child { width: 42%; white-space: normal; }
.detail-empty { height: 220px !important; color: var(--ui-text-dimmed) !important; text-align: center !important; }

@media (max-width: 1120px) {
  .calibration-workspace { grid-template-columns: 1fr; }
}

@media (max-width: 760px) {
  .calibration-stats { grid-template-columns: 1fr; }
  .form-grid,
  .switch-grid { grid-template-columns: 1fr; gap: 0; }
}
</style>
