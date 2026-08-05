import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { PushNotifications } from '@capacitor/push-notifications'
import { handleNativeOAuthCallback } from '../lib/db'
import { takePendingRoute } from '../lib/pendingRoute'
import { supabase } from '../lib/supabase'

const APP_LINK_HOSTS = ['www.eat-together.net', 'eat-together.net']

// 푸시 payload의 url은 서버(supabase/functions/_shared/fcm.ts)가 항상 앱 내부 경로로
// 넣지만, 예상 밖의 값이 들어와도 앱 밖으로 튀지 않도록 내부 경로만 통과시킨다.
// ('//evil.com' 같은 프로토콜 상대 URL도 막아야 해서 두 번째 문자까지 확인한다)
function toInternalPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null
  return url
}

// 커패시터 네이티브 앱에서만 동작 — 딥링크(초대 App Links, OAuth 콜백), 푸시 알림 탭,
// 안드로이드 뒤로가기 버튼을 처리한다. 웹에서는 Capacitor.isNativePlatform()이 항상
// false라 아무 것도 하지 않는다(기존 InAppBrowserGuard와 같은 위치·같은 패턴으로 마운트).
export default function NativeDeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const handleUrl = async (url) => {
      if (!url) return
      let parsed
      try { parsed = new URL(url) } catch { return }

      // OAuth 콜백 — Chrome Custom Tab에서 돌아온 gachimeokja://oauth-callback?code=...
      if (parsed.protocol === 'gachimeokja:') {
        try {
          await handleNativeOAuthCallback(url)
          // 웹은 redirectTo에 복귀 경로를 실어 보내지만(db.js oauthReturnPath), 네이티브는
          // 커스텀 스킴으로만 돌아오기 때문에 여기서 직접 복귀시켜야 한다. 이게 없으면
          // 밥팟 초대 링크로 들어와 로그인한 사용자가 홈으로 떨어져 밥팟을 잃어버린다.
          // (그룹 초대는 pendingInviteCode를 GroupInviteModal이 따로 이어받는다.)
          const returnTo = takePendingRoute()
          if (returnTo) navigate(returnTo)
        } catch (e) {
          console.error(e)
        } finally {
          Browser.close().catch(() => {})
        }
        return
      }

      // App Links — /join, /pot 링크로 앱이 열린 경우 해당 라우트로 이동
      if (APP_LINK_HOSTS.includes(parsed.hostname)) {
        navigate(parsed.pathname + parsed.search + parsed.hash)
      }
    }

    // 콜드 스타트 대응 — 앱이 안 떠 있다가 딥링크로 처음 실행되면 appUrlOpen이 아니라
    // 런치 URL로만 전달되므로 마운트 시 한 번 별도로 확인한다.
    App.getLaunchUrl().then(result => handleUrl(result?.url))

    let urlListenerHandle
    App.addListener('appUrlOpen', ({ url }) => handleUrl(url)).then(handle => { urlListenerHandle = handle })

    // 푸시 알림 탭 — 웹은 서비스워커(public/sw.js)의 notificationclick이 url로 이동시키는데
    // 네이티브에는 대응이 없어서, 친구 요청·밥팟 초대·그룹 초대 알림을 눌러도 홈으로만
    // 떨어지고 있었다. 서버가 data.url에 넣어주는 앱 내부 경로로 이동시킨다.
    let pushActionHandle
    PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const path = toInternalPath(notification?.data?.url)
      if (path) navigate(path)
    }).then(handle => { pushActionHandle = handle })

    // 안드로이드 하드웨어 뒤로가기 — 기본 동작은 앱 종료라, react-router의 실제 히스토리
    // 스택이 남아있을 때만 뒤로 이동하고 아니면 종료한다(react-router가 history.state.idx로
    // 스택 위치를 관리한다).
    let backListenerHandle
    App.addListener('backButton', () => {
      if (window.history.state?.idx > 0) navigate(-1)
      else App.exitApp()
    }).then(handle => { backListenerHandle = handle })

    // 앱이 백그라운드로 가면 JS 타이머가 멈춰서 supabase의 자동 토큰 갱신도 같이 멈춘다.
    // 오래 백그라운드에 있다가 돌아오면 토큰이 만료된 채로 남아있어 마치 로그아웃된 것처럼
    // 보이는 문제가 있었다 — 포그라운드/백그라운드 전환에 맞춰 직접 켜고 꺼준다.
    let stateListenerHandle
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    }).then(handle => { stateListenerHandle = handle })

    return () => {
      urlListenerHandle?.remove()
      pushActionHandle?.remove()
      backListenerHandle?.remove()
      stateListenerHandle?.remove()
    }
  }, [navigate])

  return null
}
