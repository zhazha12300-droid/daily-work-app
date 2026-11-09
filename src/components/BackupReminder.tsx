import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { daysSinceBackup, isBackupStale } from '../repo/settings'
import s from './BackupReminder.module.css'

/**
 * 备份提醒：7 天没导出就在首页顶上提醒一条。
 * 不做「忽略」，因为这条提醒存在的意义就是别让人一直忽略它。
 */
export default function BackupReminder() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)

  // 设置还没读出来的时候不闪一下
  if (settings === undefined) return null

  const lastBackup = settings.lastBackupAt ?? null
  if (!isBackupStale(lastBackup)) return null

  const days = daysSinceBackup(lastBackup)

  return (
    <div className={s.banner}>
      <div className={s.text}>
        <span className={s.icon} aria-hidden>
          !
        </span>
        <span>
          {days === null ? (
            <>
              还没有备份过。<span className={s.hint}>数据只在这台电脑的浏览器里，清一次浏览数据就没了。</span>
            </>
          ) : (
            <>
              已经 <strong className="num">{days}</strong> 天没备份了。
              <span className={s.hint}>清理浏览器数据、换浏览器或重装系统都会丢。</span>
            </>
          )}
        </span>
      </div>
      <div className={s.actions}>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/settings')}>
          去导出备份
        </button>
      </div>
    </div>
  )
}
