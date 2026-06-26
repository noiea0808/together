import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')

  const handleJoin = () => {
    if (!nickname.trim()) return
    navigate('/today')
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}>🍚</div>
        <h1 style={styles.title}>같이 먹자</h1>
        <p style={styles.sub}>오늘 같이 먹을 사람,{'\n'}묻지 말고 확인하기</p>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>개발팀에 입장하기</div>
        <p style={styles.cardDesc}>닉네임을 입력하면 바로 시작할 수 있어요.</p>
        <input
          style={styles.input}
          placeholder="닉네임 입력 (예: 김철수)"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          maxLength={8}
          autoFocus
        />
        <div style={styles.hint}>{nickname.length}/8</div>
        <button
          style={{ ...styles.btn, opacity: nickname.trim() ? 1 : 0.4 }}
          onClick={handleJoin}
        >
          입장하기
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
    fontSize: 'var(--font-size-base)', outline: 'none',
    boxSizing: 'border-box',
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right', marginBottom: 'var(--spacing-md)', marginTop: 4 },
  btn: {
    width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
  },
  footer: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
}
