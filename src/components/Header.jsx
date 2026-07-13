import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import { useUser } from '../lib/UserContext'
import { getUnreadNotificationCount } from '../lib/db'
import { syncPushSubscription } from '../lib/push'
import { supabase } from '../lib/supabase'
import RiceBowlIcon from './RiceBowlIcon'

// hidden을 상위에서 넘기면(dateNav 등 다른 sticky 요소와 동기화할 때) 그 값을 쓰고,
// 아니면 내부에서 스스로 스크롤을 감지한다.
export default function Header({ hidden: hiddenProp }) {
  const autoHidden = useHideOnScroll()
  const hidden = hiddenProp ?? autoHidden
  const navigate = useNavigate()
  const { user } = useUser()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    // 서버 VAPID 키가 재발급된 경우를 대비해, 이미 구독 중인 기기의 키가 최신인지 조용히 확인/복구한다.
    syncPushSubscription(user.id).catch(() => {})
    const refresh = () => getUnreadNotificationCount(user.id).then(count => {
      setUnread(count)
      // OS/홈 화면 앱 아이콘 뱃지 — 지원 브라우저(설치된 PWA)에서만 동작
      if ('setAppBadge' in navigator) {
        if (count > 0) navigator.setAppBadge(count).catch(() => {})
        else navigator.clearAppBadge?.().catch(() => {})
      }
    }).catch(() => {})
    refresh()

    // 실시간 구독 — 알림이 새로 쌓이거나(참여/나가기/수정/코멘트) 다른 화면에서
    // 읽음 처리될 때(NotificationsPage 진입) 배지 숫자를 즉시 다시 계산한다.
    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

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
    background: 'rgba(250,248,245,0.96)',
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
    background: '#f44336', border: '1.5px solid var(--color-bg)',
  },
}
