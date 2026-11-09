import type { ReactNode } from 'react'
import s from './ui.module.css'

interface CardProps {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  dashed?: boolean
  /** 去掉内边距（列表类内容自己控制） */
  flush?: boolean
  className?: string
}

export default function Card({ title, actions, children, dashed, flush, className }: CardProps) {
  const cls = [s.card, dashed ? s.dashed : '', flush ? s.flush : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={cls}>
      {title || actions ? (
        <header className={s.cardHead}>
          {title ? <h2 className={s.cardTitle}>{title}</h2> : <span />}
          {actions ? <div className={s.cardActions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
