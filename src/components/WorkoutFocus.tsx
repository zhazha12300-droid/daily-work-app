import { useEffect, useMemo, useState } from 'react'
import type { FitTemplate, ISODate, SessionExercise } from '../db/types'
import { formatClock, formatMinutes } from '../lib/format'
import { sessionFromTemplate } from '../repo/fitness'
import Modal from './Modal'
import s from './WorkoutFocus.module.css'

interface WorkoutFocusProps {
  open: boolean
  template: FitTemplate | null
  date: ISODate
  onClose: () => void
  onSave: (exercises: SessionExercise[], durationMin: number, note: string) => Promise<void>
}

/**
 * 训练专注模式：一次只显示一个动作的一组，完成就往下走。
 * 空格或点击都能完成一组；中途退出会让你选「保存已完成 / 放弃」。
 */
export default function WorkoutFocus({ open, template, date, onClose, onSave }: WorkoutFocusProps) {
  const [exercises, setExercises] = useState<SessionExercise[]>([])
  const [exIndex, setExIndex] = useState(0)
  const [setIndex, setSetIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [confirmExit, setConfirmExit] = useState(false)
  const [note, setNote] = useState('')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [now, setNow] = useState(Date.now())

  const templateId = template?.id ?? ''

  useEffect(() => {
    if (!open || !template) return
    setExercises(sessionFromTemplate(template))
    setExIndex(0)
    setSetIndex(0)
    setStartedAt(Date.now())
    setNow(Date.now())
    setConfirmExit(false)
    setNote('')
    // 只在打开或换模板时重置，避免每次数据刷新把训练进度冲掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, templateId])

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])

  const current = exercises[exIndex]
  const currentSet = current?.sets[setIndex]

  useEffect(() => {
    if (!currentSet) return
    setReps(currentSet.targetReps ? String(currentSet.targetReps) : '')
    setWeight(currentSet.targetWeight != null ? String(currentSet.targetWeight) : '')
  }, [exIndex, setIndex, currentSet])

  const totals = useMemo(() => {
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
    const doneSets = exercises.reduce(
      (sum, ex) => sum + ex.sets.filter((st) => st.done === 1).length,
      0,
    )
    return { totalSets, doneSets }
  }, [exercises])

  const finished = exIndex >= exercises.length
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0

  function advance(next: SessionExercise[]) {
    const ex = next[exIndex]
    if (!ex) return
    if (setIndex + 1 < ex.sets.length) {
      setSetIndex(setIndex + 1)
      return
    }
    let idx = exIndex + 1
    while (idx < next.length && next[idx].skipped === 1) idx += 1
    setExIndex(idx)
    setSetIndex(0)
  }

  function completeSet() {
    if (finished || !current) return
    const next = exercises.map((ex, i) =>
      i !== exIndex
        ? ex
        : {
            ...ex,
            sets: ex.sets.map((st, j) =>
              j !== setIndex
                ? st
                : {
                    ...st,
                    done: 1 as const,
                    actualReps: Number(reps) || st.targetReps,
                    actualWeight: weight.trim() === '' ? null : Number(weight),
                  },
            ),
          },
    )
    setExercises(next)
    advance(next)
  }

  function addSet() {
    if (!current) return
    const next = exercises.map((ex, i) =>
      i !== exIndex
        ? ex
        : {
            ...ex,
            sets: [
              ...ex.sets,
              {
                targetReps: current.sets[current.sets.length - 1]?.targetReps ?? 8,
                targetWeight: current.sets[current.sets.length - 1]?.targetWeight ?? null,
                actualReps: null,
                actualWeight: null,
                done: 0 as const,
              },
            ],
          },
    )
    setExercises(next)
  }

  function skipExercise() {
    if (finished) return
    const next = exercises.map((ex, i) => (i !== exIndex ? ex : { ...ex, skipped: 1 as const }))
    setExercises(next)
    let idx = exIndex + 1
    while (idx < next.length && next[idx].skipped === 1) idx += 1
    setExIndex(idx)
    setSetIndex(0)
  }

  async function finish() {
    const durationMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : 0
    await onSave(exercises, durationMin, note)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing =
        !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      if (e.code === 'Space') {
        e.preventDefault()
        completeSet()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (totals.doneSets > 0) setConfirmExit(true)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercises, exIndex, setIndex, reps, weight, totals.doneSets])

  if (!open) return null

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label="训练专注模式">
      <header className={s.head}>
        <span className={s.date}>{date}</span>
        <span className={s.timer}>{formatClock(elapsed)}</span>
        <button
          type="button"
          className={s.close}
          onClick={() => (totals.doneSets > 0 ? setConfirmExit(true) : onClose())}
        >
          结束
        </button>
      </header>

      <div className={s.progressLine}>
        <div className={s.progressTrack}>
          <div
            className={s.progressBar}
            style={{ width: `${totals.totalSets ? (totals.doneSets / totals.totalSets) * 100 : 0}%` }}
          />
        </div>
        <span className={s.progressText}>
          {totals.doneSets}/{totals.totalSets} 组
        </span>
      </div>

      {finished ? (
        <div className={s.done}>
          <h2 className={s.doneTitle}>练完了</h2>
          <p className={s.doneHint}>
            共完成 {totals.doneSets} 组，用时 {formatMinutes(elapsed / 60)}
          </p>
          <input
            className={s.noteInput}
            value={note}
            placeholder="今天感觉怎么样？（可选）"
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn btn-primary" onClick={() => void finish()}>
            保存这次训练
          </button>
        </div>
      ) : current ? (
        <div className={s.stage}>
          <p className={s.exIndex}>
            动作 {exIndex + 1} / {exercises.length}
          </p>
          <h2 className={s.exName}>{current.name}</h2>
          <p className={s.setIndex}>
            第 {setIndex + 1} 组 / 共 {current.sets.length} 组
          </p>

          <div className={s.inputs}>
            <label className={s.inputBox}>
              <span>次数</span>
              <input
                value={reps}
                inputMode="numeric"
                onChange={(e) => setReps(e.target.value)}
              />
            </label>
            <label className={s.inputBox}>
              <span>重量 kg</span>
              <input
                value={weight}
                inputMode="decimal"
                placeholder="自重可留空"
                onChange={(e) => setWeight(e.target.value)}
              />
            </label>
          </div>

          <button type="button" className={s.completeBtn} onClick={completeSet}>
            完成这一组
            <kbd className={s.kbd}>空格</kbd>
          </button>

          <div className={s.secondary}>
            <button type="button" className="btn btn-ghost" onClick={addSet}>
              加一组
            </button>
            <button type="button" className="btn btn-ghost" onClick={skipExercise}>
              跳过这个动作
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void finish()}>
              直接结束
            </button>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmExit}
        title="结束训练？"
        onClose={() => setConfirmExit(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>
              放弃本次
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void finish()}>
              保存已完成的 {totals.doneSets} 组
            </button>
          </>
        }
      >
        <p>还有 {totals.totalSets - totals.doneSets} 组没做。放弃的话这次记录不会保存。</p>
      </Modal>
    </div>
  )
}
