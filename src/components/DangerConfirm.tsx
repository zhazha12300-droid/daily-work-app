import { useEffect, useState, type ReactNode } from 'react'
import Modal from './Modal'
import s from './ui.module.css'

interface DangerConfirmProps {
  open: boolean
  title: string
  description: ReactNode
  /** 要用户手打的两个字，比如「清空」「恢复」 */
  confirmWord: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

/**
 * 危险操作统一走这里：必须手动输入指定词才能点确认。
 * 只有「清空模块 / 导入覆盖 / 清空全部」用得到。
 */
export default function DangerConfirm({
  open,
  title,
  description,
  confirmWord,
  confirmLabel = '确认执行',
  onCancel,
  onConfirm,
}: DangerConfirmProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setBusy(false)
    }
  }, [open])

  const matched = text.trim() === confirmWord

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={!matched || busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? '执行中…' : confirmLabel}
          </button>
        </>
      }
    >
      <div>{description}</div>
      <div>
        <p className="muted" style={{ fontSize: 'var(--fs-aux)', marginBottom: 6 }}>
          请输入「{confirmWord}」以继续
        </p>
        <input
          className={s.dangerInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={confirmWord}
          autoFocus
        />
      </div>
    </Modal>
  )
}
