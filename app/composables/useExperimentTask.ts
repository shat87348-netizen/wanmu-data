export type ExperimentTaskSource = 'internal' | 'external'

export type ExperimentTask = {
  id: string
  name: string
  /** 接口暂未返回来源，先预留给后续区分本系统与外部系统。 */
  source: ExperimentTaskSource
}

type ExperimentTaskResponse = {
  taskId?: string
  taskName?: string
}

const toTask = (item: ExperimentTaskResponse): ExperimentTask | null => {
  if (!item.taskId?.trim() || !item.taskName?.trim()) return null

  return {
    id: item.taskId.trim(),
    name: item.taskName.trim(),
    source: 'internal'
  }
}

export const useExperimentTask = () => {
  const { request } = useAdminApi()
  const { taskId } = useTaskContext()
  const tasks = useState<ExperimentTask[]>('experiment-tasks', () => [])
  const isLoading = useState('experiment-tasks-loading', () => false)
  const loadError = useState<string | null>('experiment-tasks-error', () => null)
  const isLoaded = useState('experiment-tasks-loaded', () => false)

  const selectedTask = computed(() => tasks.value.find(task => task.id === taskId.value) || tasks.value[0])

  const ensureTaskId = () => {
    if (!tasks.value.some(task => task.id === taskId.value)) {
      taskId.value = tasks.value[0]?.id || ''
    }
  }

  // 开发热更新时任务列表状态可能被保留，而新抽取的公共 taskId 仍为空。
  // 这里同步一次，确保界面显示的任务与业务接口使用的 taskId 始终一致。
  if (isLoaded.value) ensureTaskId()

  const loadTasks = async (force = false) => {
    if (isLoading.value) return
    if (isLoaded.value && !force) {
      ensureTaskId()
      return
    }

    isLoading.value = true
    loadError.value = null

    try {
      const data = await request<ExperimentTaskResponse[]>('/experiment/tasks')
      tasks.value = Array.isArray(data)
        ? data.map(toTask).filter((task): task is ExperimentTask => task !== null)
        : []

      ensureTaskId()
      isLoaded.value = true
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : '试验任务加载失败'
    } finally {
      isLoading.value = false
    }
  }

  const taskLabel = (task: ExperimentTask) => task.name

  return { taskId, tasks, selectedTask, isLoading, loadError, loadTasks, taskLabel }
}
