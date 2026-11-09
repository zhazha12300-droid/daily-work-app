import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { ensureSettings } from '../src/repo/settings'
import {
  addMedia,
  advanceMedia,
  deleteMedia,
  listMedia,
  mediaMonthlyTrend,
  mediaStats,
  overdueDays,
  overdueMedia,
  patchMedia,
  restoreMedia,
} from '../src/repo/media'
import {
  addGame,
  addGameSession,
  addWatch,
  deleteGameSession,
  finishGame,
  gameMinutesByDay,
  listGameSessions,
  listGames,
  listWatch,
  patchGame,
  toggleWatch,
  weekGameMinutes,
} from '../src/repo/game'

const D = '2026-09-21' // 周一
const Y = '2026-09-20'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('自媒体：选题流转', () => {
  it('新想法默认落在「想法」，状态按顺序推进到已发布', async () => {
    const id = await addMedia({ title: '写一篇关于本地优先的稿子' })
    let rows = await listMedia()
    expect(rows[0].status).toBe('idea')

    expect(await advanceMedia(id)).toBe('topic')
    expect(await advanceMedia(id)).toBe('writing')
    expect(await advanceMedia(id)).toBe('published')
    expect(await advanceMedia(id)).toBeNull()

    rows = await listMedia()
    expect(rows[0].status).toBe('published')
    expect(rows[0].publishDate).toBeTypeOf('string')
  })

  it('列表按状态分组排序，组内按计划日先后', async () => {
    await addMedia({ title: '已发的', status: 'published' })
    const late = await addMedia({ title: '下周的', planDate: '2026-09-28' })
    await addMedia({ title: '明天的', planDate: '2026-09-22' })
    await patchMedia(late, { status: 'writing' })

    const rows = await listMedia()
    expect(rows[0].title).toBe('明天的')
    expect(rows[1].title).toBe('下周的')
    expect(rows[2].title).toBe('已发的')
  })

  it('逾期天数：过计划日未发布才算，已发布和未来都不算', async () => {
    const id = await addMedia({ title: '拖了的', planDate: Y })
    let item = (await listMedia())[0]
    expect(overdueDays(item, D)).toBe(1)

    await patchMedia(id, { planDate: '2026-09-25' })
    item = (await listMedia())[0]
    expect(overdueDays(item, D)).toBe(0)

    await patchMedia(id, { planDate: Y, status: 'published' })
    item = (await listMedia())[0]
    expect(overdueDays(item, D)).toBe(0)

    expect(await overdueMedia(D)).toHaveLength(0)
  })

  it('统计只看已发布且填了日期的：本月条数、平台占比、表现最好 3 条', async () => {
    await addMedia({
      title: 'A',
      platform: '公众号',
      status: 'published',
    })
    const a = (await listMedia())[0]
    await patchMedia(a.id, { publishDate: '2026-09-03', views: 1200 })

    const b = await addMedia({ title: 'B', platform: 'B站', status: 'published' })
    await patchMedia(b, { publishDate: '2026-09-10', views: 500 })

    const c = await addMedia({ title: 'C', platform: '公众号', status: 'published' })
    await patchMedia(c, { publishDate: '2026-08-30', views: 9000 }) // 上个月，不算本月

    // 没填发布日的一律不计
    await addMedia({ title: 'D', platform: '公众号', status: 'published' })

    const stats = await mediaStats('2026-09')
    expect(stats.publishedThisMonth).toBe(2)
    // 数量相同时顺序由平台名决定，这里只关心各平台条数
    expect(new Map(stats.platforms.map((p) => [p.platform, p.count]))).toEqual(
      new Map([
        ['公众号', 1],
        ['B站', 1],
      ]),
    )
    expect(stats.top.map((t) => t.title)).toEqual(['C', 'A', 'B'])
  })

  it('删除是软删除，撤销能回来', async () => {
    const id = await addMedia({ title: '删掉的' })
    await deleteMedia(id)
    expect(await listMedia()).toHaveLength(0)
    expect((await db.mediaItems.get(id))?.deletedAt).toBeTypeOf('number')

    await restoreMedia(id)
    expect(await listMedia()).toHaveLength(1)
  })
})

describe('游戏：时长与通关', () => {
  it('新游戏落在「在玩」，累计时长从 0 开始', async () => {
    await addGame({ name: '塞尔达', platform: 'Switch' })
    const games = await listGames()
    expect(games[0].status).toBe('playing')
    expect(games[0].minutesTotal).toBe(0)
  })

  it('记时长会累加到游戏上，并按周按天汇总', async () => {
    const id = await addGame({ name: '哈迪斯' })
    await addGameSession({ gameId: id, date: D, minutes: 60 })
    await addGameSession({ gameId: id, date: Y, minutes: 30 })
    await addGameSession({ gameId: id, date: '2026-09-05', minutes: 120 }) // 上上周

    const games = await listGames()
    expect(games[0].minutesTotal).toBe(210)

    // 2026-09-21 是周一，20 号（周日）算上一周，所以本周只有今天的 60 分钟
    expect(await weekGameMinutes(D, 1)).toBe(60)

    const byDay = await gameMinutesByDay(D)
    expect(byDay).toHaveLength(7)
    expect(byDay[6].value).toBe(60) // 今天
    expect(byDay[5].value).toBe(30) // 昨天
    expect(byDay.reduce((sum, d) => sum + d.value, 0)).toBe(90)
  })

  it('删掉一条时长记录后会重算累计，不会留下虚数', async () => {
    const id = await addGame({ name: '只狼' })
    await addGameSession({ gameId: id, date: D, minutes: 45 })
    await addGameSession({ gameId: id, date: D, minutes: 15 })

    const sessions = await listGameSessions(id)
    expect(sessions).toHaveLength(2)

    // 同一天的两条按记录时间倒序，先删掉较早那条 45 分钟
    await deleteGameSession(sessions[1].id)
    const games = await listGames()
    expect(games[0].minutesTotal).toBe(15)
  })

  it('标记通关会改状态、记日期、留感受和评分', async () => {
    const id = await addGame({ name: '艾迪芬奇的记忆' })
    await finishGame(id, { date: D, feeling: '两个小时像做了一场梦', rating: 5 })

    const game = (await listGames())[0]
    expect(game.status).toBe('finished')
    expect(game.finishedAt).toBeTypeOf('number')
    expect(game.note).toContain('梦')
    expect(game.rating).toBe(5)
  })

  it('游戏库按 在玩 → 想玩 → 已通关 → 搁置 排序', async () => {
    const a = await addGame({ name: '搁置的' })
    await patchGame(a, { status: 'shelved' })
    const b = await addGame({ name: '想玩的' })
    await patchGame(b, { status: 'wishlist' })
    await addGame({ name: '在玩的' })

    const names = (await listGames()).map((g) => g.name)
    expect(names).toEqual(['在玩的', '想玩的', '搁置的'])
  })
})

describe('娱乐清单', () => {
  it('看完的沉底，勾选会记时间，能删', async () => {
    await addWatch({ title: '漫长的季节', type: 'tv' })
    await addWatch({ title: '沙丘 2', type: 'movie' })

    const first = (await listWatch())[0]
    await toggleWatch(first.id, true)

    const rows = await listWatch()
    expect(rows.map((r) => r.title)).toEqual(['沙丘 2', '漫长的季节'])
    expect(rows[1].done).toBe(1)
    expect(rows[1].doneAt).toBeTypeOf('number')

    await toggleWatch(first.id, false)
    expect((await listWatch())[1].done).toBe(0)
  })
})

describe('自媒体：发布数据按月汇总（图表数据源）', () => {
  it('近 6 个月按月统计发布数与阅读量，没数据的月份补 0', async () => {
    const may = await addMedia({ title: '五月稿', status: 'published' })
    await patchMedia(may, { publishDate: '2026-05-10', views: 100, likes: 5 })
    const julA = await addMedia({ title: '七月稿 A', status: 'published' })
    await patchMedia(julA, { publishDate: '2026-07-01', views: 300 })
    const julB = await addMedia({ title: '七月稿 B', status: 'published' })
    await patchMedia(julB, { publishDate: '2026-07-02', views: 50 })
    // 仍在想法里、或没填发布日的，都不该计入
    await addMedia({ title: '还在想法里' })

    const trend = await mediaMonthlyTrend('2026-07-15', 6)

    expect(trend.map((m) => m.month)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ])
    expect(trend.find((m) => m.month === '2026-03')).toMatchObject({ published: 0, views: 0 })
    expect(trend.find((m) => m.month === '2026-05')).toMatchObject({ published: 1, views: 100 })
    expect(trend.find((m) => m.month === '2026-07')).toMatchObject({ published: 2, views: 350 })
    // 标签是给人看的短月份
    expect(trend.find((m) => m.month === '2026-07')?.label).toBe('7月')
  })
})
