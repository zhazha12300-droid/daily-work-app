import { db } from '../db'
import type { FoodItem, ISODate, Meal, MealItem, MealSlot, ShoppingItem } from '../db/types'
import { shiftDate } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const M = db.meals
const W = db.waterLogs
const F = db.foodLibrary
const S = db.shoppingItems

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

const mealId = (date: ISODate, slot: MealSlot) => `${date}-${slot}`

/** 保证某天四个餐次都有记录（空数组也行），省得界面到处判空 */
export async function ensureMeals(date: ISODate): Promise<void> {
  const existing = await M.where('date').equals(date).toArray()
  const have = new Set(existing.filter((m) => m.deletedAt === null).map((m) => m.slot))
  const now = Date.now()
  const missing = MEAL_SLOTS.filter((s) => !have.has(s)).map<Meal>((slot) => ({
    id: mealId(date, slot),
    date,
    slot,
    items: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }))
  if (missing.length > 0) await M.bulkPut(missing)
}

export async function listMeals(date: ISODate): Promise<Meal[]> {
  // 同 listTemplates：不能在这里写库（useLiveQuery 只读事务）。
  // ensureMeals 只在写路径 setMealItems 里调用，够用。
  const rows = await M.where('date').equals(date).toArray()
  const alive = rows.filter((m) => m.deletedAt === null)
  return MEAL_SLOTS.map(
    (slot) =>
      alive.find((m) => m.slot === slot) ?? {
        id: mealId(date, slot),
        date,
        slot,
        items: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      },
  )
}

export async function setMealItems(
  date: ISODate,
  slot: MealSlot,
  items: MealItem[],
): Promise<void> {
  await ensureMeals(date)
  await M.update(mealId(date, slot), { items, updatedAt: Date.now() })
}

export async function addMealItem(
  date: ISODate,
  slot: MealSlot,
  item: MealItem,
): Promise<void> {
  const meals = await listMeals(date)
  const current = meals.find((m) => m.slot === slot)?.items ?? []
  await setMealItems(date, slot, [...current, item])
}

export async function removeMealItem(
  date: ISODate,
  slot: MealSlot,
  index: number,
): Promise<void> {
  const meals = await listMeals(date)
  const current = meals.find((m) => m.slot === slot)?.items ?? []
  await setMealItems(
    date,
    slot,
    current.filter((_, i) => i !== index),
  )
}

/** 复制昨天这一餐（家常做法：今天跟昨天差不多） */
export async function copyMealFromYesterday(
  date: ISODate,
  slot: MealSlot,
): Promise<number> {
  const yesterday = shiftDate(date, -1)
  const rows = await M.where('[date+slot]').equals([yesterday, slot]).toArray()
  const source = rows.find((m) => m.deletedAt === null)
  if (!source || source.items.length === 0) return 0
  await setMealItems(date, slot, source.items.map((i) => ({ ...i })))
  return source.items.length
}

export function mealKcal(meal: Meal): number {
  return meal.items.reduce((sum, item) => sum + (typeof item.kcal === 'number' ? item.kcal : 0), 0)
}

export async function dayKcal(date: ISODate): Promise<number> {
  const meals = await listMeals(date)
  return meals.reduce((sum, meal) => sum + mealKcal(meal), 0)
}

/* ── 饮水 ─────────────────────────────────────────────────────── */

export async function getWater(date: ISODate): Promise<number> {
  const row = await W.where('date').equals(date).first()
  return row?.cups ?? 0
}

export async function setWater(date: ISODate, cups: number): Promise<void> {
  const clamped = Math.max(0, Math.min(8, Math.round(cups)))
  const row = await W.where('date').equals(date).first()
  if (row) {
    await W.update(row.id, { cups: clamped, updatedAt: Date.now() })
    return
  }
  await W.add({ id: newId(), date, cups: clamped, updatedAt: Date.now() })
}

/* ── 食物库 ───────────────────────────────────────────────────── */

export async function listFoods(): Promise<FoodItem[]> {
  const rows = await F.toArray()
  return rows.filter((f) => f.deletedAt === null).sort((a, b) => a.name.localeCompare(b.name))
}

export async function addFood(input: {
  name: string
  kcal: number | null
  unit?: string
}): Promise<string> {
  const name = input.name.trim()
  const existing = (await listFoods()).find((f) => f.name === name)
  if (existing) return existing.id
  const now = nextTimestamp()
  const row: FoodItem = {
    id: newId(),
    name,
    kcal: input.kcal,
    unit: input.unit ?? '份',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await F.add(row)
  return row.id
}

export async function deleteFood(id: string): Promise<void> {
  await softDelete(F, id)
}

/* ── 购物清单 ─────────────────────────────────────────────────── */

export async function listShopping(): Promise<ShoppingItem[]> {
  const rows = await S.toArray()
  return rows
    .filter((s) => s.deletedAt === null)
    .sort((a, b) => (a.done === b.done ? a.createdAt - b.createdAt : a.done - b.done))
}

export async function addShopping(text: string): Promise<void> {
  const value = text.trim()
  if (!value) return
  const now = nextTimestamp()
  const row: ShoppingItem = {
    id: newId(),
    text: value,
    done: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await S.add(row)
}

export async function toggleShopping(id: string, done: boolean): Promise<void> {
  await S.update(id, { done: done ? 1 : 0, updatedAt: Date.now() })
}

export async function deleteShopping(id: string): Promise<void> {
  await softDelete(S, id)
}

export async function restoreShopping(id: string): Promise<void> {
  await restore(S, id)
}

export async function clearDoneShopping(): Promise<void> {
  const rows = await S.toArray()
  const done = rows.filter((s) => s.deletedAt === null && s.done === 1)
  await Promise.all(done.map((s) => softDelete(S, s.id)))
}
