import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import type { ISODate } from '../db/types'
import { formatShort } from '../lib/date'
import { moveTasksToDate, pendingCarryover } from '../repo/tasks'
import { updateSettings } from '../repo/settings'
import { useToast } from './Toast'
import s from './CarryoverBanner.module.css'

interface CarryoverBannerProps {
  today: ISODate
}

/**
 * 跨天提醒：之前没做完的任务。
 * 「忽略」只忽略当天，不会永久关掉。
 */
export default function CarryoverBanner({ today }: CarryoverBannerProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const data = useLiveQuery(() => pendingCarryover(today), [today], {
    tasks: [],
    oldest: today,
  })
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)

  const dismissKey = `carryover:${today}`
  const dismissed = settings?.dismissedTips.includes(dismissKey) ?? false

  if (dismissed || data.tasks.length === 0) return null

  const count = data.tasks.length

  async function moveAll() {
    setBusy(true)
    try {
      await moveTasksToDate(
        data.tasks.map((t) => t.id),
        today,
      )
      toast.show({ message: `已把 ${count} 项移到今天`, tone: 'success' })
      await ignore()
    } finally {
      setBusy(false)
    }
  }

  async function ignore() {
    const current = settings?.dismissedTips ?? []
    if (!current.includes(dismissKey)) {
      await updateSettings({ dismissedTips: [...current, dismissKey] })
    }
  }

  return (
    <div className={s.banner}>
      <div className={s.text}>
        <strong className={s.count}>{count}</strong> 项还没完成
        <span className={s.hint}>最早的是 {formatShort(data.oldest)}</span>
      </div>
      <div className={s.actions}>
        <button type="button" className="btn" disabled={busy} onClick={() => void moveAll()}>
          全部移到今天
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => navigate(`/today?date=${data.oldest}`)}
        >
          挑选
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void ignore()}>
          忽略
        </button>
      </div>
    </div>
  )
}
