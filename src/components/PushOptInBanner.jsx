import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { isPushSupported, subscribeToPush } from '../lib/push'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const DISMISS_KEY = 'pushOptInDismissedAt'
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000 // 2주 — 매 접속마다 뜨면 성가시니 한 번 미루면 당분간 조용히 둔다

function isCoolingDown() {
  const raw = localStorage.getItem(DISMISS_KEY)
  const dismissedAt = raw ? Number(raw) : NaN
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < COOLDOWN_MS
}

// 서비스 접속 시점에 알림 권한이 아직 default(한 번도 안 물어봄)면 이유를 먼저 보여주고
// 동의를 받는 소프트 애스크. 여기서 "알림 켜기"를 눌러야만 실제 브라우저 네이티브 권한
// 팝업(하드 애스크, subscribeToPush 내부)이 뜬다 — 브라우저 권한은 한 번 거부당하면
// 사이트가 다시 물어볼 방법이 없어서, 맥락 없이 네이티브 팝업부터 띄우면 첫인상에서
// 영구히 막힐 위험이 크다. GroupInviteModal/DailyTipModal과 마찬가지로 초대 코드가
// 대기 중이면 이번 접속에서는 띄우지 않는다.
export default function PushOptInBanner() {
  const { user } = useUser()
  const [visible, setVisible] = useState(false)
  const [subscribing, setSubscribing] = useState(false)

  useEffect(() => {
    if (!user || !user.onboarded || user.is_guest) return
    if (!isPushSupported()) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem('pendingInviteCode')) return
    if (isCoolingDown()) return
    setVisible(true)
  }, [user?.id, user?.onboarded, user?.is_guest])

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  const enable = async () => {
    if (subscribing) return
    setSubscribing(true)
    try {
      await subscribeToPush(user.id)
      setVisible(false)
    } catch {
      // 네이티브 팝업에서 거부했거나 발송 실패 — 당분간 다시 안 물어보게 쿨다운만 남기고 조용히 닫는다
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
      setVisible(false)
    } finally {
      setSubscribing(false)
    }
  }

  if (!visible) return null

  return (
    <div style={styles.overlay} onClick={dismiss}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.icon}>🔔</div>
        <div style={styles.title}>알림 켜고 놓치지 마세요</div>
        <p style={styles.desc}>그룹 초대나 밥팟 제안이 왔을 때{'\n'}바로 알려드릴게요.</p>
        <button style={PRIMARY_ACTION_BUTTON} onClick={enable} disabled={subscribing}>
          {subscribing ? '설정 중...' : '알림 켜기'}
        </button>
        <button style={styles.laterBtn} onClick={dismiss}>나중에 할게요</button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
  },
  sheet: {
    width: '100%', maxWidth: 'var(--max-width)', background: '#fff',
    borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32,
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6,
  },
  icon: { fontSize: 40 },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  desc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.6, margin: '0 0 var(--spacing-md)' },
  laterBtn: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
