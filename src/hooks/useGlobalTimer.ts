import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db'
import type { ActiveTimer } from '../db/types'
import { updateSettings } from '../repo/settings'

export interface StartTimerInput {
  devItemId: string
  projectId: string
  label: string
}

export interface StopTimerResult {
  timer: ActiveTimer | null
  minutes: number
}

/**
 * 全站唯一的计时器。状态存在 settings 表里，所以：
 *  - 切板块、刷新页面都不会断
 *  - 关掉浏览器再打开，会读到遗留的计时（M3 会给「补记 / 丢弃」的选择）
 */
export function useGlobalTimer() {
  const timer = useLiveQuery(
    async () => (await db.settings.get('app'))?.activeTimer ?? null,
    [],
    null,
  )

  const [now, setNow] = useState(() => Date.now())
  const startedAt = timer?.startedAt ?? null

  useEffect(() => {
    if (!startedAt) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0

  const start = useCallback(async (input: StartTimerInput) => {
    await updateSettings({
      activeTimer: { ...input, startedAt: Date.now() },
    })
  }, [])

  const stop = useCallback(async (): Promise<StopTimerResult> => {
    const settings = await db.settings.get('app')
    const current = settings?.activeTimer ?? null
    if (!current) return { timer: null, minutes: 0 }
    const minutes = Math.max(1, Math.round((Date.now() - current.startedAt) / 60_000))
    await updateSettings({ activeTimer: null })
    return { timer: current, minutes }
  }, [])

  const discard = useCallback(async () => {
    await updateSettings({ activeTimer: null })
  }, [])

  return { timer, elapsedSec, isRunning: Boolean(timer), start, stop, discard }
}
