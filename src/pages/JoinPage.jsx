import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getGroupByInviteCode, joinGroup } from '../lib/db'
import { invalidateCache } from '../lib/cache'

export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()
  const [status, setStatus] = useState('loading') // loading | success | error
  const [groupName, setGroupName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user === undefined) return // 로딩중

    const join = async () => {
      try {
        const group = await getGroupByInviteCode(code)
        setGroupName(group.name)

        if (!user) {
          // 로그인 필요 → 온보딩으로, 이후 돌아올 수 있도록 코드 저장
          localStorage.setItem('pendingInviteCode', code)
          navigate('/onboarding')
          return
        }

        await joinGroup(group.id, user.id)
        invalidateCache(`board:${user.id}:`, { prefix: true })
        setStatus('success')
        setTimeout(() => navigate('/today'), 1500)
      } catch (e) {
        setError('유효하지 않은 초대 코드예요.')
        setStatus('error')
      }
    }

    join()
  }, [code, user])

  return (
    <div style={styles.page}>
      {status === 'loading' && (
        <>
          <div style={styles.emoji}>🍚</div>
          <div style={styles.title}>초대 코드 확인 중...</div>
        </>
      )}
      {status === 'success' && (
        <>
          <div style={styles.emoji}>🎉</div>
          <div style={styles.title}>{groupName}에 참여했어요!</div>
          <p style={styles.sub}>잠시 후 메인 화면으로 이동합니다.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <div style={styles.emoji}>😢</div>
          <div style={styles.title}>{error}</div>
          <button style={styles.btn} onClick={() => navigate('/today')}>
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
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' },
  btn: { marginTop: 8, padding: '13px 28px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
}
