import { useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getUnreadNotificationCount } from '../lib/db'
import { syncPushSubscription } from '../lib/push'
import { supabase } from '../lib/supabase'

// 홈 화면 앱 아이콘 배지 갱신과 푸시 구독 복구는 특정 페이지(Header가 있는 화면)에서만
// 동작하면 안 된다. 예전엔 Header.jsx(TodayPage 전용)가 이 일을 겸했는데, 알림함처럼
// Header가 없는 화면에 머무는 동안엔 실시간 구독 자체가 끊겨서 배지가 못 따라갔다.
// 그래서 페이지 전환과 무관하게 앱 전체에서 딱 한 번만 마운트되는 이 컴포넌트가 전담한다.
export default function BadgeSync() {
  const { user } = useUser()

  useEffect(() => {
    if (!user || user.is_guest) return
    syncPushSubscription(user.id).catch(() => {})

    // 응답 순서가 보장되지 않으니, 가장 나중에 시작한 요청의 결과만 반영한다.
    let requestId = 0
    const refresh = () => {
      const myRequestId = ++requestId
      getUnreadNotificationCount(user.id).then(count => {
        if (myRequestId !== requestId) return
        if ('setAppBadge' in navigator) {
          if (count > 0) navigator.setAppBadge(count).catch(() => {})
          else navigator.clearAppBadge?.().catch(() => {})
        }
      }).catch(() => {})
    }
    refresh()

    const channel = supabase
      .channel(`badge_sync_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  return null
}
