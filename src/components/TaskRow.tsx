import { useState } from 'react'
import type { Priority, Task } from '../db/types'
import { useAutosave } from '../hooks/useAutosave'
import Badge from './Badge'
import InlineEdit from './InlineEdit'
import RowMenu, { type MenuAction } from './RowMenu'
import s from './TaskRow.module.css'

interface TaskRowProps {
  task: Task
  /** 首页用紧凑版：没有展开面板 */
  compact?: boolean
  onToggle: (done: boolean) => void
  onDelete?: () => void
  onFocusToggle?: () => void
  onPatch?: (patch: Partial<Task>) => void | Promise<void>
  accent?: string
}

const PRIORITY_LABEL: Record<Priority, string> = { 0: '高', 1: '中', 2: '低' }

export default function TaskRow({
  task,
  compact = false,
  onToggle,
  onDelete,
  onFocusToggle,
  onPatch,
  accent = 'var(--c-today)',
}: TaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const noteSave = useAutosave<string>((value) => onPatch?.({ note: value }) ?? Promise.resolve())

  const menu: MenuAction[] = []
  if (onFocusToggle) {
    menu.push({
      label: task.focus === 1 ? '取消今日重点' : '设为今日重点',
      onSelect: onFocusToggle,
    })
  }
  if (onDelete) menu.push({ label: '删除', danger: true, onSelect: onDelete })

  return (
    <li
      className={[s.row, task.done === 1 ? s.done : '', expanded ? s.expanded : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={s.main}>
        <button
          type="button"
          className={[s.check, task.done === 1 ? s.checkOn : ''].join(' ')}
          aria-pressed={task.done === 1}
          aria-label={task.done === 1 ? '标记为未完成' : '标记为完成'}
          style={
            task.done === 1 ? { background: accent, borderColor: accent } : undefined
          }
          onClick={() => onToggle(task.done === 0)}
        >
          {task.done === 1 ? '✓' : ''}
        </button>

        <div className={s.title}>
          <InlineEdit
            value={task.title}
            ariaLabel="任务标题"
            onCommit={(next) => {
              if (next) void onPatch?.({ title: next })
            }}
          />
          {task.sourceLabel ? (
            <Badge color="var(--c-dev)" title="来自别的板块，完成这里不会回写来源">
              {task.sourceLabel}
            </Badge>
          ) : null}
          {task.focus === 1 ? <span className={s.star} title="今日重点">★</span> : null}
        </div>

        <span className={s.meta}>
          {task.priority === 0 ? (
            <span className={s.priorityHigh}>高</span>
          ) : task.estimateMin ? (
            `${task.estimateMin} 分钟`
          ) : (
            ''
          )}
        </span>

        {!compact && onPatch ? (
          <button
            type="button"
            className={s.expand}
            aria-expanded={expanded}
            aria-label={expanded ? '收起详情' : '展开详情'}
            onClick={() => setExpanded((v) => !v)}
          >
            ⌄
          </button>
        ) : null}

        {menu.length > 0 ? <RowMenu items={menu} /> : null}
      </div>

      {expanded && onPatch ? (
        <div className={s.detail}>
          <label className={s.field}>
            <span className={s.fieldLabel}>备注</span>
            <textarea
              className={s.textarea}
              rows={2}
              defaultValue={task.note}
              placeholder="补充说明，输入即保存"
              onChange={(e) => noteSave.run(e.target.value)}
            />
          </label>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>优先级</span>
              <select
                className={s.select}
                value={task.priority}
                onChange={(e) => void onPatch({ priority: Number(e.target.value) as Priority })}
              >
                {([0, 1, 2] as Priority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>

            <label className={s.field}>
              <span className={s.fieldLabel}>预计耗时</span>
              <input
                className={s.select}
                type="number"
                min={0}
                step={5}
                defaultValue={task.estimateMin ?? ''}
                placeholder="分钟"
                onBlur={(e) => {
                  const raw = e.target.value.trim()
                  const next = raw === '' ? null : Math.max(0, Number(raw))
                  if (next !== task.estimateMin) void onPatch({ estimateMin: next })
                }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </li>
  )
}
