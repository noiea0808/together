import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGroup, getGroupByInviteCode, joinGroup, searchGroups, joinGroupByPassword } from '../lib/db'
import { useUser } from '../lib/UserContext'
import { invalidateCache } from '../lib/cache'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import GroupInviteShare from '../components/GroupInviteShare'
import { SearchIcon, LockIcon } from '../components/GroupIcons'

const MIN_NAME_LENGTH = 4
const MIN_SEARCH_LENGTH = 3

export default function GroupSetupPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [tab, setTab] = useState('search') // 'search' | 'create' | 'join'
  const [groupName, setGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdGroup, setCreatedGroup] = useState(null) // 생성 직후: 초대 화면으로 전환

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState(null) // { id, name }
  const [passwordValue, setPasswordValue] = useState('')
  const debounceRef = useRef(null)

  const handleCreate = async () => {
    if (groupName.trim().length < MIN_NAME_LENGTH || loading) return
    setLoading(true)
    setError(null)
    try {
      const group = await createGroup(groupName.trim(), user.id)
      invalidateCache(`board:${user.id}:`, { prefix: true })
      setCreatedGroup(group)
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
      invalidateCache(`board:${user.id}:`, { prefix: true })
      navigate('/today', { replace: true })
    } catch (e) {
      setError('초대 코드를 찾을 수 없어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = searchQuery.trim()
    if (q.length < MIN_SEARCH_LENGTH) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const rows = await searchGroups(q)
        setSearchResults(rows)
      } catch (e) {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery])

  const openPasswordPrompt = (group) => {
    setPasswordTarget(group)
    setPasswordValue('')
    setError(null)
  }

  const handleJoinByPassword = async () => {
    if (!passwordValue || loading) return
    setLoading(true)
    setError(null)
    try {
      await joinGroupByPassword(passwordTarget.id, passwordValue)
      invalidateCache(`board:${user.id}:`, { prefix: true })
      navigate('/today', { replace: true })
    } catch (e) {
      setError(e.message || '참여에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const switchTab = (t) => { setTab(t); setError(null) }

  if (createdGroup) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <GroupInviteShare group={createdGroup} onDone={() => navigate('/today', { replace: true })} />
        </div>
      </div>
    )
  }

  if (passwordTarget) {
    return (
      <div style={styles.page}>
        <div style={styles.top}>
          <div style={styles.logo}><LockIcon size={40} /></div>
          <h1 style={styles.title}>{passwordTarget.name}</h1>
          <p style={styles.sub}>방장이 설정한 비밀번호를 입력하세요</p>
        </div>
        <div style={styles.card}>
          <input
            style={styles.input}
            type="password"
            placeholder="비밀번호"
            value={passwordValue}
            onChange={e => setPasswordValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoinByPassword()}
            autoFocus
            disabled={loading}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{ ...PRIMARY_ACTION_BUTTON, marginTop: 4, opacity: passwordValue && !loading ? 1 : 0.4 }}
            onClick={handleJoinByPassword}
            disabled={!passwordValue || loading}
          >
            {loading ? '참여 중...' : '참여하기'}
          </button>
        </div>
        <button style={styles.skipBtn} onClick={() => setPasswordTarget(null)}>← 뒤로</button>
      </div>
    )
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
          style={{ ...styles.tab, ...(tab === 'search' ? styles.tabActive : {}) }}
          onClick={() => switchTab('search')}
        >
          <SearchIcon size={14} /> 검색
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }}
          onClick={() => switchTab('create')}
        >
          그룹 만들기
        </button>
        <button
          style={{ ...styles.tab, ...(tab === 'join' ? styles.tabActive : {}) }}
          onClick={() => switchTab('join')}
        >
          초대 코드
        </button>
      </div>

      <div style={styles.card}>
        {tab === 'create' && (
          <>
            <p style={styles.desc}>팀/친구 그룹 이름을 입력하세요 (4자 이상)</p>
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
              style={{ ...PRIMARY_ACTION_BUTTON, marginTop: 4, opacity: groupName.trim().length >= MIN_NAME_LENGTH && !loading ? 1 : 0.4 }}
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? '생성 중...' : '그룹 만들기'}
            </button>
          </>
        )}

        {tab === 'join' && (
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
              style={{ ...PRIMARY_ACTION_BUTTON, marginTop: 4, opacity: inviteCode.trim().length === 6 && !loading ? 1 : 0.4 }}
              onClick={handleJoin}
              disabled={loading}
            >
              {loading ? '참여 중...' : '그룹 참여하기'}
            </button>
          </>
        )}

        {tab === 'search' && (
          <>
            <p style={styles.desc}>그룹 이름을 3자 이상 입력하세요</p>
            <input
              style={styles.input}
              placeholder="그룹 이름"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              maxLength={20}
              autoFocus
              disabled={loading}
            />
            <div style={styles.searchResults}>
              {searching && <p style={styles.searchHint}>검색 중...</p>}
              {!searching && searchQuery.trim().length >= MIN_SEARCH_LENGTH && searchResults.length === 0 && (
                <p style={styles.searchHint}>검색 허용된 그룹이 없어요</p>
              )}
              {!searching && searchResults.map(g => (
                <button key={g.id} style={styles.searchResultRow} onClick={() => openPasswordPrompt(g)}>
                  <span style={styles.searchResultName}>{g.name}</span>
                  <span style={styles.searchResultCount}>멤버 {g.member_count}명</span>
                </button>
              ))}
            </div>
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
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: '10px 0', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', background: 'transparent',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
    color: 'var(--color-text-muted)',
  },
  tabActive: {
    border: '1.5px solid var(--color-primary)', background: 'var(--color-primary-a10)',
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
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' },
  skipBtn: {
    background: 'none', border: 'none',
    fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)',
    cursor: 'pointer', padding: 8,
  },

  searchResults: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' },
  searchHint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0' },
  searchResultRow: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  searchResultName: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text)' },
  searchResultCount: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
}
