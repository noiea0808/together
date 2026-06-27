import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { UserProvider, useUser } from './lib/UserContext'
import OnboardingPage from './pages/OnboardingPage'
import TodayPage from './pages/TodayPage'
import MySchedulePage from './pages/MySchedulePage'
import MyAccountPage from './pages/MyAccountPage'
import CreatePotPage from './pages/CreatePotPage'
import PotDetailPage from './pages/PotDetailPage'
import GroupPage from './pages/GroupPage'
import GroupSetupPage from './pages/GroupSetupPage'
import JoinPage from './pages/JoinPage'

function AppRoutes() {
  const { user } = useUser()

  if (user === undefined) {
    return <div style={styles.loading}>🍚</div>
  }

  const auth = (el) => user ? el : <Navigate to="/onboarding" replace />

  return (
    <Routes>
      <Route path="/onboarding" element={!user ? <OnboardingPage /> : <Navigate to="/today" replace />} />
      <Route path="/today"    element={auth(<TodayPage />)} />
      <Route path="/schedule" element={auth(<MySchedulePage />)} />
      <Route path="/account"  element={auth(<MyAccountPage />)} />
      <Route path="/create"   element={auth(<CreatePotPage />)} />
      <Route path="/pot/:id"  element={auth(<PotDetailPage />)} />
      <Route path="/group"    element={auth(<GroupPage />)} />
      <Route path="/group-setup" element={auth(<GroupSetupPage />)} />
      <Route path="/join/:code"  element={<JoinPage />} />
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
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 48 },
}
