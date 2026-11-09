import { addDays, format, parseISO, startOfWeek, endOfWeek } from 'date-fns'
import type { ISODate } from '../db/types'

export const DATE_FMT = 'yyyy-MM-dd'
const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

export function todayStr(d: Date = new Date()): ISODate {
  return format(d, DATE_FMT)
}

export function isISODate(v: unknown): v is ISODate {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function toDate(iso: ISODate): Date {
  return parseISO(iso)
}

export function shiftDate(iso: ISODate, days: number): ISODate {
  return format(addDays(toDate(iso), days), DATE_FMT)
}

export function weekdayCn(iso: ISODate): string {
  return `周${WEEKDAY_CN[toDate(iso).getDay()]}`
}

/** 9月18日 周四 */
export function formatCn(iso: ISODate): string {
  const d = toDate(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayCn(iso)}`
}

/** 9/18 —— 列表里用，省地方 */
export function formatShort(iso: ISODate): string {
  const d = toDate(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function weekRange(
  iso: ISODate,
  weekStartDay: 0 | 1,
): { start: ISODate; end: ISODate } {
  const d = toDate(iso)
  const opts = { weekStartsOn: weekStartDay } as const
  return {
    start: format(startOfWeek(d, opts), DATE_FMT),
    end: format(endOfWeek(d, opts), DATE_FMT),
  }
}

export function isValidDateInput(v: string): boolean {
  if (!isISODate(v)) return false
  return !Number.isNaN(toDate(v).getTime())
}
