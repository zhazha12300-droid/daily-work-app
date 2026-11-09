import { format } from 'date-fns'

/** 秒 → 1:05 / 1:02:03 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** 分钟 → 45 分钟 / 2 小时 10 分 */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest === 0 ? `${h} 小时` : `${h} 小时 ${rest} 分`
}

/** 时间戳 → 2026-09-18 10:32（非法值不炸页面） */
export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts)) return '—'
  return format(new Date(ts), 'yyyy-MM-dd HH:mm')
}

/** 时间戳 → 刚刚 / 3 小时前 / 3 天前 */
export function formatRelative(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return formatDateTime(ts).slice(0, 10)
}
