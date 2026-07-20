import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useUser } from './UserContext'
import { getNavBadges, markMomentsSeen as markMomentsSeenApi, markFriendsWishSeen as markFriendsWishSeenApi } from './db'

const EMPTY_BADGES = { momentsGroup: false, momentsPublic: false, friendsWish: false, friendIdsWithNewWish: [], loaded: false }

const NavBadgeContext = createContext({ ...EMPTY_BADGES, markMomentsSeen: () => {}, markFriendsWishSeen: () => {} })

// 모먼트/친구 탭의 레드닷. 알림 벨과 달리 "지금 당장 알려줘야 하는" 정보가 아니라
// 다음에 들어왔을 때 참고하는 힌트 수준이라, 실시간 구독 대신 앱 진입(로그인) 시
// 딱 한 번만 조회한다. 탭을 실제로 열람하면 markXSeen으로 서버에도 반영한다.
//
// loaded: 조회가 서버 왕복이라 즉시 오지 않는다. 하필 모먼트/친구 탭이 새로고침 직후
// 첫 화면으로 뜬 경우, 데이터가 도착하기도 전에 그 페이지가 마운트되면서 "빈 상태를
// 봤다"고 서버에 기록해버리는 레이스가 있었다 — loaded가 true로 바뀔 때까지는
// 하위 페이지가 스냅샷을 찍거나 seen 처리를 하지 않도록 신호를 준다.
export function NavBadgeProvider({ children }) {
  const { user } = useUser()
  const [badges, setBadges] = useState(EMPTY_BADGES)

  useEffect(() => {
    if (!user || user.is_guest) { setBadges({ ...EMPTY_BADGES, loaded: true }); return }
    setBadges(EMPTY_BADGES)
    getNavBadges().then(data => setBadges({ ...data, loaded: true })).catch(e => console.error('getNavBadges 실패:', e))
  }, [user])

  const markMomentsSeen = useCallback((scope) => {
    setBadges(prev => ({ ...prev, [scope === 'group' ? 'momentsGroup' : 'momentsPublic']: false }))
    markMomentsSeenApi(scope).catch(() => {})
  }, [])

  const markFriendsWishSeen = useCallback(() => {
    setBadges(prev => ({ ...prev, friendsWish: false, friendIdsWithNewWish: [] }))
    markFriendsWishSeenApi().catch(() => {})
  }, [])

  return (
    <NavBadgeContext.Provider value={{ ...badges, markMomentsSeen, markFriendsWishSeen }}>
      {children}
    </NavBadgeContext.Provider>
  )
}

export function useNavBadges() {
  return useContext(NavBadgeContext)
}
