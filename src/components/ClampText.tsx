import { useEffect, useRef, useState } from 'react'
import s from './ClampText.module.css'

interface ClampTextProps {
  text: string
  /** 折叠时保留几行 */
  lines?: number
  /** 外层样式（页面自己的字号、颜色） */
  className?: string
}

/**
 * 长文本默认折三行，超出才给「展开」。
 * 用 scrollHeight 判断是否真的溢出，所以短文本不会凭空多出一个按钮。
 */
export default function ClampText({ text, lines = 3, className }: ClampTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || open) return
    setOverflow(el.scrollHeight - el.clientHeight > 2)
  }, [text, open, lines])

  return (
    <div className={className}>
      <p
        ref={ref}
        className={open ? s.text : `${s.text} ${s.clamp}`}
        style={open ? undefined : { WebkitLineClamp: lines }}
      >
        {text}
      </p>
      {overflow || open ? (
        <button type="button" className={s.toggle} onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '展开'}
        </button>
      ) : null}
    </div>
  )
}
