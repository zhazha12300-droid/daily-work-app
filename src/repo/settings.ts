import { db } from '../db'
import type { HomeCardSetting, Settings } from '../db/types'

export const DEFAULT_PLATFORMS = ['公众号', '小红书', 'B站', '抖音', '知乎']

/** 首页六张摘要卡，顺序即展示顺序（M2 会读它） */
export const HOME_CARD_KEYS = ['media', 'dev', 'consult', 'fitness', 'diet', 'game'] as const

function defaultHomeCards(): HomeCardSetting[] {
  return HOME_CARD_KEYS.map((key, i) => ({ key, visible: 1 as const, order: i }))
}

export function defaultSettings(): Settings {
  return {
    id: 'app',
    theme: 'light',
    weekStart: 1,
    kcalTarget: null,
    platforms: [...DEFAULT_PLATFORMS],
    homeCards: defaultHomeCards(),
    lastBackupAt: null,
    activeTimer: null,
    dismissedTips: [],
    quickCaptureMode: 'memo',
    updatedAt: Date.now(),
  }
}

/** 首次启动时插入默认设置；之后只读 */
export async function ensureSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  if (existing) return existing
  const fresh = defaultSettings()
  await db.settings.put(fresh)
  return fresh
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const exists = await db.settings.get('app')
  if (!exists) await db.settings.put(defaultSettings())
  await db.settings.update('app', { ...patch, updatedAt: Date.now() })
}

export function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('app')
}

/** 备份提醒阈值：超过 7 天没导出就变橙 */
export const BACKUP_STALE_MS = 7 * 24 * 3600 * 1000

/** 从未备份也算「该备份了」 */
export function isBackupStale(lastBackupAt: number | null, now = Date.now()): boolean {
  if (!lastBackupAt) return true
  return now - lastBackupAt > BACKUP_STALE_MS
}

/** 距上次备份过了几天（向上取整，从未备份返回 null） */
export function daysSinceBackup(lastBackupAt: number | null, now = Date.now()): number | null {
  if (!lastBackupAt) return null
  return Math.max(0, Math.ceil((now - lastBackupAt) / (24 * 3600 * 1000)))
}

/**
 * 首页卡片排序：把某张卡往上/下挪一位。
 * 上移下移而不是拖拽（设计稿里定的），越界时原样返回。
 */
export function moveHomeCard(
  cards: HomeCardSetting[],
  key: string,
  dir: 'up' | 'down',
): HomeCardSetting[] {
  const sorted = [...cards].sort((a, b) => a.order - b.order)
  const from = sorted.findIndex((c) => c.key === key)
  if (from < 0) return cards
  const to = dir === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= sorted.length) return cards
  const next = [...sorted]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next.map((c, i) => ({ ...c, order: i }))
}

/** 显示/隐藏某张首页卡片，顺序不变 */
export function toggleHomeCard(cards: HomeCardSetting[], key: string): HomeCardSetting[] {
  return cards.map((c) =>
    c.key === key ? { ...c, visible: c.visible === 1 ? (0 as const) : (1 as const) } : c,
  )
}

/**
 * 没有值或脏值时补回默认卡片，防止早期数据或恢复的旧备份缺卡片。
 * 返回的数组总是 6 项、order 连续。
 */
export function normalizeHomeCards(cards: HomeCardSetting[] | undefined): HomeCardSetting[] {
  const fallback = defaultHomeCards()
  if (!cards || cards.length === 0) return fallback
  const known = new Map(cards.map((c) => [c.key, c]))
  return HOME_CARD_KEYS.map((key, i) => {
    const hit = known.get(key)
    return hit ? { ...hit, order: i } : fallback[i]
  })
}
