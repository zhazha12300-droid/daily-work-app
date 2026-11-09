export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'wb-theme-v2'
const THEME_EVENT = 'wb-theme-change'

/**
 * 默认深色（macOS「天气」风格的暮光渐变，见 tokens.css）。
 * 换用了 v2 存储键：上一次设计里默认是浅色，旧浏览器里可能存着「light」，
 * 换键后这次视觉改版统一落到深色，之后仍以用户手选的为准。
 * 这里只把主题镜像到 localStorage 一份，是为了在首帧前就能套用、避免闪白。
 *
 * 为什么不再用 React state 单独管：设置页也要能切主题，
 * 用一个模块级事件把「谁改了主题」广播出去，侧栏和设置页就都同步了。
 */
export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
  return 'dark'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* 存不进去不影响使用 */
  }
}

/** 改变主题：套用样式 + 通知所有订阅者（侧栏、设置页） */
export function setTheme(theme: Theme): void {
  applyTheme(theme)
  try {
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: theme }))
  } catch {
    /* 没有 window 的环境（测试里的服务端渲染）忽略 */
  }
}

/** 订阅主题变化，返回取消订阅的函数 */
export function subscribeTheme(onChange: (theme: Theme) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<Theme>).detail
    onChange(detail === 'dark' ? 'dark' : 'light')
  }
  try {
    window.addEventListener(THEME_EVENT, handler)
  } catch {
    return () => {}
  }
  return () => window.removeEventListener(THEME_EVENT, handler)
}
