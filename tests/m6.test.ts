import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { clearTable } from '../src/db/backup'
import {
  CLEARABLE_TABLES,
  TABLE_GROUPS,
  TABLE_LABEL,
  estimateBytes,
  formatBytes,
  tableLabel,
} from '../src/db/labels'
import { STORES, TABLE_NAMES } from '../src/db/schema'
import type { HomeCardSetting } from '../src/db/types'
import {
  BACKUP_STALE_MS,
  daysSinceBackup,
  defaultSettings,
  ensureSettings,
  isBackupStale,
  moveHomeCard,
  normalizeHomeCards,
  toggleHomeCard,
  updateSettings,
} from '../src/repo/settings'
import { addMemo, listMemos } from '../src/repo/memos'
import { addTask, listTasks } from '../src/repo/tasks'

const DAY = 24 * 3600 * 1000
const NOW = Date.parse('2026-09-21T10:00:00')

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('M6 备份提醒', () => {
  it('从未备份算「该备份了」', () => {
    expect(isBackupStale(null)).toBe(true)
    expect(daysSinceBackup(null)).toBeNull()
  })

  it('6 天前不算，8 天前算', () => {
    expect(isBackupStale(NOW - 6 * DAY, NOW)).toBe(false)
    expect(isBackupStale(NOW - 8 * DAY, NOW)).toBe(true)
  })

  it('刚好 7 天还不催，超过 7 天才催', () => {
    expect(isBackupStale(NOW - BACKUP_STALE_MS, NOW)).toBe(false)
    expect(isBackupStale(NOW - BACKUP_STALE_MS - 1, NOW)).toBe(true)
  })

  it('天数向上取整，刚导出过显示 0 天', () => {
    expect(daysSinceBackup(NOW, NOW)).toBe(0)
    expect(daysSinceBackup(NOW - 1 * DAY, NOW)).toBe(1)
    expect(daysSinceBackup(NOW - 2.4 * DAY, NOW)).toBe(3)
  })
})

describe('M6 首页卡片排序与显隐', () => {
  const cards: HomeCardSetting[] = defaultSettings().homeCards

  it('默认 6 张卡，顺序固定', () => {
    expect(cards.map((c) => c.key)).toEqual([
      'media',
      'dev',
      'consult',
      'fitness',
      'diet',
      'game',
    ])
    expect(cards.every((c) => c.visible === 1)).toBe(true)
    expect(cards.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('上移下移真的换位置，且 order 重新连续', () => {
    const moved = moveHomeCard(cards, 'game', 'up')
    expect(moved.map((c) => c.key)).toEqual(['media', 'dev', 'consult', 'fitness', 'game', 'diet'])
    expect(moved.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5])

    const back = moveHomeCard(moved, 'game', 'down')
    expect(back.map((c) => c.key)).toEqual(cards.map((c) => c.key))
  })

  it('第一张上移、最后一张下移都不动', () => {
    expect(moveHomeCard(cards, 'media', 'up')).toBe(cards)
    expect(moveHomeCard(cards, 'game', 'down')).toBe(cards)
  })

  it('不认识的 key 原样返回', () => {
    expect(moveHomeCard(cards, 'nope', 'down')).toBe(cards)
  })

  it('可以隐藏再显示', () => {
    const hidden = toggleHomeCard(cards, 'diet')
    expect(hidden.find((c) => c.key === 'diet')?.visible).toBe(0)
    expect(hidden.filter((c) => c.visible === 1)).toHaveLength(5)

    const shown = toggleHomeCard(hidden, 'diet')
    expect(shown.find((c) => c.key === 'diet')?.visible).toBe(1)
  })

  it('缺卡片时补回默认，乱序的 order 会被理顺', () => {
    const broken: HomeCardSetting[] = [
      { key: 'game', visible: 0, order: 9 },
      { key: 'media', visible: 1, order: 3 },
    ]
    const fixed = normalizeHomeCards(broken)
    expect(fixed).toHaveLength(6)
    expect(fixed.map((c) => c.key)).toEqual([
      'media',
      'dev',
      'consult',
      'fitness',
      'diet',
      'game',
    ])
    expect(fixed.map((c) => c.order)).toEqual([0, 1, 2, 3, 4, 5])
    expect(fixed.find((c) => c.key === 'game')?.visible).toBe(0)
    expect(normalizeHomeCards(undefined)).toHaveLength(6)
    expect(normalizeHomeCards([])).toHaveLength(6)
  })
})

describe('M6 偏好写回设置表', () => {
  it('每周起始日、热量目标、平台标签都能存', async () => {
    await updateSettings({ weekStart: 0, kcalTarget: 2100 })
    await updateSettings({ platforms: ['公众号', 'B站'] })

    const row = await db.settings.get('app')
    expect(row?.weekStart).toBe(0)
    expect(row?.kcalTarget).toBe(2100)
    expect(row?.platforms).toEqual(['公众号', 'B站'])
  })

  it('热量目标可以清空', async () => {
    await updateSettings({ kcalTarget: 2000 })
    await updateSettings({ kcalTarget: null })
    expect((await db.settings.get('app'))?.kcalTarget).toBeNull()
  })

  it('卡片顺序与显隐会落库', async () => {
    const cards = moveHomeCard(defaultSettings().homeCards, 'game', 'up')
    await updateSettings({ homeCards: cards })
    const row = await db.settings.get('app')
    expect(row?.homeCards.map((c) => c.key)).toEqual([
      'media',
      'dev',
      'consult',
      'fitness',
      'game',
      'diet',
    ])
  })

  it('主题也写进设置表（用于备份带走偏好）', async () => {
    await updateSettings({ theme: 'dark' })
    expect((await db.settings.get('app'))?.theme).toBe('dark')
  })
})

describe('M6 表的中文名与清空单表', () => {
  it('每个表都有中文名，没有多余的名字', () => {
    for (const name of TABLE_NAMES) {
      expect(TABLE_LABEL[name], `表 ${name} 缺少中文名`).toBeTruthy()
    }
    for (const key of Object.keys(TABLE_LABEL)) {
      expect(STORES[key], `中文名 ${key} 对应的表不存在`).toBeTruthy()
    }
  })

  it('分组覆盖除设置表外的全部表，且不重复', () => {
    const names = TABLE_GROUPS.flatMap((g) => g.tables)
    expect(new Set(names).size).toBe(names.length)
    expect(CLEARABLE_TABLES).not.toContain('settings')
    expect([...CLEARABLE_TABLES].sort()).toEqual(
      TABLE_NAMES.filter((n) => n !== 'settings').sort(),
    )
  })

  it('未知表名有兜底显示', () => {
    expect(tableLabel('nope')).toBe('nope')
  })

  it('清空单个模块只影响那一张表', async () => {
    await addTask({ date: '2026-09-21', title: '写方案' })
    await addMemo('记一笔')
    expect(await listTasks('2026-09-21')).toHaveLength(1)
    expect(await listMemos()).toHaveLength(1)

    await clearTable('tasks')

    expect(await listTasks('2026-09-21')).toHaveLength(0)
    expect(await listMemos()).toHaveLength(1)
  })

  it('设置表不能这样清空，未知表也拒绝', async () => {
    await expect(clearTable('settings')).rejects.toThrow('设置表不能这样清空')
    await expect(clearTable('nope')).rejects.toThrow('不认识的表')
  })
})

describe('M6 数据概览', () => {
  it('估算占用能区分空表和有数据的表', () => {
    expect(estimateBytes([])).toBeLessThan(10)
    expect(estimateBytes([{ a: 1 }])).toBeGreaterThan(estimateBytes([]))
  })

  it('占用大小按 KB / MB 显示', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})
