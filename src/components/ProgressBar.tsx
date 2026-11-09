import type { CSSProperties } from 'react'
import s from './ui.module.css'

interface ProgressBarProps {
  done: number
  total: number
  label?: string
  color?: string
}

export default function ProgressBar({ done, total, label, color }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <div className={s.progressRow}>
      <div className={s.progressTrack} style={{ flex: 1 }}>
        <div
          className={s.progressBar}
          style={{ width: `${pct}%`, '--progress-color': color } as CSSProperties}
        />
      </div>
      <span className={s.progressLabel}>{label ?? `${done}/${total} · ${pct}%`}</span>
    </div>
  )
}
