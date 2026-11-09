import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import RowMenu from '../components/RowMenu'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { ISODate, MediaItem, MediaRating, MediaStatus } from '../db/types'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatShort, shiftDate, weekRange } from '../lib/date'
import {
  MEDIA_STATUS,
  NEXT_STATUS,
  RATING_LABEL,
  RATING_OPTIONS,
  STATUS_LABEL,
  addMedia,
  advanceMedia,
  deleteMedia,
  listMedia,
  mediaMonthlyTrend,
  mediaStats,
  overdueDays,
  patchMedia,
  restoreMedia,
} from '../repo/media'
import type { MediaMonthPoint, MediaStats } from '../repo/media'
import s from './MediaPage.module.css'

const EMPTY_STATS: MediaStats = { publishedThisMonth: 0, platforms: [], top: [] }

/** 每个状态分组先渲染这么多行，剩下的点「加载更多」——选题攒到几百条时页面也不会卡 */
const ROWS_PAGE = 50

export default function MediaPage() {
  const today = useToday()
  const toast = useToast()
  const undo = useUndo()

  const [view, setView] = useState<'list' | 'schedule' | 'stats'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [rowsLimit, setRowsLimit] = useState<Record<string, number>>({})
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')

  const items = useLiveQuery(() => listMedia(), [], [] as MediaItem[])
  const monthPrefix = today.slice(0, 7)
  const stats = useLiveQuery(() => mediaStats(monthPrefix), [monthPrefix], EMPTY_STATS)
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1
  const platforms = settings?.platforms ?? []

  const selected = items.find((i) => i.id === selectedId) ?? null
  const overdue = useMemo(
    () => items.filter((i) => overdueDays(i, today) > 0),
    [items, today],
  )

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const id = await addMedia({ title: trimmed, platform: platform.trim() })
      setTitle('')
      setPlatform('')
      setSelectedId(id)
      toast.show({ message: '已记到「想法」', tone: 'success' })
    } catch (err) {
      toast.show({
        message: `添加失败：${(err as Error).message || '未知错误'}`,
        tone: 'error',
        timeout: 0,
      })
    }
  }

  async function handleAdvance(item: MediaItem) {
    const next = await advanceMedia(item.id)
    if (!next) return
    if (next === 'published') {
      toast.show({ message: '已标记发布，别忘回填数据', tone: 'success' })
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="自媒体"
        sub={`${STATUS_LABEL.published} ${stats.publishedThisMonth} 条（本月）`}
        actions={
          <div className={s.seg}>
            <button
              type="button"
              className={[s.segBtn, view === 'list' ? s.segOn : ''].filter(Boolean).join(' ')}
              onClick={() => setView('list')}
            >
              选题列表
            </button>
            <button
              type="button"
              className={[s.segBtn, view === 'schedule' ? s.segOn : ''].filter(Boolean).join(' ')}
              onClick={() => setView('schedule')}
            >
              发布排期
              {overdue.length > 0 ? <span className={s.segDot}>{overdue.length}</span> : null}
            </button>
            <button
              type="button"
              className={[s.segBtn, view === 'stats' ? s.segOn : ''].filter(Boolean).join(' ')}
              onClick={() => setView('stats')}
            >
              数据图表
            </button>
          </div>
        }
      />

      <Card className={s.statsCard}>
        <div className={s.statRow}>
          <div className={s.statBlock}>
            <p className={s.statLabel}>本月发布</p>
            <p className={s.statValue}>
              <b className="num">{stats.publishedThisMonth}</b>
              <span className={s.statUnit}>条</span>
            </p>
          </div>

          <div className={s.statBlock}>
            <p className={s.statLabel}>平台占比</p>
            {stats.platforms.length === 0 ? (
              <p className={s.statMuted}>本月还没发布</p>
            ) : (
              <div className={s.platformBars}>
                {stats.platforms.map((p) => {
                  const total = stats.platforms.reduce((sum, x) => sum + x.count, 0)
                  const pct = Math.round((p.count / total) * 100)
                  return (
                    <div key={p.platform} className={s.platformBarRow}>
                      <span className={s.platformName}>{p.platform}</span>
                      <span className={s.platformTrack}>
                        <span className={s.platformFill} style={{ width: `${pct}%` }} />
                      </span>
                      <span className={s.platformCount}>
                        {p.count} · {pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className={s.statBlock}>
            <p className={s.statLabel}>表现最好</p>
            {stats.top.length === 0 ? (
              <p className={s.statMuted}>回填阅读数后出现</p>
            ) : (
              <ol className={s.topList}>
                {stats.top.map((item, i) => (
                  <li key={item.id}>
                    <span className={s.topRank}>{i + 1}</span>
                    <button type="button" className={s.topTitle} onClick={() => setSelectedId(item.id)}>
                      {item.title}
                    </button>
                    <span className={s.topViews}>{item.views} 阅读</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Card>

      {view === 'list' ? (
        <>
          <div className={s.addBar}>
            <input
              className={`input ${s.addName}`}
              value={title}
              placeholder="冒出一个想法？写下标题，回车存进「想法」"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
            />
            <input
              className={`input ${s.addPlatform}`}
              value={platform}
              list="media-platforms"
              placeholder="平台"
              onChange={(e) => setPlatform(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void handleAdd()}>
              ＋ 新选题
            </button>
            <datalist id="media-platforms">
              {platforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {items.length === 0 ? (
            <Card>
              <EmptyState
                title="还没有选题"
                hint="先把脑子里冒出来的想法记下来（几个字就行），想清楚了再推进成选题、写作中、已发布。"
              />
            </Card>
          ) : null}

          {MEDIA_STATUS.map((status) => {
            const group = items.filter((i) => i.status === status)
            const isCollapsed = collapsed[status] === true
            const limit = rowsLimit[status] ?? ROWS_PAGE
            const shownRows = group.slice(0, limit)
            const hiddenCount = group.length - shownRows.length
            return (
              <Card
                key={status}
                className={s.group}
                title={
                  <button
                    type="button"
                    className={s.groupTitle}
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((c) => ({ ...c, [status]: !isCollapsed }))}
                  >
                    <span className={[s.caret, isCollapsed ? '' : s.caretOpen].join(' ')} aria-hidden>
                      ›
                    </span>
                    {STATUS_LABEL[status]}
                    <span className={s.groupCount}>{group.length}</span>
                  </button>
                }
              >
                {isCollapsed ? null : group.length === 0 ? (
                  <p className={s.groupEmpty}>这里还是空的</p>
                ) : (
                  <ul className={s.rows}>
                    {shownRows.map((item) => {
                      const late = overdueDays(item, today)
                      return (
                        <li
                          key={item.id}
                          className={[s.row, item.id === selectedId ? s.rowOn : ''].filter(Boolean).join(' ')}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <span className={s.rowTitle}>{item.title}</span>
                          {item.platform ? <Badge>{item.platform}</Badge> : null}
                          {late > 0 ? (
                            <span className={s.late}>逾期 {late} 天</span>
                          ) : item.planDate ? (
                            <span className={s.planDate}>计划 {formatShort(item.planDate)}</span>
                          ) : null}
                          {item.status === 'published' && item.views !== null ? (
                            <span className={s.viewsNum}>{item.views} 阅读</span>
                          ) : null}
                          <span className={s.rowTools} onClick={(e) => e.stopPropagation()}>
                            {NEXT_STATUS[item.status] ? (
                              <button
                                type="button"
                                className={s.advance}
                                title={`推进到「${STATUS_LABEL[NEXT_STATUS[item.status]!]}」`}
                                onClick={() => void handleAdvance(item)}
                              >
                                →
                              </button>
                            ) : (
                              <span className={s.doneMark}>已发</span>
                            )}
                            <RowMenu
                              items={[
                                {
                                  label: '删除',
                                  danger: true,
                                  onSelect: () => {
                                    void deleteMedia(item.id)
                                    if (selectedId === item.id) setSelectedId(null)
                                    undo(`已删除「${item.title}」`, () => restoreMedia(item.id))
                                  },
                                },
                              ]}
                            />
                          </span>
                        </li>
                      )
                    })}
                    {hiddenCount > 0 ? (
                      <li className={s.moreRow}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            setRowsLimit((m) => ({ ...m, [status]: (m[status] ?? ROWS_PAGE) + ROWS_PAGE }))
                          }
                        >
                          还有 {hiddenCount} 条，加载更多
                        </button>
                      </li>
                    ) : null}
                  </ul>
                )}
              </Card>
            )
          })}
        </>
      ) : view === 'stats' ? (
        <MediaChart today={today} />
      ) : (
        <ScheduleView
          items={items}
          today={today}
          weekStart={weekStart}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      )}

      {selected ? (
        <MediaDrawer
          key={selected.id}
          item={selected}
          platforms={platforms}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            const id = selected.id
            const t = selected.title
            setSelectedId(null)
            void deleteMedia(id)
            undo(`已删除「${t}」`, () => restoreMedia(id))
          }}
          onAdvance={() => void handleAdvance(selected)}
        />
      ) : null}
    </div>
  )
}

/* ── 发布数据图表 ───────────────────────────────────────────── */

function MediaChart({ today }: { today: ISODate }) {
  const trend = useLiveQuery(
    () => mediaMonthlyTrend(today, 6),
    [today],
    [] as MediaMonthPoint[],
  )
  const totalPublished = trend.reduce((sum, m) => sum + m.published, 0)
  const totalViews = trend.reduce((sum, m) => sum + m.views, 0)
  const maxViews = Math.max(1, ...trend.map((m) => m.views))
  const perItem = totalPublished > 0 ? Math.round(totalViews / totalPublished) : 0

  return (
    <Card title="近 6 个月发布与浏览">
      {totalPublished === 0 ? (
        <p className={s.chartEmpty}>
          还没有已发布的数据。把选题推进到「已发布」，并在详情里回填阅读数，这里会长出柱状图。
        </p>
      ) : (
        <>
          <div className={s.chartSummary}>
            <span>
              发布 <b className="num">{totalPublished}</b> 条
            </span>
            <span>
              浏览 <b className="num">{totalViews}</b>
            </span>
            <span>
              平均 <b className="num">{perItem}</b> 阅读/条
            </span>
          </div>
          <div className={s.chart} role="img" aria-label="近 6 个月发布与浏览柱状图">
            {trend.map((m) => (
              <div
                key={m.month}
                className={s.chartCol}
                title={`${m.label}：发布 ${m.published} 条 · 浏览 ${m.views}`}
              >
                <span className={s.chartValue}>{m.views > 0 ? m.views : ''}</span>
                <div className={s.chartBarWrap}>
                  <div
                    className={[s.chartBar, m.views === 0 ? s.chartBarZero : ''].filter(Boolean).join(' ')}
                    style={{
                      height: `${m.views === 0 ? 3 : Math.max(8, (m.views / maxViews) * 100)}%`,
                    }}
                  />
                </div>
                <span className={s.chartLabel}>{m.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/* ── 发布排期 ─────────────────────────────────────────────────── */

interface ScheduleProps {
  items: MediaItem[]
  today: ISODate
  weekStart: 0 | 1
  selectedId: string | null
  onSelect: (id: string) => void
}

function ScheduleView({ items, today, weekStart, selectedId, onSelect }: ScheduleProps) {
  const thisWeek = weekRange(today, weekStart)
  const weeks = [-1, 0, 1, 2].map((offset) => {
    const start = shiftDate(thisWeek.start, offset * 7)
    const end = shiftDate(start, 6)
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i))
    const planned = days.map((day) => ({
      day,
      list: items
        .filter((i) => i.planDate === day)
        .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt - b.createdAt)),
    }))
    return { start, end, planned, isThis: offset === 0 }
  })

  const overdue = items
    .filter((i) => overdueDays(i, today) > 0)
    .sort((a, b) => (a.planDate! < b.planDate! ? -1 : 1))

  return (
    <>
      {overdue.length > 0 ? (
        <Card className={s.overdueCard} title={`逾期待发 ${overdue.length}`}>
          <ul className={s.rows}>
            {overdue.map((item) => (
              <li key={item.id} className={s.row} onClick={() => onSelect(item.id)}>
                <span className={s.rowTitle}>{item.title}</span>
                {item.platform ? <Badge>{item.platform}</Badge> : null}
                <span className={s.planDate}>原计划 {formatShort(item.planDate!)}</span>
                <span className={s.late}>已逾期 {overdueDays(item, today)} 天</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {weeks.map((week) => {
        const hasAny = week.planned.some((d) => d.list.length > 0)
        return (
          <Card
            key={week.start}
            title={`${formatShort(week.start)} – ${formatShort(week.end)}${week.isThis ? ' · 本周' : ''}`}
          >
            {hasAny ? (
              <ul className={s.week}>
                {week.planned
                  .filter((d) => d.list.length > 0)
                  .map((d) => (
                    <li key={d.day} className={s.weekDay}>
                      <span className={[s.dayLabel, d.day === today ? s.dayToday : ''].filter(Boolean).join(' ')}>
                        {formatShort(d.day)}
                      </span>
                      <span className={s.dayItems}>
                        {d.list.map((item) => {
                          const late = overdueDays(item, today)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={[
                                s.pill,
                                item.status === 'published' ? s.pillDone : '',
                                late > 0 ? s.pillLate : '',
                                item.id === selectedId ? s.pillOn : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => onSelect(item.id)}
                            >
                              {item.title}
                              {item.platform ? <em>{item.platform}</em> : null}
                              {late > 0 ? <em className={s.pillLateText}>逾期 {late} 天</em> : null}
                            </button>
                          )
                        })}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className={s.groupEmpty}>这周没有排期</p>
            )}
          </Card>
        )
      })}
    </>
  )
}

/* ── 右侧详情抽屉 ─────────────────────────────────────────────── */

interface DrawerProps {
  item: MediaItem
  platforms: string[]
  onClose: () => void
  onDelete: () => void
  onAdvance: () => void
}

function MediaDrawer({ item, platforms, onClose, onDelete, onAdvance }: DrawerProps) {
  const [title, setTitle] = useState(item.title)
  const [platform, setPlatform] = useState(item.platform)
  const [planDate, setPlanDate] = useState(item.planDate ?? '')
  const [publishDate, setPublishDate] = useState(item.publishDate ?? '')
  const [link, setLink] = useState(item.link)
  const [outline, setOutline] = useState(item.outline)
  const [views, setViews] = useState(item.views === null ? '' : String(item.views))
  const [likes, setLikes] = useState(item.likes === null ? '' : String(item.likes))
  const [followers, setFollowers] = useState(item.followers === null ? '' : String(item.followers))
  const [review, setReview] = useState(item.review)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v))
  const commit = (patch: Parameters<typeof patchMedia>[1]) => void patchMedia(item.id, patch)

  return (
    <div className={s.drawerWrap} role="dialog" aria-label="选题详情">
      <div className={s.drawerMask} onClick={onClose} />
      <aside className={s.drawer}>
        <header className={s.drawerHead}>
          <div>
            <span className={s.drawerStatus}>{STATUS_LABEL[item.status]}</span>
            <h2 className={s.drawerTitle}>{item.title || '未命名'}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className={s.drawerBody}>
          <label className={s.field}>
            <span>标题</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => commit({ title: title.trim() || '未命名' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
          </label>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span>平台</span>
              <input
                className="input"
                value={platform}
                list="drawer-platforms"
                onChange={(e) => setPlatform(e.target.value)}
                onBlur={() => commit({ platform: platform.trim() })}
              />
              <datalist id="drawer-platforms">
                {platforms.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className={s.field}>
              <span>计划发布日</span>
              <input
                className="input"
                type="date"
                value={planDate}
                onChange={(e) => {
                  setPlanDate(e.target.value)
                  commit({ planDate: e.target.value || null })
                }}
              />
            </label>
          </div>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span>实际发布日</span>
              <input
                className="input"
                type="date"
                value={publishDate}
                onChange={(e) => {
                  setPublishDate(e.target.value)
                  commit({ publishDate: e.target.value || null })
                }}
              />
            </label>
            <label className={s.field}>
              <span>链接</span>
              <input
                className="input"
                value={link}
                placeholder="https://"
                onChange={(e) => setLink(e.target.value)}
                onBlur={() => commit({ link: link.trim() })}
              />
            </label>
          </div>

          <label className={s.field}>
            <span>大纲 / 备注</span>
            <textarea
              className={`input ${s.textarea}`}
              value={outline}
              placeholder="先写三行：钩子、主体、落点"
              onChange={(e) => setOutline(e.target.value)}
              onBlur={() => commit({ outline })}
            />
          </label>

          <div className={s.section}>
            <p className={s.sectionTitle}>数据回填</p>
            <div className={s.fieldRow}>
              <label className={s.field}>
                <span>阅读</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={views}
                  onChange={(e) => setViews(e.target.value)}
                  onBlur={() => commit({ views: num(views) })}
                />
              </label>
              <label className={s.field}>
                <span>点赞</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  onBlur={() => commit({ likes: num(likes) })}
                />
              </label>
              <label className={s.field}>
                <span>新增粉丝</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={followers}
                  onChange={(e) => setFollowers(e.target.value)}
                  onBlur={() => commit({ followers: num(followers) })}
                />
              </label>
            </div>
          </div>

          <div className={s.section}>
            <p className={s.sectionTitle}>复盘</p>
            <div className={s.ratings}>
              {RATING_OPTIONS.map((r: Exclude<MediaRating, null>) => (
                <button
                  key={r}
                  type="button"
                  className={[s.ratingBtn, item.rating === r ? s.ratingOn : ''].filter(Boolean).join(' ')}
                  onClick={() => commit({ rating: item.rating === r ? null : r })}
                >
                  {RATING_LABEL[r]}
                </button>
              ))}
            </div>
            <textarea
              className={`input ${s.textarea}`}
              value={review}
              placeholder="一句话：这次哪里好，下次改什么"
              onChange={(e) => setReview(e.target.value)}
              onBlur={() => commit({ review })}
            />
          </div>

          <label className={s.field}>
            <span>状态</span>
            <select
              className="input"
              value={item.status}
              onChange={(e) => commit({ status: e.target.value as MediaStatus })}
            >
              {MEDIA_STATUS.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className={s.drawerFoot}>
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            删除
          </button>
          {NEXT_STATUS[item.status] ? (
            <button type="button" className="btn btn-primary" onClick={onAdvance}>
              推进到「{STATUS_LABEL[NEXT_STATUS[item.status]!]}」→
            </button>
          ) : (
            <span className={s.drawerDone}>已经发布完了</span>
          )}
        </footer>
      </aside>
    </div>
  )
}
