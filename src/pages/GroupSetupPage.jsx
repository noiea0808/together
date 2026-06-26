import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGroup, getGroupByInviteCode, joinGroup } from '../lib/db'
import { useUser } from '../lib/UserContext'

export default function GroupSetupPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [tab, setTab] = useState('create') // 'create' | 'join'
  const [groupName, setGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleCreate = async () => {
    if (!groupName.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      await createGroup(groupName.trim(), user.id)
      navigate('/today', { replace: true })
    } catch (e) {
      setError('그룹 생성에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!inviteCode.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      const group = await getGroupByInviteCode(inviteCode.trim())
      await joinGroup(group.id, user.id)
      navigate('/today', { replace: true })
    } catch (e) {
      setError('초대 코드를 찾을 수 없어요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}>👥</div>
        <h1 style={styles.title}>그룹 설정</h1>
        <p style={styles.sub}>{user?.nickname}님, 그룹을 만들거나 참여해보세요.</p>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }}
          onClick={() => { setTab('create'); setError(null) }}
        >
          그룹 만들기
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'join' ? styles.tabActive : {}) }}
          onClick={() => { setTab('join'); setError(null) }}
        >
          초대 코드로 참여
        </button>
      </div>

      <div style={styles.card}>
        {tab === 'create' ? (
          <>
            <p style={styles.desc}>팀/친구 그룹 이름을 입력하세요.</p>
            <input
              style={styles.input}
              placeholder="예: 개발팀, 대학 친구들"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              maxLength={20}
              autoFocus
              disabled={loading}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button
              style={{ ...styles.btn, opacity: groupName.trim() && !loading ? 1 : 0.4 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '생성 중...' : '그룹 만들기'}
            </button>
          </>
        ) : (
          <>
            <p style={styles.desc}>초대 링크의 코드 6자리를 입력하세요.</p>
            <input
              style={{ ...styles.input, textTransform: 'uppercase', letterSpacing: 4, textAlign: 'center', fontSize: 20, fontWeight: 700 }}
              placeholder="ABC123"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              autoFocus
              disabled={loading}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button
              style={{ ...styles.btn, opacity: inviteCode.trim().length === 6 && !loading ? 1 : 0.4 }}
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? '참여 중...' : '그룹 참여하기'}
            </button>
          </>
        )}
      </div>

      {/* 이미 그룹이 있으면 건너뛰기 */}
      <button style={styles.skipBtn} onClick={() => navigate('/today')}>
        나중에 하기 →
      </button>
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
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 900, marginBottom: 6 },
  sub: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },
  tabs: { display: 'flex', width: '100%', gap: 8 },
  tab: {
    flex: 1, padding: '10px 0', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', background: 'transparent',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  tabActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary)18',
    color: 'var(--color-primary)',
  },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)',
  },
  desc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },
  input: {
    width: '100%', padding: '14px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
  },
  error: { fontSize: 'var(--font-size-xs)', color: '#f44336' },
  btn: {
    width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
    marginTop: 4,
  },
  skipBtn: {
    background: 'none', border: 'none',
    fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)',
    cursor: 'pointer', padding: 8,
  },
}
