import { useNavigate } from 'react-router-dom'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import { useNotificationSync } from '../lib/NotificationSyncContext'
import RiceBowlIcon from './RiceBowlIcon'

// hidden을 상위에서 넘기면(dateNav 등 다른 sticky 요소와 동기화할 때) 그 값을 쓰고,
// 아니면 내부에서 스스로 스크롤을 감지한다.
export default function Header({ hidden: hiddenProp }) {
  const autoHidden = useHideOnScroll()
  const hidden = hiddenProp ?? autoHidden
  const navigate = useNavigate()
  // unread count 조회/실시간 구독은 NotificationSyncProvider(App.jsx)가 앱 전체에서 한 번만
  // 담당한다 — 여기선 벨 아이콘 빨간 점 표시용으로 값만 구독.
  const { unreadCount: unread } = useNotificationSync()

  return (
    <div
      style={{
        ...styles.bar,
        height: hidden ? 0 : 44,
        opacity: hidden ? 0 : 1,
        borderBottomColor: hidden ? 'transparent' : 'var(--color-border)',
      }}
    >
      <RiceBowlIcon size={22} />
      <span style={styles.title}>같이 먹자</span>
      <button style={styles.bellBtn} onClick={() => navigate('/notifications')} aria-label="알림">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span style={styles.bellDot} />}
      </button>
    </div>
  )
}

const styles = {
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    padding: '0 var(--spacing-md)',
    background: 'rgba(250,248,245,0.95)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid',
    transition: 'height 0.22s ease, opacity 0.18s ease, border-color 0.18s ease',
    flexShrink: 0,
  },
  logo: { fontSize: 18, lineHeight: 1 },
  title: { fontWeight: 900, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.4px', color: 'var(--color-text)', flex: 1 },
  bellBtn: {
    position: 'relative', width: 32, height: 32, flexShrink: 0, display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none',
    color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0,
  },
  bellDot: {
    position: 'absolute', top: 5, right: 6, width: 8, height: 8, borderRadius: '50%',
    background: 'var(--color-danger)', border: '1.5px solid var(--color-bg)',
  },
}
