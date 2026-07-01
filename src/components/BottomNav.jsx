import { useNavigate, useLocation } from 'react-router-dom'

function HomeIcon({ active }) {
  return active ? (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.19 2.6a1.4 1.4 0 0 1 1.62 0l7.5 5.36c.43.31.69.82.69 1.36V19.5A1.5 1.5 0 0 1 19.5 21H15a1 1 0 0 1-1-1v-5.5a1.5 1.5 0 0 0-1.5-1.5h-1A1.5 1.5 0 0 0 10 14.5V20a1 1 0 0 1-1 1H4.5A1.5 1.5 0 0 1 3 19.5V9.32c0-.54.26-1.05.69-1.36l7.5-5.36Z" />
    </svg>
  ) : (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5a.5.5 0 0 1-.5-.5V15a2 2 0 0 0-2-2h0a2 2 0 0 0-2 2v4.5a.5.5 0 0 1-.5.5H5a1 1 0 0 1-1-1v-8.5Z" />
    </svg>
  )
}

function CalendarIcon({ active }) {
  return active ? (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <rect x="7" y="2" width="2.3" height="4.5" rx="1.15" fill="var(--color-surface)" />
      <rect x="14.7" y="2" width="2.3" height="4.5" rx="1.15" fill="var(--color-surface)" />
      <rect x="6" y="9.5" width="12" height="2" rx="1" fill="var(--color-surface)" />
    </svg>
  ) : (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M8 2v4.5M16 2v4.5M3 9.5h18" />
    </svg>
  )
}

function PeopleIcon({ active }) {
  return active ? (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1Z" />
      <circle cx="17.2" cy="9" r="2.6" opacity="0.55" />
      <path d="M15.3 13.2c2.9.3 4.7 2.3 4.9 5.3a1 1 0 0 1-1 1.1h-2" opacity="0.55" />
    </svg>
  ) : (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M15.3 13.2c2.9.3 4.7 2.3 4.9 5.3M14 5.4a2.6 2.6 0 1 1 0 5" />
    </svg>
  )
}

function UserIcon({ active }) {
  return active ? (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="7.5" r="4.3" />
      <path d="M3.5 20.2c0-4.3 3.8-7.2 8.5-7.2s8.5 2.9 8.5 7.2a.9.9 0 0 1-.9.8H4.4a.9.9 0 0 1-.9-.8Z" />
    </svg>
  ) : (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="4.3" />
      <path d="M3.5 20.2c0-4.3 3.8-7.2 8.5-7.2s8.5 2.9 8.5 7.2" />
    </svg>
  )
}

const TABS = [
  { path: '/today',    Icon: HomeIcon,     label: '오늘' },
  { path: '/schedule', Icon: CalendarIcon, label: '일정' },
  { path: '/group',    Icon: PeopleIcon,   label: '친구' },
  { path: '/account',  Icon: UserIcon,     label: '내 계정' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav style={styles.nav}>
      {TABS.map(({ path, Icon, label }) => {
        const active = pathname === path
        return (
          <button
            key={path}
            style={{ ...styles.tab, color: active ? 'var(--color-text)' : 'var(--color-text-muted)' }}
            onClick={() => navigate(path)}
            aria-label={label}
          >
            <Icon active={active} />
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
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 0',
    background: 'none', border: 'none', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
}
