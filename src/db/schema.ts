import Dexie, { type Table } from 'dexie'
import type {
  BodyMetric,
  Client,
  ConsultLog,
  DevItem,
  DevNote,
  DevProject,
  FitTemplate,
  FoodItem,
  Game,
  GameSession,
  Meal,
  MediaItem,
  Memo,
  Payment,
  Settings,
  ShoppingItem,
  Task,
  WatchItem,
  WaterLog,
  WorkLog,
  WorkoutSession,
} from './types'

export const DB_NAME = 'workbench'
export const SCHEMA_VERSION = 1

/**
 * 表结构定义（Dexie 的唯一真源）。
 * 改表必须先改这里，再写 upgrade()，最后才改页面。
 */
export const STORES: Record<string, string> = {
  tasks: 'id, date, [date+done], [date+focus], sourceType, deletedAt',
  memos: 'id, createdAt, processedAt, deletedAt',
  mediaItems: 'id, status, planDate, publishDate, deletedAt',
  devProjects: 'id, status, sortOrder, deletedAt',
  devItems: 'id, projectId, status, type, [projectId+status], deletedAt',
  workLogs: 'id, projectId, startedAt, devItemId, deletedAt',
  devNotes: 'id, projectId, deletedAt',
  clients: 'id, status, name, deletedAt',
  consultLogs: 'id, clientId, date, nextFollowUp, deletedAt',
  payments: 'id, clientId, date, received, deletedAt',
  fitTemplates: 'id, weekday',
  workoutSessions: 'id, date, deletedAt',
  bodyMetrics: 'id, &date',
  meals: 'id, date, [date+slot], deletedAt',
  waterLogs: 'id, &date',
  shoppingItems: 'id, done, deletedAt',
  foodLibrary: 'id, name, deletedAt',
  games: 'id, status, deletedAt',
  gameSessions: 'id, gameId, date',
  watchItems: 'id, type, done, deletedAt',
  settings: 'id',
}

/** 备份时的表清单：顺序固定，方便人工比对 */
export const TABLE_NAMES = Object.keys(STORES)

export class WorkbenchDB extends Dexie {
  tasks!: Table<Task, string>
  memos!: Table<Memo, string>
  mediaItems!: Table<MediaItem, string>
  devProjects!: Table<DevProject, string>
  devItems!: Table<DevItem, string>
  workLogs!: Table<WorkLog, string>
  devNotes!: Table<DevNote, string>
  clients!: Table<Client, string>
  consultLogs!: Table<ConsultLog, string>
  payments!: Table<Payment, string>
  fitTemplates!: Table<FitTemplate, string>
  workoutSessions!: Table<WorkoutSession, string>
  bodyMetrics!: Table<BodyMetric, string>
  meals!: Table<Meal, string>
  waterLogs!: Table<WaterLog, string>
  shoppingItems!: Table<ShoppingItem, string>
  foodLibrary!: Table<FoodItem, string>
  games!: Table<Game, string>
  gameSessions!: Table<GameSession, string>
  watchItems!: Table<WatchItem, string>
  settings!: Table<Settings, string>

  constructor() {
    super(DB_NAME)
    this.version(SCHEMA_VERSION).stores(STORES)
  }
}
