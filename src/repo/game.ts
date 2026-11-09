import { db } from '../db'
import type { Game, GameSession, GameStatus, ISODate, WatchItem, WatchType } from '../db/types'
import { shiftDate, toDate, weekRange } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const G = db.games
const S = db.gameSessions
const W = db.watchItems

export const GAME_STATUS: GameStatus[] = ['playing', 'wishlist', 'finished', 'shelved']

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  playing: '在玩',
  wishlist: '想玩',
  finished: '已通关',
  shelved: '搁置',
}

export const WATCH_TYPES: WatchType[] = ['tv', 'movie', 'book']

export const WATCH_LABEL: Record<WatchType, string> = {
  tv: '剧',
  movie: '电影',
  book: '书',
}

export async function listGames(): Promise<Game[]> {
  const rows = await G.toArray()
  return rows
    .filter((g) => g.deletedAt === null)
    .sort((a, b) => {
      const sa = GAME_STATUS.indexOf(a.status)
      const sb = GAME_STATUS.indexOf(b.status)
      if (sa !== sb) return sa - sb
      return b.updatedAt - a.updatedAt
    })
}

export async function addGame(input: { name: string; platform?: string }): Promise<string> {
  const now = nextTimestamp()
  const row: Game = {
    id: newId(),
    name: input.name.trim() || '未命名',
    platform: input.platform ?? '',
    status: 'playing',
    rating: null,
    progress: '',
    minutesTotal: 0,
    note: '',
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await G.add(row)
  return row.id
}

export async function patchGame(
  id: string,
  patch: Partial<Omit<Game, 'id' | 'createdAt'>>,
): Promise<void> {
  await G.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteGame(id: string): Promise<void> {
  await softDelete(G, id)
}

export async function restoreGame(id: string): Promise<void> {
  await restore(G, id)
}

export async function listGameSessions(gameId: string, limit = 20): Promise<GameSession[]> {
  const rows = await S.where('gameId').equals(gameId).toArray()
  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt)).slice(0, limit)
}

/** 记一次时长：写一条会话，再把游戏上的累计时长重算一遍 */
export async function addGameSession(input: {
  gameId: string
  date: ISODate
  minutes: number
  note?: string
}): Promise<void> {
  const minutes = Math.max(1, Math.round(input.minutes))
  await S.add({
    id: newId(),
    gameId: input.gameId,
    date: input.date,
    minutes,
    note: input.note ?? '',
    createdAt: nextTimestamp(),
  })
  await recomputeGameMinutes(input.gameId)
}

export async function deleteGameSession(id: string): Promise<void> {
  const row = await S.get(id)
  if (!row) return
  await S.delete(id)
  await recomputeGameMinutes(row.gameId)
}

export async function recomputeGameMinutes(gameId: string): Promise<void> {
  const rows = await S.where('gameId').equals(gameId).toArray()
  const total = rows.reduce((sum, s) => sum + (s.minutes || 0), 0)
  await G.update(gameId, { minutesTotal: total, updatedAt: Date.now() })
}

/** 标记通关：记下日期和一句感受 */
export async function finishGame(
  id: string,
  input: { date: ISODate; feeling: string; rating?: number | null },
): Promise<void> {
  const row = await G.get(id)
  if (!row) return
  const feeling = input.feeling.trim()
  await G.update(id, {
    status: 'finished',
    finishedAt: toDate(input.date).getTime(),
    note: feeling || row.note,
    rating: input.rating ?? row.rating,
    updatedAt: Date.now(),
  })
}

export async function weekGameMinutes(today: ISODate, weekStartDay: 0 | 1): Promise<number> {
  const { start, end } = weekRange(today, weekStartDay)
  const rows = await S.where('date').between(start, end, true, true).toArray()
  return rows.reduce((sum, s) => sum + (s.minutes || 0), 0)
}

/** 最近 7 天每天玩了多少分钟，给迷你柱用 */
export async function gameMinutesByDay(today: ISODate): Promise<{ label: string; value: number }[]> {
  const days: ISODate[] = []
  for (let i = 6; i >= 0; i -= 1) days.push(shiftDate(today, -i))

  const rows = await S.where('date').between(days[0], today, true, true).toArray()
  const byDay = new Map<string, number>()
  for (const row of rows) byDay.set(row.date, (byDay.get(row.date) ?? 0) + (row.minutes || 0))

  return days.map((d) => ({ label: d.slice(5).replace('-', '/'), value: byDay.get(d) ?? 0 }))
}

/* ── 娱乐清单（剧 / 电影 / 书） ─────────────────────────────── */

export async function listWatch(): Promise<WatchItem[]> {
  const rows = await W.toArray()
  return rows
    .filter((w) => w.deletedAt === null)
    .sort((a, b) => (a.done === b.done ? a.createdAt - b.createdAt : a.done - b.done))
}

export async function addWatch(input: { title: string; type: WatchType }): Promise<void> {
  const now = nextTimestamp()
  await W.add({
    id: newId(),
    title: input.title.trim(),
    type: input.type,
    done: 0,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
}

export async function toggleWatch(id: string, done: boolean): Promise<void> {
  await W.update(id, { done: done ? 1 : 0, doneAt: done ? Date.now() : null, updatedAt: Date.now() })
}

export async function deleteWatch(id: string): Promise<void> {
  await softDelete(W, id)
}

export async function restoreWatch(id: string): Promise<void> {
  await restore(W, id)
}
