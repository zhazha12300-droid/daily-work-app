import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { db } from '../db'
import { useGlobalTimer } from '../hooks/useGlobalTimer'
import { useToday } from '../hooks/useToday'
import { formatClock, formatRelative } from '../lib/format'
import { MODULES } from '../modules'
import { addWorkLog } from '../repo/dev'
import { overdueMedia } from '../repo/media'
import { isBackupStale } from '../repo/settings'
import type { Theme } from '../theme'
import Modal from './Modal'
import { useToast } from './Toast'
import s from './Sidebar.module.css'

interface SidebarProps {
  theme: Theme
  onToggleTheme: () => void
}

export default function Sidebar({ theme, onToggleTheme }: SidebarProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const timer = useGlobalTimer()
  const today = useToday()
  const overdueCount = useLiveQuery(
    async () => (await overdueMedia(today)).length,
    [today],
    0,
  )

  const [stopOpen, setStopOpen] = useState(false)
  const [minutes, setMinutes] = useState('1')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const lastBackupAt = settings?.lastBackupAt ?? null
  const backupStale = isBackupStale(lastBackupAt)

  function openStop() {
    setMinutes(String(Math.max(1, Math.round(timer.elapsedSec / 60))))
    setNote('')
    setStopOpen(true)
  }

  async function saveAndStop() {
    const current = timer.timer
    if (!current) {
      setStopOpen(false)
      return
    }
    setSaving(true)
    try {
      await addWorkLog({
        projectId: current.projectId,
        devItemId: current.devItemId,
        startedAt: current.startedAt,
        minutes: Math.max(1, Number(minutes) || 1),
        note,
      })
      await timer.discard()
      setStopOpen(false)
      toast.show({ message: '工时已记录', tone: 'success' })
    } finally {
      setSaving(false)
    }
  }

  async function discardTimer() {
    await timer.discard()
    setStopOpen(false)
    toast.show({ message: '已丢弃这次计时' })
  }

  return (
    <aside className={s.sidebar}>
      <div className={s.brand}>
        <span className={s.mark} aria-hidden />
        <span className={s.brandText}>我的工作台</span>
      </div>

      <nav className={s.nav} aria-label="板块导航">
        {MODULES.map((m) => (
          <NavLink
            key={m.key}
            to={m.path}
            end={m.path === '/'}
            className={({ isActive }) => (isActive ? `${s.item} ${s.active}` : s.item)}
          >
            <span className={s.dot} style={{ background: m.accent }} aria-hidden />
            <span className={s.label}>{m.label}</span>
            {m.key === 'media' && overdueCount > 0 ? (
              <span className={s.alert} title={`${overdueCount} 条选题已过计划日`} />
            ) : null}
          </NavLink>
        ))}
      </nav>

      <div className={s.footer}>
        {timer.isRunning ? (
          <button
            type="button"
            className={s.timerRow}
            onClick={openStop}
            title="点一下结束计时并记录工时"
          >
            <span className={s.timerDot} aria-hidden />
            <span className={s.timerLabel}>{timer.timer?.label ?? '计时中'}</span>
            <span className={`${s.timerClock} num`}>{formatClock(timer.elapsedSec)}</span>
          </button>
        ) : null}

        <button
          type="button"
          className={s.footerBtn}
          onClick={() => navigate('/settings')}
          title="前往「数据与设置」导出备份"
        >
          <span>上次备份</span>
          <span className={backupStale ? s.stale : s.weak}>
            {lastBackupAt ? formatRelative(lastBackupAt) : '未备份'}
          </span>
        </button>

        <button type="button" className={s.footerBtn} onClick={onToggleTheme}>
          <span aria-hidden>{theme === 'light' ? '☀' : '☾'}</span>
          <span>{theme === 'light' ? '浅色主题' : '深色主题'}</span>
        </button>

        <div
          className={s.origin}
          title="浏览器的本地数据按「协议 + 域名 + 端口」隔离，端口一变就会读不到原来的数据"
        >
          {window.location.origin}
        </div>
      </div>

      <Modal
        open={stopOpen}
        title="结束计时"
        onClose={() => setStopOpen(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => void discardTimer()} disabled={saving}>
              丢弃
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void saveAndStop()}
              disabled={saving}
            >
              保存工时
            </button>
          </>
        }
      >
        <p className="muted" style={{ fontSize: 'var(--fs-aux)' }}>
          {timer.timer?.label ?? '计时'} · 已走 {formatClock(timer.elapsedSec)}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>记录时长（分钟）</span>
          <input
            className="input"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            autoFocus
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>备注（可选）</span>
          <input
            className="input"
            value={note}
            placeholder="这次做了什么"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </Modal>
    </aside>
  )
}
