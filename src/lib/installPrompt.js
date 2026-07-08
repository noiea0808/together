// beforeinstallprompt는 브라우저가 "설치 가능"으로 판단하는 즉시(대개 페이지 로드 직후)
// 딱 한 번 발생한다. useInstallPrompt 훅이 MyAccountPage가 마운트될 때만 리스너를 붙이면
// 그 전에 이미 지나가버린 이벤트를 영영 놓친다 — 그래서 이 모듈이 import되는 즉시(=main.jsx
// 로드 시점, React 렌더보다 먼저) 전역으로 캡처해두고, 늦게 구독하는 쪽에도 캐시된 값을 준다.
let deferredPrompt = null
const listeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach(fn => fn(e))
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
  })
}

export function getDeferredInstallPrompt() {
  return deferredPrompt
}

// 구독 시점에 이미 캡처된 이벤트가 있으면 즉시 콜백을 호출해준다.
export function onInstallPromptReady(fn) {
  if (deferredPrompt) fn(deferredPrompt)
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function clearDeferredInstallPrompt() {
  deferredPrompt = null
}
