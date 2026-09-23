type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
}

const messageOf = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const data = (error as { data?: { message?: string } }).data
    if (data?.message) return data.message
    const message = (error as { message?: string }).message
    if (message) return message
  }
  return '请求失败，请稍后重试'
}

const isUnauthorized = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false

  const value = error as {
    status?: number
    statusCode?: number
    data?: { code?: number }
    response?: { status?: number, _data?: { code?: number } }
  }
  return value.status === 401
    || value.statusCode === 401
    || value.data?.code === 401
    || value.response?.status === 401
    || value.response?._data?.code === 401
}

export const useAdminApi = () => {
  const config = useRuntimeConfig()
  const { session, handleSessionExpired } = useSession()
  const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')

  const request = async <T>(path: string, options: RequestOptions = {}) => {
    try {
      const token = session.value?.token
      const response = await $fetch<ApiEnvelope<T> | T>(`${apiBase}${path}`, {
        method: options.method || 'GET',
        body: options.body,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      })

      if (typeof response === 'object' && response !== null && 'code' in response) {
        const envelope = response as ApiEnvelope<T>
        if (envelope.code === 401) {
          await handleSessionExpired()
          throw new Error(envelope.message || '登录状态已失效')
        }
        if (envelope.code !== undefined && envelope.code !== 0 && envelope.code !== 200) {
          throw new Error(envelope.message || '请求失败')
        }
        return envelope.data as T
      }

      return response as T
    } catch (error) {
      if (isUnauthorized(error)) await handleSessionExpired()
      throw new Error(messageOf(error))
    }
  }

  return { request }
}
