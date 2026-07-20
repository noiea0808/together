import { useNavigate } from 'react-router-dom'
import { useNotificationSync } from '../lib/NotificationSyncContext'

// 5개 메인 화면(오늘/일정/모먼트/친구/내 계정) 헤더에 공통으로 쓰는 알림 벨.
// 하단 네비의 "오늘" 탭 점은 여기로 통합됐으므로(BottomNav 참고) 더 이상 따로 없다.
export default function NotificationBell({ style }) {
  const navigate = useNavigate()
  const { unreadCount } = useNotificationSync()

  return (
    <button style={{ ...styles.bellBtn, ...style }} onClick={() => navigate('/notifications')} aria-label="알림">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && <span style={styles.bellDot} />}
    </button>
  )
}

const styles = {
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
