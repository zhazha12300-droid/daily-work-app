import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../db'
import { WELCOME_TIP_ID, dismissTip, isTipDismissed } from '../lib/tips'
import { updateSettings } from '../repo/settings'
import Modal from './Modal'
import s from './WelcomeModal.module.css'

/**
 * 第一次打开的说明。只讲三件用户以后会后悔不知道的事：
 * 数据在哪、怎么保住、快捷键是什么。
 */
export default function WelcomeModal() {
  const navigate = useNavigate()
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const [closed, setClosed] = useState(false)

  if (!settings || closed) return null
  if (isTipDismissed(settings.dismissedTips, WELCOME_TIP_ID)) return null

  async function close(goBackup: boolean) {
    await updateSettings({ dismissedTips: dismissTip(settings?.dismissedTips, WELCOME_TIP_ID) })
    setClosed(true)
    if (goBackup) navigate('/settings')
  }

  return (
    <Modal
      open
      title="这是你自己的本地工作台"
      onClose={() => void close(false)}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => void close(false)}>
            知道了
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => void close(true)}>
            先建一份备份
          </button>
        </>
      }
    >
      <ul className={s.list}>
        <li className={s.item}>
          <span className={s.num}>1</span>
          <div>
            <p className={s.itemTitle}>数据存在这台电脑的浏览器里</p>
            <p className={s.itemBody}>
              刷新、关浏览器、重启电脑都不会丢。不需要登录，也不会传到任何地方。
            </p>
          </div>
        </li>
        <li className={s.item}>
          <span className={s.num}>2</span>
          <div>
            <p className={s.itemTitle}>但它只在这一个浏览器里</p>
            <p className={s.itemBody}>
              换浏览器、清浏览数据、换个端口打开，都会看到空库。
              <strong>唯一能保住它的是设置页的「导出备份」</strong>
              ——那个 JSON 文件可以随便放，恢复时原样还原。建议每周导一次。
            </p>
          </div>
        </li>
        <li className={s.item}>
          <span className={s.num}>3</span>
          <div>
            <p className={s.itemTitle}>键盘能省一半点击</p>
            <p className={s.itemBody}>
              <kbd className={s.kbd}>Ctrl/⌘ + K</kbd> 随手记，
              <kbd className={s.kbd}>Alt + 1…8</kbd> 切板块，
              <kbd className={s.kbd}>Alt + 0</kbd> 回首页。全站没有「保存」按钮，改完点别处就存了。
            </p>
          </div>
        </li>
      </ul>
    </Modal>
  )
}
