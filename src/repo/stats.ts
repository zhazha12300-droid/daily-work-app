import { db } from '../db'
import type { ISODate } from '../db/types'
import { weekRange } from '../lib/date'

export interface HomeStats {
  /** 本周已发布条数 */
  mediaWeek: number
  /** 进行中的条目数 */
  devDoing: number
  /** 今天有几场咨询 */
  consultToday: number
  /** 今天练没练（次数） */
  fitnessToday: number
  /** 今天摄入热量 */
  dietKcal: number
  /** 本周娱乐时长（分钟） */
  gameMinutes: number
}

export const EMPTY_STATS: HomeStats = {
  mediaWeek: 0,
  devDoing: 0,
  consultToday: 0,
  fitnessToday: 0,
  dietKcal: 0,
  gameMinutes: 0,
}

/**
 * 首页六张摘要卡的数据。
 * 各板块还没实装时，这些表是空的，卡片会显示 0 —— 这是正常的，不是 bug。
 */
export async function getHomeStats(today: ISODate, weekStartDay: 0 | 1): Promise<HomeStats> {
  const { start, end } = weekRange(today, weekStartDay)

  const [media, dev, consult, fitness, meals, games] = await Promise.all([
    db.mediaItems.where('publishDate').between(start, end, true, true).toArray(),
    db.devItems.where('status').equals('doing').toArray(),
    db.consultLogs.where('date').equals(today).toArray(),
    db.workoutSessions.where('date').equals(today).toArray(),
    db.meals.where('date').equals(today).toArray(),
    db.gameSessions.where('date').between(start, end, true, true).toArray(),
  ])

  const kcal = meals.reduce(
    (sum, meal) =>
      sum + meal.items.reduce((s, item) => s + (typeof item.kcal === 'number' ? item.kcal : 0), 0),
    0,
  )

  return {
    mediaWeek: media.filter((m) => m.deletedAt === null).length,
    devDoing: dev.filter((d) => d.deletedAt === null).length,
    consultToday: consult.filter((c) => c.deletedAt === null).length,
    fitnessToday: fitness.filter((w) => w.deletedAt === null).length,
    dietKcal: kcal,
    gameMinutes: games.reduce((sum, g) => sum + (g.minutes || 0), 0),
  }
}
