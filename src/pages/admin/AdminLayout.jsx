import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_SECTIONS = [
  {
    title: '가이드',
    items: [
      { to: '/admin/guide/status',   label: '사용자 상태', icon: '🟢' },
      { to: '/admin/guide/slots',    label: '식사 슬롯',   icon: '🍽️', disabled: true },
      { to: '/admin/guide/pots',     label: '밥팟 규칙',   icon: '🍲', disabled: true },
    ],
  },
  {
    title: '서비스 관리',
    items: [
      { to: '/admin/terms',    label: '약관',     icon: '📜' },
      { to: '/admin/users',    label: '사용자',   icon: '👤', disabled: true },
      { to: '/admin/groups',   label: '그룹',     icon: '👥', disabled: true },
      { to: '/admin/stats',    label: '통계',     icon: '📊', disabled: true },
    ],
  },
]

export default function AdminLayout() {
  useEffect(() => {
    const prev = document.title
    document.title = '같이먹자_Admin'
    return () => { document.title = prev }
  }, [])

  return (
    <div style={s.root}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandIcon}>🍚</span>
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
    fontSize: 10,
    fontWeight: 700,
    color: '#5A5A7A',
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
