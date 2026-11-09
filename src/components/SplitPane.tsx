import type { ReactNode } from 'react'
import s from './SplitPane.module.css'

interface SplitPaneProps {
  side: ReactNode
  children: ReactNode
  /** 左栏顶部的标题行 */
  sideTitle?: ReactNode
  sideActions?: ReactNode
}

/**
 * 左列表 + 右详情的双栏。窄屏（<1180）自动变成上下堆叠。
 * 开发工作和咨询工作共用这一套。
 */
export default function SplitPane({ side, children, sideTitle, sideActions }: SplitPaneProps) {
  return (
    <div className={s.split}>
      <aside className={s.side}>
        {sideTitle || sideActions ? (
          <header className={s.sideHead}>
            <span className={s.sideTitle}>{sideTitle}</span>
            {sideActions ? <div className={s.sideActions}>{sideActions}</div> : null}
          </header>
        ) : null}
        <div className={s.sideBody}>{side}</div>
      </aside>
      <section className={s.main}>{children}</section>
    </div>
  )
}
