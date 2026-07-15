import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/installPrompt' // beforeinstallprompt를 React 렌더 전에 최대한 빨리 캡처
import { isAndroidInAppBrowser, openInChromeAndroid } from './lib/inAppBrowser'
import App from './App.jsx'

// 카톡 등 인앱 브라우저(Android)는 React 마운트를 기다리지 않고 여기서 가장 먼저 크롬으로
// 넘긴다. InAppBrowserGuard의 useEffect까지 기다리면 그 사이 JoinPage 등이 navigate()로
// URL을 먼저 바꿔버릴 수 있어(예: /join/:code → /onboarding), 크롬으로 넘어갈 때 초대
// 코드가 담긴 원래 URL을 놓치는 레이스가 생긴다. 앱 진입 즉시, 아무 것도 실행되기 전에
// 원본 URL 그대로 캡처해 넘겨서 이 레이스를 원천 차단한다.
if (isAndroidInAppBrowser()) openInChromeAndroid()

// 서비스 워커 등록 (PWA 설치 지원)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
