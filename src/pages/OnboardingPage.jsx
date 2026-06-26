import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createUser } from '../lib/db'
import { useUser } from '../lib/UserContext'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { login } = useUser()
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleJoin = async () => {
    if (!nickname.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const user = await createUser(nickname.trim())
      login(user)
      navigate('/today')
    } catch (e) {
      setError('오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}>🍚</div>
        <h1 style={styles.title}>같이 먹자</h1>
        <p style={styles.sub}>오늘 같이 먹을 사람,{'\n'}묻지 말고 확인하기</p>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>시작하기</div>
        <p style={styles.cardDesc}>닉네임을 입력하면 바로 시작할 수 있어요.</p>
        <input
          style={styles.input}
          placeholder="닉네임 입력 (예: 김철수)"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          maxLength={8}
          autoFocus
          disabled={loading}
        />
        <div style={styles.hint}>{nickname.length}/8</div>
        {error && <p style={styles.error}>{error}</p>}
        <button
          style={{ ...styles.btn, opacity: nickname.trim() && !loading ? 1 : 0.4 }}
          onClick={handleJoin}
          disabled={loading}
        >
          {loading ? '입장 중...' : '입장하기'}
        </button>
      </div>

      <p style={styles.footer}>설치 불필요 · 회원가입 없음</p>
    </div>
  )
}

const styles = {
  page: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-xl)',
  },
  top: { textAlign: 'center' },
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-2xl)', fontWeight: 900, marginBottom: 8 },
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-base)', whiteSpace: 'pre-line', lineHeight: 1.6 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)',
  },
  cardTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 4 },
  cardDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-md)' },
  input: {
    width: '100%', padding: '14px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right', marginBottom: 'var(--spacing-md)', marginTop: 4 },
  error: { fontSize: 'var(--font-size-xs)', color: '#f44336', marginBottom: 'var(--spacing-sm)' },
  btn: {
    width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
  },
  footer: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
}
