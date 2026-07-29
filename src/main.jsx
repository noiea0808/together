import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/installPrompt' // beforeinstallprompt를 React 렌더 전에 최대한 빨리 캡처
import { Capacitor } from '@capacitor/core'
import { isAndroidInAppBrowser, openInChromeAndroid } from './lib/inAppBrowser'
import App from './App.jsx'

// 카톡 등 인앱 브라우저(Android)는 React 마운트를 기다리지 않고 여기서 가장 먼저 크롬으로
// 넘긴다. InAppBrowserGuard의 useEffect까지 기다리면 그 사이 JoinPage 등이 navigate()로
// URL을 먼저 바꿔버릴 수 있어(예: /join/:code → /onboarding), 크롬으로 넘어갈 때 초대
// 코드가 담긴 원래 URL을 놓치는 레이스가 생긴다. 앱 진입 즉시, 아무 것도 실행되기 전에
// 원본 URL 그대로 캡처해 넘겨서 이 레이스를 원천 차단한다.
// 커패시터 네이티브 앱은 이 우회가 필요 없다(원래 자체 UA가 카톡 패턴에 안 걸리긴 하지만,
// 우연에 기대지 않고 명시적으로 막아 앱이 스스로를 크롬으로 튕겨내는 일을 방지한다).
if (!Capacitor.isNativePlatform() && isAndroidInAppBrowser()) openInChromeAndroid()

// 서비스 워커 등록 (PWA 설치 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// 저장공간 부족 시 브라우저/OS가 로그인 세션(localStorage)을 지우지 않도록 영구 저장 요청.
// 홈 화면에 설치해두고 뜸하게 여는 사용 패턴에서 세션이 사라져 재로그인이 필요해지는
// 경우를 줄이기 위함 — 승인 여부는 브라우저가 결정하므로 완전한 보장은 아니다.
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
