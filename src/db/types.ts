/**
 * 数据契约 —— 22 张表的唯一真源。
 * 约定：
 *  1. 布尔值一律用 0 / 1（IndexedDB 不能给 boolean 建索引）。
 *  2. 所有业务表都有 id / createdAt / updatedAt / deletedAt（软删除）。
 *  3. 日期一律是本地时区的 'YYYY-MM-DD' 字符串，比较即字典序比较。
 */

export type ISODate = string

export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  /** null = 未删除；有值 = 软删除时间戳 */
  deletedAt: number | null
}

export type Bit = 0 | 1

/* ── 首页 / 今日计划 ─────────────────────────────────────────────── */

export type Priority = 0 | 1 | 2 // 0 高 / 1 中 / 2 低
export type TaskSource = 'dev' | 'consult' | 'media'

export interface Task extends BaseRecord {
  date: ISODate
  title: string
  note: string
  priority: Priority
  estimateMin: number | null
  done: Bit
  doneAt: number | null
  focus: Bit
  focusOrder: number
  /** 「加入今天」是引用，不回写来源状态，所以只存展示用的快照 */
  sourceType: TaskSource | null
  sourceId: string | null
  sourceLabel: string | null
}

export interface Memo extends BaseRecord {
  text: string
  /** 已转成任务的时间；非 null 就折叠到「已处理」 */
  processedAt: number | null
}

/* ── 自媒体 ──────────────────────────────────────────────────────── */

export type MediaStatus = 'idea' | 'topic' | 'writing' | 'published'
export type MediaRating = 'good' | 'avg' | 'bad' | null

export interface MediaItem extends BaseRecord {
  title: string
  platform: string
  status: MediaStatus
  planDate: ISODate | null
  publishDate: ISODate | null
  link: string
  outline: string
  views: number | null
  likes: number | null
  followers: number | null
  review: string
  rating: MediaRating
}

/* ── 开发工作 ────────────────────────────────────────────────────── */

export type ProjectStatus = 'building' | 'maintain' | 'paused' | 'idea'
export type DevItemType = 'feature' | 'task' | 'bug'
export type DevItemStatus = 'todo' | 'doing' | 'verify' | 'done'

export interface DevProject extends BaseRecord {
  name: string
  status: ProjectStatus
  stack: string
  repo: string
  note: string
  sortOrder: number
}

export interface DevItem extends BaseRecord {
  projectId: string
  type: DevItemType
  title: string
  status: DevItemStatus
  priority: Priority
  note: string
  doneAt: number | null
}

export interface WorkLog extends BaseRecord {
  projectId: string
  devItemId: string | null
  startedAt: number
  endedAt: number | null
  minutes: number
  note: string
}

export interface DevNote extends BaseRecord {
  projectId: string
  title: string
  body: string
}

/* ── 咨询工作 ────────────────────────────────────────────────────── */

export type ClientStatus = 'lead' | 'active' | 'closed'

export interface Client extends BaseRecord {
  name: string
  source: string
  status: ClientStatus
  contact: string
  note: string
}

export interface ConsultLog extends BaseRecord {
  clientId: string
  date: ISODate
  minutes: number
  topic: string
  summary: string
  nextFollowUp: ISODate | null
}

export interface Payment extends BaseRecord {
  clientId: string
  amount: number
  date: ISODate
  received: Bit
  note: string
}

/* ── 健身计划 ────────────────────────────────────────────────────── */

export interface TemplateExercise {
  name: string
  sets: number
  reps: number
  weight: number | null
}

export interface FitTemplate extends BaseRecord {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7
  isRest: Bit
  name: string
  exercises: TemplateExercise[]
}

export interface SessionSet {
  targetReps: number
  targetWeight: number | null
  actualReps: number | null
  actualWeight: number | null
  done: Bit
}

export interface SessionExercise {
  name: string
  sets: SessionSet[]
  skipped: Bit
}

export interface WorkoutSession extends BaseRecord {
  date: ISODate
  templateId: string | null
  templateName: string
  exercises: SessionExercise[]
  note: string
  durationMin: number
}

export interface BodyMetric extends BaseRecord {
  date: ISODate
  weight: number | null
  waist: number | null
  note: string
}

/* ── 饮食计划 ────────────────────────────────────────────────────── */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealItem {
  name: string
  amount: string
  kcal: number | null
}

export interface Meal extends BaseRecord {
  date: ISODate
  slot: MealSlot
  items: MealItem[]
}

export interface WaterLog {
  id: string
  date: ISODate
  cups: number
  updatedAt: number
}

export interface ShoppingItem extends BaseRecord {
  text: string
  done: Bit
}

export interface FoodItem extends BaseRecord {
  name: string
  kcal: number | null
  unit: string
}

/* ── 游戏娱乐 ────────────────────────────────────────────────────── */

export type GameStatus = 'playing' | 'wishlist' | 'finished' | 'shelved'

export interface Game extends BaseRecord {
  name: string
  platform: string
  status: GameStatus
  rating: number | null
  progress: string
  minutesTotal: number
  note: string
  finishedAt: number | null
}

export interface GameSession {
  id: string
  gameId: string
  date: ISODate
  minutes: number
  note: string
  createdAt: number
}

export type WatchType = 'tv' | 'movie' | 'book'

export interface WatchItem extends BaseRecord {
  title: string
  type: WatchType
  done: Bit
  doneAt: number | null
}

/* ── 设置 ────────────────────────────────────────────────────────── */

export interface HomeCardSetting {
  key: string
  visible: Bit
  order: number
}

export interface ActiveTimer {
  devItemId: string
  projectId: string
  label: string
  startedAt: number
}

export interface Settings {
  /** 单条记录，主键固定为 'app' */
  id: 'app'
  theme: 'light' | 'dark'
  /** 1 = 周一，0 = 周日 */
  weekStart: 0 | 1
  kcalTarget: number | null
  platforms: string[]
  homeCards: HomeCardSetting[]
  lastBackupAt: number | null
  activeTimer: ActiveTimer | null
  dismissedTips: string[]
  quickCaptureMode: 'memo' | 'task'
  updatedAt: number
}
