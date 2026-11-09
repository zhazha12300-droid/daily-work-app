export type ModuleKey =
  | 'home'
  | 'today'
  | 'media'
  | 'dev'
  | 'consult'
  | 'fitness'
  | 'diet'
  | 'game'
  | 'settings'

export interface ModuleDef {
  key: ModuleKey
  /** 地址，与设计稿 2.2 节一致 */
  path: string
  label: string
  /** 板块主色，只用于圆点 / 标签 / 进度条 */
  accent: string
  summary: string
  /** 这个板块第一版包含的块，占位页先列出来 */
  blocks: string[]
  /** 属于哪个里程碑 */
  milestone: string
}

export const MODULES: ModuleDef[] = [
  {
    key: 'home',
    path: '/',
    label: '首页总览',
    accent: 'var(--c-home)',
    summary: '今天该做什么，一眼看到',
    blocks: ['今日计划摘要（可直接勾选）', '快速备忘', '六张模块摘要卡'],
    milestone: 'M2',
  },
  {
    key: 'today',
    path: '/today',
    label: '今日计划',
    accent: 'var(--c-today)',
    summary: '一天的任务、重点与完成率',
    blocks: ['最多三项今日重点', '任务清单与行内编辑', '隔日未完成顺延', '本周完成率'],
    milestone: 'M2',
  },
  {
    key: 'media',
    path: '/media',
    label: '自媒体',
    accent: 'var(--c-media)',
    summary: '选题 → 排期 → 发布 → 回填',
    blocks: ['选题四状态流转', '发布排期视图', '阅读/点赞数据回填', '一句话复盘'],
    milestone: 'M5',
  },
  {
    key: 'dev',
    path: '/dev',
    label: '开发工作',
    accent: 'var(--c-dev)',
    summary: '项目、需求与 Bug、工时',
    blocks: ['项目列表与状态', '需求 / 任务 / Bug 分组', '计时与工时记录', '踩坑笔记'],
    milestone: 'M3',
  },
  {
    key: 'consult',
    path: '/consult',
    label: '咨询工作',
    accent: 'var(--c-consult)',
    summary: '客户、沟通记录、跟进与收款',
    blocks: ['客户档案', '沟通记录时间线', '待跟进提醒', '收款与待收统计'],
    milestone: 'M3',
  },
  {
    key: 'fitness',
    path: '/fitness',
    label: '健身计划',
    accent: 'var(--c-fitness)',
    summary: '一周模板 → 逐组打卡 → PR',
    blocks: ['一周训练模板', '训练专注模式', '历史记录与最好重量', '身体数据'],
    milestone: 'M4',
  },
  {
    key: 'diet',
    path: '/diet',
    label: '饮食计划',
    accent: 'var(--c-diet)',
    summary: '三餐、热量、喝水、采购',
    blocks: ['四餐食物记录', '食物库联想', '饮水打卡', '购物清单'],
    milestone: 'M4',
  },
  {
    key: 'game',
    path: '/game',
    label: '游戏娱乐',
    accent: 'var(--c-game)',
    summary: '游戏库、进度与娱乐时长',
    blocks: ['游戏库与状态', '进度与时长记录', '通关存档', '影视书清单'],
    milestone: 'M5',
  },
  {
    key: 'settings',
    path: '/settings',
    label: '数据与设置',
    accent: 'var(--c-settings)',
    summary: '备份、偏好与危险操作',
    blocks: ['数据概览', '导出 / 恢复备份', '外观与偏好', '危险区'],
    milestone: 'M6',
  },
]

export const MODULE_MAP: Record<ModuleKey, ModuleDef> = MODULES.reduce(
  (acc, m) => {
    acc[m.key] = m
    return acc
  },
  {} as Record<ModuleKey, ModuleDef>,
)
