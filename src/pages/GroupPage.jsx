import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers, getGroupStatuses, getMyPotsForSlot, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation, getMyFriends, removeFriend, getFriendWishPlaces, proposeWishPlace, getMySentWishProposals } from '../lib/db'
import { SLOT_KEYS, SLOT_EMOJI } from '../lib/potConstants'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'
import RiceBowlIcon from '../components/RiceBowlIcon'
import FriendsSearchModal from '../components/FriendsSearchModal'
import LinkPreviewCard, { extractFirstUrl, textWithoutUrl } from '../components/LinkPreviewCard'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const [friendsModalTab, setFriendsModalTab] = useState('search')

  // 친구 요청 알림(/group?friend_requests=1)을 눌러 들어온 경우, 요청 탭이 열린 채로 바로 뜬다.
  useEffect(() => {
    if (searchParams.get('friend_requests') === '1') {
      setFriendsModalTab('requests')
      setShowFriendsModal(true)
      setSearchParams(prev => { prev.delete('friend_requests'); return prev }, { replace: true })
    }
  }, [])

  const [groups, setGroups] = useState([])
  const [membersMap, setMembersMap] = useState({})
  const [statusesMap, setStatusesMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [friendGroupFilter, setFriendGroupFilter] = useState(null) // null = 전체, 아니면 group.id
  const [selectedFriendId, setSelectedFriendId] = useState(null)
  const [friendSheetTab, setFriendSheetTab] = useState('status') // 'status' | 'wish'
  const [friendWishPlaces, setFriendWishPlaces] = useState([])
  const [friendWishLoading, setFriendWishLoading] = useState(false)
  const [mySentWishProposals, setMySentWishProposals] = useState([])
  const [wishProposeTargetId, setWishProposeTargetId] = useState(null)
  const [wishProposeGroupId, setWishProposeGroupId] = useState(null)
  const [wishProposeMessage, setWishProposeMessage] = useState('')
  const [wishProposeSending, setWishProposeSending] = useState(false)
  const [wishProposeError, setWishProposeError] = useState(null)
  const [proposeSlot, setProposeSlot] = useState(null)
  const [proposeGroupId, setProposeGroupId] = useState(null)
  const [proposeMenu, setProposeMenu] = useState('')
  const [proposeSending, setProposeSending] = useState(false)
  const [proposeError, setProposeError] = useState(null)
  const [pendingInvitations, setPendingInvitations] = useState([])
  const [sentInviteKeys, setSentInviteKeys] = useState(new Set())
  const [realFriends, setRealFriends] = useState([]) // [{ requestId, id, nickname, avatar_url }] — 친구찾기로 맺어진 실제 친구
  const [confirmUnfriend, setConfirmUnfriend] = useState(false)
  const [unfriending, setUnfriending] = useState(false)

  const reloadRealFriends = () => getMyFriends().then(setRealFriends).catch(e => console.error(e))
  useEffect(() => { reloadRealFriends() }, [user.id])

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

  const handleUnfriend = async () => {
    if (!selectedFriend?.requestId || unfriending) return
    setUnfriending(true)
    try {
      await removeFriend(selectedFriend.requestId, user.id)
      setConfirmUnfriend(false)
      setSelectedFriendId(null)
      reloadRealFriends()
    } catch (e) {
      console.error(e)
    } finally {
      setUnfriending(false)
    }
  }

  // 친구 시트를 열거나 바꿀 때마다 슬롯 선택 상태 초기화
  useEffect(() => {
    setProposeSlot(null)
    setProposeMenu('')
    setProposeError(null)
    setProposeGroupId(null)
    setFriendSheetTab('status')
    setWishProposeTargetId(null)
    setWishProposeGroupId(null)
    setWishProposeMessage('')
    setWishProposeError(null)
  }, [selectedFriendId])

  useEffect(() => {
    if (friendSheetTab !== 'wish' || !selectedFriendId) return
    setFriendWishLoading(true)
    Promise.all([getFriendWishPlaces(selectedFriendId), getMySentWishProposals(selectedFriendId)])
      .then(([places, sent]) => {
        setFriendWishPlaces(places)
        setMySentWishProposals(sent)
      })
      .catch(e => console.error(e))
      .finally(() => setFriendWishLoading(false))
  }, [friendSheetTab, selectedFriendId])

  const openWishPropose = (place, friend) => {
    setWishProposeTargetId(place.id)
    setWishProposeMessage('')
    setWishProposeError(null)
    const eligibleGroups = place.restricted
      ? friend.groups.filter(g => place.eligible_group_ids?.includes(g.id))
      : friend.groups
    setWishProposeGroupId(eligibleGroups.length === 1 ? eligibleGroups[0].id : null)
  }

  const sendWishPropose = async (place) => {
    if (!selectedFriend || wishProposeSending) return
    setWishProposeSending(true)
    setWishProposeError(null)
    try {
      await proposeWishPlace({
        wishPlaceId: place.id, fromUserId: user.id, toUserId: selectedFriend.id,
        groupId: wishProposeGroupId, message: wishProposeMessage.trim() || null,
      })
      setMySentWishProposals(prev => [...prev, { wish_place_id: place.id, group_id: wishProposeGroupId }])
      setWishProposeTargetId(null)
      setWishProposeMessage('')
    } catch (e) {
      console.error(e)
      setWishProposeError('제안을 보내지 못했어요.')
    } finally {
      setWishProposeSending(false)
    }
  }

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

  // 같은 그룹 멤버 + 친구찾기로 맺어진 실제 친구를 하나의 목록으로 합친다.
  // 같은 그룹이 없는 친구는 groups가 빈 배열이라 그룹 태그/오늘 상태가 자연히 표시되지 않는다.
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
  realFriends.forEach(f => {
    if (!friendMap[f.id]) friendMap[f.id] = { ...f, groups: [] }
    // 친구찾기 쪽 프로필이 더 최신일 수 있어 닉네임/사진은 덮어쓴다
    friendMap[f.id].nickname = f.nickname
    friendMap[f.id].avatar_url = f.avatar_url
    friendMap[f.id].requestId = f.requestId
  })
  const friends = Object.values(friendMap)
    .map(f => ({ ...f, statusMap: mergeFriendStatuses(f.id, f.groups) }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'))

  const displayedFriends = friendGroupFilter
    ? friends.filter(f => f.groups.some(g => g.id === friendGroupFilter))
    : friends

  const selectedFriend = friends.find(f => f.id === selectedFriendId) ?? null
  const relLabel = getRelativeLabel(currentDate)

  if (loading) return <div style={styles.loadingPage}><RiceBowlIcon size={40} /></div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={styles.headerTitle}>친구 관리</span>
          <button style={styles.findFriendsBtn} onClick={() => { setFriendsModalTab('search'); setShowFriendsModal(true) }}>
            친구 찾기
          </button>
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

        {/* 그룹별 필터 칩 — 그룹이 하나라도 있어야 의미가 있으므로 없으면 숨긴다 */}
        {groups.length > 0 && friends.length > 0 && (
          <div className="no-scrollbar" style={styles.friendGroupFilterRow}>
            <button
              style={{ ...styles.friendGroupFilterChip, ...(friendGroupFilter === null ? styles.friendGroupFilterChipActive : {}) }}
              onClick={() => setFriendGroupFilter(null)}
            >전체</button>
            {groups.map(g => (
              <button
                key={g.id}
                style={{ ...styles.friendGroupFilterChip, ...(friendGroupFilter === g.id ? styles.friendGroupFilterChipActive : {}) }}
                onClick={() => setFriendGroupFilter(g.id)}
              >{g.name}</button>
            ))}
          </div>
        )}

        {/* 친구 목록 */}
        {friends.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 40 }}>👥</div>
            <div style={{ fontWeight: 700 }}>아직 친구가 없어요</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              그룹 멤버이거나 친구 찾기로 추가하면{'\n'}여기 표시됩니다.
            </p>
          </div>
        ) : displayedFriends.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 40 }}>👥</div>
            <div style={{ fontWeight: 700 }}>이 그룹엔 친구가 없어요</div>
          </div>
        ) : (
          <div style={{ ...styles.friendList, opacity: statusLoading ? 0.5 : 1 }}>
            {displayedFriends.map(friend => {
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
                    <div style={styles.friendNameRow}>
                      <span style={styles.friendName}>{friend.nickname}</span>
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

            <div style={styles.sheetTabs}>
              <button
                style={{ ...styles.sheetTabBtn, ...(friendSheetTab === 'status' ? styles.sheetTabBtnActive : {}) }}
                onClick={() => setFriendSheetTab('status')}
              >오늘 상태</button>
              <button
                style={{ ...styles.sheetTabBtn, ...(friendSheetTab === 'wish' ? styles.sheetTabBtnActive : {}) }}
                onClick={() => setFriendSheetTab('wish')}
              >가고 싶은데...</button>
            </div>

            {friendSheetTab === 'wish' ? (
              friendWishLoading ? (
                <p style={styles.noGroupNote}>불러오는 중...</p>
              ) : friendWishPlaces.length === 0 ? (
                <p style={styles.noGroupNote}>아직 등록한 곳이 없어요.</p>
              ) : (
                <div style={styles.friendWishList}>
                  {friendWishPlaces.map(place => {
                    const alreadySent = mySentWishProposals.some(p => p.wish_place_id === place.id)
                    const isProposing = wishProposeTargetId === place.id
                    const eligibleGroups = place.restricted
                      ? selectedFriend.groups.filter(g => place.eligible_group_ids?.includes(g.id))
                      : selectedFriend.groups
                    return (
                      <div key={place.id} style={styles.friendWishItem}>
                        <LinkPreviewCard text={place.content} />
                        {(() => {
                          const text = textWithoutUrl(place.content, extractFirstUrl(place.content))
                          return text && <div style={styles.friendWishText}>{text}</div>
                        })()}
                        {alreadySent ? (
                          <span style={styles.statusInvitedTag}>제안함 ✓</span>
                        ) : isProposing ? (
                          <div style={styles.proposePanel}>
                            {eligibleGroups.length > 1 && (
                              <div style={styles.friendGroups}>
                                {eligibleGroups.map(g => (
                                  <button
                                    key={g.id}
                                    style={{ ...styles.groupPickTag, ...(wishProposeGroupId === g.id ? styles.groupPickTagActive : {}) }}
                                    onClick={() => setWishProposeGroupId(g.id)}
                                  >{g.name}</button>
                                ))}
                              </div>
                            )}
                            <input
                              style={styles.proposeInput}
                              placeholder="메뉴나 한마디 (선택)"
                              value={wishProposeMessage}
                              onChange={e => setWishProposeMessage(e.target.value)}
                              maxLength={40}
                            />
                            {wishProposeError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{wishProposeError}</p>}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button
                                style={{ ...styles.proposeMainBtn, marginTop: 0, flex: 1, opacity: wishProposeSending || (eligibleGroups.length > 0 && !wishProposeGroupId) ? 0.5 : 1 }}
                                onClick={() => sendWishPropose(place)}
                                disabled={wishProposeSending || (eligibleGroups.length > 0 && !wishProposeGroupId)}
                              >
                                {wishProposeSending ? '보내는 중...' : '제안 보내기'}
                              </button>
                              <button style={styles.wishProposeCancelBtn} onClick={() => setWishProposeTargetId(null)} disabled={wishProposeSending}>취소</button>
                            </div>
                          </div>
                        ) : (
                          <button style={styles.wishProposeBtn} onClick={() => openWishPropose(place, selectedFriend)}>🍚 같이 가고 싶어요</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            ) : selectedFriend.groups.length === 0 ? (
              <p style={styles.noGroupNote}>같은 그룹이 없어서 오늘 상태를 확인하거나 제안할 수 없어요.{'\n'}그룹에 초대하면 함께 밥 약속을 잡을 수 있어요.</p>
            ) : (
              <>
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
              </>
            )}

            {selectedFriend.requestId && (
              <button style={styles.unfriendBtn} onClick={() => setConfirmUnfriend(true)}>친구 끊기</button>
            )}
            <button style={styles.sheetCloseBtn} onClick={() => setSelectedFriendId(null)}>닫기</button>
          </div>
        </div>
      )}

      {confirmUnfriend && selectedFriend && (
        <div style={styles.overlay} onClick={() => !unfriending && setConfirmUnfriend(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>👋</div>
            <div style={styles.dialogTitle}>{selectedFriend.nickname}님과{'\n'}친구를 끊을까요?</div>
            <div style={styles.dialogBtns}>
              <button
                style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }}
                onClick={handleUnfriend}
                disabled={unfriending}
              >
                {unfriending ? '처리 중...' : '끊기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmUnfriend(false)} disabled={unfriending}>취소</button>
            </div>
          </div>
        </div>
      )}

      {showFriendsModal && (
        <FriendsSearchModal
          myUserId={user.id}
          initialTab={friendsModalTab}
          onClose={() => { setShowFriendsModal(false); reloadRealFriends() }}
        />
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
  findFriendsBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '6px 12px', cursor: 'pointer' },

  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 'var(--font-size-base)' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },

  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  friendGroupFilterRow: { display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2, marginBottom: 4 },
  friendGroupFilterChip: { flexShrink: 0, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  friendGroupFilterChipActive: { color: 'var(--color-primary)', background: 'var(--color-primary)18', border: '1px solid var(--color-primary)' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)' },

  friendList: { display: 'flex', flexDirection: 'column', gap: 8 },
  friendRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-sm)', flexShrink: 0 },
  avatarImg: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  friendInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  friendNameRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
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
  sheetTabs: { display: 'flex', gap: 6, marginBottom: 12 },
  sheetTabBtn: { flex: 1, padding: '9px 0', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  sheetTabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },
  sheetSectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 },
  friendWishList: { display: 'flex', flexDirection: 'column', gap: 10 },
  friendWishItem: { display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  friendWishText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, marginTop: 4 },
  wishProposeBtn: { alignSelf: 'flex-start', marginTop: 4, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)14', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  wishProposeCancelBtn: { flexShrink: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit' },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  statusCell: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1.5px solid transparent' },
  statusCellSelected: { background: 'var(--color-primary)18', border: '1.5px solid var(--color-primary)' },
  statusSlotName: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  statusBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', width: 'fit-content' },
  statusDash: { fontSize: 'var(--font-size-2xs)', color: '#C7BFB6' },
  statusInvitedTag: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)' },
  statusCancelBtn: { alignSelf: 'flex-start', fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' },
  sheetCloseBtn: { marginTop: 16, padding: '12px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  noGroupNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0, padding: '6px 0' },
  unfriendBtn: { marginTop: 10, padding: '10px', background: 'none', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', cursor: 'pointer' },

  proposeMainBtn: { ...PRIMARY_ACTION_BUTTON, marginTop: 12 },
  proposePanel: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  groupPickTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  groupPickTagActive: { background: 'var(--color-primary)18', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  proposeInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
