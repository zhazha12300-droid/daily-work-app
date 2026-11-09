import { differenceInCalendarDays } from 'date-fns'
import { db } from '../db'
import type { Client, ClientStatus, ConsultLog, ISODate, Payment } from '../db/types'
import { shiftDate, toDate } from '../lib/date'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { restore, softDelete } from './undo'

const C = db.clients
const G = db.consultLogs
const Y = db.payments

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  lead: '潜在',
  active: '进行中',
  closed: '已结案',
}

export const FOLLOW_UP_DAYS = 30

/* ── 客户 ─────────────────────────────────────────────────────── */

export async function listClients(status: ClientStatus | 'all' = 'all'): Promise<Client[]> {
  const rows = await C.toArray()
  return rows
    .filter((c) => c.deletedAt === null && (status === 'all' || c.status === status))
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function addClient(name: string): Promise<string> {
  const now = nextTimestamp()
  const row: Client = {
    id: newId(),
    name: name.trim() || '未命名客户',
    source: '',
    status: 'lead',
    contact: '',
    note: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await C.add(row)
  return row.id
}

export async function patchClient(id: string, patch: Partial<Client>): Promise<void> {
  await C.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteClient(id: string): Promise<void> {
  await softDelete(C, id)
}

export async function restoreClient(id: string): Promise<void> {
  await restore(C, id)
}

/* ── 沟通记录 ─────────────────────────────────────────────────── */

export async function listConsultLogs(clientId: string): Promise<ConsultLog[]> {
  const rows = await G.where('clientId').equals(clientId).toArray()
  return rows
    .filter((l) => l.deletedAt === null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))
}

export async function addConsultLog(input: {
  clientId: string
  date: ISODate
  minutes: number
  topic: string
  summary?: string
  nextFollowUp?: ISODate | null
}): Promise<string> {
  const now = nextTimestamp()
  const row: ConsultLog = {
    id: newId(),
    clientId: input.clientId,
    date: input.date,
    minutes: Math.max(0, Math.round(input.minutes)),
    topic: input.topic.trim(),
    summary: input.summary ?? '',
    nextFollowUp: input.nextFollowUp ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await G.add(row)
  return row.id
}

export async function patchConsultLog(id: string, patch: Partial<ConsultLog>): Promise<void> {
  await G.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteConsultLog(id: string): Promise<void> {
  await softDelete(G, id)
}

export async function restoreConsultLog(id: string): Promise<void> {
  await restore(G, id)
}

/* ── 收款 ─────────────────────────────────────────────────────── */

export async function listPayments(clientId: string): Promise<Payment[]> {
  const rows = await Y.where('clientId').equals(clientId).toArray()
  return rows.filter((p) => p.deletedAt === null).sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function addPayment(input: {
  clientId: string
  amount: number
  date: ISODate
  received: boolean
  note?: string
}): Promise<string> {
  const now = nextTimestamp()
  const row: Payment = {
    id: newId(),
    clientId: input.clientId,
    amount: input.amount,
    date: input.date,
    received: input.received ? 1 : 0,
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await Y.add(row)
  return row.id
}

export async function setPaymentReceived(id: string, received: boolean): Promise<void> {
  await Y.update(id, { received: received ? 1 : 0, updatedAt: Date.now() })
}

export async function deletePayment(id: string): Promise<void> {
  await softDelete(Y, id)
}

export async function restorePayment(id: string): Promise<void> {
  await restore(Y, id)
}

/* ── 待跟进 ───────────────────────────────────────────────────── */

export interface FollowUp {
  clientId: string
  clientName: string
  due: ISODate
  overdueDays: number
}

/**
 * 待跟进判定（设计稿 3.5）：
 * 优先用最近一次沟通填的「下次跟进日」；没填就按「距上次沟通超过 30 天」。
 * 已结案的客户不提醒。
 */
export async function listFollowUps(today: ISODate): Promise<FollowUp[]> {
  const clients = (await listClients()).filter((c) => c.status !== 'closed')
  const result: FollowUp[] = []

  for (const client of clients) {
    const logs = await listConsultLogs(client.id)
    const latest = logs[0]
    if (!latest) continue

    const due = latest.nextFollowUp ?? shiftDate(latest.date, FOLLOW_UP_DAYS)
    if (due > today) continue

    result.push({
      clientId: client.id,
      clientName: client.name,
      due,
      overdueDays: Math.max(0, differenceInCalendarDays(toDate(today), toDate(due))),
    })
  }

  return result.sort((a, b) => b.overdueDays - a.overdueDays)
}

/* ── 统计 ─────────────────────────────────────────────────────── */

export interface MonthStats {
  count: number
  minutes: number
  received: number
  pending: number
}

/** 本月咨询场次、小时数、已收与待收 */
export async function monthStats(today: ISODate): Promise<MonthStats> {
  const monthStart = `${today.slice(0, 7)}-01`
  const logs = await G.where('date').between(monthStart, today, true, true).toArray()
  const alive = logs.filter((l) => l.deletedAt === null)

  const payments = await Y.toArray()
  const monthPayments = payments.filter(
    (p) => p.deletedAt === null && p.date >= monthStart && p.date <= today,
  )

  return {
    count: alive.length,
    minutes: alive.reduce((s, l) => s + l.minutes, 0),
    received: monthPayments.filter((p) => p.received === 1).reduce((s, p) => s + p.amount, 0),
    pending: monthPayments.filter((p) => p.received === 0).reduce((s, p) => s + p.amount, 0),
  }
}

export async function clientTotals(
  clientId: string,
): Promise<{ minutes: number; count: number; received: number; pending: number }> {
  const logs = await listConsultLogs(clientId)
  const payments = await listPayments(clientId)
  return {
    count: logs.length,
    minutes: logs.reduce((s, l) => s + l.minutes, 0),
    received: payments.filter((p) => p.received === 1).reduce((s, p) => s + p.amount, 0),
    pending: payments.filter((p) => p.received === 0).reduce((s, p) => s + p.amount, 0),
  }
}
