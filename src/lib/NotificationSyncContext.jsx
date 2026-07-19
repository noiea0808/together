import { createContext, useContext, useEffect, useState } from 'react'
import { useUser } from './UserContext'
import { supabase } from './supabase'
import { getUnreadNotificationCount } from './db'
import { syncPushSubscription } from './push'

const NotificationSyncContext = createContext({ unreadCount: 0, lastInsert: null })

// notifications 테이블에 대한 unread count 조회 + 실시간 구독을 앱 전체에서 딱 한 번만 한다.
// 예전엔 Header/BadgeSync/NotificationToast가 각자 채널을 열고 각자 count 쿼리를 날려서,
// 알림 하나에 웹소켓 연결 3개 + count 쿼리 2번이 중복으로 나갔다.
export function NotificationSyncProvider({ children }) {
  const { user } = useUser()
  const [unreadCount, setUnreadCount] = useState(0)
  const [lastInsert, setLastInsert] = useState(null)

  useEffect(() => {
    if (!user || user.is_guest) { setUnreadCount(0); return }
    syncPushSubscription(user.id).catch(() => {})

    // 응답 순서가 보장되지 않으니, 가장 나중에 시작한 요청의 결과만 반영한다.
    let requestId = 0
    const refreshCount = () => {
      const myRequestId = ++requestId
      getUnreadNotificationCount(user.id).then(count => {
        if (myRequestId === requestId) setUnreadCount(count)
      }).catch(() => {})
    }
    refreshCount()

    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        refreshCount()
        if (payload.eventType === 'INSERT') setLastInsert({ row: payload.new, token: Date.now() + Math.random() })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // 홈 화면 앱 아이콘 배지 — count가 바뀔 때마다 반영.
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return
    if (unreadCount > 0) navigator.setAppBadge(unreadCount).catch(() => {})
    else navigator.clearAppBadge?.().catch(() => {})
  }, [unreadCount])

  return (
    <NotificationSyncContext.Provider value={{ unreadCount, lastInsert }}>
      {children}
    </NotificationSyncContext.Provider>
  )
}

export function useNotificationSync() {
  return useContext(NotificationSyncContext)
}
