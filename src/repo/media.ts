import { db } from '../db'
import type { ISODate, MediaItem, MediaRating, MediaStatus } from '../db/types'
import { todayStr } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const T = db.mediaItems

export const MEDIA_STATUS: MediaStatus[] = ['idea', 'topic', 'writing', 'published']

export const STATUS_LABEL: Record<MediaStatus, string> = {
  idea: '想法',
  topic: '选题',
  writing: '写作中',
  published: '已发布',
}

/** 状态推进的下一步；已发布之后没有下一步 */
export const NEXT_STATUS: Record<MediaStatus, MediaStatus | null> = {
  idea: 'topic',
  topic: 'writing',
  writing: 'published',
  published: null,
}

export const RATING_LABEL: Record<'good' | 'avg' | 'bad', string> = {
  good: '好',
  avg: '一般',
  bad: '差',
}

export const RATING_OPTIONS: Exclude<MediaRating, null>[] = ['good', 'avg', 'bad']

function byStatusThenPlan(a: MediaItem, b: MediaItem): number {
  const sa = MEDIA_STATUS.indexOf(a.status)
  const sb = MEDIA_STATUS.indexOf(b.status)
  if (sa !== sb) return sa - sb
  const pa = a.planDate ?? '9999-12-31'
  const pb = b.planDate ?? '9999-12-31'
  if (pa !== pb) return pa < pb ? -1 : 1
  return b.createdAt - a.createdAt
}

export async function listMedia(): Promise<MediaItem[]> {
  const rows = await T.toArray()
  return rows.filter((r) => r.deletedAt === null).sort(byStatusThenPlan)
}

export async function getMedia(id: string): Promise<MediaItem | undefined> {
  return T.get(id)
}

export async function addMedia(input: {
  title: string
  platform?: string
  planDate?: ISODate | null
  status?: MediaStatus
}): Promise<string> {
  const now = nextTimestamp()
  const row: MediaItem = {
    id: newId(),
    title: input.title.trim() || '未命名',
    platform: input.platform ?? '',
    status: input.status ?? 'idea',
    planDate: input.planDate ?? null,
    publishDate: null,
    link: '',
    outline: '',
    views: null,
    likes: null,
    followers: null,
    review: '',
    rating: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await T.add(row)
  return row.id
}

export async function patchMedia(
  id: string,
  patch: Partial<Omit<MediaItem, 'id' | 'createdAt'>>,
): Promise<void> {
  await T.update(id, { ...patch, updatedAt: Date.now() })
}

/**
 * 状态推进：想法 → 选题 → 写作中 → 已发布。
 * 推到「已发布」时若还没填实际发布日，就用今天，省得回头再补。
 */
export async function advanceMedia(id: string): Promise<MediaStatus | null> {
  const row = await T.get(id)
  if (!row || row.deletedAt !== null) return null
  const next = NEXT_STATUS[row.status]
  if (!next) return null

  const patch: Partial<MediaItem> = { status: next, updatedAt: Date.now() }
  if (next === 'published' && !row.publishDate) {
    const today = todayStr()
    patch.publishDate = row.planDate && row.planDate > today ? row.planDate : today
  }
  await T.update(id, patch)
  return next
}

export async function deleteMedia(id: string): Promise<void> {
  await softDelete(T, id)
}

export async function restoreMedia(id: string): Promise<void> {
  await restore(T, id)
}

/** 计划日已过还没发布 → 逾期（按天算） */
export function overdueDays(item: MediaItem, today: ISODate): number {
  if (item.status === 'published' || !item.planDate) return 0
  if (item.planDate >= today) return 0
  const ms = new Date(`${today}T00:00:00`).getTime() - new Date(`${item.planDate}T00:00:00`).getTime()
  return Math.max(1, Math.round(ms / 86_400_000))
}

export async function overdueMedia(today: ISODate): Promise<MediaItem[]> {
  const rows = await listMedia()
  return rows.filter((r) => overdueDays(r, today) > 0).sort((a, b) => (a.planDate! < b.planDate! ? -1 : 1))
}

export interface MediaStats {
  publishedThisMonth: number
  platforms: { platform: string; count: number }[]
  top: MediaItem[]
}

/**
 * 统计口径：只算「已发布」且填了日期的条目。
 * 平台占比看本月，表现最好看全部历史（好选题不分月份）。
 */
export async function mediaStats(monthPrefix: string): Promise<MediaStats> {
  const rows = (await listMedia()).filter((r) => r.status === 'published' && r.publishDate)

  const thisMonth = rows.filter((r) => r.publishDate!.startsWith(monthPrefix))

  const counts = new Map<string, number>()
  for (const item of thisMonth) {
    const key = item.platform.trim() || '未标平台'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const platforms = [...counts.entries()]
    .map(([platform, count]) => ({ platform, count }))
    // 数量多的在前；数量相同按平台名固定顺序，避免每次刷新顺序乱跳
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))

  const top = [...rows]
    .filter((r) => typeof r.views === 'number')
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 3)

  return { publishedThisMonth: thisMonth.length, platforms, top }
}

export async function listPlatforms(): Promise<string[]> {
  const settings = await db.settings.get('app')
  return settings?.platforms ?? []
}

/* ── 发布后数据图表 ───────────────────────────────────────────── */

export interface MediaMonthPoint {
  /** 'YYYY-MM' */
  month: string
  /** 图上显示用的短标签，如「7月」 */
  label: string
  /** 该月发布条数 */
  published: number
  /** 该月已发布条目的总阅读量 */
  views: number
}

/**
 * 近 N 个月（含本月）的发布/浏览趋势，给自媒体「数据图表」用。
 * 口径：只统计 status === 'published' 且填了 publishDate 的条目；
 * 每个月固定输出一格（没有数据补 0），图表的横轴才不会缺席。
 */
export async function mediaMonthlyTrend(anchor: ISODate, months = 6): Promise<MediaMonthPoint[]> {
  const published = (await listMedia()).filter(
    (r) => r.status === 'published' && r.publishDate,
  )

  const buckets = new Map<string, { published: number; views: number }>()
  for (const item of published) {
    const key = item.publishDate!.slice(0, 7)
    const cur = buckets.get(key) ?? { published: 0, views: 0 }
    cur.published += 1
    cur.views += item.views ?? 0
    buckets.set(key, cur)
  }

  const [year, month] = anchor.slice(0, 7).split('-').map(Number)
  const out: MediaMonthPoint[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(year, month - 1 - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const cur = buckets.get(key) ?? { published: 0, views: 0 }
    out.push({ month: key, label: `${d.getMonth() + 1}月`, ...cur })
  }
  return out
}
