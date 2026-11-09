import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import Card from '../components/Card'
import ClampText from '../components/ClampText'
import InlineEdit from '../components/InlineEdit'
import PageHeader from '../components/PageHeader'
import RowMenu from '../components/RowMenu'
import SplitPane from '../components/SplitPane'
import { useToast } from '../components/Toast'
import type { Client, ClientStatus, ConsultLog, Payment } from '../db/types'
import { useToday } from '../hooks/useToday'
import { useUndo } from '../hooks/useUndo'
import { formatCn, formatShort } from '../lib/date'
import { formatMinutes } from '../lib/format'
import {
  CLIENT_STATUS_LABEL,
  addClient,
  addConsultLog,
  addPayment,
  clientTotals,
  deleteClient,
  deleteConsultLog,
  deletePayment,
  listClients,
  listConsultLogs,
  listFollowUps,
  listPayments,
  monthStats,
  patchClient,
  restoreConsultLog,
  restorePayment,
  setPaymentReceived,
} from '../repo/consult'
import s from './ConsultPage.module.css'

const STATUS_TABS: (ClientStatus | 'all')[] = ['all', 'lead', 'active', 'closed']

export default function ConsultPage() {
  const today = useToday()
  const toast = useToast()
  const undo = useUndo()

  const [statusFilter, setStatusFilter] = useState<ClientStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'logs' | 'payments'>('logs')

  const [logDate, setLogDate] = useState(today)
  const [logMinutes, setLogMinutes] = useState('60')
  const [logTopic, setLogTopic] = useState('')
  const [logSummary, setLogSummary] = useState('')
  const [logNext, setLogNext] = useState('')

  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(today)
  const [payReceived, setPayReceived] = useState(false)

  const clients = useLiveQuery(() => listClients(statusFilter), [statusFilter], [] as Client[])
  const selected = clients.find((c) => c.id === selectedId) ?? clients[0] ?? null
  const clientKey = selected?.id ?? ''

  const logs = useLiveQuery(
    () => (clientKey ? listConsultLogs(clientKey) : Promise.resolve([] as ConsultLog[])),
    [clientKey],
    [] as ConsultLog[],
  )
  const payments = useLiveQuery(
    () => (clientKey ? listPayments(clientKey) : Promise.resolve([] as Payment[])),
    [clientKey],
    [] as Payment[],
  )
  const totals = useLiveQuery(
    () =>
      clientKey
        ? clientTotals(clientKey)
        : Promise.resolve({ count: 0, minutes: 0, received: 0, pending: 0 }),
    [clientKey],
    { count: 0, minutes: 0, received: 0, pending: 0 },
  )
  const followUps = useLiveQuery(() => listFollowUps(today), [today], [])
  const month = useLiveQuery(
    () => monthStats(today),
    [today],
    { count: 0, minutes: 0, received: 0, pending: 0 },
  )

  const visibleClients = clients.filter((c) =>
    search.trim() ? c.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  )

  async function handleAddClient() {
    const id = await addClient('新客户')
    setSelectedId(id)
    toast.show({ message: '已新建客户，改个名字吧', tone: 'success' })
  }

  async function handleDeleteClient(client: Client) {
    await deleteClient(client.id)
    setSelectedId(null)
    toast.show({ message: `已删除客户「${client.name}」`, tone: 'success' })
  }

  async function handleAddLog() {
    if (!selected || !logTopic.trim()) return
    await addConsultLog({
      clientId: selected.id,
      date: logDate,
      minutes: Number(logMinutes) || 0,
      topic: logTopic,
      summary: logSummary,
      nextFollowUp: logNext || null,
    })
    setLogTopic('')
    setLogSummary('')
    setLogNext('')
    toast.show({ message: '已记录一次沟通', tone: 'success' })
  }

  async function handleAddPayment() {
    if (!selected) return
    const amount = Number(payAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.show({ message: '金额要大于 0', tone: 'error' })
      return
    }
    await addPayment({ clientId: selected.id, amount, date: payDate, received: payReceived })
    setPayAmount('')
    toast.show({ message: '已记录一笔收款', tone: 'success' })
  }

  async function handleDeleteLog(log: ConsultLog) {
    await deleteConsultLog(log.id)
    undo('已删除沟通记录', () => restoreConsultLog(log.id))
  }

  async function handleDeletePayment(payment: Payment) {
    await deletePayment(payment.id)
    undo('已删除收款记录', () => restorePayment(payment.id))
  }

  return (
    <div className="page">
      <PageHeader
        title="咨询工作"
        sub={`本月 ${month.count} 场 · ${formatMinutes(month.minutes)} · 已收 ¥${month.received.toLocaleString()} · 待收 ¥${month.pending.toLocaleString()}`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void handleAddClient()}>
            ＋ 新客户
          </button>
        }
      />

      {followUps.length > 0 ? (
        <div className={s.followBar}>
          <span className={s.followLabel}>待跟进 {followUps.length} 位</span>
          <div className={s.followList}>
            {followUps.slice(0, 6).map((f) => (
              <button
                key={f.clientId}
                type="button"
                className={s.followChip}
                onClick={() => {
                  setSelectedId(f.clientId)
                  setStatusFilter('all')
                }}
              >
                {f.clientName}
                <span className={s.followDue}>
                  {f.overdueDays > 0 ? `逾期 ${f.overdueDays} 天` : '今天'}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <SplitPane
        sideTitle="客户"
        side={
          <>
            <input
              className={`input ${s.search}`}
              value={search}
              placeholder="搜索客户"
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className={s.statusTabs}>
              {STATUS_TABS.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={[s.statusTab, statusFilter === st ? s.statusOn : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setStatusFilter(st)}
                >
                  {st === 'all' ? '全部' : CLIENT_STATUS_LABEL[st]}
                </button>
              ))}
            </div>
            {visibleClients.length === 0 ? (
              <p className={s.sideEmpty}>
                {clients.length === 0 ? '还没有客户，点右上角新建。' : '没有匹配的客户'}
              </p>
            ) : (
              <ul className={s.clientList}>
                {visibleClients.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={[s.clientItem, c.id === selected?.id ? s.clientOn : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedId(c.id)}
                    >
                      <span className={s.clientName}>{c.name}</span>
                      <span className={[s.clientBadge, s[`cs_${c.status}`]].join(' ')}>
                        {CLIENT_STATUS_LABEL[c.status]}
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
            <p className="muted">左边还没有客户。点右上角「＋ 新客户」开始。</p>
          </Card>
        ) : (
          <>
            <Card>
              <div className={s.clientHead}>
                <h2 className={s.clientTitle}>
                  <InlineEdit
                    value={selected.name}
                    onCommit={(name) =>
                      name ? void patchClient(selected.id, { name }) : Promise.resolve()
                    }
                  />
                </h2>
                <div className={s.pills}>
                  {(Object.keys(CLIENT_STATUS_LABEL) as ClientStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={[s.pill, selected.status === st ? s.pillOn : ''].join(' ')}
                      onClick={() => void patchClient(selected.id, { status: st })}
                    >
                      {CLIENT_STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
                <div className={s.spacer} />
                <RowMenu
                  items={[
                    {
                      label: '删除客户',
                      danger: true,
                      onSelect: () => void handleDeleteClient(selected),
                    },
                  ]}
                />
              </div>

              <div className={s.metaRow}>
                <span className={s.metaLabel}>来源</span>
                <InlineEdit
                  value={selected.source}
                  placeholder="从哪认识的"
                  onCommit={(source) => void patchClient(selected.id, { source })}
                />
                <span className={s.metaLabel}>联系方式</span>
                <InlineEdit
                  value={selected.contact}
                  placeholder="微信 / 手机 / 邮箱"
                  onCommit={(contact) => void patchClient(selected.id, { contact })}
                />
              </div>

              <div className={s.noteRow}>
                <span className={s.metaLabel}>备注</span>
                <InlineEdit
                  value={selected.note}
                  multiline
                  placeholder="背景、偏好、注意事项…"
                  onCommit={(note) => void patchClient(selected.id, { note })}
                />
              </div>

              <div className={s.summary}>
                <span>{totals.count} 次沟通</span>
                <span>{formatMinutes(totals.minutes)}</span>
                <span className={s.received}>已收 ¥{totals.received.toLocaleString()}</span>
                <span className={s.pending}>待收 ¥{totals.pending.toLocaleString()}</span>
              </div>
            </Card>

            <div className={s.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'logs'}
                className={[s.tab, tab === 'logs' ? s.tabOn : ''].join(' ')}
                onClick={() => setTab('logs')}
              >
                沟通记录 {logs.length}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'payments'}
                className={[s.tab, tab === 'payments' ? s.tabOn : ''].join(' ')}
                onClick={() => setTab('payments')}
              >
                收款 {payments.length}
              </button>
            </div>

            {tab === 'logs' ? (
              <Card flush>
                <div className={s.form}>
                  <div className={s.formRow}>
                    <input
                      type="date"
                      className={s.input}
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      step={15}
                      className={s.input}
                      value={logMinutes}
                      onChange={(e) => setLogMinutes(e.target.value)}
                      placeholder="分钟"
                    />
                    <input
                      type="date"
                      className={s.input}
                      value={logNext}
                      onChange={(e) => setLogNext(e.target.value)}
                      title="下次跟进日"
                    />
                    <span className={s.formHint}>日期 · 时长 · 下次跟进</span>
                  </div>
                  <div className={s.formRow}>
                    <input
                      className={`input ${s.grow}`}
                      value={logTopic}
                      placeholder="这次聊了什么主题"
                      onChange={(e) => setLogTopic(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void handleAddLog()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!logTopic.trim()}
                      onClick={() => void handleAddLog()}
                    >
                      记一次
                    </button>
                  </div>
                  <textarea
                    className={s.textarea}
                    rows={2}
                    value={logSummary}
                    placeholder="纪要（可选）"
                    onChange={(e) => setLogSummary(e.target.value)}
                  />
                </div>

                {logs.length === 0 ? (
                  <p className={s.empty}>还没有沟通记录。</p>
                ) : (
                  <ul className={s.timeline}>
                    {logs.map((log) => (
                      <li key={log.id} className={s.logItem}>
                        <div className={s.logDot} aria-hidden />
                        <div className={s.logBody}>
                          <div className={s.logHead}>
                            <span className={s.logDate}>{formatCn(log.date)}</span>
                            <span className={s.logMinutes}>{formatMinutes(log.minutes)}</span>
                            {log.nextFollowUp ? (
                              <span className={s.logNext}>
                                下次 {formatShort(log.nextFollowUp)}
                              </span>
                            ) : null}
                            <RowMenu
                              items={[
                                {
                                  label: '删除',
                                  danger: true,
                                  onSelect: () => void handleDeleteLog(log),
                                },
                              ]}
                            />
                          </div>
                          <p className={s.logTopic}>{log.topic}</p>
                          {log.summary ? (
                            <ClampText text={log.summary} className={s.logSummary} />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : (
              <Card flush>
                <div className={s.form}>
                  <div className={s.formRow}>
                    <input
                      className={s.input}
                      value={payAmount}
                      placeholder="金额"
                      inputMode="decimal"
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                    <input
                      type="date"
                      className={s.input}
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                    <label className={s.checkbox}>
                      <input
                        type="checkbox"
                        checked={payReceived}
                        onChange={(e) => setPayReceived(e.target.checked)}
                      />
                      已收
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!payAmount.trim()}
                      onClick={() => void handleAddPayment()}
                    >
                      记一笔
                    </button>
                  </div>
                </div>

                {payments.length === 0 ? (
                  <p className={s.empty}>还没有收款记录。</p>
                ) : (
                  <ul className={s.payList}>
                    {payments.map((p) => (
                      <li key={p.id} className={s.payItem}>
                        <span className={s.payDate}>{formatShort(p.date)}</span>
                        <span className={s.payAmount}>¥{p.amount.toLocaleString()}</span>
                        <button
                          type="button"
                          className={[s.payBadge, p.received === 1 ? s.payDone : s.payWait].join(
                            ' ',
                          )}
                          onClick={() => void setPaymentReceived(p.id, p.received === 0)}
                          title="点一下切换状态"
                        >
                          {p.received === 1 ? '已收' : '待收'}
                        </button>
                        <div className={s.spacer} />
                        <RowMenu
                          items={[
                            {
                              label: '删除',
                              danger: true,
                              onSelect: () => void handleDeletePayment(p),
                            },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </>
        )}
      </SplitPane>

      <p className={s.footerHint}>
        待跟进按「最近一次沟通填的下次跟进日」算；没填就默认 30 天后提醒。已结案的客户不再提醒。
      </p>
    </div>
  )
}
