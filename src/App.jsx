import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { UserProvider, useUser } from './lib/UserContext'
import OnboardingPage from './pages/OnboardingPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import TodayPage from './pages/TodayPage'
import GuestHomePage from './pages/GuestHomePage'
import MySchedulePage from './pages/MySchedulePage'
import MyAccountPage from './pages/MyAccountPage'
import CreatePotPage from './pages/CreatePotPage'
import PotDetailPage from './pages/PotDetailPage'
import GroupPage from './pages/GroupPage'
import GroupSetupPage from './pages/GroupSetupPage'
import GroupSettingsPage from './pages/GroupSettingsPage'
import JoinPage from './pages/JoinPage'
import NotificationsPage from './pages/NotificationsPage'
import AdminApp from './pages/admin/AdminApp'
import RiceBowlIcon from './components/RiceBowlIcon'
import NotificationToast from './components/NotificationToast'
import BadgeSync from './components/BadgeSync'
import PendingInviteRedirect from './components/PendingInviteRedirect'

function ConsumerRoutes() {
  const { user } = useUser()

  if (user === undefined) {
    return <div style={styles.loading}><RiceBowlIcon size={48} /></div>
  }

  // 로그인 + 온보딩 완료까지 요구. 온보딩 미완료 사용자는 /welcome 으로 보낸다.
  const auth = (el) => {
    if (!user) return <Navigate to="/onboarding" replace />
    if (!user.onboarded) return <Navigate to="/welcome" replace />
    return el
  }

  // 게스트는 /today 와 /pot/:id 외 보호 라우트 접근 시 /today 로 보낸다.
  const guestSafe = (el) => {
    if (user?.is_guest) return <Navigate to="/today" replace />
    return auth(el)
  }

  return (
    <Routes>
      <Route path="/onboarding" element={!user ? <OnboardingPage /> : <Navigate to={user.onboarded ? '/today' : '/welcome'} replace />} />
      <Route path="/welcome" element={!user ? <Navigate to="/onboarding" replace /> : (user.onboarded ? <Navigate to="/today" replace /> : <ProfileSetupPage />)} />
      <Route path="/today"    element={auth(user?.is_guest ? <GuestHomePage /> : <TodayPage />)} />
      <Route path="/schedule" element={guestSafe(<MySchedulePage />)} />
      <Route path="/account"  element={guestSafe(<MyAccountPage />)} />
      <Route path="/create"   element={guestSafe(<CreatePotPage />)} />
      <Route path="/pot/:id"  element={<PotDetailPage />} />
      <Route path="/group"    element={guestSafe(<GroupPage />)} />
      <Route path="/group-setup" element={guestSafe(<GroupSetupPage />)} />
      <Route path="/group/:id/settings" element={guestSafe(<GroupSettingsPage />)} />
      <Route path="/join/:code"  element={<JoinPage />} />
      <Route path="/notifications" element={guestSafe(<NotificationsPage />)} />
      <Route path="*" element={<Navigate to={user ? '/today' : '/onboarding'} replace />} />
    </Routes>
  )
}

function ConsumerApp() {
  return (
    <UserProvider>
      <NotificationToast />
      <BadgeSync />
      <PendingInviteRedirect />
      <ConsumerRoutes />
    </UserProvider>
  )
}

// 어드민(/admin)은 일반 회원 로그인/온보딩 상태와 완전히 분리된 별도 접근경로다.
// UserProvider 바깥에서 독립적으로 렌더링되며, 자체 로그인 화면과 세션을 가진다.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<ConsumerApp />} />
      </Routes>
    </BrowserRouter>
  )
}

const styles = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 48 },
}
