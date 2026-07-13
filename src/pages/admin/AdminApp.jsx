import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminAuthProvider, useAdminAuth } from '../../lib/AdminAuthContext'
import AdminLoginPage from './AdminLoginPage'
import AdminLayout from './AdminLayout'
import StatusGuidePage from './guide/StatusGuidePage'
import TermsPage from './TermsPage'
import UsersPage from './UsersPage'
import RiceBowlIcon from '../../components/RiceBowlIcon'

// 일반 회원 로그인/온보딩 상태(UserContext)와 완전히 분리된 관리자 전용 라우트 트리.
// /admin 이하는 이 트리에서만 처리되며, 일반 앱의 로그인 여부와는 무관하게 동작한다.
function AdminRoutes() {
  const { adminUser } = useAdminAuth()

  if (adminUser === undefined) {
    return <div style={styles.loading}><RiceBowlIcon size={48} /></div>
  }

  // AdminApp은 App.jsx에서 "/admin/*"에 마운트된 서브 라우트 트리이므로,
  // 여기서는 "/admin"을 뺀 나머지 경로만 상대경로로 선언한다.
  return (
    <Routes>
      <Route path="login" element={adminUser ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
      <Route path="/" element={adminUser ? <AdminLayout /> : <Navigate to="/admin/login" replace />}>
        <Route index element={<Navigate to="/admin/guide/status" replace />} />
        <Route path="guide/status" element={<StatusGuidePage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to={adminUser ? '/admin' : '/admin/login'} replace />} />
    </Routes>
  )
}

export default function AdminApp() {
  return (
    <AdminAuthProvider>
      <AdminRoutes />
    </AdminAuthProvider>
  )
}

const styles = {
  loading: {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 48, background: '#1E1E2E',
  },
}
