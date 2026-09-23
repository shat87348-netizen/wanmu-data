export const appThemes = [
  { id: 'military', name: '军绿色' },
  { id: 'style1', name: '科技蓝' },
  { id: 'style2', name: '星空紫' }
] as const

type ThemeId = (typeof appThemes)[number]['id']
type ColorMode = 'light' | 'dark'

const applyTheme = (theme: ThemeId, mode: ColorMode) => {
  if (!import.meta.client) return
  document.documentElement.dataset.appTheme = theme
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.classList.toggle('light', mode === 'light')
}

export const useAppTheme = () => {
  const themeId = useState<ThemeId>('app-theme', () => 'style1')
  const colorMode = useState<ColorMode>('app-color-mode', () => 'dark')

  const initialize = () => {
    if (!import.meta.client) return
    const storedTheme = localStorage.getItem('sjcl-app-theme') as ThemeId | null
    const storedMode = localStorage.getItem('sjcl-color-mode') as ColorMode | null
    if (appThemes.some(theme => theme.id === storedTheme)) themeId.value = storedTheme!
    if (storedMode === 'light' || storedMode === 'dark') colorMode.value = storedMode
    applyTheme(themeId.value, colorMode.value)
  }

  const setTheme = (value: ThemeId) => {
    themeId.value = value
    if (import.meta.client) localStorage.setItem('sjcl-app-theme', value)
    applyTheme(themeId.value, colorMode.value)
  }

  const setMode = (value: ColorMode) => {
    colorMode.value = value
    if (import.meta.client) localStorage.setItem('sjcl-color-mode', value)
    applyTheme(themeId.value, colorMode.value)
  }

  return {
    themes: appThemes,
    themeId,
    colorMode,
    isDark: computed(() => colorMode.value === 'dark'),
    initialize,
    setTheme,
    setMode
  }
}
