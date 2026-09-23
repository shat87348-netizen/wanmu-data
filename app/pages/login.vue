<template>
  <main class="login-page">
    <div class="scene-layer" aria-hidden="true">
      <div class="radar-scope">
        <span class="ring ring-1" />
        <span class="ring ring-2" />
        <span class="ring ring-3" />
        <span class="axis axis-x" />
        <span class="axis axis-y" />
        <span class="sweep" />
        <span class="radar-core" />
      </div>

      <div class="network-map">
        <span v-for="node in networkNodes" :key="node.id" class="network-node" :style="node.style" />
        <span v-for="link in networkLinks" :key="link.id" class="network-link" :style="link.style" />
      </div>

      <div class="data-panel panel-a">
        <div class="panel-title">
          <span />
          <strong>PDXP</strong>
        </div>
        <div class="mini-chart">
          <span v-for="bar in miniBars" :key="bar.id" :style="{ height: bar.height }" />
        </div>
      </div>

      <div class="data-panel panel-b">
        <div v-for="row in streamRows" :key="row" class="stream-row">
          <span />
          <i />
        </div>
      </div>

      <div class="wave-field">
        <span class="wave wave-1" />
        <span class="wave wave-2" />
        <span class="wave wave-3" />
      </div>
    </div>

    <section class="login-visual">
      <div class="brand-lockup">
        <div class="brand-mark">
          <UIcon name="i-lucide-satellite" />
        </div>
        <div>
          <div class="brand-name">数据处理软件</div>
          <div class="brand-subtitle">Telemetry Processing Console</div>
        </div>
      </div>

      <div class="signal-panel">
        <div class="signal-header">
          <span>实时遥测链路</span>
          <strong>ONLINE</strong>
        </div>
        <div class="signal-lines">
          <span v-for="item in signalBars" :key="item.id" :style="{ height: item.height, opacity: item.opacity }" />
        </div>
      </div>
    </section>

    <section class="login-card">
      <div class="login-card-header">
        <div class="login-eyebrow">统一身份认证</div>
        <h1>欢迎登录-</h1>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <label class="field">
          <span>用户名</span>
          <div class="input-shell">
            <UIcon name="i-lucide-user" />
            <UInput v-model.trim="form.username" autocomplete="username" placeholder="请输入用户名" class="app-input" />
          </div>
        </label>

        <label class="field">
          <span>密码</span>
          <div class="input-shell">
            <UIcon name="i-lucide-lock-keyhole" />
            <UInput v-model="form.password" autocomplete="current-password" type="password" placeholder="请输入密码" class="app-input" />
          </div>
        </label>

        <div v-if="errorMessage" class="login-error">
          <UIcon name="i-lucide-circle-alert" />
          <span>{{ errorMessage }}</span>
        </div>

        <UButton type="submit" color="primary" size="xl" block :loading="loading" class="login-submit">
          登录系统
        </UButton>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'

const route = useRoute()
const { isAuthenticated, signIn, updateUser, setPagePaths } = useSession()
const { login, userInfo, routes } = useAuthApi()
definePageMeta({ layout: false, middleware: 'guest' })
// 临时演示开关：开启时点击登录直接进入系统，不请求后台认证接口。
const DEMO_LOGIN_BYPASS = false;
const loading = ref(false)
const errorMessage = ref('')
const streamRows = Array.from({ length: 7 }, (_, index) => index + 1)
const signalBars = Array.from({ length: 18 }, (_, index) => ({
  id: index + 1,
  height: `${14 + ((index * 5) % 7) * 5}px`,
  opacity: 0.28 + (index % 4) * 0.1
}))
const miniBars = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  height: `${22 + ((index * 7) % 6) * 10}px`
}))
const networkNodes = [
  { id: 'n1', style: { left: '40%', top: '17%' } },
  { id: 'n2', style: { left: '56%', top: '24%' } },
  { id: 'n3', style: { left: '45%', top: '42%' } },
  { id: 'n4', style: { left: '67%', top: '39%' } },
  { id: 'n5', style: { left: '78%', top: '19%' } },
  { id: 'n6', style: { left: '74%', top: '68%' } }
]
const networkLinks = [
  { id: 'l1', style: { left: '41%', top: '19%', width: '18%', transform: 'rotate(22deg)' } },
  { id: 'l2', style: { left: '46%', top: '40%', width: '23%', transform: 'rotate(-8deg)' } },
  { id: 'l3', style: { left: '57%', top: '25%', width: '17%', transform: 'rotate(37deg)' } },
  { id: 'l4', style: { left: '68%', top: '37%', width: '13%', transform: 'rotate(-54deg)' } },
  { id: 'l5', style: { left: '64%', top: '58%', width: '13%', transform: 'rotate(35deg)' } }
]

const form = reactive({
  username: 'admin',
  password: ''
})

const pagePathMap: Record<string, string> = {
  '/system/user': '/config/user',
  '/system/users': '/config/user'
}

const joinRoutePath = (parentPath: string, path?: string) => {
  if (!path) return parentPath
  if (path.startsWith('/')) return path
  return `${parentPath.replace(/\/$/, '')}/${path}`
}

const collectPagePaths = (items: Array<{ path?: string, children?: unknown }> = [], parentPath = ''): string[] => {
  return items.flatMap((item) => {
    const fullPath = joinRoutePath(parentPath, item.path)
    const children = Array.isArray(item.children)
      ? collectPagePaths(item.children, fullPath)
      : []

    // 目录本身不授予页面权限；仅使用后端返回的叶子节点。
    return children.length ? children : [pagePathMap[fullPath] || fullPath]
  })
}

const handleLogin = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    if (DEMO_LOGIN_BYPASS) {
      signIn({
        token: `demo-${Date.now()}`,
        username: form.username || 'admin',
        name: form.username || '管理员'
      })
      await navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
      return
    }

    if (!form.username || !form.password) {
      errorMessage.value = '请输入用户名和密码'
      return
    }

    const result = await login(form.username, form.password)
    if (!result?.token) throw new Error('登录失败，未获取到访问令牌')

    signIn({ token: result.token, username: form.username })

    const [userInfoResult, routesResult] = await Promise.allSettled([userInfo(), routes()])
    if (userInfoResult.status === 'fulfilled') {
      const remoteUser = userInfoResult.value?.user
      updateUser({
        username: remoteUser?.username || form.username,
        name: remoteUser?.nickname || remoteUser?.name || remoteUser?.username || form.username
      })
    }
    if (routesResult.status === 'fulfilled') {
      setPagePaths(collectPagePaths(routesResult.value || []))
    }

    // 登录后的初始化接口若明确返回 401，失效处理会清空会话并跳回登录页。
    if (!isAuthenticated.value) return
    await navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 460px);
  background:
    linear-gradient(90deg, rgba(4, 12, 24, 0.02), rgba(4, 12, 24, 0.28)),
    url('../assets/images/login-bg.svg') center / cover no-repeat;
  color: var(--ui-text);
  overflow: hidden;
}

.login-page::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, transparent 0 46%, rgba(138, 187, 219, 0.08) 46% 46.2%, transparent 46.2%),
    linear-gradient(115deg, transparent 0 59%, rgba(69, 173, 141, 0.07) 59% 59.16%, transparent 59.16%);
  pointer-events: none;
}

.login-page::after {
  content: "";
  position: absolute;
  inset: auto -10% -24% 30%;
  height: 46%;
  background: radial-gradient(ellipse at center, rgba(138, 187, 219, 0.16), transparent 64%);
  pointer-events: none;
}

.scene-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.radar-scope {
  position: absolute;
  left: 45%;
  top: 18%;
  width: 520px;
  aspect-ratio: 1;
  transform: translateX(-50%);
  border-radius: 50%;
  background:
    radial-gradient(circle at center, rgba(138, 187, 219, 0.2), rgba(138, 187, 219, 0.04) 30%, transparent 62%),
    conic-gradient(from 212deg, rgba(69, 173, 141, 0.26), transparent 25%, rgba(138, 187, 219, 0.18), transparent 64%);
  opacity: 0.9;
}

.radar-scope .ring,
.radar-scope .axis,
.radar-scope .sweep,
.radar-scope .radar-core {
  position: absolute;
  display: block;
}

.radar-scope .ring {
  inset: var(--inset);
  border: 1px solid rgba(138, 187, 219, var(--alpha));
  border-radius: 50%;
}

.ring-1 { --inset: 18%; --alpha: 0.24; }
.ring-2 { --inset: 32%; --alpha: 0.2; }
.ring-3 { --inset: 45%; --alpha: 0.28; }

.radar-scope .axis {
  left: 50%;
  top: 8%;
  width: 1px;
  height: 84%;
  background: rgba(138, 187, 219, 0.18);
  transform-origin: 50% 50%;
}

.axis-x { transform: rotate(90deg); }
.axis-y { transform: rotate(0deg); }

.sweep {
  inset: 14%;
  border-radius: 50%;
  background: conic-gradient(from 300deg, rgba(69, 173, 141, 0.42), rgba(69, 173, 141, 0.04) 16%, transparent 26%);
  filter: blur(0.5px);
}

.radar-core {
  left: 50%;
  top: 50%;
  width: 96px;
  height: 96px;
  transform: translate(-50%, -50%) rotate(45deg);
  border: 1px solid rgba(138, 187, 219, 0.52);
  background: rgba(18, 43, 67, 0.34);
  box-shadow: 0 0 60px rgba(138, 187, 219, 0.24);
}

.network-map {
  position: absolute;
  inset: 0;
}

.network-node {
  position: absolute;
  width: 74px;
  height: 74px;
  margin: -37px 0 0 -37px;
  border-radius: 50%;
  border: 1px solid rgba(69, 173, 141, 0.62);
  background: radial-gradient(circle, rgba(69, 173, 141, 0.22), rgba(8, 17, 31, 0.62) 58%, rgba(8, 17, 31, 0.08));
  box-shadow: 0 0 46px rgba(69, 173, 141, 0.18), inset 0 0 26px rgba(138, 187, 219, 0.08);
}

.network-node::after {
  content: "";
  position: absolute;
  inset: 24px;
  border-radius: 50%;
  background: #8abbdb;
  box-shadow: 0 0 18px rgba(138, 187, 219, 0.9);
}

.network-link {
  position: absolute;
  height: 4px;
  transform-origin: left center;
  background: linear-gradient(90deg, rgba(138, 187, 219, 0.04), rgba(138, 187, 219, 0.5), rgba(69, 173, 141, 0.12));
  box-shadow: 0 0 20px rgba(138, 187, 219, 0.18);
}

.data-panel {
  position: absolute;
  border: 1px solid rgba(138, 187, 219, 0.3);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(8, 17, 31, 0.7), rgba(8, 17, 31, 0.38));
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
}

.panel-a {
  right: clamp(520px, 28vw, 680px);
  top: 10%;
  width: 320px;
  padding: 18px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title span {
  width: 118px;
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(138, 187, 219, 0.72), rgba(69, 173, 141, 0.12));
}

.panel-title strong {
  color: #45ad8d;
  font-size: 12px;
  letter-spacing: 0;
}

.mini-chart {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: end;
  gap: 7px;
  height: 112px;
}

.mini-chart span {
  border-radius: 3px 3px 0 0;
  background: linear-gradient(180deg, #8abbdb, rgba(69, 173, 141, 0.7));
  box-shadow: 0 0 18px rgba(138, 187, 219, 0.18);
}

.panel-b {
  right: clamp(520px, 28vw, 680px);
  bottom: 12%;
  width: 360px;
  padding: 18px;
  display: grid;
  gap: 13px;
}

.stream-row {
  display: grid;
  grid-template-columns: 12px 1fr;
  gap: 12px;
  align-items: center;
}

.stream-row span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #45ad8d;
  box-shadow: 0 0 18px rgba(69, 173, 141, 0.8);
}

.stream-row i {
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(138, 187, 219, 0.56), rgba(138, 187, 219, 0.06));
}

.wave-field {
  position: absolute;
  left: -3%;
  right: -4%;
  bottom: 2%;
  height: 290px;
  overflow: hidden;
}

.wave {
  position: absolute;
  left: 0;
  width: 110%;
  height: 180px;
  border: solid rgba(138, 187, 219, 0.34);
  border-width: 2px 0 0;
  border-radius: 50%;
}

.wave-1 {
  bottom: 86px;
  transform: rotate(-5deg);
}

.wave-2 {
  bottom: 26px;
  border-color: rgba(69, 173, 141, 0.32);
  transform: rotate(7deg);
}

.wave-3 {
  bottom: -42px;
  border-color: rgba(236, 190, 132, 0.24);
  transform: rotate(-3deg);
}

.login-visual {
  position: relative;
  z-index: 2;
  min-height: 100vh;
  padding: 56px;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #eef7ff;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-primary) 18%, transparent);
  box-shadow: 0 0 0 1px rgba(138, 187, 219, 0.36), 0 16px 40px rgba(69, 173, 141, 0.18);
}

.brand-mark :deep(svg) {
  width: 24px;
  height: 24px;
}

.brand-name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0;
}

.brand-subtitle {
  margin-top: 3px;
  color: rgba(238, 247, 255, 0.62);
  font-size: 12px;
  letter-spacing: 0;
}

.signal-panel {
  position: absolute;
  left: 72px;
  bottom: 80px;
  width: min(420px, calc(100% - 144px));
  padding: 14px;
  border: 1px solid rgba(138, 187, 219, 0.18);
  border-radius: 8px;
  background: rgba(4, 13, 25, 0.42);
  backdrop-filter: blur(8px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(69, 173, 141, 0.05) inset;
  opacity: 0.82;
}

.signal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  color: rgba(238, 247, 255, 0.72);
  font-size: 12px;
}

.signal-header strong {
  color: #45ad8d;
  font-size: 12px;
}

.signal-lines {
  display: grid;
  grid-template-columns: repeat(18, 1fr);
  align-items: end;
  gap: 4px;
  height: 58px;
}

.signal-lines span {
  border-radius: 2px 2px 0 0;
  background: linear-gradient(180deg, #8abbdb, #45ad8d);
}

.login-card {
  position: relative;
  z-index: 2;
  align-self: center;
  justify-self: center;
  width: min(400px, calc(100% - 40px));
  padding: 34px;
  border: 1px solid rgba(138, 187, 219, 0.24);
  border-radius: 8px;
  background: rgba(8, 17, 31, 0.76);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(18px);
}

.login-card-header {
  margin-bottom: 28px;
}

.login-eyebrow {
  margin-bottom: 8px;
  color: #8abbdb;
  font-size: 13px;
  font-weight: 700;
}

.login-card h1 {
  margin: 0;
  color: #f7fbff;
  font-size: 30px;
  line-height: 1.18;
  font-weight: 800;
  letter-spacing: 0;
}

.login-form {
  display: grid;
  gap: 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field > span {
  color: rgba(238, 247, 255, 0.72);
  font-size: 13px;
  font-weight: 600;
}

.input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 13px;
  border: 1px solid rgba(138, 187, 219, 0.22);
  border-radius: 6px;
  background: rgba(4, 12, 24, 0.72);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.input-shell:focus-within {
  border-color: rgba(138, 187, 219, 0.72);
  background: rgba(4, 12, 24, 0.9);
  box-shadow: 0 0 0 3px rgba(138, 187, 219, 0.12);
}

.input-shell :deep(svg) {
  flex: none;
  width: 18px;
  height: 18px;
  color: #8abbdb;
}

.input-shell input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f7fbff;
  font-size: 15px;
}

.input-shell input::placeholder {
  color: rgba(238, 247, 255, 0.36);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(239, 68, 60, 0.12);
  color: #ffb4ae;
  font-size: 13px;
}

.login-submit {
  margin-top: 4px;
}

@media (max-width: 980px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-visual {
    position: absolute;
    inset: 0;
    min-height: 100vh;
    padding: 28px;
    pointer-events: none;
  }

  .signal-panel {
    display: none;
  }

  .panel-a,
  .panel-b {
    display: none;
  }

  .login-card {
    position: relative;
    z-index: 1;
  }
}
</style>
