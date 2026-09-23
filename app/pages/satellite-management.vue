<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

type DescrambleRule = {
  startPos: number | null
  length: number | null
  feedBack: string
  initialValue: boolean
}

type TmChannel = {
  _key: string
  enable: boolean
  configKey: string
  name: string
  address: string
  port: string
  receiverPort: string
  channelId: string
  decryptor: string
  secretKey: string
  toDescramble: boolean
  tmSyncHead: string
}

type SatelliteConfig = {
  _key: string
  _draft?: boolean
  name: string
  code: string
  enable: boolean
  tableA: string
  tableB: string
  luaPath: string
  tmLen: number | null
  multicastAddress: string
  multicastPort: string
  descrambleRule: DescrambleRule
  tmChannels: TmChannel[]
}

type SatelliteResponse = Partial<Omit<SatelliteConfig, '_key' | '_draft' | 'tmChannels'>> & {
  tmChannels?: Array<Partial<TmChannel>>
}

const { request } = useAdminApi()
const toast = useToast()

let keySequence = 0
const keyOf = (prefix: string) => `${prefix}-${Date.now()}-${++keySequence}`

const emptyRule = (): DescrambleRule => ({
  startPos: null,
  length: null,
  feedBack: '',
  initialValue: false
})

const emptyChannel = (): TmChannel => ({
  _key: keyOf('channel'),
  enable: true,
  configKey: '',
  name: '',
  address: '',
  port: '',
  receiverPort: '',
  channelId: '',
  decryptor: '',
  secretKey: '',
  toDescramble: false,
  tmSyncHead: ''
})

const emptySatellite = (): SatelliteConfig => ({
  _key: keyOf('satellite'),
  _draft: true,
  name: '',
  code: '',
  enable: true,
  tableA: '',
  tableB: '',
  luaPath: '',
  tmLen: null,
  multicastAddress: '',
  multicastPort: '',
  descrambleRule: emptyRule(),
  tmChannels: []
})

const normalizeChannel = (channel: Partial<TmChannel> = {}): TmChannel => ({
  ...emptyChannel(),
  ...channel,
  _key: channel._key || keyOf('channel'),
  enable: channel.enable !== false,
  toDescramble: Boolean(channel.toDescramble)
})

const normalizeSatellite = (satellite: SatelliteResponse): SatelliteConfig => ({
  ...emptySatellite(),
  ...satellite,
  _key: satellite.code || keyOf('satellite'),
  _draft: false,
  enable: satellite.enable !== false,
  tmLen: satellite.tmLen ?? null,
  multicastAddress: satellite.multicastAddress || '',
  multicastPort: satellite.multicastPort || '',
  descrambleRule: {
    ...emptyRule(),
    ...satellite.descrambleRule
  },
  tmChannels: (satellite.tmChannels || []).map(normalizeChannel)
})

const serialiseSatellite = (satellite: SatelliteConfig) => ({
  name: satellite.name.trim(),
  code: satellite.code.trim(),
  enable: satellite.enable,
  tableA: satellite.tableA.trim(),
  tableB: satellite.tableB.trim(),
  luaPath: satellite.luaPath.trim(),
  tmLen: Number(satellite.tmLen || 0),
  descrambleRule: {
    startPos: Number(satellite.descrambleRule.startPos || 0),
    length: Number(satellite.descrambleRule.length || 0),
    feedBack: satellite.descrambleRule.feedBack.trim(),
    initialValue: satellite.descrambleRule.initialValue
  },
  tmChannels: satellite.tmChannels.map(({ _key, configKey, address, port, receiverPort, decryptor, secretKey, ...channel }) => channel)
})

const localIp = ref('')
const satelliteConfigs = ref<SatelliteConfig[]>([])
const activeKey = ref<string | null>(null)
const loading = ref(false)
const loadingDetail = ref(false)
const saving = ref(false)
const uploadingTable = ref<'A' | 'B' | null>(null)
const tableAInput = ref<HTMLInputElement | null>(null)
const tableBInput = ref<HTMLInputElement | null>(null)

const activeSatellite = computed(() => (
  satelliteConfigs.value.find(item => item._key === activeKey.value) || null
))

const setActiveSatellite = (satellite: SatelliteConfig) => {
  activeKey.value = satellite._key
}

const replaceSatellite = (next: SatelliteConfig) => {
  const index = satelliteConfigs.value.findIndex(item => item._key === activeKey.value)
  if (index >= 0) satelliteConfigs.value.splice(index, 1, next)
}

const loadSatelliteDetail = async (code: string) => {
  loadingDetail.value = true
  try {
    const detail = await request<SatelliteResponse>(`/satellite-management/satellites/${encodeURIComponent(code)}`)
    const config = normalizeSatellite(detail)
    replaceSatellite(config)
    activeKey.value = config._key
  } catch (error) {
    toast.add({ title: '卫星配置加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    loadingDetail.value = false
  }
}

const loadSatellites = async () => {
  loading.value = true
  try {
    const list = await request<SatelliteResponse[]>('/satellite-management/satellites')
    satelliteConfigs.value = Array.isArray(list) ? list.map(normalizeSatellite) : []
    activeKey.value = satelliteConfigs.value[0]?._key || null
  } catch (error) {
    satelliteConfigs.value = []
    activeKey.value = null
    toast.add({ title: '卫星列表加载失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    loading.value = false
  }
}

const selectSatellite = async (satellite: SatelliteConfig) => {
  setActiveSatellite(satellite)
  if (!satellite._draft && satellite.code) await loadSatelliteDetail(satellite.code)
}

const createSatellite = () => {
  const draft = emptySatellite()
  satelliteConfigs.value.push(draft)
  setActiveSatellite(draft)
}

const cancelEditing = async () => {
  const satellite = activeSatellite.value
  if (!satellite) return
  if (satellite._draft) {
    satelliteConfigs.value = satelliteConfigs.value.filter(item => item._key !== satellite._key)
    activeKey.value = satelliteConfigs.value[0]?._key || null
    return
  }
  await loadSatelliteDetail(satellite.code)
}

const saveSatellite = async () => {
  const satellite = activeSatellite.value
  if (!satellite) return
  if (!satellite.name.trim() || !satellite.code.trim()) {
    toast.add({ title: '请填写卫星名称和代号', color: 'warning' })
    return
  }

  saving.value = true
  try {
    const info = serialiseSatellite(satellite)
    if (satellite._draft) {
      await request<void>('/satellite-management/satellites/create', { method: 'POST', body: info })
    } else {
      await request<void>('/satellite-management/satellites/update', {
        method: 'POST',
        body: { code: satellite._key, info }
      })
    }
    toast.add({ title: '卫星配置已保存', color: 'success' })
    await loadSatellites()
    const saved = satelliteConfigs.value.find(item => item.code === info.code)
    if (saved) await loadSatelliteDetail(saved.code)
  } catch (error) {
    toast.add({ title: '卫星配置保存失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    saving.value = false
  }
}

const removeSatellite = async () => {
  const satellite = activeSatellite.value
  if (!satellite) return
  if (satellite._draft) {
    satelliteConfigs.value = satelliteConfigs.value.filter(item => item._key !== satellite._key)
    activeKey.value = satelliteConfigs.value[0]?._key || null
    return
  }
  if (!window.confirm(`确定删除卫星“${satellite.name || satellite.code}”吗？`)) return

  saving.value = true
  try {
    await request<void>('/satellite-management/satellites/delete', {
      method: 'POST',
      body: { code: satellite.code }
    })
    toast.add({ title: '卫星配置已删除', color: 'success' })
    await loadSatellites()
  } catch (error) {
    toast.add({ title: '卫星配置删除失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    saving.value = false
  }
}

const updateSatelliteEnabled = async () => {
  const satellite = activeSatellite.value
  if (!satellite || satellite._draft || !satellite.code) return
  try {
    await request<void>('/satellite-management/satellites/enabled', {
      method: 'POST',
      body: { code: satellite.code, enable: satellite.enable }
    })
  } catch (error) {
    satellite.enable = !satellite.enable
    toast.add({ title: '卫星状态更新失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const updateChannelEnabled = async (channel: TmChannel) => {
  const satellite = activeSatellite.value
  if (!satellite || satellite._draft || !satellite.code || !channel.channelId) return
  try {
    await request<void>('/satellite-management/channels/enabled', {
      method: 'POST',
      body: { satelliteCode: satellite.code, channelId: channel.channelId, enable: channel.enable }
    })
  } catch (error) {
    channel.enable = !channel.enable
    toast.add({ title: '通道状态更新失败', description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  }
}

const addChannel = () => activeSatellite.value?.tmChannels.push(emptyChannel())
const removeChannel = (index: number) => activeSatellite.value?.tmChannels.splice(index, 1)

const chooseTable = (type: 'A' | 'B') => {
  if (!activeSatellite.value?.code || activeSatellite.value._draft) {
    toast.add({ title: '请先保存卫星配置', color: 'warning' })
    return
  }
  if (type === 'A') tableAInput.value?.click()
  else tableBInput.value?.click()
}

const uploadTable = async (type: 'A' | 'B', event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const satellite = activeSatellite.value
  if (!file || !satellite?.code) return

  uploadingTable.value = type
  try {
    const formData = new FormData()
    formData.append('code', satellite.code)
    formData.append('tableType', type)
    formData.append('file', file)
    await request<void>('/satellite-management/tables/upload', { method: 'POST', body: formData })
    toast.add({ title: `${type} 表上传成功`, color: 'success' })
    await loadSatelliteDetail(satellite.code)
  } catch (error) {
    toast.add({ title: `${type} 表上传失败`, description: error instanceof Error ? error.message : '请稍后重试', color: 'error' })
  } finally {
    input.value = ''
    uploadingTable.value = null
  }
}

const copyLuaPath = async () => {
  const path = activeSatellite.value?.luaPath
  if (!path) return
  try {
    await navigator.clipboard.writeText(path)
    toast.add({ title: '脚本目录已复制', color: 'success' })
  } catch {
    toast.add({ title: '脚本目录复制失败', color: 'error' })
  }
}

onMounted(loadSatellites)
</script>

<template>
  <main class="satellite-management-page">
    <section class="local-ip-card">
      <label for="local-ip">本机网卡地址 LocalIp</label>
      <UInput id="local-ip" v-model.trim="localIp" type="text" autocomplete="off" class="app-input" />
      <p>接收遥测所用的本机网卡。多网卡设备请配置为可达地址。</p>
    </section>

    <div class="satellite-workspace">
      <aside class="satellite-directory" aria-label="卫星配置列表">
        <header class="card-header">
          <h2>卫星</h2>
          <UButton type="button" class="outline-button small" @click="createSatellite">
            <UIcon name="i-lucide-plus" />新增
          </UButton>
        </header>

        <div v-if="loading" class="directory-state"><UIcon name="i-lucide-loader-circle" class="spin-icon" />加载中...</div>
        <div v-else-if="!satelliteConfigs.length" class="directory-state">暂无卫星配置</div>
        <nav v-else class="satellite-list">
          <UButton
            v-for="satellite in satelliteConfigs"
            :key="satellite._key"
            type="button"
            :class="['satellite-item', { active: activeSatellite?._key === satellite._key }]"
            @click="selectSatellite(satellite)"
          >
            <span class="satellite-item-name">{{ satellite.name || '未命名卫星' }}</span>
            <span class="satellite-item-meta">
              <span>{{ satellite.code || '未设置代号' }}</span>
              <span :class="satellite.enable ? 'status-enabled' : 'status-disabled'">{{ satellite.enable ? '启用' : '未启用' }}</span>
            </span>
          </UButton>
        </nav>

        <footer class="directory-footer">
          <UButton type="button" class="outline-button small" @click="createSatellite"><UIcon name="i-lucide-plus" />新增</UButton>
          <UButton type="button" class="outline-button small danger" :disabled="!activeSatellite || saving" @click="removeSatellite"><UIcon name="i-lucide-trash-2" />删除</UButton>
        </footer>
      </aside>

      <section v-if="!activeSatellite" class="workspace-empty">
        <UIcon name="i-lucide-satellite-dish" />
        <span>暂无卫星配置</span>
        <UButton type="button" class="primary-button" @click="createSatellite">新建卫星</UButton>
      </section>

      <section v-else class="satellite-config" :aria-busy="loadingDetail">
        <article class="config-card">
          <header class="card-header">
            <h2>卫星基础配置</h2>
            <span v-if="loadingDetail" class="loading-text"><UIcon name="i-lucide-loader-circle" class="spin-icon" />加载中...</span>
          </header>
          <div class="base-form">
            <label class="form-field span-two"><span>星名（参数目录名）</span><UInput v-model.trim="activeSatellite.name" type="text" autocomplete="off" class="app-input" /></label>
            <label class="check-field"><USwitch v-model="activeSatellite.enable" @update:model-value="updateSatelliteEnabled" /><span>启用</span></label>
            <label class="form-field"><span>代号（十六进制）</span><UInput v-model.trim="activeSatellite.code" type="text" autocomplete="off" class="app-input" /></label>
            <label class="form-field"><span>帧长</span><UInput v-model.number="activeSatellite.tmLen" min="0" type="number" class="app-input" /></label>
            <label class="form-field"><span>解扰起始位置</span><UInput v-model.number="activeSatellite.descrambleRule.startPos" min="0" type="number" class="app-input" /></label>
            <label class="form-field"><span>长度</span><UInput v-model.number="activeSatellite.descrambleRule.length" min="0" type="number" class="app-input" /></label>
            <label class="form-field span-two"><span>反馈多项式</span><UInput v-model.trim="activeSatellite.descrambleRule.feedBack" type="text" autocomplete="off" class="app-input" /></label>
            <label class="check-field"><USwitch v-model="activeSatellite.descrambleRule.initialValue" /><span>全 1 初始值</span></label>
          </div>
        </article>

        <article class="config-card">
          <header class="card-header">
            <h2>参数表与脚本</h2>
            <UButton type="button" class="outline-button small" :disabled="!activeSatellite.luaPath" @click="copyLuaPath">复制目录</UButton>
          </header>
          <div class="script-form">
            <label class="form-field"><span>遥测参数表 TableA</span><div class="input-action"><UInput v-model.trim="activeSatellite.tableA" type="text" autocomplete="off" class="app-input" /><UButton type="button" class="outline-button small" :disabled="uploadingTable !== null" @click="chooseTable('A')">{{ uploadingTable === 'A' ? '上传中...' : '上传 A 表' }}</UButton></div></label>
            <label class="form-field"><span>帧结构表 TableB</span><div class="input-action"><UInput v-model.trim="activeSatellite.tableB" type="text" autocomplete="off" class="app-input" /><UButton type="button" class="outline-button small" :disabled="uploadingTable !== null" @click="chooseTable('B')">{{ uploadingTable === 'B' ? '上传中...' : '上传 B 表' }}</UButton></div></label>
            <label class="form-field"><span>Lua 脚本目录 LuaPath</span><UInput v-model.trim="activeSatellite.luaPath" type="text" autocomplete="off" class="app-input" /></label>
            <input ref="tableAInput" class="file-input" type="file" accept=".xlsx,.xls,.csv,.txt" @change="uploadTable('A', $event)">
            <input ref="tableBInput" class="file-input" type="file" accept=".xlsx,.xls,.csv,.txt" @change="uploadTable('B', $event)">
          </div>
        </article>

        <article class="config-card table-card">
          <header class="card-header">
            <h2>CRT 遥测通道</h2>
            <UButton type="button" class="outline-button small" @click="addChannel"><UIcon name="i-lucide-plus" />新增通道</UButton>
          </header>
          <div class="table-scroll">
            <table class="config-table channel-table">
              <thead><tr><th class="check-cell">启用</th><th>配置键</th><th>名称</th><th>通道号(hex)</th><th class="check-cell">解扰</th><th>同步头(hex)</th><th class="action-cell">操作</th></tr></thead>
              <tbody>
                <tr v-if="!activeSatellite.tmChannels.length"><td colspan="7" class="empty-cell">暂无通道配置</td></tr>
                <tr v-for="(channel, index) in activeSatellite.tmChannels" :key="channel._key">
                  <td class="check-cell"><USwitch v-model="channel.enable" aria-label="启用通道" @update:model-value="updateChannelEnabled(channel)" /></td>
                  <td><UInput v-model.trim="channel.configKey" class="app-input table-input" aria-label="配置键" /></td><td><UInput v-model.trim="channel.name" class="app-input table-input" aria-label="名称" /></td><td><UInput v-model.trim="channel.channelId" class="app-input table-input" aria-label="通道号" /></td>
                  <td class="check-cell"><UCheckbox v-model="channel.toDescramble" aria-label="解扰" /></td><td><UInput v-model.trim="channel.tmSyncHead" class="app-input table-input" aria-label="同步头" /></td><td class="action-cell"><UButton type="button" class="text-button danger" @click="removeChannel(index)">删除</UButton></td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <footer class="workspace-actions">
          <UButton type="button" class="primary-button" :disabled="saving" @click="saveSatellite"><UIcon name="i-lucide-save" />{{ saving ? '保存中...' : '保存并重载' }}</UButton>
          <UButton type="button" class="outline-button" :disabled="saving" @click="loadSatellites"><UIcon name="i-lucide-rotate-cw" />重载</UButton>
          <UButton type="button" class="outline-button" :disabled="saving" @click="cancelEditing">取消</UButton>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.satellite-management-page { display: flex; min-width: 0; min-height: 100%; flex-direction: column; }
.local-ip-card, .satellite-directory, .config-card, .workspace-empty { border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg-elevated); }
.local-ip-card { display: grid; grid-template-columns: max-content 190px minmax(0, 1fr); align-items: center; gap: 12px; min-height: 66px; padding: 12px; }
.local-ip-card label, .form-field > span { color: var(--ui-text-muted); font-size: 12px; }
.local-ip-card p { margin: 0; color: var(--ui-text-muted); font-size: 12px; }
.local-ip-card input, .form-field input, .table-input { width: 100%; height: 30px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: none; background: var(--ui-bg); color: var(--ui-text); padding: 0 8px; font-size: 12px; }
.local-ip-card input:focus, .form-field input:focus, .table-input:focus { border-color: var(--ui-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-primary) 22%, transparent); }
.satellite-workspace { display: grid; grid-template-columns: minmax(205px, 250px) minmax(0, 1fr); min-height: 640px; flex: 1; gap: 12px; margin-top: 12px; }
.satellite-directory { display: flex; min-height: 640px; flex-direction: column; overflow: hidden; }
.card-header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--ui-border); }
.card-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 14px; font-weight: 650; }
.primary-button, .outline-button { display: inline-flex; height: 30px; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; border-radius: var(--ui-radius); font-size: 12px; white-space: nowrap; cursor: pointer; }
.primary-button { border: 1px solid var(--ui-primary); background: var(--ui-primary); color: white; }.outline-button { border: 1px solid var(--ui-border); background: transparent; color: var(--ui-text); }.outline-button.danger, .text-button.danger { color: var(--ui-error); }.primary-button:disabled, .outline-button:disabled { opacity: .5; cursor: not-allowed; }.small { height: 28px; padding: 0 8px; }
.directory-state { display: flex; flex: 1; align-items: center; justify-content: center; gap: 7px; min-height: 120px; color: var(--ui-text-muted); font-size: 12px; }.spin-icon { animation: spin 1s linear infinite; }
.satellite-list { display: grid; gap: 4px; padding: 8px; }.satellite-item { display: grid; gap: 5px; width: 100%; padding: 9px; border: 1px solid transparent; border-radius: var(--ui-radius); background: color-mix(in srgb, var(--ui-bg-muted) 55%, transparent); color: var(--ui-text); text-align: left; cursor: pointer; }.satellite-item:hover { background: var(--ui-bg-accented); }.satellite-item.active { border-color: var(--ui-primary); background: color-mix(in srgb, var(--ui-primary) 16%, var(--ui-bg-elevated)); }.satellite-item-name { overflow: hidden; color: var(--ui-text-highlighted); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.satellite-item-meta { display: flex; justify-content: space-between; gap: 7px; color: var(--ui-text-muted); font-size: 11px; }.status-enabled { color: var(--ui-success); }.status-disabled { color: var(--ui-text-muted); }.directory-footer { display: flex; gap: 8px; margin-top: auto; padding: 10px; border-top: 1px solid var(--ui-border); }
.workspace-empty { display: grid; min-height: 420px; place-content: center; justify-items: center; gap: 12px; color: var(--ui-text-muted); font-size: 13px; }.workspace-empty .i-lucide { width: 28px; height: 28px; color: var(--ui-primary); }.satellite-config { min-width: 0; }.config-card { margin-bottom: 12px; overflow: hidden; }.loading-text { display: inline-flex; align-items: center; gap: 5px; color: var(--ui-text-muted); font-size: 12px; }
.base-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; padding: 12px; }.form-field { display: grid; min-width: 0; gap: 5px; }.span-two { grid-column: span 2; }.check-field { display: inline-flex; min-height: 30px; align-items: end; gap: 7px; color: var(--ui-text); font-size: 12px; }.check-field input { position: absolute; opacity: 0; }.check-field i { position: relative; width: 30px; height: 16px; flex: none; border-radius: 999px; background: var(--ui-border); transition: background .18s ease; }.check-field i::after { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 999px; background: white; content: ''; transition: transform .18s ease; }.check-field input:checked + i { background: var(--ui-primary); }.check-field input:checked + i::after { transform: translateX(14px); }
.script-form { display: grid; gap: 10px; padding: 12px; }.input-action { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }.file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.table-scroll { overflow: auto; }.config-table { width: 100%; min-width: 1120px; border-collapse: collapse; table-layout: fixed; }.config-table th, .config-table td { height: 35px; padding: 4px 6px; border-bottom: 1px solid var(--ui-border-muted); color: var(--ui-text); text-align: left; vertical-align: middle; font-size: 12px; }.config-table th { background: color-mix(in srgb, var(--ui-bg-muted) 66%, transparent); color: var(--ui-text-muted); font-weight: 600; white-space: nowrap; }.table-input { height: 25px; padding: 0 5px; }.check-cell { width: 55px; text-align: center !important; }.action-cell { width: 58px; text-align: center !important; }.empty-cell { height: 88px !important; color: var(--ui-text-muted) !important; text-align: center !important; }.text-button { border: 0; background: transparent; color: var(--ui-primary); font-size: 12px; cursor: pointer; }
.workspace-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 2px 0 10px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) { .base-form { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 800px) { .local-ip-card { grid-template-columns: 1fr; gap: 6px; }.satellite-workspace { grid-template-columns: 1fr; }.satellite-directory { min-height: auto; }.satellite-list { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }.base-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .base-form { grid-template-columns: 1fr; }.span-two { grid-column: span 1; }.input-action { grid-template-columns: 1fr; }.workspace-actions { justify-content: stretch; }.workspace-actions button { flex: 1; } }
</style>
