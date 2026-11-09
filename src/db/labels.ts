/**
 * 表的中文名，给「数据概览」和「清空单个模块」用。
 * 键必须与 db/schema.ts 的 STORES 一致，tests/m6.test.ts 会做一致性校验。
 */
export const TABLE_LABEL: Record<string, string> = {
  tasks: '任务',
  memos: '快速备忘',
  mediaItems: '自媒体选题',
  devProjects: '开发项目',
  devItems: '开发条目',
  workLogs: '工时记录',
  devNotes: '开发笔记',
  clients: '咨询客户',
  consultLogs: '沟通记录',
  payments: '收款记录',
  fitTemplates: '健身模板',
  workoutSessions: '训练记录',
  bodyMetrics: '身体数据',
  meals: '饮食记录',
  waterLogs: '饮水记录',
  shoppingItems: '购物清单',
  foodLibrary: '食物库',
  games: '游戏',
  gameSessions: '游戏时长',
  watchItems: '娱乐清单',
  settings: '设置与偏好',
}

export interface TableGroup {
  title: string
  tables: string[]
}

/** 按板块分组，清空单模块时按这个顺序列出 */
export const TABLE_GROUPS: TableGroup[] = [
  { title: '首页与今日计划', tables: ['tasks', 'memos'] },
  { title: '自媒体', tables: ['mediaItems'] },
  { title: '开发工作', tables: ['devProjects', 'devItems', 'workLogs', 'devNotes'] },
  { title: '咨询工作', tables: ['clients', 'consultLogs', 'payments'] },
  { title: '健身计划', tables: ['fitTemplates', 'workoutSessions', 'bodyMetrics'] },
  { title: '饮食计划', tables: ['meals', 'waterLogs', 'shoppingItems', 'foodLibrary'] },
  { title: '游戏娱乐', tables: ['games', 'gameSessions', 'watchItems'] },
]

/** 可以单独清空的表：设置表永远保留 */
export const CLEARABLE_TABLES = TABLE_GROUPS.flatMap((g) => g.tables)

export function tableLabel(name: string): string {
  return TABLE_LABEL[name] ?? name
}

/** 估算占用：把记录集合序列化后的字节数（够用就好，不当精确值） */
export function estimateBytes(rows: unknown[]): number {
  try {
    return new Blob([JSON.stringify(rows)]).size
  } catch {
    return 0
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
