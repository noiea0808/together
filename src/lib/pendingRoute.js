// "로그인 후 원래 가려던 곳"을 기억한다 (밥팟 초대 링크로 들어와 로그인하는 경우 등).
//
// sessionStorage가 아니라 localStorage를 쓰는 이유: 카톡 인앱 브라우저 → 외부 브라우저
// 전환, 네이티브 앱의 Chrome Custom Tab OAuth 왕복처럼 세션 저장소가 이어지지 않는
// 경로가 있어서 sessionStorage로는 중간에 유실된다.
// (그룹 초대는 URL에 코드를 실어 나르는 pendingInviteCode 방식을 그대로 쓴다.)
//
// 대신 localStorage는 지우지 않으면 영원히 남으므로, 한참 뒤의 로그인이 엉뚱한 옛 링크로
// 튀지 않도록 만료 시간을 같이 저장한다.
const KEY = 'pendingRoute'
const TTL_MS = 30 * 60 * 1000 // 30분

export function setPendingRoute(path) {
  if (!path) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, expiresAt: Date.now() + TTL_MS }))
  } catch { /* 사파리 프라이빗 모드 등 — 복귀 경로는 부가 기능이라 조용히 넘어간다 */ }
}

// 읽으면서 지운다 — 한 번 소비된 복귀 경로가 다음 로그인까지 남지 않게.
export function takePendingRoute() {
  let raw
  try {
    raw = localStorage.getItem(KEY)
    if (!raw) return null
    localStorage.removeItem(KEY)
  } catch { return null }

  try {
    const { path, expiresAt } = JSON.parse(raw)
    if (!path || !expiresAt || Date.now() > expiresAt) return null
    return path
  } catch {
    return null
  }
}
