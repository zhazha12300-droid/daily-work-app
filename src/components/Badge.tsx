import type { CSSProperties, ReactNode } from 'react'
import s from './ui.module.css'

interface BadgeProps {
  children: ReactNode
  /** 小圆点颜色，不传则只有文字 */
  color?: string
  className?: string
  title?: string
}

export default function Badge({ children, color, className, title }: BadgeProps) {
  return (
    <span
      className={[s.badge, className].filter(Boolean).join(' ')}
      title={title}
      style={color ? ({ '--badge-color': color } as CSSProperties) : undefined}
    >
      {color ? <i className={s.badgeDot} aria-hidden /> : null}
      {children}
    </span>
  )
}
