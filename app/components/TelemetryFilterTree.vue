<script setup lang="ts">
import type { FilterTreeNode } from './TelemetryFilterTreeNode.vue'

const props = defineProps<{ taskId: string }>()
const emit = defineEmits<{ 'update:checkedCodes': [codes: string[]] }>()

const { request } = useAdminApi()
const toast = useToast()
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '请稍后重试'

const rootNodes = ref<FilterTreeNode[]>([])
const rootLoading = ref(false)
const searchText = ref('')
const searchResults = ref<FilterTreeNode[]>([])
const searchLoading = ref(false)
const mode = ref<'browse' | 'search'>('browse')
// parseRuleId -> 遥测代号（从 label 的 “名称/代号” 里取最后一段）；只跟踪当前已勾选的。
const checkedCodes = ref<Map<number, string>>(new Map())

const codeFromLabel = (label: string) => {
  const parts = label.split('/')
  return parts[parts.length - 1] || label
}

const normalizeNodes = (list: unknown, deviceSatelliteId?: number): FilterTreeNode[] => {
  if (!Array.isArray(list)) return []
  return list.map((item): FilterTreeNode => {
    const raw = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
    const node: FilterTreeNode = {
      id: Number(raw.id),
      label: String(raw.label ?? ''),
      nodeType: (raw.nodeType as FilterTreeNode['nodeType']) || 'parameter',
      nodeTypeName: raw.nodeTypeName ? String(raw.nodeTypeName) : undefined,
      selectable: Boolean(raw.selectable),
      checked: Boolean(raw.checked),
      hasChildren: Boolean(raw.hasChildren),
      deviceSatelliteId: raw.deviceSatelliteId !== undefined ? Number(raw.deviceSatelliteId) : deviceSatelliteId
    }
    if (node.nodeType === 'device') node.deviceSatelliteId = node.id
    if (node.nodeType === 'parameter' && node.checked) checkedCodes.value.set(node.id, codeFromLabel(node.label))
    return node
  })
}

const loadRoot = async () => {
  if (!props.taskId) {
    rootNodes.value = []
    return
  }
  rootLoading.value = true
  try {
    const data = await request<unknown>(`/processing/telemetry-filter-tree?taskId=${encodeURIComponent(props.taskId)}`)
    rootNodes.value = normalizeNodes(data)
  } catch (error) {
    rootNodes.value = []
    toast.add({ title: '遥测参数筛选树加载失败', description: errorMessage(error), color: 'error' })
  } finally {
    rootLoading.value = false
  }
}

// 提供给子节点：展开一个 device/system 节点时按需请求它的下一层。
const fetchChildren = async (node: FilterTreeNode): Promise<FilterTreeNode[]> => {
  const params = new URLSearchParams({ taskId: props.taskId })
  if (node.nodeType === 'device') {
    params.set('deviceSatelliteId', String(node.deviceSatelliteId ?? node.id))
  } else if (node.nodeType === 'system') {
    params.set('deviceSatelliteId', String(node.deviceSatelliteId ?? ''))
    params.set('systemId', String(node.id))
  }
  try {
    const data = await request<unknown>(`/processing/telemetry-filter-tree?${params.toString()}`)
    return normalizeNodes(data, node.deviceSatelliteId)
  } catch (error) {
    toast.add({ title: '加载子节点失败', description: errorMessage(error), color: 'error' })
    return []
  }
}

// 提供给子节点：勾选/取消勾选一个参数节点时立即保存。
const toggleChecked = async (node: FilterTreeNode) => {
  const nextChecked = !node.checked
  try {
    await request<void>('/processing/telemetry-filter-selection/update', {
      method: 'POST',
      body: { taskId: props.taskId, parseRuleId: node.id, checked: nextChecked }
    })
  } catch (error) {
    toast.add({ title: '保存勾选状态失败', description: errorMessage(error), color: 'error' })
    return
  }
  node.checked = nextChecked
  if (nextChecked) checkedCodes.value.set(node.id, codeFromLabel(node.label))
  else checkedCodes.value.delete(node.id)
  checkedCodes.value = new Map(checkedCodes.value)
}

provide('telemetryFilterFetchChildren', fetchChildren)
provide('telemetryFilterToggleChecked', toggleChecked)

const runSearch = async () => {
  const code = searchText.value.trim()
  if (!code) {
    mode.value = 'browse'
    searchResults.value = []
    return
  }
  mode.value = 'search'
  searchLoading.value = true
  try {
    const params = new URLSearchParams({ taskId: props.taskId, telemetryCode: code })
    const data = await request<unknown>(`/processing/telemetry-filter-tree?${params.toString()}`)
    searchResults.value = normalizeNodes(data)
  } catch (error) {
    searchResults.value = []
    toast.add({ title: '搜索遥测参数失败', description: errorMessage(error), color: 'error' })
  } finally {
    searchLoading.value = false
  }
}

const clearSearch = () => {
  searchText.value = ''
  mode.value = 'browse'
  searchResults.value = []
}

const toggleSearchResultChecked = async (node: FilterTreeNode) => {
  await toggleChecked(node)
  // 搜索结果和树是两份数据，手动同步一下这一条的勾选状态。
  const target = searchResults.value.find(item => item.id === node.id)
  if (target) target.checked = node.checked
}

watch(() => props.taskId, () => { loadRoot(); clearSearch() }, { immediate: true })
watch(checkedCodes, (value) => emit('update:checkedCodes', [...value.values()]), { deep: true })
</script>

<template>
  <div class="telemetry-filter-tree">
    <div class="filter-tree-search">
      <UInput v-model.trim="searchText" placeholder="按遥测代号前缀搜索" class="app-input" @keyup.enter="runSearch" />
      <UButton type="button" class="outline-button small" @click="runSearch">搜索</UButton>
      <UButton v-if="mode === 'search'" type="button" class="outline-button small" @click="clearSearch">返回树</UButton>
    </div>

    <div v-if="mode === 'search'" class="filter-tree-search-results">
      <div v-if="searchLoading" class="filter-tree-empty">搜索中…</div>
      <div v-else-if="!searchResults.length" class="filter-tree-empty">无匹配参数</div>
      <ul v-else class="filter-tree-flat-list">
        <li v-for="node in searchResults" :key="node.id" class="filter-tree-search-row">
          <UCheckbox :model-value="Boolean(node.checked)" @update:model-value="toggleSearchResultChecked(node)" />
          <span class="filter-tree-label parameter">{{ node.label }}</span>
          <span v-if="node.deviceSatelliteName" class="filter-tree-meta">{{ node.deviceSatelliteName }}<template v-if="node.systemName">（{{ node.systemName }}）</template></span>
        </li>
      </ul>
    </div>
    <div v-else class="filter-tree-browse">
      <div v-if="rootLoading" class="filter-tree-empty">加载中…</div>
      <div v-else-if="!rootNodes.length" class="filter-tree-empty">暂无设备/卫星</div>
      <ul v-else class="filter-tree-root">
        <TelemetryFilterTreeNode v-for="node in rootNodes" :key="node.id" :node="node" :depth="0" />
      </ul>
    </div>
  </div>
</template>

<style scoped>
.telemetry-filter-tree { display: flex; flex-direction: column; gap: 8px; max-height: 260px; }
.filter-tree-search { display: flex; align-items: center; gap: 6px; }
.filter-tree-search .app-input { flex: 1; }
.filter-tree-browse, .filter-tree-search-results { overflow-y: auto; border: 1px solid var(--ui-border); border-radius: 6px; padding: 4px; }
.filter-tree-empty { padding: 10px; text-align: center; font-size: 12px; color: var(--ui-text-muted); }
.filter-tree-root, .filter-tree-flat-list { margin: 0; padding: 0; }
.filter-tree-search-row { list-style: none; display: flex; align-items: center; gap: 8px; padding: 4px 6px; }
.filter-tree-meta { font-size: 11px; color: var(--ui-text-muted); }
</style>
