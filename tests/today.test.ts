import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import {
  MAX_FOCUS,
  addTask,
  focusTask,
  listTasks,
  moveTasksToDate,
  pendingCarryover,
  toggleTask,
  unfocusTask,
  weekProgress,
} from '../src/repo/tasks'
import { ensureSettings } from '../src/repo/settings'
import { addMemo, listMemos, memoToTask } from '../src/repo/memos'
import { getHomeStats } from '../src/repo/stats'

const D = '2026-09-18' // 周五

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('今日重点', () => {
  it('最多 3 项，第 4 项会被拒绝', async () => {
    const ids: string[] = []
    for (const title of ['A', 'B', 'C', 'D']) ids.push(await addTask({ date: D, title }))

    expect(await focusTask(ids[0])).toBe(true)
    expect(await focusTask(ids[1])).toBe(true)
    expect(await focusTask(ids[2])).toBe(true)
    expect(await focusTask(ids[3])).toBe(false)

    const rows = await listTasks(D)
    expect(rows.filter((r) => r.focus === 1)).toHaveLength(MAX_FOCUS)
  })

  it('取消重点后可以再设', async () => {
    const a = await addTask({ date: D, title: 'A' })
    const b = await addTask({ date: D, title: 'B' })
    const c = await addTask({ date: D, title: 'C' })
    const d = await addTask({ date: D, title: 'D' })
    await focusTask(a)
    await focusTask(b)
    await focusTask(c)
    expect(await focusTask(d)).toBe(false)

    await unfocusTask(a)
    expect(await focusTask(d)).toBe(true)
  })

  it('排序把重点放前面，但勾选完成不会让任务跳位', async () => {
    const normal = await addTask({ date: D, title: '普通' })
    await addTask({ date: D, title: '重点' })
    const focusId = (await listTasks(D)).find((t) => t.title === '重点')!.id
    await focusTask(focusId)

    await toggleTask(normal, true)

    const rows = await listTasks(D)
    expect(rows.map((r) => r.title)).toEqual(['重点', '普通'])
    expect(rows[1].done).toBe(1)
  })
})

describe('隔日顺延', () => {
  it('只收集今天之前、未完成、未删除的任务', async () => {
    const old = await addTask({ date: '2026-09-16', title: '前天没做完' })
    await addTask({ date: '2026-09-17', title: '昨天没做完' })
    const doneTask = await addTask({ date: '2026-09-17', title: '昨天做完了' })
    await toggleTask(doneTask, true)
    await addTask({ date: D, title: '今天的' })

    const { tasks, oldest } = await pendingCarryover(D)
    expect(tasks.map((t) => t.title).sort()).toEqual(['前天没做完', '昨天没做完'])
    expect(oldest).toBe('2026-09-16')
    expect(old).toBeTruthy()
  })

  it('「全部移到今天」把日期改过来，并清掉重点标记', async () => {
    const id = await addTask({ date: '2026-09-17', title: '没做完' })
    await focusTask(id)
    await moveTasksToDate([id], D)

    const today = await listTasks(D)
    expect(today.map((t) => t.title)).toContain('没做完')
    expect(today.find((t) => t.id === id)?.focus).toBe(0)
    expect(await listTasks('2026-09-17')).toHaveLength(0)
  })
})

describe('本周完成率', () => {
  it('按周一起算，跨月也正确', async () => {
    await addTask({ date: '2026-09-14', title: '周一' })
    const t2 = await addTask({ date: '2026-09-18', title: '周五' })
    await toggleTask(t2, true)
    await addTask({ date: '2026-09-21', title: '下周一' })

    const week = await weekProgress(D, 1)
    expect(week.start).toBe('2026-09-14')
    expect(week.end).toBe('2026-09-20')
    expect(week.total).toBe(2)
    expect(week.done).toBe(1)
  })
})

describe('备忘 → 今日任务', () => {
  it('复制成任务，原备忘标记已处理但不删', async () => {
    const memoId = await addMemo('问房东水费')
    const taskId = await memoToTask(memoId, D)

    expect(taskId).toBeTruthy()
    const tasks = await listTasks(D)
    expect(tasks.map((t) => t.title)).toContain('问房东水费')

    const memo = await db.memos.get(memoId)
    expect(memo?.processedAt).toBeTypeOf('number')
    expect(await listMemos()).toHaveLength(1)
  })
})

describe('首页统计', () => {
  it('空库时全部为 0', async () => {
    const stats = await getHomeStats(D, 1)
    expect(stats).toEqual({
      mediaWeek: 0,
      devDoing: 0,
      consultToday: 0,
      fitnessToday: 0,
      dietKcal: 0,
      gameMinutes: 0,
    })
  })
})
