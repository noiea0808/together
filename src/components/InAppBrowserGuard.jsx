import { useEffect, useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { openInChromeAndroid } from '../lib/inAppBrowser'

// 카톡 등 인앱 브라우저 안에서는 안드로이드만 구글 로그인이 막힌다(403 disallowed_useragent).
// iOS 인앱 브라우저는 구글 로그인이 정상 동작하는 것으로 확인돼 안내가 필요 없다.
// 안드로이드는 intent:// 자동 전환을 우선 시도하되, 일부 기기에서 조용히 실패할 수
// 있어 눈에 보이는 배너도 함께 띄운다.
export default function InAppBrowserGuard() {
  const { isInAppBrowser, isAndroid } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isInAppBrowser && isAndroid) openInChromeAndroid()
  }, [isInAppBrowser, isAndroid])

  if (!isInAppBrowser || !isAndroid || dismissed) return null

  return (
    <div style={styles.banner}>
      <span style={styles.text}>카톡 브라우저에서는 로그인이 안 돼요. Chrome으로 전환하고 있어요…</span>
      <button style={styles.btn} onClick={openInChromeAndroid}>Chrome으로 열기</button>
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
