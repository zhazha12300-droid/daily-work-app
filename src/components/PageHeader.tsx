import type { ReactNode } from 'react'
import s from './ui.module.css'

interface PageHeaderProps {
  title: string
  sub?: ReactNode
  actions?: ReactNode
}

export default function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <header className={s.pageHead}>
      <div>
        <h1 className={s.pageTitle}>{title}</h1>
        {sub ? <p className={s.pageSub}>{sub}</p> : null}
      </div>
      {actions ? <div className={s.pageActions}>{actions}</div> : null}
    </header>
  )
}
