import { db, describeDbError } from '../db'
import { formatBytes } from '../db/labels'

export type StorageLevel = 'ok' | 'warn' | 'full'

/** 浏览器给整个站点的配额，用到 80% 提醒、95% 算满（再写就会抛 QuotaExceededError） */
export const QUOTA_WARN_RATIO = 0.8
export const QUOTA_FULL_RATIO = 0.95

export function quotaLevel(usage: number, quota: number): StorageLevel {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return 'ok'
  const ratio = usage / quota
  if (ratio >= QUOTA_FULL_RATIO) return 'full'
  if (ratio >= QUOTA_WARN_RATIO) return 'warn'
  return 'ok'
}

export function quotaText(usage: number, quota: number): string {
  const percent = quota > 0 ? (usage / quota) * 100 : 0
  const shown = percent < 0.1 ? '<0.1%' : `${percent.toFixed(1)}%`
  return `已用 ${formatBytes(usage)} / ${formatBytes(quota)}（${shown}）`
}

export interface QuotaUsage {
  usage: number
  quota: number
}

/**
 * 浏览器对本地存储的用量估计。Firefox 早期版本、隐私模式下可能没有这个 API，
 * 拿不到就返回 null，界面上不显示任何东西（而不是显示 0）。
 */
export async function estimateUsage(): Promise<QuotaUsage | null> {
  if (typeof navigator === 'undefined') return null
  const storage = navigator.storage
  if (!storage || typeof storage.estimate !== 'function') return null
  try {
    const est = await storage.estimate()
    const usage = est.usage
    const quota = est.quota
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) return null
    return { usage, quota }
  } catch {
    return null
  }
}

export interface DbHealth {
  ok: boolean
  message: string
}

/** 打开一次库，确认数据还能读写——这是「红条」的第一判据 */
export async function checkDbHealth(): Promise<DbHealth> {
  try {
    await db.open()
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: describeDbError(err) }
  }
}
