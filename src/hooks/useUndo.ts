import { useCallback } from 'react'
import { useToast } from '../components/Toast'

/**
 * 删除一律不给二次弹窗，而是「删了 + 5 秒内可撤销」。
 * 个人工具里，撤销比确认框更顺手（设计稿 2.3 节）。
 */
export function useUndo() {
  const toast = useToast()

  return useCallback(
    (message: string, undo: () => void | Promise<void>) => {
      toast.show({
        message,
        actionLabel: '撤销',
        timeout: 5000,
        onAction: undo,
      })
    },
    [toast],
  )
}
