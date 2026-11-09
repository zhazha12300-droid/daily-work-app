import type { ReactNode } from 'react'
import s from './ui.module.css'

interface EmptyStateProps {
  title: string
  hint?: string
  action?: ReactNode
}

export default function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{title}</p>
      {hint ? <p className={s.emptyHint}>{hint}</p> : null}
      {action ? <div className={s.emptyAction}>{action}</div> : null}
    </div>
  )
}
