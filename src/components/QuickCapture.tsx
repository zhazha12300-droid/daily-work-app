import { useEffect, useRef, useState } from 'react'
import { useToday } from '../hooks/useToday'
import { useShortcuts } from '../hooks/useShortcuts'
import { addMemo } from '../repo/memos'
import { addTask } from '../repo/tasks'
import Modal from './Modal'
import { useToast } from './Toast'
import s from './QuickCapture.module.css'

type Mode = 'memo' | 'task'

/**
 * 全局 Ctrl/⌘+K 快速捕获。
 * 默认存成备忘，Tab 切成今日任务，Enter 保存。
 */
export default function QuickCapture() {
  const toast = useToast()
  const today = useToday()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('memo')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useShortcuts({
    'mod+k': () => {
      setMode('memo')
      setText('')
      setOpen(true)
    },
  })

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  async function submit() {
    const value = text.trim()
    if (!value || saving) return
    setSaving(true)
    try {
      if (mode === 'memo') {
        await addMemo(value)
        toast.show({ message: '已记到快速备忘', tone: 'success' })
      } else {
        await addTask({ date: today, title: value })
        toast.show({ message: '已加到今日计划', tone: 'success' })
      }
      setOpen(false)
      setText('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="快速捕获" onClose={() => setOpen(false)}>
      <div className={s.modes} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'memo'}
          className={[s.mode, mode === 'memo' ? s.modeOn : ''].join(' ')}
          onClick={() => setMode('memo')}
        >
          备忘
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'task'}
          className={[s.mode, mode === 'task' ? s.modeOn : ''].join(' ')}
          onClick={() => setMode('task')}
        >
          今日任务
        </button>
        <span className={s.tip}>Tab 切换 · Enter 保存 · Esc 关闭</span>
      </div>

      <input
        ref={inputRef}
        className={s.input}
        value={text}
        placeholder={mode === 'memo' ? '想到什么就先丢进来…' : '今天要做什么？'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault()
            setMode((m) => (m === 'memo' ? 'task' : 'memo'))
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
      />
    </Modal>
  )
}
