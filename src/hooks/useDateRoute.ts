import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ISODate } from '../db/types'
import { isISODate, shiftDate } from '../lib/date'
import { useToday } from './useToday'

/**
 * 页面日期 ↔ URL ?date= 的双向绑定。
 * 放在地址里是为了「刷新 / 关掉重开都回到同一页同一天」，且不污染其它板块。
 */
export function useDateRoute() {
  const today = useToday()
  const [params, setParams] = useSearchParams()

  const raw = params.get('date')
  const date: ISODate = isISODate(raw) ? raw : today
  const isToday = date === today

  const setDate = useCallback(
    (next: ISODate) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === today) p.delete('date')
          else p.set('date', next)
          return p
        },
        { replace: true },
      )
    },
    [setParams, today],
  )

  const goPrev = useCallback(() => setDate(shiftDate(date, -1)), [date, setDate])
  const goNext = useCallback(() => setDate(shiftDate(date, 1)), [date, setDate])
  const goToday = useCallback(() => setDate(today), [setDate, today])

  return { date, today, isToday, setDate, goPrev, goNext, goToday }
}
