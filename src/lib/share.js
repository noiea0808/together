import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

// 초대 링크 공유 공통 로직. 지금까지는 어디서든 "복사"만 제공했는데, 그러면 카톡으로
// 초대를 보내기까지 복사 → 앱 전환 → 대화방 찾기 → 붙여넣기 4단계를 사용자가 직접
// 해야 했다. 네이티브 앱은 Capacitor Share, 모바일 웹은 Web Share API로 OS 공유
// 시트를 띄워 한 번에 끝내고, 둘 다 없는 환경(데스크톱 브라우저)에서만 복사로 떨어진다.

// navigator.clipboard는 보안 컨텍스트(https/localhost)에서만 존재하고, 권한이나
// 포커스 문제로 reject될 수도 있다. 예전 코드는 실패해도 "복사됨"을 띄워서 사용자가
// 빈 클립보드를 붙여넣게 됐기 때문에, 성공 여부를 반드시 boolean으로 돌려준다.
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* 아래 execCommand 폴백으로 넘어간다 */ }

  // 구형 WebView/비보안 컨텍스트 폴백
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function canWebShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

// OS 공유 시트를 띄울 수 있는 환경인지 — 호출부에서 버튼 문구를 "공유"/"복사"로
// 가르는 데 쓴다.
export function canShare() {
  return Capacitor.isNativePlatform() || canWebShare()
}

// 반환값: 'shared'(공유 시트로 보냄) | 'copied'(공유 불가라 복사로 대체) |
//        'cancelled'(사용자가 공유 시트를 닫음) | 'failed'
// 'cancelled'는 실패가 아니므로 호출부에서 에러/성공 토스트를 띄우지 않는다.
export async function shareLink({ title, text, url }) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title, text, url, dialogTitle: title })
      return 'shared'
    } catch (e) {
      if (isShareCancelled(e)) return 'cancelled'
      // 공유 시트를 못 띄우면 최소한 링크는 손에 쥐어준다
      return (await copyToClipboard(url)) ? 'copied' : 'failed'
    }
  }

  if (canWebShare()) {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (e) {
      if (isShareCancelled(e)) return 'cancelled'
      return (await copyToClipboard(url)) ? 'copied' : 'failed'
    }
  }

  return (await copyToClipboard(url)) ? 'copied' : 'failed'
}

// 사용자가 공유 시트를 그냥 닫은 경우 — 웹은 AbortError, 네이티브는 플러그인/OS마다
// 메시지가 달라 문자열로도 확인한다.
function isShareCancelled(e) {
  if (e?.name === 'AbortError') return true
  const msg = String(e?.message ?? '')
  return /abort|cancel/i.test(msg)
}
