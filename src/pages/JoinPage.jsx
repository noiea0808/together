import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getGroupByInviteCode, joinGroup } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const [status, setStatus] = useState('loading') // loading | confirm | joining | success | error
  const [group, setGroup] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user === undefined) return // 로딩중

    if (!user) {
      // groups 테이블 조회 RLS가 authenticated 전용이라 비로그인 상태에선 그룹 정보를
      // 조회할 수 없다. 조회를 시도하지 않고 바로 코드만 저장한 뒤 로그인/가입을 시키고,
      // 실제 조회는 로그인 이후(아래 load())에 한다.
      localStorage.setItem('pendingInviteCode', code)
      navigate('/onboarding')
      return
    }

    const load = async () => {
      try {
        const g = await getGroupByInviteCode(code)
        setGroup(g)

        // 가입/로그인은 됐지만 아직 그룹에는 참여 전 — 초대를 확인하고 직접 수락하게 한다.
        // 예전엔 여기서 바로 자동 참여시켰는데, 특히 신규 가입 직후엔 방금 무슨 초대를
        // 수락한 건지 체감이 안 돼서(그냥 오늘 화면으로 넘어가버림) 명시적 확인 단계를 둔다.
        setStatus('confirm')
      } catch (e) {
        setError('유효하지 않은 초대 코드예요.')
        setStatus('error')
      }
    }

    load()
  }, [code, user])

  const accept = async () => {
    setStatus('joining')
    try {
      await joinGroup(group.id, user.id)
      invalidateCache(`board:${user.id}:`, { prefix: true })
      setStatus('success')
      setTimeout(() => navigate('/today'), 1500)
    } catch (e) {
      setError('참여에 실패했어요. 다시 시도해주세요.')
      setStatus('error')
    }
  }

  return (
    <div style={styles.page}>
      {status === 'loading' && (
        <>
          <div style={styles.emoji}><RiceBowlIcon size={56} /></div>
          <div style={styles.title}>초대 코드 확인 중...</div>
        </>
      )}
      {(status === 'confirm' || status === 'joining') && (
        <>
          <div style={styles.emoji}>🎉</div>
          <div style={styles.title}>{group.name} 그룹에 초대되었어요</div>
          <p style={styles.sub}>수락하면 그룹 멤버들과 함께{'\n'}오늘 밥자리를 맞춰볼 수 있어요.</p>
          <div style={styles.btnCol}>
            <button style={{ ...PRIMARY_ACTION_BUTTON, opacity: status === 'joining' ? 0.6 : 1 }} onClick={accept} disabled={status === 'joining'}>
              {status === 'joining' ? '참여하는 중...' : '초대 수락하기'}
            </button>
            <button style={styles.declineBtn} onClick={() => navigate('/today')} disabled={status === 'joining'}>
              나중에 할게요
            </button>
          </div>
        </>
      )}
      {status === 'success' && (
        <>
          <div style={styles.emoji}>🎉</div>
          <div style={styles.title}>{group.name}에 참여했어요!</div>
          <p style={styles.sub}>잠시 후 메인 화면으로 이동합니다.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={styles.emoji}>😢</div>
          <div style={styles.title}>{error}</div>
          <button style={PRIMARY_ACTION_BUTTON} onClick={() => navigate('/today')}>
            메인으로 돌아가기
          </button>
        </>
      )}
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-xl)' },
  emoji: { fontSize: 56 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 800, textAlign: 'center' },
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.6 },
  btnCol: { width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  declineBtn: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
