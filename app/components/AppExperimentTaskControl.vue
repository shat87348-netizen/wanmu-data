<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ compact?: boolean }>()

const { taskId, tasks, taskLabel, isLoading, loadError, loadTasks } = useExperimentTask()
const isOpen = ref(false)
const taskControlRef = ref<HTMLElement | null>(null)
const selectedTask = computed(() => tasks.value.find(task => task.id === taskId.value) || tasks.value[0])

const chooseTask = (id: string) => {
  taskId.value = id
  isOpen.value = false
}

const toggleOptions = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value && !tasks.value.length && !isLoading.value) void loadTasks(true)
}

const handleDocumentClick = (event: MouseEvent) => {
  if (!taskControlRef.value?.contains(event.target as Node)) isOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick))
</script>

<template>
  <div ref="taskControlRef" :class="['global-task-control', { compact }]">
    <span v-if="!compact" class="global-task-label">任务来源</span>
    <span v-if="!compact" class="global-task-label task-name-label">试验任务</span>
    <div class="task-select-wrap">
      <UButton
        type="button"
        class="task-select-trigger"
        aria-haspopup="listbox"
        :aria-expanded="isOpen"
        aria-label="试验任务"
        @click.stop="toggleOptions"
      >
        <span v-if="selectedTask" :class="['task-dot', selectedTask.source]" aria-hidden="true" />
        <span class="task-selected-label">{{ isLoading ? '正在加载试验任务…' : (selectedTask ? taskLabel(selectedTask) : '暂无试验任务') }}</span>
        <UIcon name="i-lucide-chevron-down" class="task-chevron" aria-hidden="true" />
      </UButton>

      <div v-if="isOpen" class="task-options" role="listbox" aria-label="试验任务">
        <UButton
          v-for="task in tasks"
          :key="task.id"
          type="button"
          role="option"
          :aria-selected="taskId === task.id"
          :class="['task-option', { selected: taskId === task.id }]"
          @click="chooseTask(task.id)"
        >
          <span :class="['task-dot', task.source]" aria-hidden="true" />
          <span class="task-option-label">{{ taskLabel(task) }}</span>
        </UButton>
        <div v-if="!tasks.length" class="task-empty">
          <span>{{ isLoading ? '正在加载试验任务…' : (loadError || '暂无试验任务') }}</span>
          <UButton v-if="!isLoading" type="button" @click="loadTasks(true)">重新加载</UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.global-task-control { display: inline-flex; align-items: center; min-width: 0; gap: 8px; }
.global-task-label { flex: none; color: var(--ui-text-muted); white-space: nowrap; font-size: 12px; font-weight: 500; }
.task-select-wrap { position: relative; min-width: 0; }
.task-select-trigger { display: flex; align-items: center; width: 300px; max-width: 28vw; min-width: 190px; height: 30px; gap: 8px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius); outline: none; background: var(--ui-bg-elevated); color: var(--ui-text); cursor: pointer; padding: 0 9px; font-size: 12px; text-align: left; transition: border-color .16s, background .16s; }
.task-select-trigger:hover, .task-select-trigger:focus-visible { border-color: var(--ui-primary); }
.task-selected-label, .task-option-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-selected-label { flex: 1; }
.task-chevron { flex: none; color: var(--ui-text-muted); }
.task-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; }
.task-dot.internal { background: #45ad8d; box-shadow: 0 0 0 3px color-mix(in srgb, #45ad8d 15%, transparent); }
.task-dot.external { background: #ecbe84; box-shadow: 0 0 0 3px color-mix(in srgb, #ecbe84 15%, transparent); }
.task-options { position: absolute; z-index: 80; top: calc(100% + 5px); right: 0; width: 360px; max-height: 260px; overflow: auto; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-bg-elevated); box-shadow: 0 12px 30px rgb(0 0 0 / 38%); padding: 4px; }
.task-option { display: flex; align-items: center; width: 100%; min-height: 30px; gap: 9px; border: 0; border-radius: 7px; background: transparent; color: var(--ui-text); cursor: pointer; padding: 5px 8px; font-size: 12px; text-align: left; }
.task-option:hover, .task-option.selected { background: var(--ui-bg-accented); color: var(--ui-text-highlighted); }
.task-empty { display: grid; min-width: 210px; gap: 8px; color: var(--ui-text-muted); padding: 10px 8px; font-size: 12px; }
.task-empty button { justify-self: start; border: 0; background: transparent; color: var(--ui-primary); cursor: pointer; padding: 0; font-size: 12px; }
.global-task-control.compact .task-select-trigger { width: min(280px, 42vw); min-width: 180px; }
@media (max-width: 1450px) { .global-task-label { display: none; }.task-select-trigger { width: 220px; min-width: 170px; } }
@media (max-width: 900px) { .global-task-control:not(.compact) { display: none; }.global-task-control.compact .task-select-trigger { width: min(250px, 62vw); min-width: 160px; } }
</style>
