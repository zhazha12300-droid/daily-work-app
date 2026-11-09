import { db } from './index'
import { SCHEMA_VERSION, TABLE_NAMES } from './schema'
import { ensureSettings } from '../repo/settings'

export const BACKUP_APP = 'my-workbench'
export const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  counts: Record<string, number>
  data: Record<string, unknown[]>
}

/** 全表打包，包含软删除的记录（这样撤销历史也能跟着搬家） */
export async function buildBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const name of TABLE_NAMES) {
    const rows = (await db.table(name).toArray()) as unknown[]
    data[name] = rows
    counts[name] = rows.length
  }
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts,
    data,
  }
}

export function backupFileName(at: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `工作台备份-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.json`
}

/** 触发浏览器下载。data 走 Blob，不联网。 */
export function downloadBackup(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  file?: BackupFile
  counts?: Record<string, number>
  total?: number
}

/**
 * 导入前的四道检查（设计稿 3.4）：
 *  1. app 标识与 version 对得上
 *  2. 表名在清单内（不认识的忽略并提示）
 *  3. 每条记录有 id
 *  4. 体积不超过 50MB
 */
export function validateBackup(raw: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errors: ['文件内容不是一个 JSON 对象'], warnings }
  }

  const obj = raw as Partial<BackupFile>

  if (obj.app !== BACKUP_APP) {
    errors.push(`不是本应用的备份文件（app = ${String(obj.app)}）`)
  }
  if (typeof obj.version !== 'number' || !Number.isInteger(obj.version)) {
    errors.push('缺少版本号')
  } else if (obj.version > SCHEMA_VERSION) {
    errors.push(`备份版本 ${obj.version} 比当前程序版本 ${SCHEMA_VERSION} 新，请先升级程序`)
  }
  if (typeof obj.data !== 'object' || obj.data === null || Array.isArray(obj.data)) {
    errors.push('缺少 data 字段')
  }

  if (errors.length > 0) return { ok: false, errors, warnings }

  let bytes = 0
  try {
    bytes = new Blob([JSON.stringify(obj)]).size
  } catch {
    errors.push('文件内容无法序列化')
    return { ok: false, errors, warnings }
  }
  if (bytes > MAX_BACKUP_BYTES) {
    errors.push(`文件太大（${(bytes / 1024 / 1024).toFixed(1)}MB），上限 50MB`)
  }

  const counts: Record<string, number> = {}
  let total = 0

  for (const [table, rows] of Object.entries(obj.data as Record<string, unknown>)) {
    if (!TABLE_NAMES.includes(table)) {
      warnings.push(`忽略了不认识的表：${table}`)
      continue
    }
    if (!Array.isArray(rows)) {
      errors.push(`表 ${table} 的内容不是数组`)
      continue
    }
    counts[table] = rows.length
    total += rows.length

    for (const row of rows) {
      if (typeof row !== 'object' || row === null || typeof (row as { id?: unknown }).id !== 'string') {
        errors.push(`表 ${table} 里有记录缺少 id`)
        break
      }
    }
  }

  if (Object.keys(counts).length === 0) errors.push('备份里没有任何数据表')

  return { ok: errors.length === 0, errors, warnings, file: obj as BackupFile, counts, total }
}

/**
 * 覆盖式恢复：一个事务里清空所有表再写入，中途失败整体回滚。
 * 调用方必须先让用户确认，并先导出当前数据。
 */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const source = file.data as Record<string, unknown[]>

  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name)
      await table.clear()
      const rows = source[name]
      if (Array.isArray(rows) && rows.length > 0) {
        await table.bulkPut(rows)
      }
    }
  })

  // 恢复后确保设置记录存在，否则界面会读到 undefined
  await ensureSettings()
}

/** 清空单张表（危险区「清空某个模块」用）。设置表不允许走这条路。 */
export async function clearTable(name: string): Promise<void> {
  if (!TABLE_NAMES.includes(name)) throw new Error(`不认识的表：${name}`)
  if (name === 'settings') throw new Error('设置表不能这样清空')
  await db.table(name).clear()
}

/** 清空全部数据（危险区用），保留设置里的主题等偏好 */
export async function clearAllData(keepSettings = true): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      if (keepSettings && name === 'settings') continue
      await db.table(name).clear()
    }
  })
  await ensureSettings()
}
