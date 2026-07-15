import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getGroupByInviteCode, joinGroup } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 그룹 초대 확인 팝업. 초대 링크(/join/:code)는 어떤 경로(비로그인 → 가입, OAuth 왕복,
// 카톡 인앱 → 외부 브라우저 전환)로 들어왔든 JoinPage가 pendingInviteCode를 남기고
// 메인으로 흘려보내고, 온보딩까지 끝난 사용자에게 여기서 팝업으로 수락 여부를 묻는다.
// 전용 페이지가 아니라 팝업이라 어느 화면 위에서든 뜨고, 라우트 전환 때마다 다시
// 확인하므로 로그인/가입 직후 흐름에서도 놓치지 않는다.
export default function GroupInviteModal() {
  const { user } = useUser()
  const location = useLocation()
  const [invite, setInvite] = useState(null) // { code, group }
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState(null)

  useScrollLock(!!invite)

  useEffect(() => {
    if (!user || !user.onboarded || user.is_guest) return
    if (invite) return
    const code = localStorage.getItem('pendingInviteCode')
    if (!code) return

    let cancelled = false
    getGroupByInviteCode(code)
      .then(group => { if (!cancelled) setInvite({ code, group }) })
      .catch(() => {
        // 유효하지 않은 코드 — 들고 있어봐야 계속 실패하므로 버린다
        localStorage.removeItem('pendingInviteCode')
      })
    return () => { cancelled = true }
  }, [user?.id, user?.onboarded, location.pathname])

  if (!invite) return null

  const accept = async () => {
    if (joining) return
    setJoining(true)
    setError(null)
    try {
      await joinGroup(invite.group.id, user.id)
      localStorage.removeItem('pendingInviteCode')
      invalidateCache(`board:${user.id}:`, { prefix: true })
      setJoined(true)
      // 이미 /today 위에 떠 있을 수 있어 navigate로는 보드가 새로 로드되지 않는다.
      // 전체 리로드로 어느 화면에서 수락했든 확실하게 새 그룹이 반영되게 한다.
      setTimeout(() => { window.location.assign('/today') }, 1200)
    } catch {
      setError('참여에 실패했어요. 다시 시도해주세요.')
      setJoining(false)
    }
  }

  const decline = () => {
    localStorage.removeItem('pendingInviteCode')
    setInvite(null)
  }

  return (
    <div style={styles.overlay} onClick={joined ? undefined : decline}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.emoji}>🎉</div>
        {joined ? (
          <>
            <div style={styles.title}>{invite.group.name}에 참여했어요!</div>
            <p style={styles.desc}>잠시 후 메인 화면으로 이동합니다.</p>
          </>
        ) : (
          <>
            <div style={styles.title}>{invite.group.name} 그룹에{'\n'}초대되었어요</div>
            <p style={styles.desc}>수락하면 그룹 멤버들과 함께{'\n'}오늘 밥자리를 맞춰볼 수 있어요.</p>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.btnCol}>
              <button style={{ ...PRIMARY_ACTION_BUTTON, opacity: joining ? 0.6 : 1 }} onClick={accept} disabled={joining}>
                {joining ? '참여하는 중...' : '초대 수락하기'}
              </button>
              <button style={styles.declineBtn} onClick={decline} disabled={joining}>
                나중에 할게요
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 400, padding: 'var(--spacing-lg)',
  },
  dialog: {
    width: '100%', maxWidth: 360, background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)',
  },
  emoji: { fontSize: 48 },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  desc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 },
  btnCol: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  declineBtn: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
