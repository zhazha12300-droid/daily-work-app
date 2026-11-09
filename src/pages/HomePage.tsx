import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Card from '../components/Card'
import BackupReminder from '../components/BackupReminder'
import CarryoverBanner from '../components/CarryoverBanner'
import ProgressBar from '../components/ProgressBar'
import TaskRow from '../components/TaskRow'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { Memo } from '../db/types'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatCn, formatShort } from '../lib/date'
import { formatMinutes } from '../lib/format'
import { addMemo, deleteMemo, listMemos, memoToTask, restoreMemo } from '../repo/memos'
import { EMPTY_STATS, getHomeStats } from '../repo/stats'
import { listTasks, patchTask, toggleTask, weekProgress } from '../repo/tasks'
import s from './HomePage.module.css'

function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 23) return '晚上好'
  return '夜深了'
}

interface CardDef {
  key: string
  label: string
  accent: string
  value: string
  hint: string
  path: string
}

const DEFAULT_ORDER = ['media', 'dev', 'consult', 'fitness', 'diet', 'game']

export default function HomePage() {
  const today = useToday()
  const navigate = useNavigate()
  const toast = useToast()
  const undo = useUndo()
  const [draft, setDraft] = useState('')
  const memoInput = useRef<HTMLInputElement | null>(null)

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1

  const tasks = useLiveQuery(() => listTasks(today), [today], [])
  const memos = useLiveQuery(() => listMemos(), [], [] as Memo[])
  const stats = useLiveQuery(() => getHomeStats(today, weekStart), [today, weekStart], EMPTY_STATS)
  const week = useLiveQuery(() => weekProgress(today, weekStart), [today, weekStart], {
    done: 0,
    total: 0,
    start: today,
    end: today,
  })

  const doneCount = tasks.filter((t) => t.done === 1).length
  const visibleMemos = memos.filter((m) => m.processedAt === null).slice(0, 6)

  const defs: Record<string, CardDef> = {
    media: {
      key: 'media',
      label: '自媒体',
      accent: 'var(--c-media)',
      value: `${stats.mediaWeek} 篇`,
      hint: '本周已发布',
      path: '/media',
    },
    dev: {
      key: 'dev',
      label: '开发工作',
      accent: 'var(--c-dev)',
      value: `${stats.devDoing} 项`,
      hint: '进行中',
      path: '/dev',
    },
    consult: {
      key: 'consult',
      label: '咨询工作',
      accent: 'var(--c-consult)',
      value: `${stats.consultToday} 场`,
      hint: '今天',
      path: '/consult',
    },
    fitness: {
      key: 'fitness',
      label: '健身计划',
      accent: 'var(--c-fitness)',
      value: stats.fitnessToday > 0 ? '已练' : '未练',
      hint: '今天',
      path: '/fitness',
    },
    diet: {
      key: 'diet',
      label: '饮食计划',
      accent: 'var(--c-diet)',
      value: `${Math.round(stats.dietKcal)}`,
      hint: 'kcal 今日',
      path: '/diet',
    },
    game: {
      key: 'game',
      label: '游戏娱乐',
      accent: 'var(--c-game)',
      value: formatMinutes(stats.gameMinutes),
      hint: '本周',
      path: '/game',
    },
  }

  const configured = settings?.homeCards ?? []
  const orderedKeys =
    configured.length > 0
      ? [...configured].sort((a, b) => a.order - b.order).filter((c) => c.visible === 1).map((c) => c.key)
      : DEFAULT_ORDER

  async function handleMemoAdd() {
    const text = draft.trim()
    if (!text) return
    await addMemo(text)
    setDraft('')
    memoInput.current?.focus()
  }

  async function handleMemoToTask(memo: Memo) {
    await memoToTask(memo.id, today)
    toast.show({ message: '已转成今日任务', tone: 'success' })
  }

  async function handleMemoDelete(memo: Memo) {
    await deleteMemo(memo.id)
    undo('已删除 1 条备忘', () => restoreMemo(memo.id))
  }

  return (
    <div className="page">
      <header className={s.hero}>
        <div>
          <h1 className={s.hello}>{greeting(new Date())}</h1>
          <p className={s.date}>
            {formatCn(today)} · 本周完成率{' '}
            <span className="num">
              {week.total > 0 ? Math.round((week.done / week.total) * 100) : 0}%
            </span>
            <span className={s.weekRange}>
              （{formatShort(week.start)}–{formatShort(week.end)}）
            </span>
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => memoInput.current?.focus()}
          title="也可以按 Ctrl/⌘+K 全局唤起"
        >
          记一笔
        </button>
      </header>

      <BackupReminder />
      <CarryoverBanner today={today} />

      <div className={s.topRow}>
        <Card
          title="今日计划"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/today')}>
              全部 →
            </button>
          }
        >
          <ProgressBar done={doneCount} total={tasks.length} color="var(--c-today)" />
          <div className={s.taskList}>
            {tasks.length === 0 ? (
              <p className={s.emptyHint}>今天还没有任务。去「今日计划」加一条，或按 Ctrl/⌘+K 直接记。</p>
            ) : (
              <ul className={s.tasks}>
                {tasks.slice(0, 5).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    compact
                    onToggle={(done) => void toggleTask(task.id, done)}
                    onPatch={(patch) => patchTask(task.id, patch)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card title="快速备忘">
          <div className={s.memoAdd}>
            <input
              ref={memoInput}
              className="input"
              value={draft}
              placeholder="想到什么先记下来，回车保存"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleMemoAdd()
                }
              }}
            />
          </div>
          {visibleMemos.length === 0 ? (
            <p className={s.emptyHint}>还没有备忘。</p>
          ) : (
            <ul className={s.memos}>
              {visibleMemos.map((memo) => (
                <li key={memo.id} className={s.memo}>
                  <span className={s.memoText}>{memo.text}</span>
                  <span className={s.memoActions}>
                    <button
                      type="button"
                      className={s.memoBtn}
                      onClick={() => void handleMemoToTask(memo)}
                    >
                      → 今日
                    </button>
                    <button
                      type="button"
                      className={s.memoBtn}
                      onClick={() => void handleMemoDelete(memo)}
                    >
                      删除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className={s.cards}>
        {orderedKeys.map((key) => {
          const def = defs[key]
          if (!def) return null
          return (
            <button
              key={key}
              type="button"
              className={s.card}
              onClick={() => navigate(def.path)}
              style={{ ['--card-accent' as string]: def.accent }}
            >
              <span className={s.cardLabel}>
                <i className={s.cardDot} aria-hidden />
                {def.label}
              </span>
              <span className={s.cardValue}>{def.value}</span>
              <span className={s.cardHint}>{def.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
