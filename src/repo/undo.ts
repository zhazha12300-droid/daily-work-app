import type { Table } from 'dexie'

interface SoftRecord {
  id: string
  deletedAt: number | null
  updatedAt: number
}

type UpdateSpec<T> = Parameters<Table<T, string>['update']>[1]

/**
 * 软删除 —— 全站唯一的删除方式。
 * 不真删，是为了「撤销」和误删找回留后路。
 */
export async function softDelete<T extends SoftRecord>(table: Table<T, string>, id: string) {
  const now = Date.now()
  await table.update(id, { deletedAt: now, updatedAt: now } as unknown as UpdateSpec<T>)
}

export async function restore<T extends SoftRecord>(table: Table<T, string>, id: string) {
  const now = Date.now()
  await table.update(id, { deletedAt: null, updatedAt: now } as unknown as UpdateSpec<T>)
}

/** 判断一条记录是否可见 */
export function isAlive<T extends { deletedAt: number | null }>(row: T): boolean {
  return row.deletedAt === null
}
