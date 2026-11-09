import { describe, expect, it } from 'vitest'
import {
  formatCn,
  formatShort,
  isISODate,
  shiftDate,
  todayStr,
  weekRange,
  weekdayCn,
} from '../src/lib/date'
import { formatClock, formatMinutes, formatRelative } from '../src/lib/format'

describe('日期工具', () => {
  it('日期串校验', () => {
    expect(isISODate('2026-09-18')).toBe(true)
    expect(isISODate('2026-9-18')).toBe(false)
    expect(isISODate('2026/09/18')).toBe(false)
    expect(isISODate(null)).toBe(false)
  })

  it('前后移动一天，跨月正确', () => {
    expect(shiftDate('2026-09-18', 1)).toBe('2026-09-19')
    expect(shiftDate('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('中文日期与星期', () => {
    expect(formatCn('2026-09-18')).toBe('9月18日 周五')
    expect(weekdayCn('2026-09-20')).toBe('周日')
    expect(formatShort('2026-09-08')).toBe('9/8')
  })

  it('本周范围跟随「每周起始日」设置', () => {
    // 2026-09-18 是周五
    expect(weekRange('2026-09-18', 1)).toEqual({ start: '2026-09-14', end: '2026-09-20' })
    expect(weekRange('2026-09-18', 0)).toEqual({ start: '2026-09-13', end: '2026-09-19' })
  })

  it('todayStr 是 10 位日期串', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('格式化', () => {
  it('计时器', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(3725)).toBe('1:02:05')
  })

  it('分钟', () => {
    expect(formatMinutes(45)).toBe('45 分钟')
    expect(formatMinutes(120)).toBe('2 小时')
    expect(formatMinutes(130)).toBe('2 小时 10 分')
  })

  it('相对时间', () => {
    const now = Date.parse('2026-09-18T10:00:00')
    expect(formatRelative(now - 30_000, now)).toBe('刚刚')
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 小时前')
    expect(formatRelative(now - 3 * 86400_000, now)).toBe('3 天前')
  })
})
