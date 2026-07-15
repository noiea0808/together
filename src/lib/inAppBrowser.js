// 카톡 등 인앱 브라우저(WebView) 안에서 안드로이드 OS가 intent:// 스킴을 해석해
// 크롬으로 직접 넘겨준다. 인앱 브라우저 자체에 "다른 브라우저로 열기" 메뉴가 없어도
// OS 레벨에서 처리되기 때문에 동작한다. iOS는 이런 강제 전환 방법이 없다.
export function openInChromeAndroid() {
  const { protocol, host, pathname, search, hash } = window.location
  const rest = `${host}${pathname}${search}${hash}`
  window.location.href = `intent://${rest}#Intent;scheme=${protocol.replace(':', '')};package=com.android.chrome;end`
}
