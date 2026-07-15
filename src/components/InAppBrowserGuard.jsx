import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { openInChromeAndroid } from '../lib/inAppBrowser'

// 카톡 등 인앱 브라우저 안에서는 구글 로그인이 아예 차단되고(403 disallowed_useragent)
// 홈 화면 설치도 안 되기 때문에, 앱 진입 시점에 바로 외부 브라우저로 내보낸다.
// 안드로이드는 intent:// 자동 전환을 우선 시도하되, 일부 기기에서 조용히 실패할 수
// 있어 눈에 보이는 배너도 함께 띄운다. iOS는 강제 전환 방법이 없어 배너 안내만 한다.
export default function InAppBrowserGuard() {
  const { isInAppBrowser, isAndroid, isIOS } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (isInAppBrowser && isAndroid) openInChromeAndroid()
  }, [isInAppBrowser, isAndroid])

  if (!isInAppBrowser || dismissed) return null

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div style={styles.banner}>
      <span style={styles.text}>
        {isIOS
          ? '카톡 브라우저에서는 로그인이 안 돼요. 링크를 복사해 Safari에서 열어주세요.'
          : '카톡 브라우저에서는 로그인이 안 돼요. Chrome으로 전환하고 있어요…'}
      </span>
      {isIOS && (
        <button style={styles.btn} onClick={copyLink}>{linkCopied ? '복사됨 ✓' : '링크 복사'}</button>
      )}
      {isAndroid && (
        <button style={styles.btn} onClick={openInChromeAndroid}>Chrome으로 열기</button>
      )}
      <button style={styles.close} onClick={() => setDismissed(true)} aria-label="닫기">✕</button>
    </div>
  )
}

const styles = {
  banner: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', background: '#1a1a1a', color: '#fff',
    fontSize: 'var(--font-size-xs)', lineHeight: 1.4,
  },
  text: { flex: 1 },
  btn: {
    flexShrink: 0, padding: '6px 10px', borderRadius: 'var(--radius-full)',
    border: 'none', background: 'var(--color-primary)', color: '#fff',
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, cursor: 'pointer',
  },
  close: {
    flexShrink: 0, background: 'none', border: 'none', color: '#fff',
    opacity: 0.6, fontSize: 14, cursor: 'pointer', padding: 4,
  },
}
