import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { buildBackup, restoreBackup, validateBackup, clearAllData } from '../src/db/backup'
import { TABLE_NAMES } from '../src/db/schema'
import { addTask, deleteTask, listTasks, restoreTask, toggleTask } from '../src/repo/tasks'
import { ensureSettings } from '../src/repo/settings'

const D = '2026-09-18'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSettings()
})

describe('任务数据层', () => {
  it('新建后能读回来，并且落在指定日期', async () => {
    const id = await addTask({ date: D, title: '写周报' })
    const rows = await listTasks(D)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(id)
    expect(rows[0].title).toBe('写周报')
    expect(rows[0].done).toBe(0)
    expect(await listTasks('2026-09-19')).toHaveLength(0)
  })

  it('勾选完成会写 doneAt，取消会清掉', async () => {
    const id = await addTask({ date: D, title: '回访张先生' })
    await toggleTask(id, true)
    let row = await db.tasks.get(id)
    expect(row?.done).toBe(1)
    expect(row?.doneAt).toBeTypeOf('number')

    await toggleTask(id, false)
    row = await db.tasks.get(id)
    expect(row?.done).toBe(0)
    expect(row?.doneAt).toBeNull()
  })

  it('删除是软删除：列表里消失，记录还在，撤销能回来', async () => {
    const id = await addTask({ date: D, title: '买菜' })
    await deleteTask(id)

    expect(await listTasks(D)).toHaveLength(0)
    const raw = await db.tasks.get(id)
    expect(raw).toBeDefined()
    expect(raw?.deletedAt).toBeTypeOf('number')

    await restoreTask(id)
    const rows = await listTasks(D)
    expect(rows.map((r) => r.id)).toContain(id)
  })

  it('列表按创建时间稳定排序，勾选完成不会改变位置', async () => {
    await addTask({ date: D, title: 'A' })
    const b = await addTask({ date: D, title: 'B' })
    await toggleTask(b, true)
    const rows = await listTasks(D)
    expect(rows.map((r) => r.title)).toEqual(['A', 'B'])
  })
})

describe('备份与恢复', () => {
  it('导出 → 清空 → 导入，数据逐项一致', async () => {
    await addTask({ date: D, title: '任务一' })
    await addTask({ date: D, title: '任务二' })

    const backup = await buildBackup()
    expect(backup.counts.tasks).toBe(2)
    expect(backup.counts.settings).toBe(1)

    await clearAllData()
    expect(await db.tasks.count()).toBe(0)

    const check = validateBackup(backup)
    expect(check.ok).toBe(true)
    expect(check.total).toBeGreaterThan(0)

    await restoreBackup(backup)
    const rows = await listTasks(D)
    expect(rows.map((r) => r.title).sort()).toEqual(['任务一', '任务二'])
    expect((await db.settings.get('app'))?.id).toBe('app')
  })

  it('校验会拒绝别家的文件和缺 id 的记录', () => {
    expect(validateBackup({ app: 'other', version: 1, data: {} }).ok).toBe(false)
    expect(
      validateBackup({
        app: 'my-workbench',
        version: 1,
        data: { tasks: [{ title: '没有 id' }] },
      }).ok,
    ).toBe(false)
  })

  it('未知表名只提示、不阻断', () => {
    const result = validateBackup({
      app: 'my-workbench',
      version: 1,
      data: { tasks: [], mystery: [] },
    })
    expect(result.ok).toBe(true)
    expect(result.warnings.join()).toContain('mystery')
  })

  it('备份包含全部 21 张表（settings 之外的表都要在）', () => {
    expect(TABLE_NAMES).toHaveLength(21)
    expect(TABLE_NAMES).toContain('workoutSessions')
  })
})
