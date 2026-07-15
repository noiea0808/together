export const IN_APP_UA_PATTERN = /kakaotalk|instagram|fban|fbav|line\/|naver\(inapp/i

// useInstallPrompt 훅(React 마운트 후 useEffect에서 판정)과 별개로, React가 뜨기도
// 전에 앱 진입 시점 UA만으로 즉시 판별하기 위한 동기 버전. main.jsx에서 가장 먼저
// 호출해 리다이렉트 타이밍 경쟁을 피하는 데 쓴다.
export function isAndroidInAppBrowser() {
  const ua = navigator.userAgent
  return /android/i.test(ua) && IN_APP_UA_PATTERN.test(ua)
}

// 카톡 등 인앱 브라우저(WebView) 안에서 안드로이드 OS가 intent:// 스킴을 해석해
// 크롬으로 직접 넘겨준다. 인앱 브라우저 자체에 "다른 브라우저로 열기" 메뉴가 없어도
// OS 레벨에서 처리되기 때문에 동작한다. iOS는 이런 강제 전환 방법이 없다.
export function openInChromeAndroid() {
  const { protocol, host, pathname, search, hash } = window.location
  const rest = `${host}${pathname}${search}${hash}`
  window.location.href = `intent://${rest}#Intent;scheme=${protocol.replace(':', '')};package=com.android.chrome;end`
}
