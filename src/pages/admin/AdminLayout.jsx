import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import RiceBowlIcon from '../../components/RiceBowlIcon'
import { useAdminAuth } from '../../lib/AdminAuthContext'

const NAV_SECTIONS = [
  {
    title: '운영 관리',
    items: [
      { to: '/admin/users',    label: '사용자',     icon: '👤' },
      { to: '/admin/reports',  label: '신고/제재',   icon: '🚨' },
      { to: '/admin/feedback', label: '사용자 의견', icon: '💬' },
      { to: '/admin/groups',   label: '그룹',       icon: '👥', disabled: true },
    ],
  },
  {
    title: '콘텐츠 관리',
    items: [
      { to: '/admin/tips',     label: '오늘의 팁', icon: '💡' },
      { to: '/admin/terms',    label: '약관',     icon: '📜' },
      { to: '/admin/notifications', label: '알림', icon: '🔔' },
    ],
  },
  {
    title: '통계',
    items: [
      { to: '/admin/stats',    label: '대시보드', icon: '📊', disabled: true },
    ],
  },
  {
    title: '참고자료',
    items: [
      { to: '/admin/guide/status', label: '사용자 상태', icon: '🟢' },
      { to: '/admin/icons',        label: '아이콘',     icon: '🎨' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { adminUser, logout } = useAdminAuth()

  useEffect(() => {
    const prev = document.title
    document.title = 'Admin'
    return () => { document.title = prev }
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <RiceBowlIcon size={28} />
          <div>
            <div style={s.brandName}>같이먹자</div>
            <div style={s.brandSub}>Admin</div>
          </div>
        </div>

        <nav style={s.nav}>
          {NAV_SECTIONS.map(section => (
            <div key={section.title} style={s.navSection}>
              <div style={s.navSectionTitle}>{section.title}</div>
              {section.items.map(item => (
                item.disabled
                  ? (
                    <div key={item.to} style={{ ...s.navItem, ...s.navItemDisabled }}>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      <span style={s.chip}>예정</span>
                    </div>
                  )
                  : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navItemActive : {}) })}
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  )
              ))}
            </div>
          ))}
        </nav>

        <div style={s.sidebarFooter}>
          {adminUser?.email && <div style={s.adminEmail}>{adminUser.email}</div>}
          <button style={s.logoutBtn} onClick={handleLogout}>로그아웃</button>
          <a href="/today" style={s.backLink}>← 서비스로 돌아가기</a>
        </div>
      </aside>

      {/* Main */}
      <main style={s.main}>
        <Outlet />
      </main>
    </div>
  )
}

const s = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    background: '#F7F8FA',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif",
    color: '#1A1A1A',
  },
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: '#1E1E2E',
    color: '#C8C8D8',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 20px 16px',
    borderBottom: '1px solid #2E2E42',
  },
  brandIcon: { fontSize: 28 },
  brandName: { fontSize: 15, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 },
  brandSub: { fontSize: 11, color: '#FF6B35', fontWeight: 600, letterSpacing: 1 },
  nav: { flex: 1, overflowY: 'auto', padding: '12px 0' },
  navSection: { marginBottom: 4 },
  navSectionTitle: {
    fontSize: 11,
    fontWeight: 800,
    color: '#A8A8C8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    padding: '12px 20px 6px',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 500,
    color: '#9090A8',
    textDecoration: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
  navItemActive: {
    background: '#2A2A3E',
    color: '#FFFFFF',
    borderLeft: '3px solid #FF6B35',
    paddingLeft: 17,
  },
  navItemDisabled: {
    opacity: 0.4,
    cursor: 'default',
    justifyContent: 'space-between',
  },
  chip: {
    fontSize: 9,
    fontWeight: 700,
    background: '#3A3A54',
    color: '#7070A0',
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  sidebarFooter: {
    padding: '14px 20px',
    borderTop: '1px solid #2E2E42',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  adminEmail: {
    fontSize: 11,
    color: '#5A5A7A',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  logoutBtn: {
    fontSize: 12,
    color: '#9090A8',
    background: 'none',
    border: 'none',
    padding: 0,
    textAlign: 'left',
    cursor: 'pointer',
  },
  backLink: {
    fontSize: 12,
    color: '#5A5A7A',
    textDecoration: 'none',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: 32,
  },
}
