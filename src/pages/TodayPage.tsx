import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import Card from '../components/Card'
import CarryoverBanner from '../components/CarryoverBanner'
import DateStepper from '../components/DateStepper'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import ProgressBar from '../components/ProgressBar'
import TaskRow from '../components/TaskRow'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { Task } from '../db/types'
import { useDateRoute } from '../hooks/useDateRoute'
import { useUndo } from '../hooks/useUndo'
import { formatShort } from '../lib/date'
import {
  MAX_FOCUS,
  addTask,
  deleteTask,
  focusTask,
  listTasks,
  patchTask,
  restoreTask,
  toggleTask,
  unfocusTask,
  weekProgress,
} from '../repo/tasks'
import s from './TodayPage.module.css'

export default function TodayPage() {
  const { date, today, goPrev, goNext, goToday } = useDateRoute()
  const toast = useToast()
  const undo = useUndo()
  const [draft, setDraft] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1

  const tasks = useLiveQuery(() => listTasks(date), [date], [] as Task[])
  const week = useLiveQuery(() => weekProgress(today, weekStart), [today, weekStart], {
    done: 0,
    total: 0,
    start: today,
    end: today,
  })

  const doneCount = tasks.filter((t) => t.done === 1).length
  const visible = hideDone ? tasks.filter((t) => t.done === 0) : tasks
  const focusTasks = visible.filter((t) => t.focus === 1)
  const otherTasks = visible.filter((t) => t.focus !== 1)

  async function handleAdd() {
    const title = draft.trim()
    if (!title) return
    await addTask({ date, title })
    setDraft('')
    inputRef.current?.focus()
  }

  async function handleDelete(task: Task) {
    await deleteTask(task.id)
    undo('已删除 1 项任务', () => restoreTask(task.id))
  }

  async function handleFocus(task: Task) {
    if (task.focus === 1) {
      await unfocusTask(task.id)
      return
    }
    const ok = await focusTask(task.id)
    if (!ok) toast.show({ message: `今日重点最多 ${MAX_FOCUS} 项，先取消一个`, tone: 'error' })
  }

  function row(task: Task) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        onToggle={(done) => void toggleTask(task.id, done)}
        onPatch={(patch) => patchTask(task.id, patch)}
        onFocusToggle={() => void handleFocus(task)}
        onDelete={() => void handleDelete(task)}
        accent="var(--c-today)"
      />
    )
  }

  return (
    <div className="page">
      <PageHeader
        title="今日计划"
        sub={
          date === today
            ? `今天 · ${tasks.length} 项任务`
            : `正在查看 ${formatShort(date)}，不是今天`
        }
        actions={
          <DateStepper
            date={date}
            today={today}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
        }
      />

      <CarryoverBanner today={today} />

      <Card>
        <div className={s.statsRow}>
          <div className={s.statBlock}>
            <span className={s.statLabel}>今天</span>
            <ProgressBar done={doneCount} total={tasks.length} color="var(--c-today)" />
          </div>
          <div className={s.statDivider} aria-hidden />
          <div className={s.statBlock}>
            <span className={s.statLabel}>
              本周（{formatShort(week.start)}–{formatShort(week.end)}）
            </span>
            <ProgressBar done={week.done} total={week.total} color="var(--c-dev)" />
          </div>
        </div>
      </Card>

      {focusTasks.length > 0 ? (
        <Card
          title={`今日重点 ${focusTasks.length}/${MAX_FOCUS}`}
          flush
          className={s.focusCard}
        >
          <ul className={s.list}>{focusTasks.map(row)}</ul>
        </Card>
      ) : null}

      <Card
        title="其他任务"
        actions={
          doneCount > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setHideDone((v) => !v)}>
              {hideDone ? `显示已完成 ${doneCount}` : `隐藏已完成 ${doneCount}`}
            </button>
          ) : null
        }
        flush
      >
        <div className={s.addRow}>
          <input
            ref={inputRef}
            className="input"
            value={draft}
            placeholder="添加任务，回车保存（连续录入不用碰鼠标）"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAdd()
              }
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleAdd()}
            disabled={!draft.trim()}
          >
            添加
          </button>
        </div>

        {otherTasks.length === 0 && focusTasks.length === 0 ? (
          <EmptyState
            title={date === today ? '今天还没有任务' : '这一天没有任务'}
            hint="先写下第一件要做的事。任务会立刻存进本机数据库，刷新、关浏览器都还在。"
          />
        ) : otherTasks.length === 0 ? (
          <EmptyState title="其余都清空了" hint="今天的重点都列在上面了。" />
        ) : (
          <ul className={s.list}>{otherTasks.map(row)}</ul>
        )}
      </Card>

      <p className={s.footerHint}>
        勾选完成的任务会原地变灰、不会跳走；点行尾 ⌄ 可以填备注、优先级和预计耗时。
      </p>
    </div>
  )
}
