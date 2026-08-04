export const IN_APP_UA_PATTERN = /kakaotalk|instagram|fban|fbav|line\/|naver\(inapp/i

// android/app/src/main/AndroidManifest.xml, capacitor.config.json의 appId와 같아야 한다.
const APP_PACKAGE = 'app.eat_together.mobile'
// AndroidManifest의 App Links intent-filter(pathPrefix)와 짝을 이룬다 — 이 경로만 앱이 받는다.
const APP_LINK_PATH_PATTERN = /^\/(join|pot)(\/|$)/

// useInstallPrompt 훅(React 마운트 후 useEffect에서 판정)과 별개로, React가 뜨기도
// 전에 앱 진입 시점 UA만으로 즉시 판별하기 위한 동기 버전. main.jsx에서 가장 먼저
// 호출해 리다이렉트 타이밍 경쟁을 피하는 데 쓴다.
export function isAndroidInAppBrowser() {
  const ua = navigator.userAgent
  return /android/i.test(ua) && IN_APP_UA_PATTERN.test(ua)
}

// 카톡 등 인앱 브라우저(WebView) 안에서 안드로이드 OS가 intent:// 스킴을 해석해
// 지정한 앱으로 넘겨준다. 인앱 브라우저 자체에 "다른 브라우저로 열기" 메뉴가 없어도
// OS 레벨에서 처리되기 때문에 동작한다. iOS는 이런 강제 전환 방법이 없다.
function buildIntentUrl({ pkg, fallbackUrl }) {
  const { protocol, host, pathname, search, hash } = window.location
  const rest = `${host}${pathname}${search}${hash}`
  const parts = [`scheme=${protocol.replace(':', '')}`]
  if (pkg) parts.push(`package=${pkg}`)
  // 지정한 앱이 없을 때 기본 브라우저로라도 열리게 한다 — 크롬이 안 깔린 기기
  // (삼성 인터넷만 쓰는 경우) 대응.
  if (fallbackUrl) parts.push(`S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`)
  return `intent://${rest}#Intent;${parts.join(';')};end`
}

export function openInChromeAndroid() {
  window.location.href = buildIntentUrl({ pkg: 'com.android.chrome', fallbackUrl: window.location.href })
}

// 인앱 브라우저 탈출. 초대 링크(/join, /pot)는 네이티브 앱이 깔려 있으면 앱에서 여는 게
// 맞으므로 앱을 먼저 시도하고, 앱이 없어 화면이 그대로 남아 있으면 그때 크롬으로 넘긴다.
// (앱이 열리면 이 탭은 백그라운드로 가서 visibilityState가 'hidden'이 된다.)
export function escapeInAppBrowserAndroid() {
  if (!APP_LINK_PATH_PATTERN.test(window.location.pathname)) {
    openInChromeAndroid()
    return
  }

  window.location.href = buildIntentUrl({ pkg: APP_PACKAGE })
  setTimeout(() => {
    if (document.visibilityState === 'visible') openInChromeAndroid()
  }, 1500)
}
