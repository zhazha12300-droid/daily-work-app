import { useEffect, useState } from 'react'
import { getStoredTheme, setTheme as applyAndBroadcast, subscribeTheme, type Theme } from '../theme'

/**
 * 读当前主题并跟着 setTheme() 的变化更新。
 * 组件里不要自己存一份 theme state——会跟侧栏/设置页对不上。
 */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  useEffect(() => subscribeTheme(setThemeState), [])

  return [theme, applyAndBroadcast]
}
