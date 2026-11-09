import { db } from '../db'
import type { ISODate, Memo } from '../db/types'
import { newId } from '../lib/id'
import { nextTimestamp } from '../lib/time'
import { addTask } from './tasks'
import { restore, softDelete } from './undo'

const M = db.memos

export async function listMemos(): Promise<Memo[]> {
  const rows = await M.orderBy('createdAt').reverse().toArray()
  return rows.filter((m) => m.deletedAt === null)
}

export async function addMemo(text: string): Promise<string> {
  const now = nextTimestamp()
  const row: Memo = {
    id: newId(),
    text: text.trim(),
    processedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  await M.add(row)
  return row.id
}

export async function deleteMemo(id: string): Promise<void> {
  await softDelete(M, id)
}

export async function restoreMemo(id: string): Promise<void> {
  await restore(M, id)
}

/**
 * 备忘 → 今日任务：复制内容建任务，原备忘标记「已处理」折叠起来（不删）。
 * 设计稿 4.2 条：这是复制，不是引用。
 */
export async function memoToTask(id: string, date: ISODate): Promise<string | null> {
  const memo = await M.get(id)
  if (!memo) return null
  const taskId = await addTask({ date, title: memo.text })
  await M.update(id, { processedAt: Date.now(), updatedAt: Date.now() })
  return taskId
}
