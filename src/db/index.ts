import { WorkbenchDB } from './schema'

export const db = new WorkbenchDB()

/** 把 IndexedDB 的异常翻译成能给人看的话 */
export function describeDbError(err: unknown): string {
  const e = err as { name?: string; message?: string } | null
  if (!e) return '未知错误'
  if (e.name === 'QuotaExceededError') return '浏览器存储空间已满，请先导出备份并清理旧数据'
  if (e.name === 'InvalidStateError') return '数据库被浏览器的隐私模式或清理操作关闭了，请刷新页面'
  if (e.name === 'VersionError') return '数据库版本不匹配（可能是被旧标签页占用了），请关掉其它标签页再刷新'
  return e.message ?? '未知错误'
}

export type { Table } from 'dexie'
