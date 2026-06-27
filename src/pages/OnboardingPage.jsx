import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp, signIn } from '../lib/db'
import { useUser } from '../lib/UserContext'

const ERROR_MESSAGES = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않아요.',
  'User already registered': '이미 가입된 이메일이에요. 로그인해주세요.',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 해요.',
  'Unable to validate email address: invalid format': '올바른 이메일 형식이 아니에요.',
}

function parseError(e) {
  return ERROR_MESSAGES[e.message] ?? '오류가 발생했어요. 다시 시도해주세요.'
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { login } = useUser()
  const hasPendingInvite = !!localStorage.getItem('pendingInviteCode')
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', nickname: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const pendingCode = localStorage.getItem('pendingInviteCode')

  const handleSignUp = async () => {
    if (!form.email || !form.password || !form.nickname || loading) return
    setLoading(true); setError(null)
    try {
      const user = await signUp(form.email.trim(), form.password, form.nickname.trim())
      login(user)
      if (pendingCode) {
        localStorage.removeItem('pendingInviteCode')
        navigate(`/join/${pendingCode}`)
      } else {
        navigate('/group-setup')
      }
    } catch (e) {
      setError(parseError(e))
    } finally {
      setLoading(false)
    }
  }

  const handleSignIn = async () => {
    if (!form.email || !form.password || loading) return
    setLoading(true); setError(null)
    try {
      const user = await signIn(form.email.trim(), form.password)
      login(user)
      if (pendingCode) {
        localStorage.removeItem('pendingInviteCode')
        navigate(`/join/${pendingCode}`)
      } else {
        navigate('/today')
      }
    } catch (e) {
      setError(parseError(e))
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') tab === 'signup' ? handleSignUp() : handleSignIn()
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}>🍚</div>
        <h1 style={styles.title}>같이 먹자</h1>
        <p style={styles.sub}>오늘 같이 먹을 사람,{'\n'}묻지 말고 확인하기</p>
      </div>

      <div style={styles.card}>
        {/* 초대 링크로 온 경우 안내 */}
        {hasPendingInvite && (
          <div style={styles.inviteBanner}>
            🎉 초대 링크로 오셨군요! 로그인하면 바로 입장됩니다.
          </div>
        )}
        {/* 탭 */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setTab('login'); setError(null) }}
          >
            로그인
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'signup' ? styles.tabActive : {}) }}
            onClick={() => { setTab('signup'); setError(null) }}
          >
            회원가입
          </button>
        </div>

        {/* 닉네임 (회원가입만) */}
        {tab === 'signup' && (
          <div style={styles.field}>
            <label style={styles.label}>닉네임</label>
            <input
              style={styles.input}
              placeholder="예: 김철수"
              value={form.nickname}
              onChange={e => set('nickname', e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={8}
              autoFocus
              disabled={loading}
            />
            <span style={styles.hint}>{form.nickname.length}/8</span>
          </div>
        )}

        <div style={styles.field}>
          <label style={styles.label}>이메일</label>
          <input
            style={styles.input}
            type="email"
            placeholder="hello@example.com"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={tab === 'login'}
            disabled={loading}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>비밀번호</label>
          <input
            style={styles.input}
            type="password"
            placeholder="6자 이상"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{
            ...styles.btn,
            opacity: (tab === 'signup'
              ? form.email && form.password && form.nickname
              : form.email && form.password) && !loading ? 1 : 0.4
          }}
          onClick={tab === 'signup' ? handleSignUp : handleSignIn}
          disabled={loading}
        >
          {loading ? '처리 중...' : tab === 'signup' ? '가입하기' : '로그인'}
        </button>
      </div>

      <p style={styles.footer}>설치 불필요 · 링크로 바로 참여</p>
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
  logo: { fontSize: 56, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-2xl)', fontWeight: 900, marginBottom: 8 },
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-base)', whiteSpace: 'pre-line', lineHeight: 1.6 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  tabs: { display: 'flex', gap: 8, marginBottom: 4 },
  tab: {
    flex: 1, padding: '10px 0',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', background: 'transparent',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  tabActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary)18',
    color: 'var(--color-primary)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  input: {
    width: '100%', padding: '13px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },
  error: { fontSize: 'var(--font-size-xs)', color: '#f44336', margin: 0 },
  btn: {
    width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
    marginTop: 4,
  },
  footer: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  inviteBanner: { background: 'var(--color-primary)12', border: '1px solid var(--color-primary)33', borderRadius: 'var(--radius-md)', padding: '10px var(--spacing-md)', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 600, lineHeight: 1.5 },
}
