import { useState } from 'react'
import { createGroup, getGroupByInviteCode, joinGroup } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import { UsersIcon, UserPlusIcon } from './GroupIcons'
import GroupInviteShare from './GroupInviteShare'

export default function GroupSetupModal({ userId, onClose, onDone }) {
  const [tab, setTab] = useState('create') // 'create' | 'join'
  const [groupName, setGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdGroup, setCreatedGroup] = useState(null) // 생성 직후: 초대 화면으로 전환

  const switchTab = (t) => { setTab(t); setError(null) }

  const handleCreate = async () => {
    if (!groupName.trim() || loading) return
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

  const canSubmit = tab === 'create' ? !!groupName.trim() : inviteCode.trim().length === 6

  if (createdGroup) {
    return (
      <div style={styles.overlay} onClick={onDone}>
        <div style={styles.dialog} onClick={e => e.stopPropagation()}>
          <GroupInviteShare group={createdGroup} onDone={onDone} />
        </div>
      </div>
    )
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.iconBadge}><UsersIcon size={26} /></div>
        <div style={styles.dialogTitle}>그룹 만들기 / 참여하기</div>

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(tab === 'create' ? styles.tabActive : {}) }} onClick={() => switchTab('create')}>
            <UsersIcon size={16} /> 그룹 만들기
          </button>
          <button style={{ ...styles.tab, ...(tab === 'join' ? styles.tabActive : {}) }} onClick={() => switchTab('join')}>
            <UserPlusIcon size={16} /> 초대 코드로 참여
          </button>
        </div>

        {tab === 'create' ? (
          <>
            <p style={styles.dialogDesc}>팀/친구 그룹 이름을 입력하세요</p>
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
        ) : (
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

        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{error}</p>}

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

  tabs: { display: 'flex', width: '100%', gap: 6 },
  tab: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '9px 0', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', background: 'var(--color-bg)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
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
}
