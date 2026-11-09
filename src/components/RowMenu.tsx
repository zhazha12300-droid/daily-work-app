import { useEffect, useRef, useState } from 'react'
import s from './ui.module.css'

export interface MenuAction {
  label: string
  onSelect: () => void
  danger?: boolean
}

interface RowMenuProps {
  items: MenuAction[]
  ariaLabel?: string
}

/** 行尾的「⋯」菜单。删除不弹窗，点了就走，靠 toast 给 5 秒撤销。 */
export default function RowMenu({ items, ariaLabel = '更多操作' }: RowMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={s.menuWrap} ref={wrapRef}>
      <button
        type="button"
        className={[s.menuTrigger, open ? s.menuTriggerOpen : ''].filter(Boolean).join(' ')}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div className={s.menuList} role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={[s.menuItem, item.danger ? s.menuItemDanger : ''].filter(Boolean).join(' ')}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
