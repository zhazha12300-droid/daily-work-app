import type { ISODate } from '../db/types'
import { formatCn } from '../lib/date'
import s from './ui.module.css'

interface DateStepperProps {
  date: ISODate
  today: ISODate
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}

export default function DateStepper({ date, today, onPrev, onNext, onToday }: DateStepperProps) {
  return (
    <div className={s.stepper}>
      <button type="button" className={s.stepBtn} onClick={onPrev} title="前一天" aria-label="前一天">
        ‹
      </button>
      <span className={s.stepDate}>{formatCn(date)}</span>
      <button type="button" className={s.stepBtn} onClick={onNext} title="后一天" aria-label="后一天">
        ›
      </button>
      {date !== today ? (
        <button type="button" className={s.stepToday} onClick={onToday}>
          回今天
        </button>
      ) : null}
    </div>
  )
}
