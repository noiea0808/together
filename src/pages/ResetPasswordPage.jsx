import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../lib/db'
import { useUser } from '../lib/UserContext'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const ERROR_MESSAGES = {
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 해요.',
  'New password should be different from the old password.': '이전과 다른 비밀번호를 입력해주세요.',
}

function parseError(e) {
  return ERROR_MESSAGES[e.message] ?? '오류가 발생했어요. 다시 시도해주세요.'
}

// 비밀번호 재설정 메일의 링크로 진입하는 화면. 링크 클릭 시 supabase 클라이언트가
// URL의 임시 토큰으로 세션을 만들어두므로, 그 세션 위에서 새 비밀번호만 입력받으면 된다.
export default function ResetPasswordPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  if (user === undefined) {
    return <div style={styles.loading}><RiceBowlIcon size={48} /></div>
  }

  if (user === null) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <p style={styles.desc}>링크가 만료되었거나 유효하지 않아요.{'\n'}비밀번호 찾기를 다시 시도해주세요.</p>
          <button style={PRIMARY_ACTION_BUTTON} onClick={() => navigate('/onboarding')}>로그인 화면으로</button>
        </div>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (!password || loading) return
    if (password.length < 6) { setError('비밀번호는 6자 이상이어야 해요.'); return }
    if (password !== passwordConfirm) { setError('비밀번호가 일치하지 않아요.'); return }
    setLoading(true); setError(null)
    try {
      await updatePassword(password)
      setDone(true)
    } catch (e) {
      setError(parseError(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}><RiceBowlIcon size={96} /></div>
        <h1 style={styles.title}>새 비밀번호 설정</h1>
      </div>

      <div style={styles.card}>
        {done ? (
          <>
            <p style={styles.desc}>비밀번호가 변경됐어요.</p>
            <button style={PRIMARY_ACTION_BUTTON} onClick={() => navigate('/today')}>계속하기</button>
          </>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label}>새 비밀번호</label>
              <input
                style={styles.input}
                type="password"
                placeholder="6자 이상"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoFocus
                disabled={loading}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>새 비밀번호 확인</label>
              <input
                style={styles.input}
                type="password"
                placeholder="비밀번호 재입력"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                disabled={loading}
              />
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button
              style={{ ...PRIMARY_ACTION_BUTTON, opacity: password && passwordConfirm && !loading ? 1 : 0.4 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? '처리 중...' : '비밀번호 변경하기'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-lg)',
  },
  top: { textAlign: 'center' },
  logo: { marginBottom: 8 },
  title: { fontFamily: 'var(--font-title)', fontSize: 'var(--font-size-xl)', fontWeight: 700 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  input: {
    width: '100%', padding: '13px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
  },
  desc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.6, margin: 0, textAlign: 'center' },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 48 },
}
