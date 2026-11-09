import { useEffect, useRef, useState } from 'react'
import s from './ui.module.css'

interface InlineEditProps {
  value: string
  onCommit: (value: string) => void | Promise<void>
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * 点一下就能改，Enter 存、Esc 放弃、失焦也算存。
 * 全站没有「保存」按钮，靠它和 useAutosave 兜住。
 */
export default function InlineEdit({
  value,
  onCommit,
  placeholder = '点击编辑',
  multiline = false,
  ariaLabel,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next === value) return
    void onCommit(next)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    const common = {
      ref: inputRef as never,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: commit,
      'aria-label': ariaLabel,
      className: multiline ? s.editTextarea : s.editInput,
    }

    if (multiline) {
      return (
        <textarea
          {...common}
          rows={Math.min(8, Math.max(2, draft.split('\n').length + 1))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
        />
      )
    }

    return (
      <input
        {...common}
        type="text"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className={[s.editTrigger, multiline ? 'prewrap' : '', className].filter(Boolean).join(' ')}
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
    >
      {value ? (
        value
      ) : (
        <span className={s.editPlaceholder}>{placeholder}</span>
      )}
    </button>
  )
}
