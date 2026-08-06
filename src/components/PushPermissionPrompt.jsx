import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups } from '../lib/db'
import { isPushSupported, getPushPermissionState, subscribeToPush } from '../lib/push'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { useScrollLock } from '../lib/useScrollLock'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 알림 권한을 언제 묻느냐가 수락률을 가른다. 가입 직후에 물으면 "이게 왜 필요한지" 모르는
// 상태라 거절이 많고, 설정 화면 토글로만 두면 (예전 방식) 대부분 알림이 꺼진 채로 남는다.
// 그래서 그룹에 실제로 들어와 "받을 알림이 생긴" 시점에 딱 한 번 물어본다.
//
// OS 권한 팝업은 한 번 거부되면 앱에서 다시 띄울 수 없기 때문에, 그 앞에 이 안내를 한 겹
// 두고 여기서 "받을게요"를 누른 사람에게만 진짜 권한 요청을 보낸다.
const DISMISSED_KEY = 'pushPromptDismissed'

export default function PushPermissionPrompt() {
  const { user } = useUser()
  const location = useLocation()
  const { isIOS, isInstalled } = useInstallPrompt()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // 아직 그룹이 없는 사용자에게서 화면 이동마다 getMyGroups가 반복되지 않도록,
  // "그룹 없음" 결과는 잠깐 기억해두고 그 사이엔 다시 조회하지 않는다.
  const noGroupsUntil = useRef(0)

  useScrollLock(show)

  useEffect(() => {
    if (show) return
    if (!user || !user.onboarded || user.is_guest) return
    if (localStorage.getItem(DISMISSED_KEY)) return
    if (!isPushSupported()) return
    // iOS 웹은 홈 화면에 추가하기 전엔 푸시 자체가 안 돼서, 물어봐야 켤 수가 없다.
    if (isIOS && !isInstalled) return
    if (Date.now() < noGroupsUntil.current) return

    let cancelled = false
    ;(async () => {
      // 이미 허용했거나 거부한 사용자에겐 묻지 않는다 ('default'일 때만 물어볼 여지가 있다)
      const state = await getPushPermissionState()
      if (cancelled || state !== 'default') return

      // 그룹이 하나라도 있어야 알림 받을 일이 생긴다 — 가입만 하고 아무 데도 안 들어간
      // 사용자에게 미리 묻지 않기 위한 조건.
      const groups = await getMyGroups(user.id)
      if (cancelled) return
      if (groups.length === 0) {
        noGroupsUntil.current = Date.now() + 60_000
        return
      }

      setShow(true)
    })().catch(() => { /* 권한/네트워크 실패는 조용히 넘어간다 — 설정 화면에서 켤 수 있다 */ })

    return () => { cancelled = true }
  }, [user?.id, user?.onboarded, user?.is_guest, isIOS, isInstalled, location.pathname])

  if (!show) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  const allow = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await subscribeToPush(user.id)
      localStorage.setItem(DISMISSED_KEY, '1')
      setShow(false)
    } catch (e) {
      // 사용자가 OS 팝업에서 거부한 경우도 여기로 온다 — 다시 묻지 않도록 같이 기록한다.
      localStorage.setItem(DISMISSED_KEY, '1')
      setError(e.message || '알림을 켜지 못했어요. 나중에 내 계정에서 켤 수 있어요.')
      setBusy(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.dialog}>
        <div style={styles.emoji}>🔔</div>
        <div style={styles.title}>밥 약속 소식을{'\n'}알려드릴까요?</div>
        <p style={styles.desc}>
          같이 먹자고 제안이 오거나 밥팟에 초대되면{'\n'}바로 알려드려요. 언제든 끌 수 있어요.
        </p>
        {error && <p style={styles.error}>{error}</p>}
        <div style={styles.btnCol}>
          <button style={{ ...PRIMARY_ACTION_BUTTON, opacity: busy ? 0.6 : 1 }} onClick={allow} disabled={busy}>
            {busy ? '설정하는 중...' : '알림 받을게요'}
          </button>
          <button style={styles.laterBtn} onClick={dismiss} disabled={busy}>
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 380, padding: 'var(--spacing-lg)',
  },
  dialog: {
    width: '100%', maxWidth: 340, background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)',
  },
  emoji: { fontSize: 44 },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.4 },
  desc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', textAlign: 'center', margin: 0 },
  btnCol: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  laterBtn: {
    width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)',
    border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer',
  },
}
