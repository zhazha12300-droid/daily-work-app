import { useEffect, useState } from 'react'
import type { ISODate } from '../db/types'
import { todayStr } from '../lib/date'

/**
 * 当前日期（本地时区）。
 * 每 60 秒检查一次是否跨了零点，并监听窗口获得焦点——
 * 这样半夜开着页面也不会把新任务记到昨天。
 */
export function useToday(): ISODate {
  const [today, setToday] = useState<ISODate>(() => todayStr())

  useEffect(() => {
    const check = () => {
      const next = todayStr()
      setToday((cur) => (cur === next ? cur : next))
    }
    const id = window.setInterval(check, 60_000)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', check)
    }
  }, [])

  return today
}
