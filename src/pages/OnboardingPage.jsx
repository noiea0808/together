import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp, signIn, signInWithGoogle, signInWithKakao } from '../lib/db'
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

// 진입 화면: 소셜 / 이메일 선택
function LoginSelect({ onEmail, hasPendingInvite }) {
  return (
    <div style={styles.card}>
      {hasPendingInvite && (
        <div style={styles.inviteBanner}>
          🎉 초대 링크로 오셨군요! 로그인하면 바로 입장됩니다.
        </div>
      )}
      <p style={styles.selectTitle}>로그인 / 회원가입</p>
      <button style={{ ...styles.socialBtn, ...styles.googleBtn }} onClick={async () => { try { await signInWithGoogle() } catch (e) { alert('구글 로그인 실패: ' + e.message) } }}>
        <GoogleIcon />
        <span>Google로 계속하기</span>
      </button>
      <button style={{ ...styles.socialBtn, ...styles.kakaoBtn }} onClick={async () => { try { await signInWithKakao() } catch (e) { alert('카카오 로그인 실패: ' + e.message) } }}>
        <KakaoIcon />
        <span>카카오로 계속하기</span>
      </button>
      <div style={styles.divider}>
        <span style={styles.dividerLine} />
        <span style={styles.dividerText}>또는</span>
        <span style={styles.dividerLine} />
      </div>
      <button style={{ ...styles.socialBtn, ...styles.emailBtn }} onClick={onEmail}>
        <span style={styles.emailIcon}>✉️</span>
        <span>이메일로 계속하기</span>
      </button>
    </div>
  )
}

// 이메일 로그인/가입 폼
function EmailForm({ hasPendingInvite, onBack }) {
  const navigate = useNavigate()
  const { login } = useUser()
  const [tab, setTab] = useState('login')
  const [form, setForm] = useState({ email: localStorage.getItem('rememberedEmail') || '', password: '', passwordConfirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSignUp = async () => {
    if (!form.email || !form.password || loading) return
    if (form.password.length < 6) { setError('비밀번호는 6자 이상이어야 해요.'); return }
    if (form.password !== form.passwordConfirm) { setError('비밀번호가 일치하지 않아요.'); return }
    setLoading(true); setError(null)
    try {
      // 닉네임·생년월일·약관동의는 /welcome 단계에서 받는다.
      const user = await signUp(form.email.trim(), form.password)
      login(user)
      navigate('/welcome')
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
      localStorage.setItem('rememberedEmail', form.email.trim())
      login(user)
      // 밥팟 링크 등에서 넘어온 경우 원래 위치로 복귀
      const returnTo = sessionStorage.getItem('returnTo')
      if (returnTo) {
        sessionStorage.removeItem('returnTo')
        navigate(returnTo)
      } else {
        // onboarded 여부는 App 라우팅 게이트가 판단해 /welcome 또는 /today 로 보냄
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
    <div style={styles.card}>
      {hasPendingInvite && (
        <div style={styles.inviteBanner}>
          🎉 초대 링크로 오셨군요! 로그인하면 바로 입장됩니다.
        </div>
      )}
      <div style={styles.emailFormHeader}>
        <button style={styles.backBtn} onClick={onBack}>←</button>
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
      </div>

      <div style={styles.field}>
        <label style={styles.label}>이메일</label>
        <input
          style={styles.input}
          type="email"
          placeholder="hello@example.com"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
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

      {tab === 'signup' && (
        <div style={styles.field}>
          <label style={styles.label}>비밀번호 확인</label>
          <input
            style={styles.input}
            type="password"
            placeholder="비밀번호 재입력"
            value={form.passwordConfirm}
            onChange={e => set('passwordConfirm', e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      <button
        style={{
          ...styles.btn,
          opacity: (tab === 'signup'
            ? form.email && form.password && form.passwordConfirm
            : form.email && form.password) && !loading ? 1 : 0.4,
        }}
        onClick={tab === 'signup' ? handleSignUp : handleSignIn}
        disabled={loading}
      >
        {loading ? '처리 중...' : tab === 'signup' ? '가입하기' : '로그인'}
      </button>
    </div>
  )
}

export default function OnboardingPage() {
  const hasPendingInvite = !!localStorage.getItem('pendingInviteCode')
  const [view, setView] = useState('select') // 'select' | 'email'

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}>🍚</div>
        <h1 style={styles.title}>같이 먹자</h1>
        <p style={styles.sub}>오늘 같이 먹을 사람,{'\n'}묻지 말고 확인하기</p>
      </div>

      {view === 'select'
        ? <LoginSelect hasPendingInvite={hasPendingInvite} onEmail={() => setView('email')} />
        : <EmailForm hasPendingInvite={hasPendingInvite} onBack={() => setView('select')} />
      }

      <p style={styles.footer}>설치 불필요 · 링크로 바로 참여</p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  )
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#3C1E1E" d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.617 5.08 4.077 6.558L5.1 21l4.523-2.94A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z"/>
    </svg>
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
  selectTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)', textAlign: 'center', marginBottom: 4 },
  socialBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, padding: '13px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
  },
  googleBtn: { background: '#fff', color: '#3c4043' },
  kakaoBtn: { background: '#FEE500', color: '#3C1E1E', border: '1.5px solid #FEE500' },
  emailBtn: { background: 'var(--color-surface-2)', color: 'var(--color-text)', marginTop: -4 },
  emailIcon: { fontSize: 18, lineHeight: 1 },
  divider: { display: 'flex', alignItems: 'center', gap: 8 },
  dividerLine: { flex: 1, height: 1, background: 'var(--color-border)' },
  dividerText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexShrink: 0 },
  emailFormHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  backBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '0 4px', flexShrink: 0 },
  tabs: { display: 'flex', gap: 8, flex: 1 },
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
