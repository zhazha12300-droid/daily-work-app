import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './ui.module.css'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 点背景是否关闭，危险确认场景应传 false */
  closeOnBackdrop?: boolean
}

export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // 焦点搬进弹窗：Tab 从这里开始走，Esc 立刻可用，不会被丢回页面顶部
    dialogRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className={s.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className={s.modalHead}>
          <h2 className={s.modalTitle}>{title}</h2>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className={s.modalBody}>{children}</div>
        {footer ? <footer className={s.modalFoot}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
