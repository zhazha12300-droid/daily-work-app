import type { ActiveTimer } from '../db/types'

/**
 * 计时器状态存在 settings 里，所以关掉浏览器、第二天再打开，
 * 那条计时还会「一直在走」。这里判断要不要打断用户问一句：
 *   - 计时从今天早些时候就开始、已经走了 30 分钟以上 → 可能浏览器关过，问
 *   - 开始日期和现在不是同一天 → 肯定是遗留的，问
 *   - 刚开 5 分钟的计时（比如刷新了一下页面）→ 不打扰，接着走
 */
export const TIMER_RECOVERY_THRESHOLD_MS = 30 * 60 * 1000

function localDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shouldPromptRecovery(
  timer: ActiveTimer | null | undefined,
  now = Date.now(),
  thresholdMs = TIMER_RECOVERY_THRESHOLD_MS,
): boolean {
  if (!timer) return false
  const elapsed = now - timer.startedAt
  if (elapsed < 0) return false
  if (localDay(new Date(timer.startedAt)) !== localDay(new Date(now))) return true
  return elapsed >= thresholdMs
}

/** 「补记」时预填的分钟数，至少 1 分钟 */
export function recoveryMinutes(timer: ActiveTimer, now = Date.now()): number {
  return Math.max(1, Math.round((now - timer.startedAt) / 60_000))
}

interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 同一次页面打开期间只问一次：选了「继续计时」之后切板块别再弹 */
export function promptKey(timer: ActiveTimer): string {
  return `wb-timer-prompted:${timer.startedAt}`
}

export function wasPrompted(
  timer: ActiveTimer,
  storage: KeyValueStore | null = typeof window === 'undefined' ? null : window.sessionStorage,
): boolean {
  if (!storage) return false
  return storage.getItem(promptKey(timer)) === '1'
}

export function markPrompted(
  timer: ActiveTimer,
  storage: KeyValueStore | null = typeof window === 'undefined' ? null : window.sessionStorage,
): void {
  if (!storage) return
  try {
    storage.setItem(promptKey(timer), '1')
  } catch {
    // 隐私模式下 sessionStorage 可能写不进去，弹窗多出现一次不算问题
  }
}
