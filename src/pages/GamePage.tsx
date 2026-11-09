import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Badge from '../components/Badge'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import MiniBars from '../components/MiniBars'
import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import RowMenu from '../components/RowMenu'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { Game, GameSession, GameStatus, WatchItem, WatchType } from '../db/types'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatMinutes } from '../lib/format'
import { formatShort, todayStr } from '../lib/date'
import {
  GAME_STATUS,
  GAME_STATUS_LABEL,
  WATCH_LABEL,
  WATCH_TYPES,
  addGame,
  addGameSession,
  addWatch,
  deleteGame,
  deleteGameSession,
  deleteWatch,
  finishGame,
  gameMinutesByDay,
  listGameSessions,
  listGames,
  listWatch,
  patchGame,
  restoreGame,
  restoreWatch,
  toggleWatch,
  weekGameMinutes,
} from '../repo/game'
import s from './GamePage.module.css'

export default function GamePage() {
  const today = useToday()
  const toast = useToast()
  const undo = useUndo()

  const [tab, setTab] = useState<'library' | 'watch'>('library')
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState('')
  const [watchTitle, setWatchTitle] = useState('')
  const [watchType, setWatchType] = useState<WatchType>('tv')

  const [logGame, setLogGame] = useState<Game | null>(null)
  const [finishTarget, setFinishTarget] = useState<Game | null>(null)

  const games = useLiveQuery(() => listGames(), [], [] as Game[])
  const watch = useLiveQuery(() => listWatch(), [], [] as WatchItem[])
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1
  const weekMinutes = useLiveQuery(() => weekGameMinutes(today, weekStart), [today, weekStart], 0)
  const byDay = useLiveQuery(() => gameMinutesByDay(today), [today], [])
  const platforms = settings?.platforms ?? []

  async function handleAddGame() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await addGame({ name: trimmed, platform: platform.trim() })
      setName('')
      setPlatform('')
    } catch (err) {
      // 之前 void handleAddGame() 会把失败静默吞掉，用户看到的就是「加不进去」。
      // 现在把原因亮出来，方便定位（多半是本机 IndexedDB 数据旧了）。
      toast.show({
        message: `添加失败：${(err as Error).message || '未知错误'}`,
        tone: 'error',
        timeout: 0,
      })
    }
  }

  async function handleAddWatch() {
    if (!watchTitle.trim()) return
    await addWatch({ title: watchTitle, type: watchType })
    setWatchTitle('')
  }

  return (
    <div className="page">
      <PageHeader
        title="游戏娱乐"
        sub={`本周 ${formatMinutes(weekMinutes)}`}
        actions={
          <div className={s.seg}>
            <button
              type="button"
              className={[s.segBtn, tab === 'library' ? s.segOn : ''].filter(Boolean).join(' ')}
              onClick={() => setTab('library')}
            >
              游戏库
            </button>
            <button
              type="button"
              className={[s.segBtn, tab === 'watch' ? s.segOn : ''].filter(Boolean).join(' ')}
              onClick={() => setTab('watch')}
            >
              娱乐清单
              <span className={s.segCount}>{watch.filter((w) => w.done === 0).length}</span>
            </button>
          </div>
        }
      />

      <Card title="这七天玩了多久">
        <div className={s.weekRow}>
          <p className={s.weekValue}>
            <b className="num">{formatMinutes(weekMinutes)}</b>
            <span className={s.weekUnit}>本周累计</span>
          </p>
          <div className={s.chart}>
            <MiniBars data={byDay} color="var(--c-game)" emptyHint="最近七天还没有记录" />
          </div>
        </div>
      </Card>

      {tab === 'library' ? (
        <>
          <div className={s.addBar}>
            <input
              className={`input ${s.addName}`}
              value={name}
              placeholder="游戏名字，回车加入「在玩」"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddGame()
              }}
            />
            <input
              className={`input ${s.addPlatform}`}
              value={platform}
              list="game-platforms"
              placeholder="平台"
              onChange={(e) => setPlatform(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddGame()
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => void handleAddGame()}>
              ＋ 游戏
            </button>
            <datalist id="game-platforms">
              {['Steam', 'PS5', 'Switch', '手机', ...platforms].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {games.length === 0 ? (
            <Card>
              <EmptyState
                title="游戏库是空的"
                hint="把在玩的、想玩的都记进来，玩完记一笔时长，回头能看出时间花在哪。"
              />
            </Card>
          ) : (
            GAME_STATUS.map((status) => {
              const group = games.filter((g) => g.status === status)
              if (group.length === 0) return null
              return (
                <Card
                  key={status}
                  className={s.group}
                  title={
                    <>
                      {GAME_STATUS_LABEL[status]}
                      <span className={s.groupCount}>{group.length}</span>
                    </>
                  }
                >
                  <ul className={s.rows}>
                    {group.map((game) => (
                      <li key={game.id} className={s.row}>
                        <span className={s.gameName}>{game.name}</span>
                        {game.platform ? <Badge>{game.platform}</Badge> : null}
                        <Stars
                          value={game.rating}
                          onChange={(rating) => void patchGame(game.id, { rating })}
                        />
                        <span className={s.minutes}>
                          {game.minutesTotal > 0 ? formatMinutes(game.minutesTotal) : '还没记'}
                        </span>
                        <button
                          type="button"
                          className={`btn btn-ghost ${s.logBtn}`}
                          onClick={() => setLogGame(game)}
                        >
                          ＋ 记时长
                        </button>
                        <RowMenu
                          items={[
                            ...(game.status !== 'finished'
                              ? [{ label: '标记通关', onSelect: () => setFinishTarget(game) }]
                              : [
                                  {
                                    label: '改成在玩',
                                    onSelect: () => void patchGame(game.id, { status: 'playing' as GameStatus }),
                                  },
                                ]),
                            {
                              label: '挪到搁置',
                              onSelect: () => void patchGame(game.id, { status: 'shelved' as GameStatus }),
                            },
                            {
                              label: '删除',
                              danger: true,
                              onSelect: () => {
                                void deleteGame(game.id)
                                undo(`已删除「${game.name}」`, () => restoreGame(game.id))
                              },
                            },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            })
          )}
        </>
      ) : (
        <>
          <div className={s.addBar}>
            <input
              className={`input ${s.addName}`}
              value={watchTitle}
              placeholder="想看的剧 / 电影 / 书"
              onChange={(e) => setWatchTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddWatch()
              }}
            />
            <select
              className={`input ${s.addType}`}
              value={watchType}
              onChange={(e) => setWatchType(e.target.value as WatchType)}
            >
              {WATCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {WATCH_LABEL[t]}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={() => void handleAddWatch()}>
              ＋ 加入清单
            </button>
          </div>

          <Card>
            {watch.length === 0 ? (
              <EmptyState title="清单是空的" hint="看到想看的就记一笔，看完勾掉。" />
            ) : (
              <ul className={s.watchList}>
                {watch.map((item) => (
                  <li key={item.id} className={s.watchRow}>
                    <label className={s.watchCheck}>
                      <input
                        type="checkbox"
                        checked={item.done === 1}
                        onChange={(e) => void toggleWatch(item.id, e.target.checked)}
                      />
                      <span className={item.done === 1 ? s.watchDone : ''}>{item.title}</span>
                    </label>
                    <Badge>{WATCH_LABEL[item.type]}</Badge>
                    {item.doneAt ? (
                      <span className={s.watchDate}>{formatShort(todayStr(new Date(item.doneAt)))}</span>
                    ) : null}
                    <button
                      type="button"
                      className={s.del}
                      aria-label="删除"
                      onClick={() => {
                        void deleteWatch(item.id)
                        undo(`已删除「${item.title}」`, () => restoreWatch(item.id))
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {logGame ? <LogModal game={logGame} today={today} onClose={() => setLogGame(null)} /> : null}

      {finishTarget ? (
        <FinishModal
          game={finishTarget}
          today={today}
          onClose={() => setFinishTarget(null)}
          onDone={() => {
            toast.show({ message: '已通关，记一笔感受', tone: 'success' })
            setFinishTarget(null)
          }}
        />
      ) : null}
    </div>
  )
}

/* ── 评分星星 ─────────────────────────────────────────────────── */

function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className={s.stars} role="group" aria-label="评分">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={[s.star, (value ?? 0) >= n ? s.starOn : ''].filter(Boolean).join(' ')}
          aria-label={`${n} 分`}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}

/* ── 记时长 ───────────────────────────────────────────────────── */

function LogModal({ game, today, onClose }: { game: Game; today: string; onClose: () => void }) {
  const [minutes, setMinutes] = useState('60')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const sessions = useLiveQuery(() => listGameSessions(game.id, 5), [game.id], [] as GameSession[])
  const toast = useToast()

  async function save() {
    const m = Number(minutes)
    if (!Number.isFinite(m) || m <= 0) return
    await addGameSession({ gameId: game.id, date, minutes: m, note })
    toast.show({ message: `已记 ${m} 分钟`, tone: 'success' })
    onClose()
  }

  return (
    <Modal
      open
      title={`记时长 · ${game.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            记下
          </button>
        </>
      }
    >
      <div className={s.modalRow}>
        <label className={s.field}>
          <span>分钟</span>
          <input
            className="input"
            inputMode="numeric"
            value={minutes}
            autoFocus
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        </label>
        <label className={s.field}>
          <span>日期</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <label className={s.field}>
        <span>备注（可选）</span>
        <input
          className="input"
          value={note}
          placeholder="打到哪了 / 和谁玩"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className={s.quick}>
        {[30, 60, 90, 120].map((m) => (
          <button key={m} type="button" className={s.quickBtn} onClick={() => setMinutes(String(m))}>
            {m} 分钟
          </button>
        ))}
      </div>

      {sessions.length > 0 ? (
        <div className={s.recent}>
          <p className={s.recentTitle}>最近记录</p>
          <ul>
            {sessions.map((session) => (
              <li key={session.id}>
                <span className={s.recentDate}>{formatShort(session.date)}</span>
                <span className={s.recentMin}>{session.minutes} 分钟</span>
                {session.note ? <span className={s.recentNote}>{session.note}</span> : null}
                <button
                  type="button"
                  className={s.del}
                  aria-label="删除这条记录"
                  onClick={() => {
                    void deleteGameSession(session.id)
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  )
}

/* ── 标记通关 ─────────────────────────────────────────────────── */

function FinishModal({
  game,
  today,
  onClose,
  onDone,
}: {
  game: Game
  today: string
  onClose: () => void
  onDone: () => void
}) {
  const [date, setDate] = useState(today)
  const [feeling, setFeeling] = useState(game.note ?? '')
  const [rating, setRating] = useState<number | null>(game.rating)

  async function save() {
    await finishGame(game.id, { date, feeling, rating })
    onDone()
  }

  return (
    <Modal
      open
      title={`通关 · ${game.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            标记通关
          </button>
        </>
      }
    >
      <label className={s.field}>
        <span>通关日期</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className={s.field}>
        <span>一句感受</span>
        <textarea
          className={`input ${s.textarea}`}
          value={feeling}
          placeholder="结局怎么样？值不值得推荐给自己"
          onChange={(e) => setFeeling(e.target.value)}
        />
      </label>
      <div className={s.field}>
        <span>评分</span>
        <Stars value={rating} onChange={setRating} />
      </div>
    </Modal>
  )
}
