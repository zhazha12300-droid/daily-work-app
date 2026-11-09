import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { ensureSettings } from '../src/repo/settings'
import {
  addItem,
  addProject,
  addWorkLog,
  countOpenBugs,
  listItems,
  minutesByItem,
  patchItem,
  patchProject,
  weekMinutesByProject,
} from '../src/repo/dev'
import {
  addClient,
  addConsultLog,
  addPayment,
  clientTotals,
  listFollowUps,
  monthStats,
  patchClient,
  setPaymentReceived,
} from '../src/repo/consult'

const D = '2026-09-18'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('开发工作', () => {
  it('项目里的条目按状态分组，切换完成会写 doneAt', async () => {
    const pid = await addProject('项目A')
    const a = await addItem({ projectId: pid, type: 'bug', title: '登录 bug' })
    await addItem({ projectId: pid, type: 'feature', title: '新首页' })

    let items = await listItems(pid)
    expect(items).toHaveLength(2)
    expect(items[0].status).toBe('todo')

    await patchItem(a, { status: 'done' })
    items = await listItems(pid)
    const done = items.find((x) => x.id === a)
    expect(done?.doneAt).toBeTypeOf('number')
    expect(await countOpenBugs()).toBe(0)
  })

  it('未解决 Bug 只算没完成的', async () => {
    const pid = await addProject('项目B')
    const b1 = await addItem({ projectId: pid, type: 'bug', title: 'bug1' })
    await addItem({ projectId: pid, type: 'bug', title: 'bug2' })
    expect(await countOpenBugs()).toBe(2)

    await patchItem(b1, { status: 'done' })
    expect(await countOpenBugs()).toBe(1)
  })

  it('工时按条目累计，也能按项目汇总到本周', async () => {
    const pid = await addProject('项目C')
    const item = await addItem({ projectId: pid, type: 'task', title: '写文档' })

    await addWorkLog({
      projectId: pid,
      devItemId: item,
      startedAt: Date.parse('2026-09-15T10:00:00'),
      minutes: 30,
    })
    await addWorkLog({
      projectId: pid,
      devItemId: item,
      startedAt: Date.parse('2026-09-16T10:00:00'),
      minutes: 45,
    })
    // 上一周的记录不该算进来
    await addWorkLog({
      projectId: pid,
      devItemId: item,
      startedAt: Date.parse('2026-09-01T10:00:00'),
      minutes: 999,
    })

    const byItem = await minutesByItem(pid)
    // 条目上是「累计工时」，包含所有历史
    expect(byItem[item]).toBe(30 + 45 + 999)

    const week = await weekMinutesByProject(D, 1)
    expect(week).toHaveLength(1)
    expect(week[0].minutes).toBe(75)
    expect(week[0].projectName).toBe('项目C')
  })

  it('改项目状态会同步到列表', async () => {
    const pid = await addProject('项目D')
    await patchProject(pid, { status: 'paused' })
    const row = await db.devProjects.get(pid)
    expect(row?.status).toBe('paused')
  })
})

describe('咨询工作', () => {
  it('待跟进：优先用下次跟进日，没填按 30 天', async () => {
    const c1 = await addClient('客户一') // 30 天前沟通，没填下次跟进 → 已逾期
    await addConsultLog({ clientId: c1, date: '2026-08-10', minutes: 60, topic: '初次' })

    const c2 = await addClient('客户二') // 9 天前沟通 → 还没到 30 天
    await addConsultLog({ clientId: c2, date: '2026-09-09', minutes: 60, topic: '随访' })

    const c3 = await addClient('客户三') // 明确写了今天跟进
    await addConsultLog({
      clientId: c3,
      date: '2026-09-01',
      minutes: 60,
      topic: '方案',
      nextFollowUp: '2026-09-18',
    })

    const list = await listFollowUps(D)
    const names = list.map((f) => f.clientName).sort()
    expect(names).toEqual(['客户一', '客户三'].sort())

    const first = list.find((f) => f.clientName === '客户一')
    expect(first?.overdueDays).toBe(9)
    const third = list.find((f) => f.clientName === '客户三')
    expect(third?.overdueDays).toBe(0)
  })

  it('已结案的客户不再提醒', async () => {
    const c = await addClient('已结案客户')
    await addConsultLog({ clientId: c, date: '2026-08-01', minutes: 60, topic: '旧事' })
    await patchClient(c, { status: 'closed' })
    expect(await listFollowUps(D)).toHaveLength(0)
  })

  it('本月统计：场次、时长、已收、待收', async () => {
    const c = await addClient('客户甲')
    await addConsultLog({ clientId: c, date: '2026-09-05', minutes: 90, topic: 'A' })
    await addConsultLog({ clientId: c, date: '2026-09-12', minutes: 30, topic: 'B' })
    await addConsultLog({ clientId: c, date: '2026-08-30', minutes: 120, topic: '上月' })

    const paid = await addPayment({
      clientId: c,
      amount: 2000,
      date: '2026-09-10',
      received: true,
    })
    await addPayment({ clientId: c, amount: 1500, date: '2026-09-15', received: false })

    const stats = await monthStats(D)
    expect(stats.count).toBe(2)
    expect(stats.minutes).toBe(120)
    expect(stats.received).toBe(2000)
    expect(stats.pending).toBe(1500)

    await setPaymentReceived(paid, false)
    const after = await monthStats(D)
    expect(after.received).toBe(0)
    expect(after.pending).toBe(3500)
  })

  it('客户累计：次数、时长与金额', async () => {
    const c = await addClient('客户乙')
    await addConsultLog({ clientId: c, date: '2026-09-01', minutes: 60, topic: 'X' })
    await addPayment({ clientId: c, amount: 800, date: '2026-09-02', received: true })

    const totals = await clientTotals(c)
    expect(totals).toEqual({ count: 1, minutes: 60, received: 800, pending: 0 })
  })
})
