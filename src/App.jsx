import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { UserProvider, useUser } from './lib/UserContext'
import OnboardingPage from './pages/OnboardingPage'
import TodayPage from './pages/TodayPage'
import CreatePotPage from './pages/CreatePotPage'
import PotDetailPage from './pages/PotDetailPage'
import GroupPage from './pages/GroupPage'
import GroupSetupPage from './pages/GroupSetupPage'

function AppRoutes() {
  const { user } = useUser()

  // 로딩 중
  if (user === undefined) {
    return <div style={styles.loading}>🍚</div>
  }

  return (
    <Routes>
      <Route path="/onboarding" element={!user ? <OnboardingPage /> : <Navigate to="/today" replace />} />
      <Route path="/today" element={user ? <TodayPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/create" element={user ? <CreatePotPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/pot/:id" element={user ? <PotDetailPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/group" element={user ? <GroupPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="/group-setup" element={user ? <GroupSetupPage /> : <Navigate to="/onboarding" replace />} />
      <Route path="*" element={<Navigate to={user ? '/today' : '/onboarding'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AppRoutes />
      </UserProvider>
    </BrowserRouter>
  )
}

const styles = {
  loading: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100dvh', fontSize: 48,
  },
}
