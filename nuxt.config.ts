export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  buildDir: '.nuxt-dev',
  app: {
    head: {
      script: [{ src: '/config.js' }]
    }
  },
  runtimeConfig: {
    // 服务端专用（不下发到客户端）。server/api/[...].ts 在收到请求时读取，
    // 所以容器启动时用 NUXT_API_TARGET 环境变量覆盖即可生效，不用重新构建镜像。
    // apiTarget: process.env.NUXT_API_TARGET || 'http://192.168.112.55:8082',
    apiTarget: process.env.NUXT_API_TARGET || 'http://10.126.100.107:8082',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      syduThemeHostOrigins: process.env.NUXT_PUBLIC_SYDU_THEME_HOST_ORIGINS || '',
      ssoEnabled: process.env.NUXT_PUBLIC_SSO_ENABLED !== 'false',
      ssoHostOrigins: process.env.NUXT_PUBLIC_SSO_HOST_ORIGINS || '',
      ssoSystemKey: process.env.NUXT_PUBLIC_SSO_SYSTEM_KEY || 'data-processing'
    }
  },
  nitro: {
    prerender: {
      autoSubfolderIndex: false
    }
  },
  ui: {
    // Keep builds independent of external font metadata. A system font stack is sufficient initially.
    fonts: false
  },
  vite: {
    // Keep the development dependency cache in a project-owned location.
    cacheDir: '.vite'
  },
  devtools: { enabled: true },
  compatibilityDate: '2026-08-03'
})
