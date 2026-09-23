<template>
  <main v-if="isEmbeddedContent" class="embed-content">
    <div v-if="!isAuthenticated" class="embed-auth-wait" role="status" aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="embed-auth-spinner" />
      <span>正在获取统一登录状态…</span>
    </div>
    <slot v-else />
  </main>

  <UDashboardGroup v-else class="app-shell">
    <UDashboardSidebar id="main-sidebar">
      <template #header>
        <NuxtLink to="/dashboard" class="sidebar-brand">
          <span class="brand-mark">DP</span>
          <span class="brand-text">数据处理软件</span>
        </NuxtLink>
      </template>

      <template #default>
        <UNavigationMenu
          :items="navigation"
          orientation="vertical"
          highlight
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="main-panel" class="main-panel">
      <UDashboardNavbar :toggle="false" class="top-navbar">
        <template #left>
          <div>
            <p class="page-title">{{ pageTitle }}</p>
            <p class="page-description">数据处理软件</p>
          </div>
        </template>

        <template #right>
          <!-- <AppExperimentTaskControl /> -->
          <AppThemeMenu />
          <UButton color="neutral" variant="ghost" class="profile-button" @click="handleLogout">
            <UAvatar size="xs" :text="avatarText" />
            <span>{{ user?.name || '用户' }}</span>
            <UIcon name="i-lucide-log-out" class="size-4" />
          </UButton>
        </template>
      </UDashboardNavbar>

      <div class="content-area">
        <slot />
      </div>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
const route = useRoute()
const { user, isAuthenticated, canAccessPage, signOut } = useSession()
const { logout } = useAuthApi()
const isEmbeddedContent = useEmbedMode()

const allNavigation = computed(() => [
  { label: '总览', icon: 'i-lucide-layout-dashboard', to: '/dashboard' },
  { label: '数据可视化', icon: 'i-lucide-line-chart', to: '/data-viz' },
  { label: '数据采集', icon: 'i-lucide-radio-tower', to: '/data-collection' },
  { label: '卫星管理', icon: 'i-lucide-satellite-dish', to: '/satellite-management' },
  { label: '数据处理', icon: 'i-lucide-cog', to: '/data-process' },
  { label: '数据校准', icon: 'i-lucide-sliders-horizontal', to: '/calibration' },
  { label: '告警管理', icon: 'i-lucide-bell-ring', to: '/alarm' },
  {
    label: '系统配置',
    icon: 'i-lucide-settings',
    defaultOpen: route.path.startsWith('/config'),
    children: [
      { label: '采集代理管理', icon: 'i-lucide-server', to: '/config/agents' },
      { label: '日志管理', icon: 'i-lucide-scroll-text', to: '/config/log' },
      { label: '用户管理', icon: 'i-lucide-users', to: '/config/user' }
    ]
  }
])

const navigation = computed(() => allNavigation.value.flatMap((item) => {
  if (item.children) {
    const children = item.children.filter(child => canAccessPage(child.to))
    return children.length ? [{ ...item, children }] : []
  }

  return item.to && canAccessPage(item.to) ? [item] : []
}))

const navTitles = computed(() => {
  const titles = new Map<string, string>()
  navigation.value.forEach(item => {
    if (item.to) titles.set(item.to, item.label)
    item.children?.forEach(child => titles.set(child.to, child.label))
  })
  return titles
})

const pageTitle = computed(() => navTitles.value.get(route.path) || '数据处理软件')
const avatarText = computed(() => (user.value?.name || '用').slice(0, 1))

const handleLogout = async () => {
  try {
    if (isAuthenticated.value) await logout()
  } catch {
    // 令牌失效时仍清理本地会话，确保用户可以重新登录。
  } finally {
    signOut()
  }
  await navigateTo('/login')
}
</script>

<style scoped>
.embed-content {
  width: 100%;
  height: 100dvh;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 20px;
  background: var(--ui-bg-muted);
  color: var(--ui-text);
}

.embed-content > :slotted(*) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 100%;
}

.embed-auth-wait {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ui-text-muted);
  font-size: 14px;
}

.embed-auth-spinner {
  width: 20px;
  height: 20px;
  animation: embed-auth-spin .8s linear infinite;
}

@keyframes embed-auth-spin {
  to { transform: rotate(360deg); }
}

.app-shell {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  background: var(--ui-bg-muted);
}

.main-panel {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  color: var(--ui-text-highlighted);
  font-size: 14px;
  font-weight: 700;
}

.sidebar-brand.collapsed {
  justify-content: center;
}

.brand-mark {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  flex: none;
  border-radius: 6px;
  background: var(--ui-primary);
  color: white;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .04em;
}

.brand-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-navbar {
  flex: 0 0 52px;
  min-height: 52px;
}

.page-title,
.page-description {
  margin: 0;
}

.page-title {
  color: var(--ui-text-highlighted);
  font-size: 14px;
  font-weight: 650;
}

.page-description {
  margin-top: 2px;
  color: var(--ui-text-muted);
  font-size: 11px;
}

.profile-button {
  gap: 7px;
}

.content-area {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px;
}

.content-area > :slotted(*) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 100%;
  flex: 1 1 auto;
}
</style>
