import { useEffect, useRef } from 'react'

type Bindings = Record<string, () => void>

function comboOf(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

/**
 * 全局快捷键。键位写法：'mod+k'、'mod+1'、'escape'。
 * 规则：在输入框里只响应带 mod 的组合键和 Esc，避免打字时误触发。
 */
export function useShortcuts(bindings: Bindings): void {
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      const combo = comboOf(e)
      if (typing && !combo.startsWith('mod+') && combo !== 'escape') return

      const fn = ref.current[combo]
      if (!fn) return
      e.preventDefault()
      fn()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
