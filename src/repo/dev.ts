import { db } from '../db'
import type {
  DevItem,
  DevItemStatus,
  DevItemType,
  DevNote,
  DevProject,
  ISODate,
  Priority,
  ProjectStatus,
  WorkLog,
} from '../db/types'
import { weekRange } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const P = db.devProjects
const I = db.devItems
const N = db.devNotes
const L = db.workLogs

const STATUS_ORDER: ProjectStatus[] = ['building', 'maintain', 'paused', 'idea']
const ITEM_STATUS_ORDER: DevItemStatus[] = ['todo', 'doing', 'verify', 'done']

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  building: '开发中',
  maintain: '维护',
  paused: '暂停',
  idea: '构思',
}

export const ITEM_TYPE_LABEL: Record<DevItemType, string> = {
  feature: '需求',
  task: '任务',
  bug: 'Bug',
}

export const ITEM_STATUS_LABEL: Record<DevItemStatus, string> = {
  todo: '待办',
  doing: '进行中',
  verify: '待验证',
  done: '已完成',
}

/* ── 项目 ─────────────────────────────────────────────────────── */

export async function listProjects(): Promise<DevProject[]> {
  const rows = await P.toArray()
  return rows
    .filter((p) => p.deletedAt === null)
    .sort((a, b) => {
      const sa = STATUS_ORDER.indexOf(a.status)
      const sb = STATUS_ORDER.indexOf(b.status)
      if (sa !== sb) return sa - sb
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.createdAt - b.createdAt
    })
}

export async function addProject(name: string): Promise<string> {
  const now = nextTimestamp()
  const row: DevProject = {
    id: newId(),
    name: name.trim() || '未命名项目',
    status: 'building',
    stack: '',
    repo: '',
    note: '',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await P.add(row)
  return row.id
}

export async function patchProject(id: string, patch: Partial<DevProject>): Promise<void> {
  await P.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteProject(id: string): Promise<void> {
  await softDelete(P, id)
}

export async function restoreProject(id: string): Promise<void> {
  await restore(P, id)
}

/* ── 条目 ─────────────────────────────────────────────────────── */

export async function listItems(projectId: string): Promise<DevItem[]> {
  const rows = await I.where('projectId').equals(projectId).toArray()
  return rows
    .filter((it) => it.deletedAt === null)
    .sort((a, b) => {
      const sa = ITEM_STATUS_ORDER.indexOf(a.status)
      const sb = ITEM_STATUS_ORDER.indexOf(b.status)
      if (sa !== sb) return sa - sb
      if (a.priority !== b.priority) return a.priority - b.priority
      return a.createdAt - b.createdAt
    })
}

export async function addItem(input: {
  projectId: string
  type: DevItemType
  title: string
  priority?: Priority
}): Promise<string> {
  const now = nextTimestamp()
  const row: DevItem = {
    id: newId(),
    projectId: input.projectId,
    type: input.type,
    title: input.title.trim(),
    status: 'todo',
    priority: input.priority ?? 1,
    note: '',
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await I.add(row)
  return row.id
}

export async function patchItem(id: string, patch: Partial<DevItem>): Promise<void> {
  const next: Partial<DevItem> = { ...patch, updatedAt: Date.now() }
  if (patch.status) next.doneAt = patch.status === 'done' ? Date.now() : null
  await I.update(id, next)
}

export async function deleteItem(id: string): Promise<void> {
  await softDelete(I, id)
}

export async function restoreItem(id: string): Promise<void> {
  await restore(I, id)
}

/** 每个条目累计花了多少分钟 */
export async function minutesByItem(projectId: string): Promise<Record<string, number>> {
  const rows = await L.where('projectId').equals(projectId).toArray()
  const map: Record<string, number> = {}
  for (const log of rows) {
    if (log.deletedAt !== null || !log.devItemId) continue
    map[log.devItemId] = (map[log.devItemId] ?? 0) + log.minutes
  }
  return map
}

/* ── 笔记 ─────────────────────────────────────────────────────── */

export async function listNotes(projectId: string): Promise<DevNote[]> {
  const rows = await N.where('projectId').equals(projectId).toArray()
  return rows
    .filter((n) => n.deletedAt === null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function addNote(projectId: string, title = '', body = ''): Promise<string> {
  const now = nextTimestamp()
  const row: DevNote = {
    id: newId(),
    projectId,
    title,
    body,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await N.add(row)
  return row.id
}

export async function patchNote(id: string, patch: Partial<DevNote>): Promise<void> {
  await N.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteNote(id: string): Promise<void> {
  await softDelete(N, id)
}

export async function restoreNote(id: string): Promise<void> {
  await restore(N, id)
}

/* ── 工时 ─────────────────────────────────────────────────────── */

export async function addWorkLog(input: {
  projectId: string
  devItemId: string | null
  startedAt: number
  minutes: number
  note?: string
}): Promise<string> {
  const now = Date.now()
  const row: WorkLog = {
    id: newId(),
    projectId: input.projectId,
    devItemId: input.devItemId,
    startedAt: input.startedAt,
    endedAt: now,
    minutes: Math.max(1, Math.round(input.minutes)),
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await L.add(row)
  return row.id
}

export async function deleteWorkLog(id: string): Promise<void> {
  await softDelete(L, id)
}

export interface ProjectMinutes {
  projectId: string
  projectName: string
  minutes: number
}

/** 本周每个项目的工时，用来画堆叠条 */
export async function weekMinutesByProject(
  date: ISODate,
  weekStartDay: 0 | 1,
): Promise<ProjectMinutes[]> {
  const { start, end } = weekRange(date, weekStartDay)
  const from = Date.parse(`${start}T00:00:00`)
  const to = Date.parse(`${end}T23:59:59.999`)
  const logs = await L.where('startedAt').between(from, to, true, true).toArray()
  const projects = await listProjects()
  const nameOf = new Map(projects.map((p) => [p.id, p.name]))

  const sums = new Map<string, number>()
  for (const log of logs) {
    if (log.deletedAt !== null) continue
    sums.set(log.projectId, (sums.get(log.projectId) ?? 0) + log.minutes)
  }

  return [...sums.entries()]
    .map(([projectId, minutes]) => ({
      projectId,
      projectName: nameOf.get(projectId) ?? '已删除项目',
      minutes,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

/** 未解决的 Bug 数（导航小圆点用） */
export async function countOpenBugs(): Promise<number> {
  const rows = await I.where('type').equals('bug').toArray()
  return rows.filter((r) => r.deletedAt === null && r.status !== 'done').length
}

export async function countDoingItems(): Promise<number> {
  const rows = await I.where('status').equals('doing').toArray()
  return rows.filter((r) => r.deletedAt === null).length
}
