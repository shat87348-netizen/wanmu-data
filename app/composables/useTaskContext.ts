/**
 * 当前试验任务上下文。
 *
 * 绝大多数业务接口都以 taskId 作为数据范围；页面只需引用此上下文，
 * 即可与顶部试验任务选择保持一致。
 */
export const useTaskContext = () => {
  const taskId = useState<string>('global-task-id', () => '')

  const setTaskId = (value: string | number | null | undefined) => {
    taskId.value = value === null || value === undefined ? '' : String(value)
  }

  return { taskId, setTaskId }
}
