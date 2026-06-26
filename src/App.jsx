import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import OnboardingPage from './pages/OnboardingPage'
import TodayPage from './pages/TodayPage'
import CreatePotPage from './pages/CreatePotPage'
import PotDetailPage from './pages/PotDetailPage'
import GroupPage from './pages/GroupPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/onboarding" replace />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/create" element={<CreatePotPage />} />
        <Route path="/pot/:id" element={<PotDetailPage />} />
        <Route path="/group" element={<GroupPage />} />
      </Routes>
    </BrowserRouter>
  )
}
