import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import MiniBars from '../components/MiniBars'
import PageHeader from '../components/PageHeader'
import RowMenu from '../components/RowMenu'
import { useToast } from '../components/Toast'
import WorkoutFocus from '../components/WorkoutFocus'
import { db } from '../db'
import type { SessionExercise, TemplateExercise, WorkoutSession } from '../db/types'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatCn, formatShort, weekRange } from '../lib/date'
import { formatMinutes, formatRelative } from '../lib/format'
import {
  WEEKDAY_LABEL,
  addSession,
  deleteMetric,
  deleteSession,
  ensureTemplates,
  exercisePRs,
  knownExercises,
  listMetrics,
  listSessions,
  listTemplates,
  patchTemplate,
  sessionsThisWeekCount,
  setTemplateExercises,
  upsertMetric,
  weekdayOf,
  type Weekday,
} from '../repo/fitness'
import s from './FitnessPage.module.css'

export default function FitnessPage() {
  const today = useToday()
  const toast = useToast()
  const undo = useUndo()
  const [tab, setTab] = useState<'plan' | 'history' | 'body'>('plan')
  const [editDay, setEditDay] = useState<Weekday | null>(weekdayOf(today))
  const [draftState, setDraftState] = useState<TemplateExercise[] | null>(null)
  const [focusOpen, setFocusOpen] = useState(false)

  const [metricDate, setMetricDate] = useState(today)
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')

  // 首次进入时把 7 天模板补全（在 effect 里写库，避免触发 liveQuery 的只读事务报错）。
  useEffect(() => {
    void ensureTemplates()
  }, [])

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1
  const week = weekRange(today, weekStart)

  const templates = useLiveQuery(() => listTemplates(), [], [])
  const sessions = useLiveQuery(() => listSessions(20), [], [] as WorkoutSession[])
  const prs = useLiveQuery(() => exercisePRs(), [], {} as Record<string, number>)
  const metrics = useLiveQuery(() => listMetrics(30), [], [])
  const known = useLiveQuery(() => knownExercises(), [], [] as string[])
  const weekCount = useLiveQuery(
    () => sessionsThisWeekCount(week.start, week.end),
    [week.start, week.end],
    0,
  )

  const todayTemplate = templates.find((t) => t.weekday === weekdayOf(today)) ?? null
  const editing = templates.find((t) => t.weekday === editDay) ?? null

  // 草稿为 null 时直接读库里的模板：这样还没输入前永远是最新的，
  // 输入后草稿接管，避免一边打字一边被实时查询冲掉。
  const draft: TemplateExercise[] = draftState ?? editing?.exercises ?? []

  function commitDraft(next: TemplateExercise[]) {
    setDraftState(next)
    if (editDay) void setTemplateExercises(editDay, next)
  }

  function chooseDay(day: Weekday | null) {
    setEditDay(day)
    setDraftState(null)
  }

  async function handleSaveSession(exercises: SessionExercise[], durationMin: number, note: string) {
    const done = exercises.filter((ex) => ex.sets.some((st) => st.done === 1))
    setFocusOpen(false)
    if (done.length === 0) {
      toast.show({ message: '这次没有完成的组，没有保存' })
      return
    }
    await addSession({
      date: today,
      templateId: todayTemplate?.id ?? null,
      templateName: todayTemplate?.name || '训练',
      exercises: done,
      note,
      durationMin,
    })
    setTab('history')
    toast.show({ message: '训练已保存', tone: 'success' })
  }

  async function handleMetricSave() {
    const w = weight.trim() === '' ? null : Number(weight)
    const r = waist.trim() === '' ? null : Number(waist)
    if (w === null && r === null) {
      toast.show({ message: '体重和腰围至少填一个', tone: 'error' })
      return
    }
    await upsertMetric({ date: metricDate, weight: w, waist: r })
    setWeight('')
    setWaist('')
    toast.show({ message: '已记录', tone: 'success' })
  }

  const weightSeries = [...metrics]
    .filter((m) => typeof m.weight === 'number')
    .slice(0, 14)
    .reverse()
    .map((m) => ({ label: formatShort(m.date), value: m.weight ?? 0 }))

  return (
    <div className="page">
      <PageHeader
        title="健身计划"
        sub={`本周 ${weekCount} 次 · 今天 ${
          todayTemplate?.isRest === 0 && todayTemplate.exercises.length > 0
            ? todayTemplate.name || '安排好了'
            : '休息'
        }`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!todayTemplate || todayTemplate.isRest === 1 || todayTemplate.exercises.length === 0}
            onClick={() => setFocusOpen(true)}
          >
            开始训练
          </button>
        }
      />

      <Card>
        <div className={s.todayRow}>
          <div>
            <p className={s.todayLabel}>今天该练</p>
            <p className={s.todayValue}>
              {todayTemplate && todayTemplate.isRest === 0 && todayTemplate.exercises.length > 0
                ? `${todayTemplate.name || WEEKDAY_LABEL[todayTemplate.weekday]} · ${todayTemplate.exercises.length} 个动作`
                : '今天休息'}
            </p>
          </div>
          <span className={s.todayHint}>
            {weekCount} 次 / 本周（{formatShort(week.start)}–{formatShort(week.end)}）
          </span>
        </div>
      </Card>

      <div className={s.tabs} role="tablist">
        {(
          [
            ['plan', '一周计划'],
            ['history', '训练历史'],
            ['body', '身体数据'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={[s.tab, tab === key ? s.tabOn : ''].join(' ')}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'plan' ? (
        <>
          <div className={s.grid}>
            {templates.map((tpl) => (
              <button
                key={tpl.weekday}
                type="button"
                className={[
                  s.day,
                  editDay === tpl.weekday ? s.dayOn : '',
                  tpl.weekday === weekdayOf(today) ? s.dayToday : '',
                  tpl.isRest === 1 || tpl.exercises.length === 0 ? s.dayRest : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => chooseDay(tpl.weekday)}
              >
                <span className={s.dayName}>{WEEKDAY_LABEL[tpl.weekday]}</span>
                <span className={s.dayMain}>
                  {tpl.isRest === 1 || tpl.exercises.length === 0
                    ? '休息'
                    : tpl.name || `${tpl.exercises.length} 个动作`}
                </span>
                <span className={s.dayMeta}>
                  {tpl.exercises.length > 0 ? `${tpl.exercises.length} 个动作` : '—'}
                </span>
              </button>
            ))}
          </div>

          {editing ? (
            <Card
              title={`${WEEKDAY_LABEL[editing.weekday]} 的安排`}
              actions={
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    void patchTemplate(editing.weekday, {
                      isRest: editing.isRest === 1 ? 0 : 1,
                    })
                  }
                >
                  {editing.isRest === 1 ? '改为训练日' : '改为休息日'}
                </button>
              }
            >
              <div className={s.editorHead}>
                <input
                  className="input"
                  defaultValue={editing.name}
                  placeholder="这一天练什么（如：胸 + 三头）"
                  onBlur={(e) => void patchTemplate(editing.weekday, { name: e.target.value })}
                />
              </div>

              {draft.length === 0 ? (
                <EmptyState title="还没有动作" hint="加几个动作，比如「卧推 4 组 × 8 次 × 60kg」。" />
              ) : (
                <ul className={s.exList}>
                  {draft.map((ex, i) => (
                    <li key={i} className={s.exRow}>
                      <input
                        className={`input ${s.exName}`}
                        value={ex.name}
                        list="known-exercises"
                        placeholder="动作名"
                        onChange={(e) =>
                          commitDraft(
                            draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                      />
                      <input
                        className={s.exNum}
                        type="number"
                        min={1}
                        value={ex.sets}
                        title="组数"
                        onChange={(e) =>
                          commitDraft(
                            draft.map((x, j) =>
                              j === i ? { ...x, sets: Number(e.target.value) || 1 } : x,
                            ),
                          )
                        }
                      />
                      <span className={s.exUnit}>组</span>
                      <input
                        className={s.exNum}
                        type="number"
                        min={1}
                        value={ex.reps}
                        title="次数"
                        onChange={(e) =>
                          commitDraft(
                            draft.map((x, j) =>
                              j === i ? { ...x, reps: Number(e.target.value) || 1 } : x,
                            ),
                          )
                        }
                      />
                      <span className={s.exUnit}>次</span>
                      <input
                        className={s.exNum}
                        type="number"
                        min={0}
                        value={ex.weight ?? ''}
                        placeholder="—"
                        title="目标重量"
                        onChange={(e) =>
                          commitDraft(
                            draft.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    weight:
                                      e.target.value.trim() === '' ? null : Number(e.target.value),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <span className={s.exUnit}>kg</span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => commitDraft(draft.filter((_, j) => j !== i))}
                      >
                        删除
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <datalist id="known-exercises">
                {known.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              <button
                type="button"
                className="btn"
                onClick={() => commitDraft([...draft, { name: '', sets: 3, reps: 8, weight: null }])}
              >
                ＋ 添加动作
              </button>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'history' ? (
        <>
          {Object.keys(prs).length > 0 ? (
            <Card title="最好重量（PR）">
              <div className={s.prList}>
                {Object.entries(prs)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([name, kg]) => (
                    <span key={name} className={s.prItem}>
                      {name}
                      <b className="num">{kg}</b>kg
                    </span>
                  ))}
              </div>
            </Card>
          ) : null}

          <Card title="训练历史" flush>
            {sessions.length === 0 ? (
              <EmptyState
                title="还没有训练记录"
                hint="在「一周计划」里排好动作，然后回顶部点「开始训练」。"
              />
            ) : (
              <ul className={s.history}>
                {sessions.map((session) => (
                  <li key={session.id} className={s.session}>
                    <div className={s.sessionHead}>
                      <span className={s.sessionDate}>{formatCn(session.date)}</span>
                      <span className={s.sessionName}>{session.templateName}</span>
                      <span className={s.sessionMeta}>
                        {session.durationMin ? formatMinutes(session.durationMin) : ''}
                      </span>
                      <RowMenu
                        items={[
                          {
                            label: '删除这次记录',
                            danger: true,
                            onSelect: async () => {
                              await deleteSession(session.id)
                              undo('已删除训练记录', async () => {
                                await db.workoutSessions.update(session.id, {
                                  deletedAt: null,
                                  updatedAt: Date.now(),
                                })
                              })
                            },
                          },
                        ]}
                      />
                    </div>
                    <div className={s.exLines}>
                      {session.exercises.map((ex, i) => {
                        const best = ex.sets.reduce(
                          (max, st) => Math.max(max, st.actualWeight ?? 0),
                          0,
                        )
                        return (
                          <span key={i} className={s.exLine}>
                            {ex.name}
                            <span className={s.exDetail}>
                              {ex.sets.filter((st) => st.done === 1).length} 组
                              {best > 0 ? ` · ${best}kg` : ''}
                              {best > 0 && prs[ex.name] === best ? (
                                <b className={s.prStar}>PR</b>
                              ) : null}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                    {session.note ? <p className={s.sessionNote}>{session.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      {tab === 'body' ? (
        <>
          <Card title="记一笔身体数据">
            <div className={s.metricForm}>
              <input
                type="date"
                className="input"
                value={metricDate}
                onChange={(e) => setMetricDate(e.target.value)}
              />
              <input
                className="input"
                value={weight}
                placeholder="体重 kg"
                inputMode="decimal"
                onChange={(e) => setWeight(e.target.value)}
              />
              <input
                className="input"
                value={waist}
                placeholder="腰围 cm"
                inputMode="decimal"
                onChange={(e) => setWaist(e.target.value)}
              />
              <button type="button" className="btn btn-primary" onClick={() => void handleMetricSave()}>
                保存
              </button>
            </div>
          </Card>

          {weightSeries.length > 0 ? (
            <Card title="体重趋势（最近 14 次）">
              <MiniBars data={weightSeries} color="var(--c-fitness)" />
            </Card>
          ) : null}

          <Card title="记录" flush>
            {metrics.length === 0 ? (
              <EmptyState title="还没有身体数据" hint="每天同一时间称一次，趋势才有意义。" />
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>体重</th>
                    <th>腰围</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.id}>
                      <td>{formatShort(m.date)}</td>
                      <td className="num">{m.weight ?? '—'}</td>
                      <td className="num">{m.waist ?? '—'}</td>
                      <td className={s.rowAction}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={async () => {
                            await deleteMetric(m.id)
                            toast.show({ message: '已删除（这条与饮食共享）' })
                          }}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {metrics.length === 0 ? (
            <p className={s.footHint}>这份身体数据是唯一的，饮食板块读的是同一份。</p>
          ) : (
            <p className={s.footHint}>
              最后更新：{formatRelative(metrics[0]?.updatedAt ?? Date.now())} · 饮食板块读的是同一份数据
            </p>
          )}
        </>
      ) : null}

      <WorkoutFocus
        open={focusOpen}
        template={todayTemplate}
        date={today}
        onClose={() => setFocusOpen(false)}
        onSave={handleSaveSession}
      />
    </div>
  )
}
