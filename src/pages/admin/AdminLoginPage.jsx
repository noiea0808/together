import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminSignIn } from '../../lib/adminAuth'
import { useAdminAuth } from '../../lib/AdminAuthContext'
import RiceBowlIcon from '../../components/RiceBowlIcon'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const { login } = useAdminAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password || loading) return
    setLoading(true)
    setError(null)
    try {
      const profile = await adminSignIn(email.trim(), password)
      login(profile)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message === '관리자 권한이 없는 계정입니다.' ? err.message : '이메일 또는 비밀번호가 올바르지 않아요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={handleSubmit}>
        <div style={s.brand}>
          <RiceBowlIcon size={36} />
          <div>
            <div style={s.brandName}>같이먹자</div>
            <div style={s.brandSub}>Admin</div>
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>이메일</label>
          <input
            style={s.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            disabled={loading}
          />
        </div>

        <div style={s.field}>
          <label style={s.label}>비밀번호</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button style={{ ...s.btn, opacity: email && password && !loading ? 1 : 0.5 }} type="submit" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </div>
  )
}

const s = {
  page: {
    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1E1E2E', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 360, background: '#2A2A3E', borderRadius: 14,
    padding: 32, display: 'flex', flexDirection: 'column', gap: 18,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  brandName: { fontSize: 16, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 },
  brandSub: { fontSize: 11, color: '#FF6B35', fontWeight: 600, letterSpacing: 1 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: '#9090A8' },
  input: {
    padding: '11px 12px', border: '1.5px solid #3A3A54', borderRadius: 8,
    fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#1E1E2E', color: '#FFFFFF',
  },
  error: { fontSize: 12, color: '#FF6B6B', margin: 0 },
  btn: {
    padding: 13, background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
}
