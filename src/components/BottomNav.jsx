import { useNavigate, useLocation } from 'react-router-dom'

const TABS = [
  { path: '/today',    icon: '🍚', label: '오늘' },
  { path: '/schedule', icon: '📅', label: '일정' },
  { path: '/group',    icon: '👥', label: '그룹관리' },
  { path: '/account',  icon: '👤', label: '내 계정' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav style={styles.nav}>
      {TABS.map(tab => {
        const active = pathname === tab.path
        return (
          <button
            key={tab.path}
            style={{ ...styles.tab, color: active ? 'var(--color-primary)' : 'var(--color-text-muted)' }}
            onClick={() => navigate(tab.path)}
          >
            <span style={styles.icon}>{tab.icon}</span>
            <span style={{ ...styles.label, fontWeight: active ? 700 : 400 }}>{tab.label}</span>
            {active && <span style={styles.dot} />}
          </button>
        )
      })}
    </nav>
  )
}

const styles = {
  nav: {
    position: 'fixed', bottom: 0, left: '50%',
    transform: 'translateX(-50%)',
    width: '100%', maxWidth: 'var(--max-width)',
    display: 'flex', borderTop: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    zIndex: 100,
  },
  tab: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 2, padding: '10px 0 8px',
    background: 'none', border: 'none', cursor: 'pointer',
    position: 'relative', WebkitTapHighlightColor: 'transparent',
  },
  icon: { fontSize: 22 },
  label: { fontSize: 10 },
  dot: {
    position: 'absolute', bottom: 4, width: 4, height: 4,
    borderRadius: '50%', background: 'var(--color-primary)',
  },
}
