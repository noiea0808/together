import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import RiceBowlIcon from '../components/RiceBowlIcon'

// 초대 확인 UI는 전역 팝업(GroupInviteModal)이 담당한다. 이 라우트는 초대 코드를
// localStorage에 남기고 로그인 상태에 맞는 화면으로 흘려보내는 얇은 진입점 역할만 한다.
// (비로그인 → 온보딩, 온보딩 미완 → /welcome, 완료 → 메인 위에 팝업)
// OAuth 왕복 후에도 이 경로로 돌아오므로(oauthReturnPath), 저장소가 이어지지 않는
// 브라우저 전환 상황에서도 URL에 실린 코드가 여기서 다시 저장된다.
export default function JoinPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useUser()

  useEffect(() => {
    if (user === undefined) return // 세션 확인중
    if (code) localStorage.setItem('pendingInviteCode', code)
    if (!user) navigate('/onboarding', { replace: true })
    else if (!user.onboarded) navigate('/welcome', { replace: true })
    else navigate('/today', { replace: true })
  }, [code, user, navigate])

  return (
    <div style={styles.page}>
      <div style={styles.emoji}><RiceBowlIcon size={56} /></div>
      <div style={styles.title}>초대 코드 확인 중...</div>
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-xl)' },
  emoji: { fontSize: 56 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 800, textAlign: 'center' },
}
