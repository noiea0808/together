import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { UserProvider, useUser } from './lib/UserContext'
import { NotificationSyncProvider } from './lib/NotificationSyncContext'
import { NavBadgeProvider } from './lib/NavBadgeContext'
import { getActiveTerms, getMyTermAgreements } from './lib/db'
import OnboardingPage from './pages/OnboardingPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import TermsConsentPage from './pages/TermsConsentPage'
import TodayPage from './pages/TodayPage'
import GuestHomePage from './pages/GuestHomePage'
import MySchedulePage from './pages/MySchedulePage'
import MomentPage from './pages/MomentPage'
import MyAccountPage from './pages/MyAccountPage'
import GuidePage from './pages/GuidePage'
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
import GroupInviteModal from './components/GroupInviteModal'
import DailyTipModal from './components/DailyTipModal'
import InAppBrowserGuard from './components/InAppBrowserGuard'

// 정지 기간이 지났으면 클라이언트에서는 정지 아님으로 취급 (DB의 is_suspended 갱신은 관리자 해제 시점에 이뤄짐)
function isCurrentlySuspended(user) {
  if (!user?.is_suspended) return false
  if (!user.suspended_until) return true
  return new Date(user.suspended_until) > new Date()
}

// 필수+활성 약관 중, 지금 버전으로 동의하지 않은(레거시 미동의 포함) 항목만 골라낸다.
function findMissingRequiredTerms(terms, agreements) {
  return terms.filter(t => t.is_required && t.is_active &&
    !agreements.some(a => a.term_id === t.id && (a.agreed_version ?? null) === (t.version ?? null)))
}

function ConsumerRoutes() {
  const { user, logout } = useUser()
  // undefined = 확인 전, null = 해당 없음(비로그인/게스트/온보딩 전), array = 재동의 필요한 필수 약관 목록
  const [missingTerms, setMissingTerms] = useState(undefined)

  useEffect(() => {
    if (!user || !user.onboarded || user.is_guest) { setMissingTerms(null); return }
    let cancelled = false
    Promise.all([getActiveTerms(), getMyTermAgreements(user.id)])
      .then(([terms, agreements]) => {
        if (cancelled) return
        setMissingTerms(findMissingRequiredTerms(terms, agreements))
      })
      .catch(() => { if (!cancelled) setMissingTerms([]) })
    return () => { cancelled = true }
  }, [user?.id, user?.onboarded, user?.is_guest])

  if (user === undefined) {
    return <div style={styles.loading}><RiceBowlIcon size={48} /></div>
  }

  if (isCurrentlySuspended(user)) {
    return (
      <div style={styles.suspended}>
        <div style={{ fontSize: 40 }}>🚫</div>
        <div style={styles.suspendedTitle}>이용이 정지된 계정이에요</div>
        <p style={styles.suspendedDesc}>
          {user.suspended_reason ? `사유: ${user.suspended_reason}\n` : ''}
          {user.suspended_until ? `${new Date(user.suspended_until).toLocaleDateString('ko-KR')}까지 정지됩니다.` : '정지 기간이 정해지지 않았습니다.'}
        </p>
        <button style={styles.suspendedLogout} onClick={logout}>로그아웃</button>
      </div>
    )
  }

  // 온보딩까지 마친 사용자는 재동의 필요 여부가 확인될 때까지 대기 (레거시 미동의자 포함)
  if (user && user.onboarded && !user.is_guest && missingTerms === undefined) {
    return <div style={styles.loading}><RiceBowlIcon size={48} /></div>
  }
  if (user && user.onboarded && !user.is_guest && missingTerms?.length > 0) {
    return <TermsConsentPage onDone={() => setMissingTerms([])} />
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
      <Route path="/moment"   element={guestSafe(<MomentPage />)} />
      <Route path="/account"  element={guestSafe(<MyAccountPage />)} />
      <Route path="/guide"    element={guestSafe(<GuidePage />)} />
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
      <NotificationSyncProvider>
        <NavBadgeProvider>
          <NotificationToast />
          <GroupInviteModal />
          <DailyTipModal />
          <ConsumerRoutes />
        </NavBadgeProvider>
      </NotificationSyncProvider>
    </UserProvider>
  )
}

// 어드민(/admin)은 일반 회원 로그인/온보딩 상태와 완전히 분리된 별도 접근경로다.
// UserProvider 바깥에서 독립적으로 렌더링되며, 자체 로그인 화면과 세션을 가진다.
export default function App() {
  return (
    <BrowserRouter>
      <InAppBrowserGuard />
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/*" element={<ConsumerApp />} />
      </Routes>
    </BrowserRouter>
  )
}

const styles = {
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 48 },
  suspended: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: '100dvh', padding: 24, textAlign: 'center',
  },
  suspendedTitle: { fontSize: 18, fontWeight: 800 },
  suspendedDesc: { fontSize: 14, color: '#6A6A80', whiteSpace: 'pre-line', lineHeight: 1.6, margin: 0 },
  suspendedLogout: { marginTop: 12, padding: '10px 20px', background: 'none', border: '1.5px solid #DDD', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer' },
}
