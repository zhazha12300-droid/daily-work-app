import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

/**
 * 防抖写入 + 「已保存」提示。
 * 全站没有保存按钮，靠它兜住多行文本这类高频输入。
 */
export function useAutosave<T>(commit: (value: T) => Promise<unknown>, delay = 400) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<number | null>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const run = useCallback(
    (value: T) => {
      setStatus('saving')
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        void (async () => {
          try {
            await commitRef.current(value)
            setStatus('saved')
            timer.current = window.setTimeout(() => setStatus('idle'), 1500)
          } catch {
            setStatus('idle')
          }
        })()
      }, delay)
    },
    [delay],
  )

  return { status, run }
}
