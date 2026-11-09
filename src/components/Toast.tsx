import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import s from './ui.module.css'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastInput {
  message: string
  tone?: ToastTone
  actionLabel?: string
  onAction?: () => void | Promise<void>
  /** 0 = 不自动消失 */
  timeout?: number
}

interface ToastItem extends ToastInput {
  id: number
}

export interface ToastApi {
  show: (input: ToastInput) => void
  dismiss: (id: number) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const show = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current
      // 最多同时叠 3 条，老的自然被挤掉
      setItems((prev) => [...prev.slice(-2), { ...input, id }])
      if (input.timeout !== 0) {
        window.setTimeout(() => dismiss(id), input.timeout ?? 4000)
      }
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className={s.toastWrap} role="status" aria-live="polite">
        {items.map((item) => {
          const toneClass =
            item.tone === 'error' ? s.toastError : item.tone === 'success' ? s.toastSuccess : ''
          return (
            <div key={item.id} className={`${s.toast} ${toneClass}`}>
              <span className={s.toastMsg}>{item.message}</span>
              {item.actionLabel && item.onAction ? (
                <button
                  type="button"
                  className={s.toastAction}
                  onClick={() => {
                    dismiss(item.id)
                    void item.onAction?.()
                  }}
                >
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
