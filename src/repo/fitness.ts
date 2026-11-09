import { db } from '../db'
import type {
  BodyMetric,
  FitTemplate,
  ISODate,
  SessionExercise,
  SessionSet,
  TemplateExercise,
  WorkoutSession,
} from '../db/types'
import { toDate } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'

const T = db.fitTemplates
const S = db.workoutSessions
const B = db.bodyMetrics

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

/** 日期 → 一周里的第几天（周一是 1，周日是 7） */
export function weekdayOf(date: ISODate): Weekday {
  const day = toDate(date).getDay() // 0 = 周日
  return (day === 0 ? 7 : day) as Weekday
}

const emptyTemplate = (weekday: Weekday): FitTemplate => {
  const now = Date.now()
  return {
    id: `wd-${weekday}`,
    weekday,
    isRest: 1,
    name: '',
    exercises: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

/** 保证 7 天都有模板行（首次进入健身板块时调用） */
export async function ensureTemplates(): Promise<void> {
  const existing = await T.toArray()
  const have = new Set(existing.filter((t) => t.deletedAt === null).map((t) => t.weekday))
  const missing: Weekday[] = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).filter((d) => !have.has(d))
  if (missing.length === 0) return
  await T.bulkPut(missing.map(emptyTemplate))
}

export async function listTemplates(): Promise<FitTemplate[]> {
  // 注意：这里不能写库。useLiveQuery 会在只读事务里跑查询函数，
  // 一旦调用 ensureTemplates() 触发写入就会抛 ReadOnly 导致整页白屏。
  // 种子写入改由页面里的 useEffect 调用 ensureTemplates() 完成。
  const rows = await T.toArray()
  return rows
    .filter((t) => t.deletedAt === null)
    .sort((a, b) => a.weekday - b.weekday)
}

export async function patchTemplate(
  weekday: Weekday,
  patch: Partial<Omit<FitTemplate, 'id' | 'weekday'>>,
): Promise<void> {
  await ensureTemplates()
  await T.update(`wd-${weekday}`, { ...patch, updatedAt: Date.now() })
}

export async function setTemplateExercises(
  weekday: Weekday,
  exercises: TemplateExercise[],
): Promise<void> {
  await patchTemplate(weekday, { exercises, isRest: exercises.length === 0 ? 1 : 0 })
}

/* ── 训练记录 ─────────────────────────────────────────────────── */

export async function listSessions(limit = 30): Promise<WorkoutSession[]> {
  const rows = await S.toArray()
  return rows
    .filter((s) => s.deletedAt === null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
    .slice(0, limit)
}

export async function addSession(input: {
  date: ISODate
  templateId: string | null
  templateName: string
  exercises: SessionExercise[]
  note?: string
  durationMin?: number
}): Promise<string> {
  const now = nextTimestamp()
  const row: WorkoutSession = {
    id: newId(),
    date: input.date,
    templateId: input.templateId,
    templateName: input.templateName,
    exercises: input.exercises,
    note: input.note ?? '',
    durationMin: input.durationMin ?? 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await S.add(row)
  return row.id
}

export async function deleteSession(id: string): Promise<void> {
  await S.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}

/** 每个动作的历史最好重量（PR） */
export async function exercisePRs(): Promise<Record<string, number>> {
  const rows = await S.toArray()
  const prs: Record<string, number> = {}
  for (const session of rows) {
    if (session.deletedAt !== null) continue
    for (const ex of session.exercises) {
      for (const set of ex.sets) {
        const w = set.actualWeight
        if (typeof w === 'number' && w > 0) {
          prs[ex.name] = Math.max(prs[ex.name] ?? 0, w)
        }
      }
    }
  }
  return prs
}

/** 出现过的动作名，用于输入联想 */
export async function knownExercises(): Promise<string[]> {
  const rows = await S.toArray()
  const seen = new Set<string>()
  for (const session of rows) {
    for (const ex of session.exercises) seen.add(ex.name)
  }
  const templates = await T.toArray()
  for (const t of templates) for (const ex of t.exercises) seen.add(ex.name)
  return [...seen].filter(Boolean).sort()
}

/** 由模板生成一次训练（每组都留空，等你去勾） */
export function sessionFromTemplate(template: FitTemplate): SessionExercise[] {
  return template.exercises.map((ex) => ({
    name: ex.name,
    skipped: 0 as const,
    sets: Array.from({ length: Math.max(1, ex.sets) }, (): SessionSet => ({
      targetReps: ex.reps,
      targetWeight: ex.weight,
      actualReps: null,
      actualWeight: null,
      done: 0,
    })),
  }))
}

export async function sessionsThisWeekCount(from: ISODate, to: ISODate): Promise<number> {
  const rows = await S.where('date').between(from, to, true, true).toArray()
  return rows.filter((s) => s.deletedAt === null).length
}

/* ── 身体数据 ─────────────────────────────────────────────────── */

export async function listMetrics(limit = 60): Promise<BodyMetric[]> {
  const rows = await B.toArray()
  return rows
    .filter((m) => m.deletedAt === null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
}

export async function upsertMetric(input: {
  date: ISODate
  weight: number | null
  waist: number | null
  note?: string
}): Promise<void> {
  const existing = await B.where('date').equals(input.date).first()
  const now = Date.now()
  if (existing) {
    await B.update(existing.id, {
      weight: input.weight,
      waist: input.waist,
      note: input.note ?? existing.note,
      updatedAt: now,
    })
    return
  }
  await B.add({
    id: newId(),
    date: input.date,
    weight: input.weight,
    waist: input.waist,
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  })
}

export async function deleteMetric(id: string): Promise<void> {
  await B.update(id, { deletedAt: Date.now(), updatedAt: Date.now() })
}
