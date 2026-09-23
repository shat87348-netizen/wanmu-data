<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ middleware: 'auth' })

type Role = {
  id: number
  roleName?: string
  roleKey?: string
  status?: number
}

type User = {
  id: number
  username: string
  nickname?: string
  email?: string
  phone?: string
  status: number
  roleId?: number
  roleName?: string
  roleKey?: string
}

const { request } = useAdminApi()
const toast = useToast()
const { load: loadUserLookup, options: userOptions, label: userLabel } = useModuleLookup('user')
const loading = ref(false)
const userModalVisible = ref(false)
const isEditingUser = ref(false)
const editUserLoading = ref(false)
const statusChangingId = ref<number | null>(null)
const passwordModalVisible = ref(false)
const resetPasswordSubmitting = ref(false)
const resetTarget = ref<User | null>(null)
const users = ref<User[]>([])
const roles = ref<Role[]>([])

const userForm = reactive({
  id: undefined as number | undefined,
  username: '',
  password: '',
  realName: '',
  roleId: undefined as number | undefined,
  status: 1,
  email: '',
  phone: ''
})

const resetPasswordForm = reactive({
  password: '',
  confirmPassword: ''
})

const normalizeStatus = (value: unknown) => value === 1 || value === '1' || value === true || value === 'ACTIVE' ? 1 : 0

const asList = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object') {
    const result = payload as { records?: T[], list?: T[], rows?: T[] }
    return result.records || result.list || result.rows || []
  }
  return []
}

const normalizeUser = (row: Record<string, unknown>): User => ({
  id: Number(row.id),
  username: String(row.username || ''),
  nickname: String(row.nickname || row.realName || ''),
  email: String(row.email || ''),
  phone: String(row.phone || ''),
  status: normalizeStatus(row.status),
  roleId: row.roleId === undefined || row.roleId === null ? undefined : Number(row.roleId),
  roleName: String(row.roleName || ''),
  roleKey: String(row.roleKey || row.role || '')
})

const asRecord = (payload: unknown): Record<string, unknown> => (
  payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
)

const stats = computed(() => ({
  totalUser: users.value.length,
  activeUser: users.value.filter(user => user.status === 1).length,
  adminCount: users.value.filter(user => ['admin', 'super_admin', 'administrator'].includes(user.roleKey?.toLowerCase() || '')).length,
  userCount: users.value.filter(user => !['admin', 'super_admin', 'administrator'].includes(user.roleKey?.toLowerCase() || '')).length
}))

const roleOptions = computed(() => roles.value
  .filter(role => normalizeStatus(role.status ?? 1) === 1)
  .map(role => ({ value: role.id, label: role.roleName || role.roleKey || `角色 ${role.id}` })))
const userStatusOptions = computed(() => userOptions('status'))
const statusLabel = (status: unknown) => userLabel('status', status, status === 1 || status === '1' ? '启用' : '禁用')

const getRoleName = (user: User) => user.roleName || user.roleKey || '未分配'

const getRoleColor = (user: User) => {
  const key = user.roleKey?.toLowerCase()
  if (key === 'admin' || key === 'super_admin') return 'red'
  if (key?.includes('model')) return 'orange'
  if (key === 'user') return 'blue'
  return 'default'
}

const userColumns: TableColumn<User>[] = [
  { accessorKey: 'username', header: '用户名' },
  { accessorKey: 'nickname', header: '真实姓名' },
  { id: 'role', header: '角色' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'phone', header: '电话' },
  { id: 'actions', header: '操作' }
]

const loadUsers = async () => {
  loading.value = true
  try {
    const data = await request<unknown>('/system/users')
    users.value = asList<Record<string, unknown>>(data).map(normalizeUser)
  } catch (error) {
    users.value = []
    toast.add({ title: '加载用户列表失败，请检查登录状态', color: 'error' })
  } finally {
    loading.value = false
  }
}

const loadRoles = async () => {
  try {
    const data = await request<unknown>('/system/roles')
    roles.value = asList<Role>(data)
  } catch {
    roles.value = []
  }
}

const resetUserForm = () => Object.assign(userForm, {
  id: undefined,
  username: '',
  password: '',
  realName: '',
  roleId: undefined,
  status: 1,
  email: '',
  phone: ''
})

const showAddUserModal = () => {
  isEditingUser.value = false
  resetUserForm()
  userModalVisible.value = true
}

const fillUserForm = (record: User) => {
  Object.assign(userForm, {
    id: record.id,
    username: record.username,
    password: '',
    realName: record.nickname || '',
    roleId: record.roleId,
    status: record.status,
    email: record.email || '',
    phone: record.phone || ''
  })
}

const editUser = async (record: User) => {
  isEditingUser.value = true
  fillUserForm(record)
  userModalVisible.value = true
  editUserLoading.value = true
  try {
    const data = await request<unknown>(`/system/users/${encodeURIComponent(String(record.id))}`)
    fillUserForm(normalizeUser(asRecord(data)))
  } catch {
    toast.add({ title: '用户详情加载失败，已使用列表信息', color: 'warning' })
  } finally {
    editUserLoading.value = false
  }
}

const closeUserModal = () => {
  userModalVisible.value = false
}

const saveUser = async () => {
  if (!userForm.username.trim()) {
    toast.add({ title: '请填写用户名', color: 'error' })
    return
  }
  if (!isEditingUser.value && !userForm.password) {
    toast.add({ title: '请填写密码', color: 'error' })
    return
  }
  if (!userForm.roleId) {
    toast.add({ title: '请选择角色', color: 'error' })
    return
  }

  const payload = {
    ...(isEditingUser.value ? { id: userForm.id } : { password: userForm.password }),
    username: userForm.username.trim(),
    nickname: userForm.realName.trim(),
    phone: userForm.phone.trim(),
    email: userForm.email.trim(),
    status: Number(userForm.status),
    roleId: Number(userForm.roleId)
  }

  try {
    await request(isEditingUser.value ? '/system/users/update' : '/system/users/create', {
      method: 'POST',
      body: payload
    })
    toast.add({ title: isEditingUser.value ? '用户更新成功' : '用户添加成功', color: 'success' })
    closeUserModal()
    await loadUsers()
  } catch (error) {
    toast.add({ title: `操作失败: ${error instanceof Error ? error.message : ''}`, color: 'error' })
  }
}

const changeUserStatus = async (record: User) => {
  const nextStatus = record.status === 1 ? 0 : 1
  if (record.id === 1 && nextStatus === 0) {
    toast.add({ title: '保底管理员不能禁用', color: 'warning' })
    return
  }
  if (import.meta.client && !window.confirm(`确定${nextStatus === 1 ? '启用' : '禁用'}用户“${record.username}”吗？`)) return

  statusChangingId.value = record.id
  try {
    await request('/system/users/status', {
      method: 'POST',
      body: { id: record.id, status: nextStatus }
    })
    record.status = nextStatus
    toast.add({ title: nextStatus === 1 ? '用户已启用' : '用户已禁用', color: 'success' })
  } catch (error) {
    toast.add({ title: `状态更新失败: ${error instanceof Error ? error.message : ''}`, color: 'error' })
  } finally {
    statusChangingId.value = null
  }
}

const showResetPasswordModal = (record: User) => {
  resetTarget.value = record
  Object.assign(resetPasswordForm, { password: '', confirmPassword: '' })
  passwordModalVisible.value = true
}

const closeResetPasswordModal = () => {
  passwordModalVisible.value = false
  resetTarget.value = null
}

const resetPassword = async () => {
  if (!resetTarget.value) return
  if (!resetPasswordForm.password) {
    toast.add({ title: '请填写新密码', color: 'error' })
    return
  }
  if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
    toast.add({ title: '两次输入的密码不一致', color: 'error' })
    return
  }

  resetPasswordSubmitting.value = true
  try {
    await request('/system/users/reset-password', {
      method: 'POST',
      body: { id: resetTarget.value.id, password: resetPasswordForm.password }
    })
    toast.add({ title: '密码重置成功', color: 'success' })
    closeResetPasswordModal()
  } catch (error) {
    toast.add({ title: `密码重置失败: ${error instanceof Error ? error.message : ''}`, color: 'error' })
  } finally {
    resetPasswordSubmitting.value = false
  }
}

const deleteUser = async (id: number) => {
  if (import.meta.client && !window.confirm('确定删除此用户?')) return
  try {
    await request('/system/users/delete', { method: 'POST', body: { id } })
    toast.add({ title: '删除成功', color: 'success' })
    await loadUsers()
  } catch {
    toast.add({ title: '删除失败', color: 'error' })
  }
}

onMounted(() => {
  void loadUsers()
  void loadRoles()
  void loadUserLookup().catch(() => undefined)
})
</script>

<template>
  <div class="user">
    <div class="stats-row">
      <section class="stat-card"><UIcon name="i-lucide-user" /><div><span>用户总数</span><strong>{{ stats.totalUser }}</strong></div></section>
      <section class="stat-card"><UIcon name="i-lucide-users" /><div><span>活跃用户</span><strong>{{ stats.activeUser }}</strong></div></section>
      <section class="stat-card"><UIcon name="i-lucide-shield-check" /><div><span>管理员</span><strong>{{ stats.adminCount }}</strong></div></section>
      <section class="stat-card"><UIcon name="i-lucide-lock-keyhole" /><div><span>普通用户</span><strong>{{ stats.userCount }}</strong></div></section>
    </div>

    <section class="data-card">
      <header class="data-card-header">
        <h2>用户列表</h2>
        <UButton @click="showAddUserModal">新增用户</UButton>
      </header>
      <div class="table-wrap">
        <UTable :data="users" :columns="userColumns" :loading="loading" empty="暂无数据">
          <template #nickname-cell="{ row }">{{ row.original.nickname || '—' }}</template>
          <template #role-cell="{ row }"><span :class="['tag', getRoleColor(row.original)]">{{ getRoleName(row.original) }}</span></template>
          <template #status-cell="{ row }"><span :class="['tag', row.original.status === 1 ? 'success' : 'default']">{{ statusLabel(row.original.status) }}</span></template>
          <template #email-cell="{ row }">{{ row.original.email || '—' }}</template>
          <template #phone-cell="{ row }">{{ row.original.phone || '—' }}</template>
          <template #actions-cell="{ row }">
            <div class="actions">
              <UButton type="button" variant="link" size="xs" :disabled="statusChangingId === row.original.id" :title="row.original.id === 1 && row.original.status === 1 ? '保底管理员不能禁用' : undefined" @click="changeUserStatus(row.original)">{{ row.original.status === 1 ? '禁用' : '启用' }}</UButton>
              <UButton type="button" variant="link" size="xs" @click="editUser(row.original)">编辑</UButton>
              <UButton type="button" variant="link" size="xs" @click="showResetPasswordModal(row.original)">重置密码</UButton>
              <UButton type="button" color="error" variant="link" size="xs" @click="deleteUser(row.original.id)">删除</UButton>
            </div>
          </template>
        </UTable>
      </div>
    </section>

    <div v-if="userModalVisible" class="modal-layer" @click.self="closeUserModal">
      <section class="modal" role="dialog" aria-modal="true" :aria-label="isEditingUser ? '编辑用户' : '新增用户'">
        <header><h3>{{ isEditingUser ? '编辑用户' : '新增用户' }}</h3><UButton type="button" @click="closeUserModal"><UIcon name="i-lucide-x" /></UButton></header>
        <div class="form-body">
          <label>用户名<span>*</span><UInput v-model="userForm.username" placeholder="请输入用户名" /></label>
          <label v-if="!isEditingUser">密码<span>*</span><UInput v-model="userForm.password" type="password" placeholder="请输入密码" /></label>
          <label>真实姓名<UInput v-model="userForm.realName" placeholder="请输入真实姓名" /></label>
          <label>角色<span>*</span><AppSelect v-model="userForm.roleId"><option :value="undefined" disabled>请选择角色</option><option v-for="role in roleOptions" :key="role.value" :value="role.value">{{ role.label }}</option></AppSelect></label>
          <label>状态<AppSelect v-model.number="userForm.status"><option v-for="item in userStatusOptions" :key="item.value" :value="Number(item.value)">{{ item.label }}</option></AppSelect></label>
          <label>邮箱<UInput v-model="userForm.email" placeholder="请输入邮箱" /></label>
          <label>电话<UInput v-model="userForm.phone" placeholder="请输入电话" /></label>
        </div>
        <footer><UButton color="neutral" variant="outline" @click="closeUserModal">取消</UButton><UButton :loading="editUserLoading" @click="saveUser">确定</UButton></footer>
      </section>
    </div>

    <div v-if="passwordModalVisible" class="modal-layer" @click.self="closeResetPasswordModal">
      <section class="modal reset-password-modal" role="dialog" aria-modal="true" aria-label="重置用户密码">
        <header><h3>重置密码</h3><UButton type="button" @click="closeResetPasswordModal"><UIcon name="i-lucide-x" /></UButton></header>
        <div class="form-body reset-password-form">
          <p>为用户“{{ resetTarget?.username }}”设置新密码。</p>
          <label>新密码<span>*</span><UInput v-model="resetPasswordForm.password" type="password" placeholder="请输入新密码" /></label>
          <label>确认密码<span>*</span><UInput v-model="resetPasswordForm.confirmPassword" type="password" placeholder="请再次输入新密码" /></label>
        </div>
        <footer><UButton color="neutral" variant="outline" @click="closeResetPasswordModal">取消</UButton><UButton :loading="resetPasswordSubmitting" @click="resetPassword">确认重置</UButton></footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.user { display: grid; gap: 16px; }.stats-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }.stat-card, .data-card { border: 1px solid var(--ui-border); background: var(--ui-bg-elevated); }.stat-card { display: flex; align-items: center; gap: 12px; min-height: 92px; padding: 18px; }.stat-card > :first-child { color: var(--ui-primary); font-size: 23px; }.stat-card span { color: var(--ui-text-muted); font-size: 13px; }.stat-card strong { display: block; margin-top: 3px; color: var(--ui-text-highlighted); font-size: 24px; }.data-card-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--ui-border-muted); }.data-card-header h2 { margin: 0; color: var(--ui-text-highlighted); font-size: 16px; }.table-wrap { overflow-x: auto; } table { width: 100%; min-width: 820px; border-collapse: collapse; text-align: left; } th { padding: 12px 18px; color: var(--ui-text-muted); background: var(--ui-bg-muted); font-size: 13px; font-weight: 600; } td { padding: 13px 18px; border-top: 1px solid var(--ui-border-muted); color: var(--ui-text); font-size: 13px; } .table-state { padding: 36px; color: var(--ui-text-muted); text-align: center; }.tag { display: inline-block; padding: 3px 8px; border: 1px solid var(--ui-border); font-size: 12px; }.tag.success { color: var(--ui-success); }.tag.red { color: var(--ui-error); }.tag.orange { color: var(--ui-warning); }.tag.blue { color: var(--ui-info); }.actions { display: flex; gap: 10px; }.actions button { padding: 0; color: var(--ui-primary); border: 0; background: transparent; cursor: pointer; }.actions .danger { color: var(--ui-error); }.modal-layer { position: fixed; z-index: 50; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / .45); }.modal { width: min(560px, 100%); border: 1px solid var(--ui-border); background: var(--ui-bg-elevated); box-shadow: 0 18px 48px rgb(0 0 0 / .3); }.modal header { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--ui-border-muted); }.modal h3 { margin: 0; color: var(--ui-text-highlighted); font-size: 16px; }.modal header button { border: 0; background: transparent; color: var(--ui-text-muted); font-size: 18px; cursor: pointer; }.form-body { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 20px; }.form-body label { display: grid; gap: 7px; color: var(--ui-text); font-size: 13px; }.form-body label > span { margin-left: 3px; color: var(--ui-error); }.form-body select { min-height: 32px; padding: 0 9px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-bg); }.modal footer { display: flex; justify-content: flex-end; gap: 8px; padding: 15px 18px; border-top: 1px solid var(--ui-border-muted); } @media (max-width: 760px) { .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }.stat-card { min-height: 78px; padding: 12px; }.form-body { grid-template-columns: 1fr; } }
.user {
  grid-template-rows: auto minmax(280px, 1fr);
}

.user > .data-card {
  display: flex;
  min-height: 280px;
  flex-direction: column;
}

.user > .data-card .table-wrap {
  min-height: 0;
  flex: 1;
}

.reset-password-form {
  grid-template-columns: 1fr;
}

.reset-password-form p {
  margin: 0;
  color: var(--ui-text-muted);
  font-size: 13px;
}
</style>
