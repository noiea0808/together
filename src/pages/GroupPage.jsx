import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers, getGroupStatuses, getMyPotsForSlot, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation } from '../lib/db'
import { SLOT_KEYS, SLOT_EMOJI } from '../lib/potConstants'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

function toDateStr(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function getRelativeLabel(date) {
  const diff = Math.round((date - TODAY) / (1000 * 60 * 60 * 24))
  if (diff === 0)  return { label: '오늘',   color: 'var(--color-primary)' }
  if (diff === -1) return { label: '어제',   color: 'var(--color-info)' }
  if (diff === 1)  return { label: '내일',   color: 'var(--color-success)' }
  if (diff < 0)    return { label: `${Math.abs(diff)}일 전`, color: '#9E9E9E' }
  return { label: `${diff}일 뒤`, color: '#9E9E9E' }
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
const isActiveStatus = st => st === '참여중' || st === '참여완료'

export default function GroupPage() {
  const { user } = useUser()
  const [groups, setGroups] = useState([])
  const [membersMap, setMembersMap] = useState({})
  const [statusesMap, setStatusesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [selectedFriendId, setSelectedFriendId] = useState(null)
  const [proposeSlot, setProposeSlot] = useState(null)
  const [proposeGroupId, setProposeGroupId] = useState(null)
  const [proposeMenu, setProposeMenu] = useState('')
  const [proposeSending, setProposeSending] = useState(false)
  const [proposeError, setProposeError] = useState(null)
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [sentInviteKeys, setSentInviteKeys] = useState(new Set())

  const dateStr = toDateStr(currentDate)
  const isToday = currentDate.getTime() === TODAY.getTime()
  const isPastDate = currentDate.getTime() < TODAY.getTime()

  useEffect(() => {
    getMyGroups(user.id).then(async gs => {
      setGroups(gs)
      const entries = await Promise.all(gs.map(g => getGroupMembers(g.id).then(m => [g.id, m])))
      setMembersMap(Object.fromEntries(entries))
      setLoading(false)
    })
  }, [user.id])

  useEffect(() => {
    if (groups.length === 0) return
    setStatusLoading(true)
    Promise.all(groups.map(g => getGroupStatuses(g.id, dateStr).then(s => [g.id, s])))
      .then(entries => {
        setStatusesMap(Object.fromEntries(entries))
        setStatusLoading(false)
      })
  }, [groups, dateStr])

  useEffect(() => {
    getMyPendingInvitationsForDate(user.id, dateStr)
      .then(setPendingInvitations)
      .catch(e => console.error(e))
  }, [user.id, dateStr])

  const findPendingInvitation = (friendId, slot) =>
    pendingInvitations.find(inv => inv.to_user_id === friendId && inv.slot === slot)

  const hasPendingInvitation = (friendId, slot) =>
    sentInviteKeys.has(`${friendId}:${slot}`) || !!findPendingInvitation(friendId, slot)

  const handleCancelInvitation = async (e, invitationId) => {
    e.stopPropagation()
    try {
      await cancelPotInvitation(invitationId, user.id)
      const updated = await getMyPendingInvitationsForDate(user.id, dateStr)
      setPendingInvitations(updated)
    } catch (err) {
      console.error(err)
    }
  }

  // 친구 시트를 열거나 바꿀 때마다 슬롯 선택 상태 초기화
  useEffect(() => {
    setProposeSlot(null)
    setProposeMenu('')
    setProposeError(null)
    setProposeGroupId(null)
  }, [selectedFriendId])

  const selectProposeSlot = (friend, slot) => {
    if (hasPendingInvitation(friend.id, slot)) return
    setProposeSlot(prev => {
      const next = prev === slot ? null : slot
      if (next && friend.groups.length === 1) setProposeGroupId(friend.groups[0].id)
      return next
    })
    setProposeError(null)
  }

  const sendPropose = async () => {
    if (!selectedFriend || !proposeSlot || !proposeGroupId || proposeSending) return
    setProposeSending(true)
    setProposeError(null)
    try {
      const existing = await getMyPotsForSlot(user.id, proposeGroupId, dateStr, proposeSlot)
      if (existing.length > 0) {
        await invitePotFriend(existing[0].pot_id, user.id, selectedFriend.id)
      } else {
        await proposeMealTogether({
          groupId: proposeGroupId, fromUserId: user.id, toUserId: selectedFriend.id,
          date: dateStr, slot: proposeSlot, meal_time: null, menu: proposeMenu.trim() || null,
        })
        const updated = await getMyPendingInvitationsForDate(user.id, dateStr)
        setPendingInvitations(updated)
      }
      setSentInviteKeys(prev => new Set(prev).add(`${selectedFriend.id}:${proposeSlot}`))
      setProposeSlot(null)
      setProposeMenu('')
    } catch (e) {
      console.error(e)
      setProposeError('제안을 보내지 못했어요.')
    } finally {
      setProposeSending(false)
    }
  }

  // 친구가 속한 그룹들의 상태를 슬롯별로 병합 (참여중/참여완료 우선)
  const mergeFriendStatuses = (friendId, friendGroups) => {
    const map = {}
    friendGroups.forEach(g => {
      (statusesMap[g.id] ?? []).forEach(s => {
        if (s.user_id !== friendId) return
        const existing = map[s.slot]
        if (!existing || (isActiveStatus(s.status) && !isActiveStatus(existing.status))) map[s.slot] = s
      })
    })
    return map
  }

  // 나를 제외한 모든 친구 + 각자 속한 그룹 정보
  const friendMap = {}
  groups.forEach(g => {
    (membersMap[g.id] ?? []).forEach(member => {
      if (member.id === user.id) return
      if (!friendMap[member.id]) {
        friendMap[member.id] = { ...member, groups: [] }
      }
      friendMap[member.id].groups.push(g)
    })
  })
  const friends = Object.values(friendMap)
    .map(f => ({ ...f, statusMap: mergeFriendStatuses(f.id, f.groups) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'))

  const totalMembers = new Set(
    Object.values(membersMap).flat().map(m => m.id).filter(id => id !== user.id)
  ).size

  const selectedFriend = friends.find(f => f.id === selectedFriendId) ?? null
  const relLabel = getRelativeLabel(currentDate)

  if (loading) return <div style={styles.loadingPage}><RiceBowlIcon size={40} /></div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>친구 관리</span>
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryNum}>{totalMembers}</div>
            <div style={styles.summaryLabel}>함께하는 친구</div>
          </div>
          <div style={styles.summaryDivider} />
          <div style={styles.summaryItem}>
            <div style={styles.summaryNum}>{groups.length}</div>
            <div style={styles.summaryLabel}>참여 그룹</div>
          </div>
        </div>
      </div>

      <div style={styles.dateNav}>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, -1))}>‹</button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          <span style={{ ...styles.relBadge, background: relLabel.color }}>{relLabel.label}</span>
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setCurrentDate(TODAY)}>오늘로</button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))}>›</button>
      </div>

      <div style={styles.body}>

        {/* 친구 목록 */}
        {friends.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 40 }}>👥</div>
            <div style={{ fontWeight: 700 }}>아직 친구가 없어요</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              그룹에 초대하면 친구들이 여기 표시됩니다.
            </p>
          </div>
        ) : (
          <div style={{ ...styles.friendList, opacity: statusLoading ? 0.5 : 1 }}>
            {friends.map(friend => {
              const statusChips = SLOT_KEYS
                .filter(slot => friend.statusMap[slot])
                .map(slot => ({ slot, opt: SLOT_STATUS_OPTIONS.find(o => o.key === friend.statusMap[slot].status) }))
              return (
                <div key={friend.id} style={styles.friendRow} onClick={() => setSelectedFriendId(friend.id)}>
                  {friend.avatar_url ? (
                    <img src={friend.avatar_url} alt="" style={styles.avatarImg} />
                  ) : (
                    <div style={styles.avatar}>{friend.nickname[0]}</div>
                  )}
                  <div style={styles.friendInfo}>
                    <div style={styles.friendName}>{friend.nickname}</div>
                    <div style={styles.friendGroups}>
                      {friend.groups.map(g => (
                        <span key={g.id} style={styles.groupTag}>{g.name}</span>
                      ))}
                    </div>
                    {statusChips.length > 0 && (
                      <div style={styles.statusChipRow}>
                        {statusChips.map(({ slot, opt }) => opt && (
                          <span key={slot} style={{ ...styles.miniChip, color: opt.color, background: opt.bg, border: `1px solid ${opt.border}` }}>
                            {opt.emoji} {slot} · {opt.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={styles.friendChevron}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedFriend && (
        <div style={styles.sheetOverlay} onClick={() => setSelectedFriendId(null)}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHeader}>
              {selectedFriend.avatar_url ? (
                <img src={selectedFriend.avatar_url} alt="" style={styles.avatarLgImg} />
              ) : (
                <div style={styles.avatarLg}>{selectedFriend.nickname[0]}</div>
              )}
              <div style={styles.sheetName}>{selectedFriend.nickname}</div>
              <div style={styles.friendGroups}>
                {selectedFriend.groups.map(g => (
                  <span key={g.id} style={styles.groupTag}>{g.name}</span>
                ))}
              </div>
            </div>

            <div style={styles.sheetDivider} />
            <div style={styles.sheetSectionTitle}>{formatDate(currentDate)} {relLabel.label} 상태</div>

            <div style={styles.statusGrid}>
              {SLOT_KEYS.map(slot => {
                const s = selectedFriend.statusMap[slot]
                const opt = s ? SLOT_STATUS_OPTIONS.find(o => o.key === s.status) : null
                const pendingInv = findPendingInvitation(selectedFriend.id, slot)
                const invited = hasPendingInvitation(selectedFriend.id, slot)
                const isSelected = proposeSlot === slot
                const selectable = !isPastDate && !invited
                return (
                  <div
                    key={slot}
                    style={{
                      ...styles.statusCell,
                      ...(isSelected ? styles.statusCellSelected : {}),
                      cursor: selectable ? 'pointer' : 'default',
                      opacity: invited && !isSelected ? 0.55 : 1,
                    }}
                    onClick={() => selectable && selectProposeSlot(selectedFriend, slot)}
                  >
                    <span style={styles.statusSlotName}>{SLOT_EMOJI[slot]} {slot}</span>
                    {opt ? (
                      <span style={{ ...styles.statusBadge, color: opt.color, background: opt.bg, border: `1px solid ${opt.border}` }}>
                        {opt.emoji} {opt.label}
                      </span>
                    ) : (
                      <span style={styles.statusDash}>미설정</span>
                    )}
                    {pendingInv ? (
                      <button style={styles.statusCancelBtn} onClick={e => handleCancelInvitation(e, pendingInv.id)}>
                        제안함 ✓ · 취소
                      </button>
                    ) : invited ? (
                      <span style={styles.statusInvitedTag}>초대함 ✓</span>
                    ) : null}
                  </div>
                )
              })}
            </div>

            {proposeSlot && (
              <div style={styles.proposePanel}>
                {selectedFriend.groups.length > 1 && (
                  <div style={styles.friendGroups}>
                    {selectedFriend.groups.map(g => (
                      <button
                        key={g.id}
                        style={{ ...styles.groupPickTag, ...(proposeGroupId === g.id ? styles.groupPickTagActive : {}) }}
                        onClick={() => setProposeGroupId(g.id)}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  style={styles.proposeInput}
                  placeholder="메뉴나 한마디 (선택)"
                  value={proposeMenu}
                  onChange={e => setProposeMenu(e.target.value)}
                  maxLength={40}
                />
                {proposeError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{proposeError}</p>}
              </div>
            )}

            {!isPastDate && (
              <button
                style={{ ...styles.proposeMainBtn, opacity: proposeSlot && proposeGroupId && !proposeSending ? 1 : 0.4 }}
                onClick={sendPropose}
                disabled={!proposeSlot || !proposeGroupId || proposeSending}
              >
                {proposeSending ? '보내는 중...' : proposeSlot ? `🍚 ${proposeSlot} 같이 먹자` : '🍚 슬롯을 선택해주세요'}
              </button>
            )}
            <button style={styles.sheetCloseBtn} onClick={() => setSelectedFriendId(null)}>닫기</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: { padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  headerTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },

  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 'var(--font-size-base)' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },

  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  summary: { display: 'flex', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)', marginTop: 10 },
  summaryItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  summaryNum: { fontSize: 'var(--font-size-xl)', fontWeight: 900, color: 'var(--color-primary)' },
  summaryLabel: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  summaryDivider: { width: 1, background: 'var(--color-border)', margin: '8px 0' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)' },

  friendList: { display: 'flex', flexDirection: 'column', gap: 8 },
  friendRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-sm)', flexShrink: 0 },
  avatarImg: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  friendInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  friendName: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  friendGroups: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  groupTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-primary)18', color: 'var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 600 },
  friendChevron: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-lg)', flexShrink: 0 },
  statusChipRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  miniChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', whiteSpace: 'nowrap' },

  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '80vh', overflowY: 'auto' },
  sheetHeader: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 6 },
  avatarLg: { width: 56, height: 56, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-lg)' },
  avatarLgImg: { width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' },
  sheetName: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  sheetDivider: { height: 1, background: 'var(--color-border)', margin: '12px 0 8px' },
  sheetSectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  statusCell: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1.5px solid transparent' },
  statusCellSelected: { background: 'var(--color-primary)18', border: '1.5px solid var(--color-primary)' },
  statusSlotName: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  statusBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', width: 'fit-content' },
  statusDash: { fontSize: 'var(--font-size-2xs)', color: '#C7BFB6' },
  statusInvitedTag: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)' },
  statusCancelBtn: { alignSelf: 'flex-start', fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' },
  sheetCloseBtn: { marginTop: 16, padding: '12px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },

  proposeMainBtn: { ...PRIMARY_ACTION_BUTTON, marginTop: 12 },
  proposePanel: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  groupPickTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  groupPickTagActive: { background: 'var(--color-primary)18', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  proposeInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
}
