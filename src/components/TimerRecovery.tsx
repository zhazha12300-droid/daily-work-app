import { useState } from 'react'
import { useGlobalTimer } from '../hooks/useGlobalTimer'
import { formatDateTime, formatMinutes } from '../lib/format'
import {
  markPrompted,
  recoveryMinutes,
  shouldPromptRecovery,
  wasPrompted,
} from '../lib/timerRecovery'
import { addWorkLog, deleteWorkLog } from '../repo/dev'
import { updateSettings } from '../repo/settings'
import Modal from './Modal'
import { useToast } from './Toast'
import s from './TimerRecovery.module.css'

/**
 * 关浏览器时留下的计时：再打开会读到一条还在走的计时。
 * 不静默处理——安静地把它算成 3 小时工时，比什么都不做更糟。
 */
export default function TimerRecovery() {
  const toast = useToast()
  const { timer, discard } = useGlobalTimer()
  // 只在这一刻判断一次：页面停留久了不该突然弹出第二个窗
  const [openedAt] = useState(() => Date.now())
  const [answeredAt, setAnsweredAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const leftover =
    timer &&
    timer.startedAt !== answeredAt &&
    !wasPrompted(timer) &&
    shouldPromptRecovery(timer, openedAt)
      ? timer
      : null

  const defaultMinutes = leftover ? recoveryMinutes(leftover, openedAt) : 0
  const [minutes, setMinutes] = useState('')

  function keepGoing() {
    if (!leftover) return
    markPrompted(leftover)
    setAnsweredAt(leftover.startedAt)
  }

  async function saveLeftover() {
    if (!leftover) return
    const value = Math.max(1, Math.round(Number(minutes) || defaultMinutes))
    setSaving(true)
    try {
      const logId = await addWorkLog({
        projectId: leftover.projectId,
        devItemId: leftover.devItemId,
        startedAt: leftover.startedAt,
        minutes: value,
        note: '补记：关闭浏览器时计时没有结束',
      })
      await discard()
      setAnsweredAt(leftover.startedAt)
      toast.show({
        message: `已补记 ${formatMinutes(value)}工时`,
        tone: 'success',
        actionLabel: '撤销',
        onAction: async () => {
          // 撤销＝删掉刚补的那条工时，并把计时原样放回去重新选
          await deleteWorkLog(logId)
          await updateSettings({ activeTimer: leftover })
          setAnsweredAt(null)
        },
      })
    } finally {
      setSaving(false)
    }
  }

  async function throwAway() {
    if (!leftover) return
    await discard()
    setAnsweredAt(leftover.startedAt)
    toast.show({ message: '这段计时已丢弃' })
  }

  return (
    <Modal
      open={Boolean(leftover)}
      title="有一段计时没结束"
      onClose={keepGoing}
      closeOnBackdrop={false}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => void throwAway()}>
            丢弃这段
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={keepGoing}>
            继续计时
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void saveLeftover()}
          >
            {saving ? '保存中…' : '补记成工时'}
          </button>
        </>
      }
    >
      {leftover ? (
        <div className={s.body}>
          <p>
            <strong>{leftover.label}</strong> · 从 {formatDateTime(leftover.startedAt)} 开始，
            到现在已经 {formatMinutes(defaultMinutes)}。
          </p>
          <p className="muted">
            大概是关浏览器时忘了停。这一段到底算不算工作，只有你自己知道——
            所以不替你决定。
          </p>
          <label className={s.field}>
            <span className={s.label}>补记多少分钟</span>
            <div className={s.inputRow}>
              <input
                className="input num"
                type="number"
                min={1}
                step={5}
                value={minutes}
                placeholder={String(defaultMinutes)}
                onChange={(e) => setMinutes(e.target.value)}
              />
              <span className={s.unit}>分钟</span>
            </div>
          </label>
          <p className={s.hint}>
            留空就按实际走过的时间记（{defaultMinutes} 分钟）。补记的记录会写进这个项目的工时里。
          </p>
        </div>
      ) : null}
    </Modal>
  )
}
