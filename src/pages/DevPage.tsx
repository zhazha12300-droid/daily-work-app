import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Card from '../components/Card'
import InlineEdit from '../components/InlineEdit'
import PageHeader from '../components/PageHeader'
import RowMenu from '../components/RowMenu'
import SplitPane from '../components/SplitPane'
import { useToast } from '../components/Toast'
import { db } from '../db'
import type { DevItem, DevItemStatus, DevItemType, DevNote, DevProject } from '../db/types'
import { useGlobalTimer } from '../hooks/useGlobalTimer'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatMinutes } from '../lib/format'
import {
  ITEM_STATUS_LABEL,
  ITEM_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  addItem,
  addNote,
  addProject,
  countOpenBugs,
  deleteItem,
  deleteNote,
  deleteProject,
  listItems,
  listNotes,
  listProjects,
  minutesByItem,
  patchItem,
  patchNote,
  patchProject,
  restoreItem,
  restoreNote,
  weekMinutesByProject,
} from '../repo/dev'
import { addTask } from '../repo/tasks'
import s from './DevPage.module.css'

const TYPES: DevItemType[] = ['feature', 'task', 'bug']
const STATUSES: DevItemStatus[] = ['todo', 'doing', 'verify', 'done']

export default function DevPage() {
  const today = useToday()
  const toast = useToast()
  const undo = useUndo()
  const timer = useGlobalTimer()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'items' | 'notes'>('items')
  const [typeFilter, setTypeFilter] = useState<DevItemType | 'all'>('all')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [newType, setNewType] = useState<DevItemType>('task')
  const [newTitle, setNewTitle] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const [expandedNote, setExpandedNote] = useState<string | null>(null)

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const weekStart = settings?.weekStart ?? 1

  const projects = useLiveQuery(() => listProjects(), [], [] as DevProject[])
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0] ?? null
  const selectedKey = selected?.id ?? ''

  const items = useLiveQuery(
    () => (selectedKey ? listItems(selectedKey) : Promise.resolve([] as DevItem[])),
    [selectedKey],
    [] as DevItem[],
  )
  const minutes = useLiveQuery(
    () => (selectedKey ? minutesByItem(selectedKey) : Promise.resolve({} as Record<string, number>)),
    [selectedKey],
    {} as Record<string, number>,
  )
  const notes = useLiveQuery(
    () => (selectedKey ? listNotes(selectedKey) : Promise.resolve([] as DevNote[])),
    [selectedKey],
    [] as DevNote[],
  )
  const week = useLiveQuery(() => weekMinutesByProject(today, weekStart), [today, weekStart], [])
  const openBugs = useLiveQuery(() => countOpenBugs(), [], 0)

  const visibleProjects = projects.filter((p) =>
    search.trim() ? p.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  )

  const visibleItems = items.filter((it) => {
    if (typeFilter !== 'all' && it.type !== typeFilter) return false
    if (onlyOpen && it.status === 'done') return false
    return true
  })

  const visibleNotes = notes.filter((n) =>
    noteSearch.trim()
      ? `${n.title} ${n.body}`.toLowerCase().includes(noteSearch.trim().toLowerCase())
      : true,
  )

  const weekTotal = week.reduce((sum, w) => sum + w.minutes, 0)

  async function handleNewProject() {
    // 记录创建前是否已有选中的项目：新用户一个项目都没有时，创建后自动切过去方便改名；
    // 已有项目时留在原地，避免「新建项目把旧项目的任务顶掉」的错觉。
    const hadSelection = selected != null
    const id = await addProject('新项目')
    if (!hadSelection) setSelectedId(id)
    toast.show({
      message: hadSelection
        ? '已新建「新项目」。当前项目和旧任务都没动，左侧列表点它即可切换改名。'
        : '已新建项目，改个名字吧',
      tone: 'success',
    })
  }

  async function handleAddItem() {
    if (!selected || !newTitle.trim()) return
    await addItem({ projectId: selected.id, type: newType, title: newTitle })
    setNewTitle('')
  }

  async function handleDeleteItem(item: DevItem) {
    await deleteItem(item.id)
    undo('已删除条目', () => restoreItem(item.id))
  }

  async function handleAddToToday(item: DevItem) {
    if (!selected) return
    await addTask({
      date: today,
      title: item.title,
      sourceType: 'dev',
      sourceId: item.id,
      sourceLabel: `开发·${selected.name}`,
    })
    toast.show({ message: '已加入今日计划（不会回写这里的状态）', tone: 'success' })
  }

  async function handleDeleteProject(project: DevProject) {
    await deleteProject(project.id)
    setSelectedId(null)
    toast.show({ message: `已删除项目「${project.name}」`, tone: 'success' })
  }

  return (
    <div className="page">
      <PageHeader
        title="开发工作"
        sub={`${projects.length} 个项目 · ${openBugs} 个未解决 Bug · 本周 ${formatMinutes(weekTotal)}`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void handleNewProject()}>
            ＋ 新项目
          </button>
        }
      />

      <SplitPane
        sideTitle="项目"
        side={
          <>
            <input
              className={`input ${s.search}`}
              value={search}
              placeholder="搜索项目"
              onChange={(e) => setSearch(e.target.value)}
            />
            {visibleProjects.length === 0 ? (
              <p className={s.sideEmpty}>
                {projects.length === 0 ? '还没有项目，点右上角新建。' : '没有匹配的项目'}
              </p>
            ) : (
              <ul className={s.projectList}>
                {visibleProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={[s.projectItem, p.id === selected?.id ? s.projectOn : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <span className={s.projectName}>{p.name}</span>
                      <span className={[s.projectBadge, s[`st_${p.status}`]].join(' ')}>
                        {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      >
        {!selected ? (
          <Card>
            <p className="muted">左边还没有项目。点右上角「＋ 新项目」开始。</p>
          </Card>
        ) : (
          <>
            <Card>
              <div className={s.projectHead}>
                <div className={s.projectTitleRow}>
                  <h2 className={s.projectTitle}>
                    <InlineEdit
                      value={selected.name}
                      ariaLabel="项目名"
                      onCommit={(name) =>
                        name ? void patchProject(selected.id, { name }) : Promise.resolve()
                      }
                    />
                  </h2>
                  <select
                    className={s.statusSelect}
                    value={selected.status}
                    onChange={(e) =>
                      void patchProject(selected.id, {
                        status: e.target.value as DevProject['status'],
                      })
                    }
                  >
                    {(Object.keys(PROJECT_STATUS_LABEL) as DevProject['status'][]).map((st) => (
                      <option key={st} value={st}>
                        {PROJECT_STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                  <div className={s.spacer} />
                  <RowMenu
                    items={[
                      {
                        label: '删除项目',
                        danger: true,
                        onSelect: () => void handleDeleteProject(selected),
                      },
                    ]}
                  />
                </div>

                <div className={s.metaRow}>
                  <span className={s.metaLabel}>技术栈</span>
                  <InlineEdit
                    value={selected.stack}
                    placeholder="例如 React + Node"
                    onCommit={(stack) => void patchProject(selected.id, { stack })}
                  />
                  <span className={s.metaLabel}>仓库</span>
                  <InlineEdit
                    value={selected.repo}
                    placeholder="粘贴仓库地址"
                    onCommit={(repo) => void patchProject(selected.id, { repo })}
                  />
                </div>
              </div>
            </Card>

            <div className={s.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'items'}
                className={[s.tab, tab === 'items' ? s.tabOn : ''].join(' ')}
                onClick={() => setTab('items')}
              >
                条目 {items.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'notes'}
                className={[s.tab, tab === 'notes' ? s.tabOn : ''].join(' ')}
                onClick={() => setTab('notes')}
              >
                笔记 {notes.length}
              </button>
            </div>

            {tab === 'items' ? (
              <Card flush>
                <div className={s.filters}>
                  <div className={s.chips}>
                    {(['all', ...TYPES] as (DevItemType | 'all')[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={[s.chip, typeFilter === t ? s.chipOn : ''].join(' ')}
                        onClick={() => setTypeFilter(t)}
                      >
                        {t === 'all' ? '全部' : ITEM_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                  <label className={s.checkbox}>
                    <input
                      type="checkbox"
                      checked={onlyOpen}
                      onChange={(e) => setOnlyOpen(e.target.checked)}
                    />
                    只显示未完成
                  </label>
                </div>

                {STATUSES.filter((st) => visibleItems.some((it) => it.status === st)).map((st) => (
                  <section key={st} className={s.group}>
                    <h3 className={s.groupTitle}>
                      {ITEM_STATUS_LABEL[st]}
                      <span className={s.groupCount}>
                        {visibleItems.filter((it) => it.status === st).length}
                      </span>
                    </h3>
                    <ul className={s.items}>
                      {visibleItems
                        .filter((it) => it.status === st)
                        .map((item) => (
                          <li key={item.id} className={s.item}>
                            <span className={[s.typeDot, s[`type_${item.type}`]].join(' ')} />
                            <div className={s.itemTitle}>
                              <InlineEdit
                                value={item.title}
                                onCommit={(title) =>
                                  title ? void patchItem(item.id, { title }) : Promise.resolve()
                                }
                              />
                            </div>
                            <span className={s.itemMinutes}>
                              {minutes[item.id] ? formatMinutes(minutes[item.id]) : ''}
                            </span>
                            <select
                              className={s.miniSelect}
                              value={item.status}
                              aria-label="状态"
                              onChange={(e) =>
                                void patchItem(item.id, {
                                  status: e.target.value as DevItemStatus,
                                })
                              }
                            >
                              {STATUSES.map((x) => (
                                <option key={x} value={x}>
                                  {ITEM_STATUS_LABEL[x]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className={s.timerBtn}
                              disabled={item.status === 'done' || timer.isRunning}
                              title={
                                timer.isRunning ? '已有计时在跑，先在左下角结束它' : '开始计时'
                              }
                              onClick={() =>
                                void timer.start({
                                  devItemId: item.id,
                                  projectId: selected.id,
                                  label: item.title,
                                })
                              }
                            >
                              {timer.timer?.devItemId === item.id ? '计时中' : '计时'}
                            </button>
                            <RowMenu
                              items={[
                                {
                                  label: '加入今日计划',
                                  onSelect: () => void handleAddToToday(item),
                                },
                                {
                                  label: '删除',
                                  danger: true,
                                  onSelect: () => void handleDeleteItem(item),
                                },
                              ]}
                            />
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}

                {visibleItems.length === 0 ? (
                  <p className={s.empty}>这个项目还没有条目。在下面加第一条。</p>
                ) : null}

                <div className={s.addRow}>
                  <select
                    className={s.miniSelect}
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as DevItemType)}
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ITEM_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={newTitle}
                    placeholder="添加条目，回车保存"
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleAddItem()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    disabled={!newTitle.trim()}
                    onClick={() => void handleAddItem()}
                  >
                    添加
                  </button>
                </div>

                <div className={s.weekBar}>
                  <span className={s.weekLabel}>本周 {formatMinutes(weekTotal)}</span>
                  <div className={s.stack}>
                    {week.map((w) => (
                      <span
                        key={w.projectId}
                        className={s.stackSeg}
                        style={{
                          flexGrow: w.minutes,
                          ['--seg' as string]: 'var(--c-dev)',
                        }}
                        title={`${w.projectName} ${formatMinutes(w.minutes)}`}
                      />
                    ))}
                  </div>
                  <span className={s.weekDetail}>
                    {week.length === 0
                      ? '还没有工时记录'
                      : week.map((w) => `${w.projectName} ${Math.round(w.minutes / 60 * 10) / 10}h`).join(' · ')}
                  </span>
                </div>
              </Card>
            ) : (
              <Card flush>
                <div className={s.filters}>
                  <input
                    className={`input ${s.search}`}
                    value={noteSearch}
                    placeholder="搜索笔记内容"
                    onChange={(e) => setNoteSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void addNote(selected.id)}
                  >
                    ＋ 新笔记
                  </button>
                </div>

                {visibleNotes.length === 0 ? (
                  <p className={s.empty}>还没有笔记。踩过的坑、代码片段都记在这里。</p>
                ) : (
                  <ul className={s.notes}>
                    {visibleNotes.map((note) => {
                      const open = expandedNote === note.id
                      return (
                        <li key={note.id} className={s.note}>
                          <div className={s.noteHead}>
                            <InlineEdit
                              value={note.title}
                              placeholder="标题"
                              onCommit={(title) => void patchNote(note.id, { title })}
                            />
                            <RowMenu
                              items={[
                                {
                                  label: '删除',
                                  danger: true,
                                  onSelect: async () => {
                                    await deleteNote(note.id)
                                    undo('已删除笔记', () => restoreNote(note.id))
                                  },
                                },
                              ]}
                            />
                          </div>
                          <InlineEdit
                            value={note.body}
                            placeholder="写点什么…"
                            multiline
                            className={open ? '' : s.clamp}
                            onCommit={(body) => void patchNote(note.id, { body })}
                          />
                          {note.body ? (
                            <button
                              type="button"
                              className={s.more}
                              onClick={() => setExpandedNote(open ? null : note.id)}
                            >
                              {open ? '收起' : '展开'}
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            )}
          </>
        )}
      </SplitPane>
    </div>
  )
}
