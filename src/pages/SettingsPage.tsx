import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import Card from '../components/Card'
import DangerConfirm from '../components/DangerConfirm'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { db } from '../db'
import {
  buildBackup,
  clearAllData,
  clearTable,
  downloadBackup,
  restoreBackup,
  validateBackup,
  type ValidationResult,
} from '../db/backup'
import {
  TABLE_GROUPS,
  estimateBytes,
  formatBytes,
  tableLabel,
} from '../db/labels'
import { TABLE_NAMES } from '../db/schema'
import { useTheme } from '../hooks/useTheme'
import { formatDateTime, formatRelative } from '../lib/format'
import {
  daysSinceBackup,
  isBackupStale,
  moveHomeCard,
  normalizeHomeCards,
  toggleHomeCard,
  updateSettings,
} from '../repo/settings'
import { setTheme, type Theme } from '../theme'
import s from './SettingsPage.module.css'

const HOME_CARD_LABEL: Record<string, string> = {
  media: '自媒体',
  dev: '开发工作',
  consult: '咨询工作',
  fitness: '健身计划',
  diet: '饮食计划',
  game: '游戏娱乐',
}

interface OverviewRow {
  name: string
  label: string
  count: number
  bytes: number
}

export default function SettingsPage() {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState<ValidationResult | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearTarget, setClearTarget] = useState<string>('')
  const [clearTableOpen, setClearTableOpen] = useState(false)
  const [platformDraft, setPlatformDraft] = useState('')
  const [theme, changeTheme] = useTheme()

  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)

  const overview = useLiveQuery(
    async () => {
      const items: OverviewRow[] = []
      let total = 0
      let bytes = 0
      for (const name of TABLE_NAMES) {
        const rows = (await db.table(name).toArray()) as unknown[]
        const size = estimateBytes(rows)
        total += rows.length
        bytes += size
        // 设置表永远有 1 条，不占版面
        if (rows.length > 0 && name !== 'settings') {
          items.push({ name, label: tableLabel(name), count: rows.length, bytes: size })
        }
      }
      return { items, total, bytes }
    },
    [],
    { items: [] as OverviewRow[], total: 0, bytes: 0 },
  )

  const cards = normalizeHomeCards(settings?.homeCards)
  const platforms = settings?.platforms ?? []
  const lastBackup = settings?.lastBackupAt ?? null
  const stale = isBackupStale(lastBackup)
  const days = daysSinceBackup(lastBackup)

  const targetLabel = clearTarget ? tableLabel(clearTarget) : ''
  const targetCount = overview.items.find((i) => i.name === clearTarget)?.count ?? 0

  async function handleExport() {
    try {
      const file = await buildBackup()
      downloadBackup(file)
      await updateSettings({ lastBackupAt: Date.now() })
      toast.show({ message: '备份文件已下载', tone: 'success' })
    } catch (err) {
      toast.show({ message: `导出失败：${(err as Error).message}`, tone: 'error' })
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const json: unknown = JSON.parse(text)
      const result = validateBackup(json)
      if (!result.ok) {
        toast.show({ message: result.errors[0] ?? '备份文件不合法', tone: 'error' })
        return
      }
      for (const warning of result.warnings) toast.show({ message: warning })
      setPending(result)
    } catch {
      toast.show({ message: '这个文件不是合法的 JSON', tone: 'error' })
    }
  }

  async function doRestore() {
    if (!pending?.file) return
    try {
      // 覆盖之前先把当前数据导一份，防止恢复错了没法回头
      downloadBackup(await buildBackup())
      await restoreBackup(pending.file)
      await updateSettings({ lastBackupAt: Date.now() })
      // 备份里的主题偏好跟着生效（备份里的设置行可能和你现在的不一样）
      const restoredTheme = pending.file.data.settings?.[0] as { theme?: Theme } | undefined
      if (restoredTheme?.theme === 'dark' || restoredTheme?.theme === 'light') {
        setTheme(restoredTheme.theme)
      }
      setPending(null)
      toast.show({ message: '已从备份恢复', tone: 'success' })
    } catch (err) {
      toast.show({ message: `恢复失败：${(err as Error).message}`, tone: 'error' })
    }
  }

  async function doClearAll() {
    try {
      await clearAllData()
      setClearOpen(false)
      toast.show({ message: '已清空全部数据', tone: 'success' })
    } catch (err) {
      toast.show({ message: `清空失败：${(err as Error).message}`, tone: 'error' })
    }
  }

  async function doClearTable() {
    if (!clearTarget) return
    try {
      await clearTable(clearTarget)
      setClearTableOpen(false)
      toast.show({ message: `已清空「${targetLabel}」`, tone: 'success' })
    } catch (err) {
      toast.show({ message: `清空失败：${(err as Error).message}`, tone: 'error' })
    }
  }

  async function pickTheme(next: Theme) {
    changeTheme(next)
    await updateSettings({ theme: next })
  }

  async function patchCards(next: ReturnType<typeof normalizeHomeCards>) {
    await updateSettings({ homeCards: next })
  }

  function addPlatform() {
    const name = platformDraft.trim()
    if (!name) return
    if (platforms.includes(name)) {
      setPlatformDraft('')
      return
    }
    void updateSettings({ platforms: [...platforms, name] })
    setPlatformDraft('')
  }

  function removePlatform(name: string) {
    void updateSettings({ platforms: platforms.filter((p) => p !== name) })
  }

  return (
    <div className="page">
      <PageHeader title="数据与设置" sub="偏好、备份、自检与危险操作" />

      <Card title="备份与恢复">
        <div className={s.backupHead}>
          <div>
            <p className={s.backupLabel}>上次备份</p>
            <p className={[s.backupValue, stale ? s.stale : ''].join(' ')}>
              {lastBackup ? formatRelative(lastBackup) : '从未备份'}
              {days !== null && days > 0 ? <span className={s.daysHint}>（{days} 天前）</span> : null}
            </p>
            <p className={s.backupHint}>
              {lastBackup ? formatDateTime(lastBackup) : '建好第一份备份之前，任何清理浏览器的动作都可能丢数据'}
            </p>
          </div>
          <div className={s.actions}>
            <button type="button" className="btn btn-primary" onClick={() => void handleExport()}>
              导出备份
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              从文件恢复
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void handleFile(e)}
            />
          </div>
        </div>
        <p className={s.note}>
          数据存在浏览器的本地数据库里，不是磁盘上的文件。清理浏览器数据、换浏览器或重装系统都会丢，
          所以定期导出是唯一的安全带。恢复会覆盖当前全部数据，执行前会自动先导出一份当前的。
        </p>
      </Card>

      <Card title="偏好设置">
        <div className={s.prefRow}>
          <div className={s.prefLabel}>
            <p>主题</p>
            <p className={s.note}>深色适合晚上，浅色白天更清楚。</p>
          </div>
          <div className={s.seg}>
            {(['light', 'dark'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                className={[s.segBtn, theme === t ? s.segOn : ''].filter(Boolean).join(' ')}
                onClick={() => void pickTheme(t)}
              >
                {t === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
        </div>

        <div className={s.prefRow}>
          <div className={s.prefLabel}>
            <p>每周从哪天开始</p>
            <p className={s.note}>影响「本周完成率」和所有按周汇总的统计。</p>
          </div>
          <select
            className={`input ${s.prefInput}`}
            value={String(settings?.weekStart ?? 1)}
            onChange={(e) => void updateSettings({ weekStart: Number(e.target.value) === 0 ? 0 : 1 })}
          >
            <option value="1">周一</option>
            <option value="0">周日</option>
          </select>
        </div>

        <div className={s.prefRow}>
          <div className={s.prefLabel}>
            <p>每日热量目标</p>
            <p className={s.note}>饮食页用它画进度条；留空就不显示目标。</p>
          </div>
          <div className={s.kcalBox}>
            <input
              key={settings?.kcalTarget ?? 'empty'}
              className={`input ${s.prefInput}`}
              inputMode="numeric"
              defaultValue={settings?.kcalTarget ?? ''}
              placeholder="不设"
              onBlur={(e) => {
                const raw = e.target.value.trim()
                const value = raw === '' ? null : Number(raw)
                if (value !== null && (!Number.isFinite(value) || value <= 0)) {
                  toast.show({ message: '热量目标要填一个正数', tone: 'error' })
                  return
                }
                if (value !== (settings?.kcalTarget ?? null)) void updateSettings({ kcalTarget: value })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
            />
            <span className={s.unit}>kcal</span>
          </div>
        </div>

        <div className={s.prefBlock}>
          <p>自媒体平台标签</p>
          <p className={s.note}>出现在「自媒体」的平台联想和统计里，长按不了就点 × 删。</p>
          <div className={s.chips}>
            {platforms.map((p) => (
              <span key={p} className={s.chip}>
                {p}
                <button
                  type="button"
                  className={s.chipX}
                  aria-label={`删除 ${p}`}
                  onClick={() => removePlatform(p)}
                >
                  ×
                </button>
              </span>
            ))}
            {platforms.length === 0 ? <span className={s.note}>还没有平台标签</span> : null}
          </div>
          <div className={s.chipAdd}>
            <input
              className="input"
              value={platformDraft}
              placeholder="加一个平台，回车保存"
              onChange={(e) => setPlatformDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addPlatform()
                }
              }}
            />
            <button type="button" className="btn" onClick={addPlatform}>
              添加
            </button>
          </div>
        </div>

        <div className={s.prefBlock}>
          <p>首页卡片</p>
          <p className={s.note}>取消勾选就不显示；用上下箭头调整顺序（不支持拖拽）。</p>
          <ul className={s.cardList}>
            {cards.map((card, i) => (
              <li key={card.key} className={s.cardRow}>
                <label className={s.cardCheck}>
                  <input
                    type="checkbox"
                    checked={card.visible === 1}
                    onChange={() => void patchCards(toggleHomeCard(cards, card.key))}
                  />
                  <span className={card.visible === 1 ? '' : s.cardOff}>
                    {HOME_CARD_LABEL[card.key] ?? card.key}
                  </span>
                </label>
                <span className={s.cardTools}>
                  <button
                    type="button"
                    className={s.moveBtn}
                    disabled={i === 0}
                    aria-label="上移"
                    onClick={() => void patchCards(moveHomeCard(cards, card.key, 'up'))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={s.moveBtn}
                    disabled={i === cards.length - 1}
                    aria-label="下移"
                    onClick={() => void patchCards(moveHomeCard(cards, card.key, 'down'))}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={s.prefRow}>
          <div className={s.prefLabel}>
            <p>说明与提示</p>
            <p className={s.note}>
              第一次打开时的说明关掉就没了，这里可以再看一次；顺手把所有板块的提示条也恢复回来。
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void updateSettings({ dismissedTips: [] })
              toast.show({ message: '提示已恢复，切到别的板块就能看到', tone: 'success' })
            }}
          >
            恢复全部提示
          </button>
        </div>
      </Card>

      <Card title="数据概览">
        <div className={s.overviewHead}>
          <span>
            共 <strong className="num">{overview.total}</strong> 条记录
          </span>
          <span className={s.overviewSize}>估算占用 {formatBytes(overview.bytes)}</span>
        </div>
        {overview.items.length === 0 ? (
          <p className={s.note}>还没有任何业务数据。</p>
        ) : (
          <ul className={s.counts}>
            {overview.items.map((item) => (
              <li key={item.name} className={s.countItem}>
                <span>{item.label}</span>
                <span className={s.countRight}>
                  <span className="num">{item.count}</span>
                  <span className={s.countBytes}>{formatBytes(item.bytes)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={s.note}>
          估算占用是把记录序列化后的字节数，只用来判断「数据量有多大」，和浏览器实际占用不完全一样。
          设置表不计入，它只有一条。
        </p>
      </Card>

      <Card title="危险区">
        <div className={s.dangerBlock}>
          <div>
            <p>清空某个板块的数据</p>
            <p className={s.note}>只删这一块，其他板块和偏好都不动。不可撤销。</p>
          </div>
          <div className={s.clearRow}>
            <select
              className={`input ${s.select}`}
              value={clearTarget}
              onChange={(e) => setClearTarget(e.target.value)}
            >
              <option value="">选择要清空的数据…</option>
              {TABLE_GROUPS.map((group) => (
                <optgroup key={group.title} label={group.title}>
                  {group.tables.map((name) => (
                    <option key={name} value={name}>
                      {tableLabel(name)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-danger"
              disabled={!clearTarget || targetCount === 0}
              onClick={() => setClearTableOpen(true)}
            >
              清空这一项
            </button>
          </div>
          {clearTarget && targetCount === 0 ? (
            <p className={s.note}>「{targetLabel}」现在是空的，不用清。</p>
          ) : null}
        </div>

        <div className={`${s.dangerBlock} ${s.dangerRow}`}>
          <div>
            <p>清空全部数据</p>
            <p className={s.note}>所有板块的记录都会消失，主题等偏好保留。建议先导出备份。</p>
          </div>
          <button type="button" className="btn btn-danger" onClick={() => setClearOpen(true)}>
            清空全部
          </button>
        </div>
      </Card>

      <DangerConfirm
        open={pending !== null}
        title="从备份恢复"
        confirmWord="恢复"
        confirmLabel="覆盖并恢复"
        description={
          <div>
            <p>
              备份导出时间：
              <span className="num">
                {pending?.file ? formatDateTime(Date.parse(pending.file.exportedAt)) : '—'}
              </span>
            </p>
            <p style={{ marginTop: 6 }}>
              共 <strong className="num">{pending?.total ?? 0}</strong> 条记录：
              {Object.entries(pending?.counts ?? {})
                .filter(([name, n]) => n > 0 && name !== 'settings')
                .map(([name, n]) => `${tableLabel(name)} ${n}`)
                .join('、') || '（无数据）'}
            </p>
            <p className={s.dangerText} style={{ marginTop: 8 }}>
              当前全部数据会被清空并替换。执行前会自动下载一份当前数据的备份。
            </p>
          </div>
        }
        onCancel={() => setPending(null)}
        onConfirm={doRestore}
      />

      <DangerConfirm
        open={clearTableOpen}
        title={`清空「${targetLabel}」`}
        confirmWord="清空"
        confirmLabel="清空这一项"
        description={
          <p>
            会删掉「{targetLabel}」里的 <strong className="num">{targetCount}</strong> 条记录，
            其他板块不受影响。这一步不可撤销，如果还没备份过，建议先取消并导出一份。
          </p>
        }
        onCancel={() => setClearTableOpen(false)}
        onConfirm={doClearTable}
      />

      <DangerConfirm
        open={clearOpen}
        title="清空全部数据"
        confirmWord="清空"
        confirmLabel="清空全部"
        description={
          <p>
            所有板块的记录都会被删除，且不可撤销。如果还没导出过，请先取消并导出一份备份。
          </p>
        }
        onCancel={() => setClearOpen(false)}
        onConfirm={doClearAll}
      />
    </div>
  )
}
