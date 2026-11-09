import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import QuickCapture from './components/QuickCapture'
import ModuleTipHost from './components/ModuleTipHost'
import StorageAlert from './components/StorageAlert'
import TimerRecovery from './components/TimerRecovery'
import WelcomeModal from './components/WelcomeModal'
import { ToastProvider } from './components/Toast'
import { useShortcuts } from './hooks/useShortcuts'
import { useTheme } from './hooks/useTheme'
import ConsultPage from './pages/ConsultPage'
import DevPage from './pages/DevPage'
import DietPage from './pages/DietPage'
import FitnessPage from './pages/FitnessPage'
import GamePage from './pages/GamePage'
import HomePage from './pages/HomePage'
import MediaPage from './pages/MediaPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'
import { ensureSettings } from './repo/settings'
import { applyTheme } from './theme'

export default function App() {
  const [theme, setTheme] = useTheme()
  const navigate = useNavigate()

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    // 首次启动时把默认设置写进库
    void ensureSettings()
  }, [])

  // 用 Alt+数字，不用 Ctrl+数字：Chrome 把 Ctrl+1…8 占作「切换标签页」，
  // preventDefault 拦不住，会一边切标签一边跳板块。
  useShortcuts({
    'alt+1': () => navigate('/today'),
    'alt+2': () => navigate('/media'),
    'alt+3': () => navigate('/dev'),
    'alt+4': () => navigate('/consult'),
    'alt+5': () => navigate('/fitness'),
    'alt+6': () => navigate('/diet'),
    'alt+7': () => navigate('/game'),
    'alt+8': () => navigate('/settings'),
    'alt+0': () => navigate('/'),
  })

  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        />
        <main className="app-main">
          <StorageAlert />
          <ModuleTipHost />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/dev" element={<DevPage />} />
            <Route path="/consult" element={<ConsultPage />} />
            <Route path="/fitness" element={<FitnessPage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/game" element={<GamePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <QuickCapture />
        <TimerRecovery />
        <WelcomeModal />
      </div>
    </ToastProvider>
  )
}
