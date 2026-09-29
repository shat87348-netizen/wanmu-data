<script setup lang="ts">
export type FilterTreeNode = {
  id: number
  label: string
  nodeType: 'device' | 'system' | 'parameter'
  nodeTypeName?: string
  selectable?: boolean
  checked?: boolean
  hasChildren?: boolean
  deviceSatelliteId?: number
  children?: FilterTreeNode[]
  expanded?: boolean
  loading?: boolean
}

const props = defineProps<{ node: FilterTreeNode, depth: number }>()

const fetchChildren = inject<(node: FilterTreeNode) => Promise<FilterTreeNode[]>>('telemetryFilterFetchChildren')
const toggleChecked = inject<(node: FilterTreeNode) => Promise<void>>('telemetryFilterToggleChecked')

const isBranch = computed(() => props.node.nodeType !== 'parameter')

const onToggleExpand = async () => {
  if (!isBranch.value) return
  if (!props.node.hasChildren) return
  if (props.node.expanded) {
    props.node.expanded = false
    return
  }
  props.node.expanded = true
  if (props.node.children !== undefined) return
  props.node.loading = true
  try {
    props.node.children = (await fetchChildren?.(props.node)) || []
  } finally {
    props.node.loading = false
  }
}

const onToggleChecked = async () => {
  if (!props.node.selectable) return
  await toggleChecked?.(props.node)
}
</script>

<template>
  <li class="filter-tree-node">
    <div class="filter-tree-row" :style="{ paddingLeft: `${depth * 16}px` }">
      <button
        v-if="isBranch && node.hasChildren"
        type="button"
        class="filter-tree-caret"
        :class="{ expanded: node.expanded }"
        @click="onToggleExpand"
      >▸</button>
      <span v-else class="filter-tree-caret-placeholder" />
      <UCheckbox
        v-if="node.nodeType === 'parameter'"
        :model-value="Boolean(node.checked)"
        :disabled="!node.selectable"
        @update:model-value="onToggleChecked"
      />
      <span class="filter-tree-label" :class="node.nodeType" @click="isBranch ? onToggleExpand() : onToggleChecked()">
        {{ node.label }}
      </span>
      <span v-if="node.loading" class="filter-tree-loading">加载中…</span>
    </div>
    <ul v-if="node.expanded && node.children?.length" class="filter-tree-children">
      <TelemetryFilterTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
    </ul>
  </li>
</template>

<style scoped>
.filter-tree-node { list-style: none; }
.filter-tree-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; }
.filter-tree-row:hover { background: var(--ui-bg-elevated); }
.filter-tree-caret { flex: none; width: 16px; height: 16px; border: none; background: none; color: var(--ui-text-muted); cursor: pointer; transform: rotate(0deg); transition: transform 0.15s; font-size: 10px; }
.filter-tree-caret.expanded { transform: rotate(90deg); }
.filter-tree-caret-placeholder { flex: none; width: 16px; height: 16px; }
.filter-tree-label { flex: 1; font-size: 12px; cursor: pointer; color: var(--ui-text-toned); }
.filter-tree-label.parameter { color: var(--ui-text-highlighted); }
.filter-tree-loading { flex: none; font-size: 11px; color: var(--ui-text-muted); }
.filter-tree-children { margin: 0; padding: 0; }
</style>
