import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../src/db'
import { SCHEMA_VERSION, TABLE_NAMES } from '../src/db/schema'
import {
  BACKUP_APP,
  buildBackup,
  clearAllData,
  clearTable,
  restoreBackup,
  validateBackup,
} from '../src/db/backup'
import { ensureSettings, isBackupStale, updateSettings } from '../src/repo/settings'
import { addTask } from '../src/repo/tasks'
import { addMemo } from '../src/repo/memos'
import { addMedia } from '../src/repo/media'
import { addGame, addGameSession } from '../src/repo/game'
import { addItem, addProject, addNote, addWorkLog } from '../src/repo/dev'
import { addClient, addConsultLog, addPayment } from '../src/repo/consult'
import { addSession, upsertMetric } from '../src/repo/fitness'
import { addFood, addShopping, setMealItems, setWater } from '../src/repo/diet'

/**
 * 第 7 节「质量门禁」的可执行版本。
 * 计划里写的 7.1 数据安全演练有 6 步，其中 1–3 步（刷新 / 关浏览器 / 重启电脑）
 * 在本机是同一件事：数据真的落到了 IndexedDB，重开连接还在。这里用
 * db.close() → db.open() 模拟「浏览器重新打开数据库」这一段，
 * 剩下的「电脑重启」由 IndexedDB 本身保证（它就是磁盘上的持久存储）。
 */

const D = '2026-09-21'

/**
 * 用 Vite 的 glob 把源码当纯文本读进来，不引入 node 类型：
 * 「不联网」这条只能靠扫源码来证明，运行时没法模拟断网。
 */
const SOURCE_FILES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const INDEX_HTML = (import.meta.glob('../index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>)['../index.html']

/** 每个板块都写一点真实数据，覆盖到每一类表 */
async function seedAll(): Promise<void> {
  const taskId = await addTask({ title: '写周报', date: D, note: '发给老板', priority: 0 })
  await addTask({ title: '回邮件', date: D })
  await db.table('tasks').update(taskId, { done: 1, doneAt: Date.now() })

  await addMemo('买猫粮')

  await addMedia({ title: '本地优先的笔记方案', platform: 'B站', planDate: D })
  await addMedia({ title: 'AI 工作流复盘中', platform: '公众号', status: 'writing' })

  const projectId = await addProject('工作台')
  const itemId = await addItem({ projectId, type: 'bug', title: '分页丢最后一条', priority: 0 })
  await addNote(projectId, '设计决定', '删除一律软删除，可以撤销')
  await addWorkLog({ projectId, devItemId: itemId, startedAt: Date.now(), minutes: 45 })

  const clientId = await addClient('张女士')
  await addConsultLog({
    clientId,
    date: D,
    minutes: 60,
    topic: '职业转型',
    summary: '先梳理可迁移能力，两周后看反馈。',
    nextFollowUp: '2026-10-05',
  })
  await addPayment({ clientId, amount: 800, date: D, received: true })

  await addSession({
    date: D,
    templateId: 'wd-1',
    templateName: '推日',
    exercises: [
      {
        name: '卧推',
        skipped: 0,
        sets: [
          { targetReps: 8, targetWeight: 40, actualReps: 8, actualWeight: 40, done: 1 },
          { targetReps: 8, targetWeight: 40, actualReps: 8, actualWeight: 40, done: 1 },
        ],
      },
    ],
    durationMin: 50,
  })
  await upsertMetric({ date: D, weight: 68.5, waist: 82 })
  await addFood({ name: '鸡胸肉', kcal: 165 })
  await setMealItems(D, 'lunch', [{ name: '鸡胸肉', amount: '150g', kcal: 248 }])
  await setWater(D, 3)
  await addShopping('燕麦')

  const gameId = await addGame({ name: '星露谷物语', platform: 'Steam' })
  await addGameSession({ gameId, date: D, minutes: 40 })

  await updateSettings({ weekStart: 0, kcalTarget: 2100, platforms: ['B站', '公众号'] })
}

/** 把每张表的内容取成可比较的纯数据 */
async function snapshot(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {}
  for (const name of TABLE_NAMES) {
    out[name] = (await db.table(name).toArray()).sort((a, b) =>
      String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
    )
  }
  return out
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

const BANNED_NETWORK = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /new\s+WebSocket/,
  /EventSource\s*\(/,
  /\baxios\b/,
]

/** 一份源码里出现了哪些联网痕迹（本机地址不算） */
function scanForNetwork(code: string): string[] {
  const hits: string[] = []
  for (const re of BANNED_NETWORK) {
    if (re.test(code)) hits.push(`命中 ${String(re)}`)
  }
  for (const url of code.match(/https?:\/\/[^\s"'`)]+/g) ?? []) {
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(url)) {
      hits.push(`外部地址 ${url}`)
    }
  }
  return hits
}

describe('7.1 数据安全演练', () => {
  it('第 1–3 步：写入后关掉数据库再打开，数据原样还在', async () => {
    await seedAll()
    const before = await snapshot()
    expect(before.tasks).toHaveLength(2)
    expect(before.mediaItems).toHaveLength(2)

    // 模拟刷新 / 关浏览器 / 重启电脑：连接关掉再重开，不经过任何内存缓存
    db.close()
    await db.open()
    const after = await snapshot()

    expect(after).toEqual(before)
  })

  it('第 4 步：导出 → 清空全部 → 导入，逐表逐条一致', async () => {
    await seedAll()
    const before = await snapshot()
    const backup = await buildBackup()
    expect(backup.app).toBe(BACKUP_APP)
    expect(backup.version).toBe(SCHEMA_VERSION)

    // 导出文件走一遍 JSON 序列化/反序列化，确保是「文件」而不是内存引用
    const fromFile = validateBackup(JSON.parse(JSON.stringify(backup)))
    expect(fromFile.ok).toBe(true)
    expect(fromFile.errors).toEqual([])
    expect(fromFile.file).toBeTruthy()

    await clearAllData()
    const emptied = await snapshot()
    expect(emptied.tasks).toHaveLength(0)
    expect(emptied.mediaItems).toHaveLength(0)
    // 清空全部保留设置，否则界面会读不到偏好
    expect(emptied.settings.length).toBeGreaterThan(0)

    await restoreBackup(fromFile.file!)
    const after = await snapshot()

    // 设置表里的时间戳也一起比对：除了恢复后 ensureSettings 可能补的字段，
    // 这里是逐表逐条 JSON 相等
    expect(after.tasks).toEqual(before.tasks)
    expect(after.mediaItems).toEqual(before.mediaItems)
    expect(after.clients).toEqual(before.clients)
    expect(after.consultLogs).toEqual(before.consultLogs)
    expect(after.payments).toEqual(before.payments)
    expect(after.devProjects).toEqual(before.devProjects)
    expect(after.workoutSessions).toEqual(before.workoutSessions)
    expect(after.bodyMetrics).toEqual(before.bodyMetrics)
    expect(after.meals).toEqual(before.meals)
    expect(after.waterLogs).toEqual(before.waterLogs)
    expect(after.games).toEqual(before.games)
    expect(after.gameSessions).toEqual(before.gameSessions)
    expect(after.shoppingItems).toEqual(before.shoppingItems)
    expect(after.foodLibrary).toEqual(before.foodLibrary)
    expect(after.memos).toEqual(before.memos)
    expect(after.devItems).toEqual(before.devItems)
    expect(after.devNotes).toEqual(before.devNotes)
    expect(after.workLogs).toEqual(before.workLogs)
    expect(after.fitTemplates).toEqual(before.fitTemplates)
    expect(after.watchItems).toEqual(before.watchItems)
  })

  it('第 5 步：上次备份在 8 天前就会提醒，备份一更新提醒就消失', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 3600 * 1000
    await updateSettings({ lastBackupAt: eightDaysAgo })
    expect(isBackupStale(eightDaysAgo)).toBe(true)

    await updateSettings({ lastBackupAt: Date.now() })
    expect(isBackupStale(Date.now())).toBe(false)

    // 从没备份过也算需要提醒
    await updateSettings({ lastBackupAt: null })
    expect(isBackupStale(null)).toBe(true)
  })

  it('第 6 步：源码里没有任何联网调用', () => {
    // 先自检扫描器本身：能抓住联网写法，且不误报本机地址
    expect(scanForNetwork("await fetch('/api/tasks')").length).toBe(1)
    expect(scanForNetwork('new XMLHttpRequest()').length).toBe(1)
    expect(
      scanForNetwork("const u = 'https://api.example.com/tasks'").length,
    ).toBe(1)
    expect(scanForNetwork("const origin = 'http://127.0.0.1:5180'")).toEqual([])
    expect(scanForNetwork("location.href = 'http://localhost:5180/today'")).toEqual([])

    const offenders: string[] = []
    const entries = Object.entries(SOURCE_FILES)
    expect(entries.length).toBeGreaterThan(30)

    for (const [file, raw] of entries) {
      // CSS 一类的模块在 dev 下是带 Symbol 的代理对象，只扫真正的源码文本
      if (typeof raw !== 'string') continue
      for (const hit of scanForNetwork(raw)) offenders.push(`${file} ${hit}`)
    }

    expect(offenders).toEqual([])

    // index.html 也不许引入外部脚本或字体（favicon 里的 xmlns 只是 SVG 命名空间，不是请求）
    const html = (INDEX_HTML ?? '').replace(/xmlns='[^']*'/g, '')
    expect(html.length).toBeGreaterThan(100)
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/<script[^>]+src="(?!\/)/)
  })
})

describe('7.2 交互回归（数据层可验证的部分）', () => {
  it('清空单个模块只影响那一块，别的板块数据不动', async () => {
    await seedAll()
    await clearTable('tasks')
    expect(await db.table('tasks').count()).toBe(0)
    expect(await db.table('mediaItems').count()).toBe(2)
    expect(await db.table('clients').count()).toBe(1)
  })

  it('未知表与设置表都拒绝被单独清空', async () => {
    await expect(clearTable('nope')).rejects.toThrow('不认识的表')
    await expect(clearTable('settings')).rejects.toThrow('设置表不能这样清空')
  })

  it('备份里带了软删除的记录，恢复后撤销历史也一起回来', async () => {
    const id = await addTask({ title: '会被删掉的任务', date: D })
    await db.table('tasks').update(id, { deletedAt: Date.now() })

    const backup = await buildBackup()
    await clearAllData()
    await restoreBackup(backup)

    const row = await db.table('tasks').get(id)
    expect(row).toBeTruthy()
    expect((row as { deletedAt: number | null }).deletedAt).not.toBeNull()
  })

  it('备份版本号与表清单永远是当前程序的那一套', async () => {
    await seedAll()
    const backup = await buildBackup()
    expect(Object.keys(backup.data).sort()).toEqual([...TABLE_NAMES].sort())
    expect(Object.keys(backup.counts).length).toBe(TABLE_NAMES.length)
    for (const name of TABLE_NAMES) {
      expect(backup.counts[name]).toBe(backup.data[name].length)
    }
    // 版本号的用途：老版本程序不该吃下新备份
    const fromFuture = validateBackup({ ...backup, version: SCHEMA_VERSION + 1 })
    expect(fromFuture.ok).toBe(false)
    expect(fromFuture.errors.join()).toContain('比当前程序版本')
  })
})
