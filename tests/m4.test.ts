import 'fake-indexeddb/auto'
import { liveQuery } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { ensureSettings } from '../src/repo/settings'
import { shiftDate } from '../src/lib/date'
import {
  addSession,
  deleteSession,
  ensureTemplates,
  exercisePRs,
  knownExercises,
  listMetrics,
  listSessions,
  listTemplates,
  sessionFromTemplate,
  setTemplateExercises,
  upsertMetric,
  weekdayOf,
} from '../src/repo/fitness'
import {
  addFood,
  addMealItem,
  addShopping,
  clearDoneShopping,
  copyMealFromYesterday,
  ensureMeals,
  getWater,
  listFoods,
  listMeals,
  listShopping,
  MEAL_SLOTS,
  mealKcal,
  removeMealItem,
  setWater,
  toggleShopping,
} from '../src/repo/diet'

const D = '2026-09-21' // 周一

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

/** 订阅一个 Dexie liveQuery，收齐它在窗口期内的所有发出值（或错误） */
function settle<T>(obs: ReturnType<typeof liveQuery<T>>): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const out: T[] = []
    const sub = obs.subscribe((v: T) => out.push(v), (e: unknown) => reject(e))
    setTimeout(() => {
      sub.unsubscribe()
      resolve(out)
    }, 100)
  })
}

describe('健身：一周模板', () => {
  it('首次进入会补齐 7 天，默认全是休息日', async () => {
    await ensureTemplates()
    const rows = await listTemplates()
    expect(rows).toHaveLength(7)
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows.every((r) => r.isRest === 1)).toBe(true)
  })

  it('安排动作后自动变成训练日，清空又回到休息日', async () => {
    await setTemplateExercises(1, [{ name: '卧推', sets: 4, reps: 8, weight: 60 }])
    let monday = (await listTemplates())[0]
    expect(monday.isRest).toBe(0)
    expect(monday.exercises).toHaveLength(1)

    await setTemplateExercises(1, [])
    monday = (await listTemplates())[0]
    expect(monday.isRest).toBe(1)
  })

  it('日期能算成周几（周一=1，周日=7）', () => {
    expect(weekdayOf('2026-09-21')).toBe(1)
    expect(weekdayOf('2026-09-27')).toBe(7)
  })

  it('列表查询放进 liveQuery 不会触发写库（白屏回归）', async () => {
    // useLiveQuery 会在只读事务里跑查询函数；以前 listTemplates/listMeals
    // 内部调 ensure* 写库，直接抛 ReadOnly 导致整页白屏。这里锁死这个契约。
    const emptyTemplates = await settle(liveQuery(() => listTemplates()))
    expect(emptyTemplates[emptyTemplates.length - 1]).toEqual([])

    const emptyMeals = await settle(liveQuery(() => listMeals(D)))
    expect(emptyMeals[emptyMeals.length - 1].map((m) => m.slot)).toEqual(MEAL_SLOTS)

    // 种子写入放到外面（等价于页面 useEffect 里调 ensureTemplates），
    // 之后 liveQuery 能观察到 7 天模板。
    await ensureTemplates()
    const seeded = await settle(liveQuery(() => listTemplates()))
    expect(seeded[seeded.length - 1]).toHaveLength(7)
  })
})

describe('健身：训练记录', () => {
  it('由模板生成训练时，每组都是未完成状态', () => {
    const exercises = sessionFromTemplate({
      id: 'wd-1',
      weekday: 1,
      isRest: 0,
      name: '胸',
      exercises: [{ name: '卧推', sets: 3, reps: 8, weight: 60 }],
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
    expect(exercises).toHaveLength(1)
    expect(exercises[0].sets).toHaveLength(3)
    expect(exercises[0].sets.every((s) => s.done === 0)).toBe(true)
    expect(exercises[0].sets[0].targetWeight).toBe(60)
  })

  it('历史按日期倒序，删掉的不出现', async () => {
    const older = await addSession({
      date: '2026-09-14',
      templateId: null,
      templateName: '腿',
      exercises: [],
    })
    await addSession({
      date: '2026-09-21',
      templateId: null,
      templateName: '胸',
      exercises: [],
    })
    await deleteSession(older)

    const rows = await listSessions()
    expect(rows).toHaveLength(1)
    expect(rows[0].templateName).toBe('胸')
  })

  it('每个动作的最好重量取历史最大值，空重量和被删的记录都不算', async () => {
    const set = (weight: number | null) => ({
      name: '深蹲',
      skipped: 0 as const,
      sets: [
        {
          targetReps: 5,
          targetWeight: weight,
          actualReps: 5,
          actualWeight: weight,
          done: 1 as const,
        },
      ],
    })
    await addSession({
      date: '2026-09-14',
      templateId: null,
      templateName: '腿',
      exercises: [set(80)],
    })
    await addSession({
      date: '2026-09-21',
      templateId: null,
      templateName: '腿',
      exercises: [set(85), set(null)],
    })
    const removed = await addSession({
      date: '2026-09-20',
      templateId: null,
      templateName: '腿',
      exercises: [set(200)],
    })
    await deleteSession(removed)

    const prs = await exercisePRs()
    expect(prs['深蹲']).toBe(85)
  })

  it('动作联想名同时来自模板和历史', async () => {
    await setTemplateExercises(3, [{ name: '划船', sets: 3, reps: 10, weight: null }])
    await addSession({
      date: D,
      templateId: null,
      templateName: '背',
      exercises: [
        {
          name: '引体向上',
          skipped: 0,
          sets: [
            {
              targetReps: 8,
              targetWeight: null,
              actualReps: 8,
              actualWeight: null,
              done: 1,
            },
          ],
        },
      ],
    })
    const names = await knownExercises()
    expect(names).toContain('划船')
    expect(names).toContain('引体向上')
  })
})

describe('身体数据（健身与饮食共用）', () => {
  it('同一天重复记录只会更新，不会多出一条', async () => {
    await upsertMetric({ date: D, weight: 72.5, waist: 88 })
    await upsertMetric({ date: D, weight: 72.1, waist: 87 })

    const rows = await listMetrics()
    expect(rows).toHaveLength(1)
    expect(rows[0].weight).toBe(72.1)
    expect(rows[0].waist).toBe(87)
  })

  it('多天记录按日期倒序，饮食页读的是同一份', async () => {
    await upsertMetric({ date: '2026-09-20', weight: 73, waist: null })
    await upsertMetric({ date: '2026-09-21', weight: 72.6, waist: null })

    const rows = await listMetrics()
    expect(rows.map((r) => r.weight)).toEqual([72.6, 73])
    expect(await db.bodyMetrics.count()).toBe(2)
  })
})

describe('饮食：四餐', () => {
  it('打开某天会自动建出四个餐次，顺序固定', async () => {
    await ensureMeals(D)
    const meals = await listMeals(D)
    expect(meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
    expect(meals.every((m) => m.items.length === 0)).toBe(true)
  })

  it('加条目、算热量、按序号删除', async () => {
    await addMealItem(D, 'breakfast', { name: '鸡蛋', amount: '2 个', kcal: 140 })
    await addMealItem(D, 'breakfast', { name: '豆浆', amount: '1 杯', kcal: null })

    let meals = await listMeals(D)
    expect(meals[0].items).toHaveLength(2)
    expect(mealKcal(meals[0])).toBe(140) // null 热量不参与合计

    await removeMealItem(D, 'breakfast', 0)
    meals = await listMeals(D)
    expect(meals[0].items.map((i) => i.name)).toEqual(['豆浆'])
  })

  it('复制昨天只复制这一餐，昨天没记录时返回 0', async () => {
    const yesterday = shiftDate(D, -1)
    expect(await copyMealFromYesterday(D, 'lunch')).toBe(0)

    await addMealItem(yesterday, 'lunch', { name: '牛肉面', amount: '1 碗', kcal: 650 })
    await addMealItem(yesterday, 'dinner', { name: '沙拉', amount: '1 份', kcal: 200 })

    expect(await copyMealFromYesterday(D, 'lunch')).toBe(1)
    const meals = await listMeals(D)
    expect(meals.find((m) => m.slot === 'lunch')?.items[0].name).toBe('牛肉面')
    expect(meals.find((m) => m.slot === 'dinner')?.items).toHaveLength(0)
  })
})

describe('饮食：饮水 / 食物库 / 购物清单', () => {
  it('饮水限制在 0–8 杯，重复设置是覆盖', async () => {
    await setWater(D, 3)
    expect(await getWater(D)).toBe(3)
    await setWater(D, 99)
    expect(await getWater(D)).toBe(8)
    await setWater(D, -2)
    expect(await getWater(D)).toBe(0)
  })

  it('食物库按名字去重', async () => {
    await addFood({ name: '鸡胸肉', kcal: 165, unit: '100g' })
    await addFood({ name: '鸡胸肉', kcal: 165, unit: '100g' })
    const foods = await listFoods()
    expect(foods).toHaveLength(1)
    expect(foods[0].kcal).toBe(165)
  })

  it('购物清单：已买的排后面，能一键清掉', async () => {
    await addShopping('鸡蛋')
    await addShopping('牛奶')
    const first = (await listShopping())[0]
    await toggleShopping(first.id, true)

    let rows = await listShopping()
    expect(rows.map((r) => r.text)).toEqual(['牛奶', '鸡蛋'])

    await clearDoneShopping()
    rows = await listShopping()
    expect(rows.map((r) => r.text)).toEqual(['牛奶'])
  })
})
