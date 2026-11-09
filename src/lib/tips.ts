import type { ModuleKey } from '../modules'

/**
 * 每个板块首次进入时的一条说明。
 * 只讲「这个板块和别处不一样的地方」，不讲废话——
 * 用户是自己，说明看一次就够，所以每条都能永久关掉。
 */
export interface ModuleTipDef {
  /** 存进 settings.dismissedTips 的值 */
  id: string
  title: string
  body: string
}

const RAW: Record<ModuleKey, Omit<ModuleTipDef, 'id'>> = {
  home: {
    title: '这里是每天第一眼要看的地方',
    body: '今日计划可以直接勾；下面六张卡点进去就是对应板块。随手记东西按 Ctrl/⌘+K，先记下来，回头再归位。',
  },
  today: {
    title: '一天最多三个重点',
    body: '点行左边的 ☆ 设为重点，满了三个就设不上了——这是故意的。勾掉的任务留在原位变灰，不会跳走，所以不会被「跳一下」骗到。',
  },
  media: {
    title: '一条选题往前走四步',
    body: '想法 → 选题 → 写作中 → 已发布，点行右边的 → 推一格。发布后回填阅读数，统计和「表现最好」才准。过了计划日还没发的会标红。',
  },
  dev: {
    title: '左边项目，右边内容',
    body: '条目上点「计时」，右边侧栏会一直走，切板块也不停。点侧栏那条计时就能结束并写进工时记录。踩过的坑记在下面的笔记里，以后能全局搜。',
  },
  consult: {
    title: '跟进和收款都在这一页',
    body: '填了「下次跟进」的客户会出现在顶部横条；没填的按上次沟通 30 天算。收款条点亮蓝色徽章＝已收，顶部能看本月待收总额。',
  },
  fitness: {
    title: '先把一周七天排好',
    body: '哪天练、哪天休息先定下来，之后每天只剩「照做」。练的时候点「开始训练」进专注模式，空格记一组。重量记录会攒出 PR，身体数据每天只记一条。',
  },
  diet: {
    title: '记个名字也算记了',
    body: '四餐随便填，热量留空就不计入合计——别为了填数字放弃记录。喝水点八下杯子，购物清单随手加，去超市照着买。',
  },
  game: {
    title: '时长和感受都留下',
    body: '玩完点「＋ 记时长」，几十秒的事。通关时写一句当时的感受和评分，半年后回头看才知道当时在想什么。',
  },
  settings: {
    title: '数据只在这台电脑的浏览器里',
    body: '清一次浏览数据它就没了，也没有云端副本。唯一能保住它的是「导出备份」——导出的 JSON 文件可以随便放，恢复时原样还原。建议每周导一次。',
  },
}

export const MODULE_TIPS: Record<ModuleKey, ModuleTipDef> = Object.fromEntries(
  Object.entries(RAW).map(([key, def]) => [key, { id: `tip:${key}`, ...def }]),
) as Record<ModuleKey, ModuleTipDef>

/** 首次启动引导只用这一个标记，和板块提示存在同一个数组里 */
export const WELCOME_TIP_ID = 'welcome'

export function isTipDismissed(dismissed: string[] | undefined, id: string): boolean {
  return Array.isArray(dismissed) && dismissed.includes(id)
}

/** 关掉一条提示：已经关过就原样返回，避免数组越写越长 */
export function dismissTip(dismissed: string[] | undefined, id: string): string[] {
  const list = Array.isArray(dismissed) ? dismissed : []
  return list.includes(id) ? list : [...list, id]
}

/** 恢复备份后旧数据可能没带这个字段，所有提示会重新出现——按「没关过」处理即可 */
export function normalizeDismissedTips(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
