import type { CSSProperties } from 'react'
import s from './ui.module.css'

export interface MiniBarDatum {
  label: string
  value: number
}

interface MiniBarsProps {
  data: MiniBarDatum[]
  color?: string
  /** 空数据时的提示 */
  emptyHint?: string
}

export default function MiniBars({ data, color, emptyHint = '暂无数据' }: MiniBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.value))

  if (data.every((d) => d.value === 0)) {
    return <p className="muted" style={{ fontSize: 'var(--fs-aux)' }}>{emptyHint}</p>
  }

  return (
    <div className={s.bars} role="img" aria-label="迷你柱状图">
      {data.map((d) => (
        <div key={d.label} className={s.barCol} title={`${d.label}：${d.value}`}>
          <div
            className={s.bar}
            style={
              {
                height: `${Math.round((d.value / max) * 100)}%`,
                '--bar-color': color,
              } as CSSProperties
            }
          />
          <span className={s.barLabel}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}
