import { useState, useRef, useEffect } from 'react'
import { createGroup, getGroupByInviteCode, joinGroup, searchGroups, joinGroupByPassword } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import { UsersIcon, UserPlusIcon, SearchIcon, LockIcon } from './GroupIcons'
import GroupInviteShare from './GroupInviteShare'

const MIN_NAME_LENGTH = 4
const MIN_SEARCH_LENGTH = 3

export default function GroupSetupModal({ userId, onClose, onDone }) {
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

  const switchTab = (t) => { setTab(t); setError(null) }

  const handleCreate = async () => {
    if (groupName.trim().length < MIN_NAME_LENGTH || loading) return
    setLoading(true)
    setError(null)
    try {
      const group = await createGroup(groupName.trim(), userId)
      invalidateCache(`board:${userId}:`, { prefix: true })
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
      await joinGroup(group.id, userId)
      invalidateCache(`board:${userId}:`, { prefix: true })
      onDone()
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
      invalidateCache(`board:${userId}:`, { prefix: true })
      onDone()
    } catch (e) {
      setError(e.message || '참여에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = tab === 'create' ? groupName.trim().length >= MIN_NAME_LENGTH : inviteCode.trim().length === 6

  if (createdGroup) {
    return (
      <div style={styles.overlay} onClick={onDone}>
        <div style={styles.dialog} onClick={e => e.stopPropagation()}>
          <GroupInviteShare group={createdGroup} onDone={onDone} />
        </div>
      </div>
    )
  }

  if (passwordTarget) {
    return (
      <div style={styles.overlay} onClick={onClose}>
        <div style={styles.dialog} onClick={e => e.stopPropagation()}>
          <div style={styles.iconBadge}><LockIcon size={24} /></div>
          <div style={styles.dialogTitle}>{passwordTarget.name}</div>
          <p style={styles.dialogDesc}>방장이 설정한 비밀번호를 입력하세요</p>
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
          {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{error}</p>}
          <div style={styles.dialogBtns}>
            <button
              style={{ ...styles.dialogBtnPrimary, opacity: passwordValue && !loading ? 1 : 0.4 }}
              onClick={handleJoinByPassword}
              disabled={!passwordValue || loading}
            >
              {loading ? '참여 중...' : '참여하기'}
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => setPasswordTarget(null)}>뒤로</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.iconBadge}><UsersIcon size={26} /></div>
        <div style={styles.dialogTitle}>그룹 참여하기 / 만들기</div>

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(tab === 'search' ? styles.tabActive : {}) }} onClick={() => switchTab('search')}>
            <SearchIcon size={15} /> 검색
          </button>
          <button style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }} onClick={() => switchTab('create')}>
            <UsersIcon size={15} /> 만들기
          </button>
          <button style={{ ...styles.tab, ...(tab === 'join' ? styles.tabActive : {}) }} onClick={() => switchTab('join')}>
            <UserPlusIcon size={15} /> 초대코드
          </button>
        </div>

        {tab === 'create' && (
          <>
            <p style={styles.dialogDesc}>팀/친구 그룹 이름을 입력하세요{'\n'}(4자 이상)</p>
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
          </>
        )}

        {tab === 'join' && (
          <>
            <p style={styles.dialogDesc}>초대 링크의 코드 6자리를 입력하세요</p>
            <input
              style={{ ...styles.input, textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center', fontSize: 18, fontWeight: 700 }}
              placeholder="ABC123"
              value={inviteCode}
              onChange={e => { setInviteCode(e.target.value.toUpperCase()); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              maxLength={6}
              autoFocus
              disabled={loading}
            />
          </>
        )}

        {tab === 'search' && (
          <>
            <p style={styles.dialogDesc}>그룹 이름을 3자 이상 입력하세요</p>
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
                  <span style={styles.searchResultCount}>
                    멤버 {g.member_count}명{g.owner_nickname ? ` · 방장 ${g.owner_nickname}` : ''}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab !== 'search' && error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{error}</p>}

        {tab !== 'search' && (
          <div style={styles.dialogBtns}>
            <button
              style={{ ...styles.dialogBtnPrimary, opacity: canSubmit && !loading ? 1 : 0.4 }}
              onClick={tab === 'create' ? handleCreate : handleJoin}
              disabled={!canSubmit || loading}
            >
              {loading ? (tab === 'create' ? '생성 중...' : '참여 중...') : (tab === 'create' ? '그룹 만들기' : '그룹 참여하기')}
            </button>
            <button style={styles.dialogBtnCancel} onClick={onClose}>취소</button>
          </div>
        )}
        {tab === 'search' && (
          <button style={styles.dialogBtnCancel} onClick={onClose}>취소</button>
        )}
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(26,20,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  iconBadge: {
    width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,107,53,0.14)',
    color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },

  tabs: { display: 'flex', width: '100%', gap: 5 },
  tab: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: '9px 0', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', background: 'var(--color-bg)',
    fontSize: 'var(--font-size-2xs)', fontWeight: 600, cursor: 'pointer',
    color: 'var(--color-text-muted)', fontFamily: 'inherit',
  },
  tabActive: {
    border: '2px solid var(--color-primary)', background: 'rgba(255,107,53,0.1)',
    color: 'var(--color-primary)', fontWeight: 700,
  },
  input: {
    width: '100%', padding: '11px 14px',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)',
  },

  searchResults: { width: '100%', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' },
  searchHint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '4px 0' },
  searchResultRow: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  searchResultName: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text)' },
  searchResultCount: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
}
