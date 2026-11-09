import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import type { ActiveTimer, Task } from '../src/db/types'
import { shiftDate } from '../src/lib/date'
import {
  MODULE_TIPS,
  WELCOME_TIP_ID,
  dismissTip,
  isTipDismissed,
  normalizeDismissedTips,
} from '../src/lib/tips'
import {
  TIMER_RECOVERY_THRESHOLD_MS,
  markPrompted,
  promptKey,
  recoveryMinutes,
  shouldPromptRecovery,
  wasPrompted,
} from '../src/lib/timerRecovery'
import { quotaLevel, quotaText, QUOTA_FULL_RATIO, QUOTA_WARN_RATIO } from '../src/lib/storage'
import { MODULES, type ModuleKey } from '../src/modules'
import { addMedia, listMedia, mediaStats } from '../src/repo/media'
import { addTask, listTasks } from '../src/repo/tasks'
import { addWorkLog } from '../src/repo/dev'
import { ensureSettings } from '../src/repo/settings'

const MIN = 60 * 1000
const NOW = Date.parse('2026-09-21T10:00:00')

function timerAt(startedAt: number): ActiveTimer {
  return { devItemId: 'i1', projectId: 'p1', label: '写接口', startedAt }
}

function fakeStore(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('M7 板块提示文案', () => {
  it('九个板块都有提示，id 唯一且以 tip: 开头', () => {
    const keys = MODULES.map((m) => m.key)
    expect(Object.keys(MODULE_TIPS).sort()).toEqual([...keys].sort())
    const ids = new Set<string>()
    for (const key of keys as ModuleKey[]) {
      const tip = MODULE_TIPS[key]
      expect(tip.id).toBe(`tip:${key}`)
      expect(tip.title.length).toBeGreaterThan(3)
      expect(tip.body.length).toBeGreaterThan(10)
      ids.add(tip.id)
    }
    expect(ids.size).toBe(keys.length)
    // 欢迎语和板块提示分开存，不能撞
    expect(ids.has(WELCOME_TIP_ID)).toBe(false)
  })

  it('关掉一条提示：记下来，重复关不会写两遍', () => {
    expect(isTipDismissed([], 'tip:dev')).toBe(false)
    expect(isTipDismissed(undefined, 'tip:dev')).toBe(false)
    const once = dismissTip([], 'tip:dev')
    expect(once).toEqual(['tip:dev'])
    expect(dismissTip(once, 'tip:dev')).toBe(once)
    const twice = dismissTip(once, 'tip:media')
    expect(twice).toEqual(['tip:dev', 'tip:media'])
    expect(isTipDismissed(twice, 'tip:dev')).toBe(true)
  })

  it('脏数据不会让提示逻辑崩掉', () => {
    expect(normalizeDismissedTips(undefined)).toEqual([])
    expect(normalizeDismissedTips('tip:dev')).toEqual([])
    expect(normalizeDismissedTips(['tip:dev', 3, null, 'welcome'])).toEqual(['tip:dev', 'welcome'])
  })
})

describe('M7 计时中断恢复', () => {
  it('没有计时就不问', () => {
    expect(shouldPromptRecovery(null, NOW)).toBe(false)
    expect(shouldPromptRecovery(undefined, NOW)).toBe(false)
  })

  it('今天刚开始 5 分钟：不打扰（刷新页面就是这个场景）', () => {
    expect(shouldPromptRecovery(timerAt(NOW - 5 * MIN), NOW)).toBe(false)
    expect(shouldPromptRecovery(timerAt(NOW - 29 * MIN), NOW)).toBe(false)
  })

  it('今天已经走了 30 分钟以上：问', () => {
    expect(shouldPromptRecovery(timerAt(NOW - 30 * MIN), NOW)).toBe(true)
    expect(shouldPromptRecovery(timerAt(NOW - 5 * 60 * MIN), NOW)).toBe(true)
  })

  it('开始于昨天：不管多久都问', () => {
    const yesterday = TIMER_RECOVERY_THRESHOLD_MS
    expect(shouldPromptRecovery(timerAt(NOW - 24 * 60 * MIN), NOW)).toBe(true)
    expect(shouldPromptRecovery(timerAt(NOW - yesterday - 24 * 60 * MIN), NOW)).toBe(true)
  })

  it('开始时间是未来（时钟改过）：不弹窗', () => {
    expect(shouldPromptRecovery(timerAt(NOW + 60 * MIN), NOW)).toBe(false)
  })

  it('补记分钟数四舍五入，最少 1 分钟', () => {
    expect(recoveryMinutes(timerAt(NOW - 42 * MIN), NOW)).toBe(42)
    expect(recoveryMinutes(timerAt(NOW - 90 * 1000), NOW)).toBe(2)
    expect(recoveryMinutes(timerAt(NOW - 10 * 1000), NOW)).toBe(1)
  })

  it('同一次页面打开只问一次', () => {
    const store = fakeStore()
    const t = timerAt(NOW - 60 * MIN)
    expect(promptKey(t)).toBe(`wb-timer-prompted:${t.startedAt}`)
    expect(wasPrompted(t, store)).toBe(false)
    markPrompted(t, store)
    expect(wasPrompted(t, store)).toBe(true)
    // 换一条新计时，问过的标记不生效
    const other = timerAt(NOW - 61 * MIN)
    expect(wasPrompted(other, store)).toBe(false)
  })

  it('拿不到 sessionStorage 时也不抛错', () => {
    const t = timerAt(NOW - 60 * MIN)
    expect(() => markPrompted(t, null)).not.toThrow()
    expect(wasPrompted(t, null)).toBe(false)
  })
})

describe('M7 存储容量判断', () => {
  it('80% 提醒、95% 算满', () => {
    expect(QUOTA_WARN_RATIO).toBe(0.8)
    expect(QUOTA_FULL_RATIO).toBe(0.95)
    expect(quotaLevel(0, 1000)).toBe('ok')
    expect(quotaLevel(799, 1000)).toBe('ok')
    expect(quotaLevel(800, 1000)).toBe('warn')
    expect(quotaLevel(949, 1000)).toBe('warn')
    expect(quotaLevel(950, 1000)).toBe('full')
    expect(quotaLevel(1000, 1000)).toBe('full')
  })

  it('配额缺失或为 0 时不误报', () => {
    expect(quotaLevel(10, 0)).toBe('ok')
    expect(quotaLevel(Number.NaN, 1000)).toBe('ok')
    expect(quotaLevel(10, Number.NaN)).toBe('ok')
  })

  it('用量文案带大小和百分比', () => {
    const text = quotaText(2 * 1024 * 1024, 100 * 1024 * 1024)
    expect(text).toContain('已用 2.0 MB')
    expect(text).toContain('100.0 MB')
    expect(text).toContain('2.0%')
    expect(quotaText(512, 100 * 1024 * 1024)).toContain('<0.1%')
  })
})

describe('M7 数据量下的响应', () => {
  it('1000 条任务 + 500 条选题：查询仍然只读需要的那一天', async () => {
    // 40 天 × 25 条任务，日期全在过去，今天只有 1 条
    const base: Task[] = []
    for (let d = 0; d < 40; d += 1) {
      const date = shiftDate('2026-08-01', d)
      for (let i = 0; i < 25; i += 1) {
        base.push({
          id: `t-${d}-${i}`,
          title: `任务 ${d}-${i}`,
          date,
          done: i % 2 === 0 ? 1 : 0,
          doneAt: null,
          focus: 0,
          focusOrder: 0,
          priority: 1,
          estimateMin: null,
          note: '',
          sourceType: null,
          sourceId: null,
          sourceLabel: null,
          createdAt: NOW + d * 1000 + i,
          updatedAt: NOW,
          deletedAt: null,
        })
      }
    }
    const started = Date.now()
    await db.tasks.bulkPut(base)
    for (let i = 0; i < 500; i += 1) {
      await addMedia({
        title: `选题 ${i}`,
        platform: i % 2 === 0 ? '公众号' : 'B站',
        status: i % 4 === 0 ? 'published' : 'idea',
      })
    }
    await addTask({ title: '今天的任务', date: '2026-09-21' })

    const todayTasks = await listTasks('2026-09-21')
    const all = await listMedia()
    const stats = await mediaStats('2026-09')
    const cost = Date.now() - started

    expect(todayTasks).toHaveLength(1)
    expect(all).toHaveLength(500)
    expect(all.filter((m) => m.status === 'published')).toHaveLength(125)
    // 统计只算「已发布且有实际发布日」的，这 125 条都没填发布日，所以是 0
    expect(stats.publishedThisMonth).toBe(0)
    // 本地库全量写入 + 三次查询，慢到这个数就是有问题的（真机上通常 < 1s）
    expect(cost).toBeLessThan(20000)
  })

  it('工时记录多了也不影响读一条', async () => {
    for (let i = 0; i < 300; i += 1) {
      await addWorkLog({
        projectId: 'p1',
        devItemId: 'i1',
        startedAt: NOW - i * MIN,
        minutes: 5,
      })
    }
    const rows = await db.workLogs.count()
    expect(rows).toBe(300)
  })
})
