import { db } from '../db'
import type { ISODate, Priority, Task } from '../db/types'
import { shiftDate, weekRange } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const T = db.tasks
export const MAX_FOCUS = 3

/**
 * 任务排序：重点 → 优先级 → 创建时间。
 * 故意不看 done，这样勾选完成时任务会**留在原位变灰**，不会跳走。
 */
function sortTasks(rows: Task[]): Task[] {
  return [...rows].sort((a, b) => {
    if (a.focus !== b.focus) return b.focus - a.focus
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.createdAt - b.createdAt
  })
}

export async function listTasks(date: ISODate): Promise<Task[]> {
  const rows = await T.where('date').equals(date).toArray()
  return sortTasks(rows.filter((t) => t.deletedAt === null))
}

export async function listAllPastPending(today: ISODate): Promise<Task[]> {
  const rows = await T.where('date').below(today).toArray()
  return sortTasks(rows.filter((t) => t.deletedAt === null && t.done === 0)).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
}

export interface NewTaskInput {
  date: ISODate
  title: string
  note?: string
  priority?: Priority
  estimateMin?: number | null
  focus?: boolean
  sourceType?: Task['sourceType']
  sourceId?: string | null
  sourceLabel?: string | null
}

export async function addTask(input: NewTaskInput): Promise<string> {
  const now = nextTimestamp()
  const row: Task = {
    id: newId(),
    date: input.date,
    title: input.title.trim(),
    note: input.note ?? '',
    priority: input.priority ?? 1,
    estimateMin: input.estimateMin ?? null,
    done: 0,
    doneAt: null,
    focus: input.focus ? 1 : 0,
    focusOrder: 0,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    sourceLabel: input.sourceLabel ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await T.add(row)
  return row.id
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<void> {
  await T.update(id, { ...patch, updatedAt: Date.now() })
}

export async function toggleTask(id: string, done: boolean): Promise<void> {
  await T.update(id, {
    done: done ? 1 : 0,
    doneAt: done ? Date.now() : null,
    updatedAt: Date.now(),
  })
}

export async function deleteTask(id: string): Promise<void> {
  await softDelete(T, id)
}

export async function restoreTask(id: string): Promise<void> {
  await restore(T, id)
}

/** 设为今日重点；已经满 3 个则返回 false，由界面提示 */
export async function focusTask(id: string): Promise<boolean> {
  const row = await T.get(id)
  if (!row) return false
  if (row.focus === 1) return true
  const current = (await T.where('[date+focus]').equals([row.date, 1]).toArray()).filter(
    (t) => t.deletedAt === null,
  )
  if (current.length >= MAX_FOCUS) return false
  await T.update(id, { focus: 1, focusOrder: current.length, updatedAt: Date.now() })
  return true
}

export async function unfocusTask(id: string): Promise<void> {
  await T.update(id, { focus: 0, focusOrder: 0, updatedAt: Date.now() })
}

/** 隔日顺延：把一批任务改到新的日期 */
export async function moveTasksToDate(ids: string[], date: ISODate): Promise<void> {
  await db.transaction('rw', T, async () => {
    for (const id of ids) {
      await T.update(id, { date, focus: 0, focusOrder: 0, updatedAt: Date.now() })
    }
  })
}

export interface WeekProgress {
  done: number
  total: number
  start: ISODate
  end: ISODate
}

/** 本周完成率（按「每周起始日」设置算范围） */
export async function weekProgress(
  date: ISODate,
  weekStartDay: 0 | 1,
): Promise<WeekProgress> {
  const { start, end } = weekRange(date, weekStartDay)
  const rows = await T.where('date').between(start, end, true, true).toArray()
  const alive = rows.filter((t) => t.deletedAt === null)
  return {
    done: alive.filter((t) => t.done === 1).length,
    total: alive.length,
    start,
    end,
  }
}

/** 跨天时提醒用：昨天及更早还没做完的 */
export async function pendingCarryover(today: ISODate): Promise<{ tasks: Task[]; oldest: ISODate }> {
  const tasks = await listAllPastPending(today)
  return { tasks, oldest: tasks.length ? tasks[tasks.length - 1].date : shiftDate(today, -1) }
}
