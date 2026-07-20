import { useNavigate } from 'react-router-dom'
import { useNotificationSync } from '../lib/NotificationSyncContext'

// 5개 메인 화면(오늘/일정/모먼트/친구/내 계정) 헤더에 공통으로 쓰는 알림 벨.
// 하단 네비의 "오늘" 탭 점은 여기로 통합됐으므로(BottomNav 참고) 더 이상 따로 없다.
export default function NotificationBell({ style }) {
  const navigate = useNavigate()
  const { unreadCount } = useNotificationSync()

  return (
    <button
      type="button"
      className="app-header-icon-btn"
      style={style}
      onClick={() => navigate('/notifications')}
      aria-label={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : '알림'}
    >
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unreadCount > 0 && <span className="app-header-icon-btn__dot" />}
    </button>
  )
}
