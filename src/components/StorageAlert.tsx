import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  checkDbHealth,
  estimateUsage,
  quotaLevel,
  quotaText,
  type DbHealth,
  type QuotaUsage,
} from '../lib/storage'
import { downloadBackup, buildBackup } from '../db/backup'
import { useToast } from './Toast'
import s from './StorageAlert.module.css'

/**
 * 存储出问题时的红条。两件事：
 *  1. 库打不开（隐私模式、版本冲突、被清理）——这时候最怕用户「清一下浏览数据试试」
 *  2. 空间快满了——还能救，先导出备份
 * 都能关掉，但下次打开还会出现：这条不该被永久静音。
 */
export default function StorageAlert() {
  const toast = useToast()
  const [health, setHealth] = useState<DbHealth | null>(null)
  const [quota, setQuota] = useState<QuotaUsage | null>(null)
  const [hidden, setHidden] = useState(false)
  const [exporting, setExporting] = useState(false)

  const check = useCallback(async () => {
    setHealth(await checkDbHealth())
    setQuota(await estimateUsage())
  }, [])

  useEffect(() => {
    void check()
    // 切回这个标签页时再查一次：别的标签页可能刚把库搞坏
    const onFocus = () => void check()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [check])

  async function exportNow() {
    setExporting(true)
    try {
      const file = await buildBackup()
      downloadBackup(file)
      toast.show({ message: '备份已导出', tone: 'success' })
    } catch {
      toast.show({
        message: '导出失败：数据现在读不出来，先别清浏览数据',
        tone: 'error',
        timeout: 0,
      })
    } finally {
      setExporting(false)
    }
  }

  if (hidden || !health) return null

  const level = quota ? quotaLevel(quota.usage, quota.quota) : 'ok'
  if (health.ok && level === 'ok') return null

  const broken = !health.ok
  const tone = broken || level === 'full' ? s.danger : s.warn

  return (
    <div className={`${s.bar} ${tone}`} role="alert">
      <div className={s.text}>
        {broken ? (
          <>
            <p className={s.title}>数据打不开：{health.message}</p>
            <p className={s.body}>
              先别清浏览数据——清了就真没了。试着刷新页面，或者关掉其它标签页再打开。
            </p>
          </>
        ) : (
          <>
            <p className={s.title}>浏览器存储快满了</p>
            <p className={s.body}>
              {quota ? quotaText(quota.usage, quota.quota) : ''}
              {level === 'full'
                ? '。再存就可能写不进去了，建议现在就导出备份，再在设置页清掉不要的模块。'
                : '。导出备份之后，可以在设置页清空不再需要的模块腾地方。'}
            </p>
          </>
        )}
      </div>
      {broken ? (
        <button type="button" className="btn" onClick={() => void check()}>
          再试一次
        </button>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary"
            disabled={exporting}
            onClick={() => void exportNow()}
          >
            {exporting ? '导出中…' : '先导出备份'}
          </button>
          <Link className="btn btn-ghost" to="/settings">
            去设置页
          </Link>
        </>
      )}
      <button
        type="button"
        className={s.close}
        aria-label="先关掉这条提醒"
        title="先关掉（下次打开还会提醒）"
        onClick={() => setHidden(true)}
      >
        ✕
      </button>
    </div>
  )
}
