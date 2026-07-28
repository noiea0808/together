import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { handleNativeOAuthCallback } from '../lib/db'

const APP_LINK_HOSTS = ['www.eat-together.net', 'eat-together.net']

// 커패시터 네이티브 앱에서만 동작 — 딥링크(초대 App Links, OAuth 콜백)와 안드로이드
// 뒤로가기 버튼을 처리한다. 웹에서는 Capacitor.isNativePlatform()이 항상 false라
// 아무 것도 하지 않는다(기존 InAppBrowserGuard와 같은 위치·같은 패턴으로 마운트).
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

    // 안드로이드 하드웨어 뒤로가기 — 기본 동작은 앱 종료라, react-router의 실제 히스토리
    // 스택이 남아있을 때만 뒤로 이동하고 아니면 종료한다(react-router가 history.state.idx로
    // 스택 위치를 관리한다).
    let backListenerHandle
    App.addListener('backButton', () => {
      if (window.history.state?.idx > 0) navigate(-1)
      else App.exitApp()
    }).then(handle => { backListenerHandle = handle })

    return () => {
      urlListenerHandle?.remove()
      backListenerHandle?.remove()
    }
  }, [navigate])

  return null
}
