import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation } from 'react-router-dom'
import { db } from '../db'
import { MODULE_TIPS, dismissTip, isTipDismissed } from '../lib/tips'
import { MODULE_MAP, MODULES, type ModuleKey } from '../modules'
import { updateSettings } from '../repo/settings'
import s from './ModuleTip.module.css'

function moduleOf(pathname: string): ModuleKey {
  const hit = MODULES.find((m) => m.path === pathname)
  return hit ? hit.key : 'home'
}

/**
 * 每个板块第一次进来时头顶的一条说明，关掉后永远不再出现。
 * 放在 App 里按地址判断，省得九个页面各写一遍。
 */
export default function ModuleTipHost() {
  const { pathname } = useLocation()
  const key = moduleOf(pathname)
  const tip = MODULE_TIPS[key]
  const dismissed = useLiveQuery(
    async () => (await db.settings.get('app'))?.dismissedTips ?? [],
    [],
    null,
  )

  // 设置还没读出来时不渲染，避免关过的提示闪一下
  if (dismissed === null) return null
  if (isTipDismissed(dismissed, tip.id)) return null

  return (
    <div className={s.wrap}>
      <div
        className={s.tip}
        role="note"
        style={{ borderLeftColor: MODULE_MAP[key].accent }}
      >
        <span className={s.dot} style={{ background: MODULE_MAP[key].accent }} />
        <div className={s.text}>
          <p className={s.title}>{tip.title}</p>
          <p className={s.body}>{tip.body}</p>
        </div>
        <button
          type="button"
          className={s.close}
          aria-label="关掉这条提示，以后不再显示"
          title="关掉，不再显示"
          onClick={() => void updateSettings({ dismissedTips: dismissTip(dismissed, tip.id) })}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
