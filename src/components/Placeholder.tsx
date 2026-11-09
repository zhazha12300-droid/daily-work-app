import type { CSSProperties } from 'react'
import type { ModuleDef } from '../modules'

/**
 * 占位页：M0 只验证「路由 + 布局 + 主题」通不通，
 * 每个板块的真实界面在自己的里程碑里替换掉这个组件。
 */
export default function Placeholder({ mod }: { mod: ModuleDef }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">{mod.label}</h1>
          <p className="page-sub">{mod.summary}</p>
        </div>
        <span className="tag">{mod.milestone} 待实装</span>
      </header>

      <section className="card">
        <h2 className="section-title">这个板块会包含</h2>
        <div className="chips">
          {mod.blocks.map((b) => (
            <span key={b} className="chip" style={{ '--chip-color': mod.accent } as CSSProperties}>
              {b}
            </span>
          ))}
        </div>
      </section>

      <section className="card card-dashed">
        <p>
          骨架已就位：路由、主题、布局都能用了。这个板块的数据层与交互会在
          <strong> {mod.milestone} </strong>
          阶段接上。
        </p>
      </section>
    </div>
  )
}
