import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers, getGroupStatuses, getMyPotsForSlot, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation, getMyFriends, removeFriend, getFriendWishPlaces, likeWishPlace, unlikeWishPlace, getWishPlaceComments, addWishPlaceComment, deleteWishPlaceComment } from '../lib/db'
import { useNavBadges } from '../lib/NavBadgeContext'
import { SLOT_KEYS } from '../lib/potConstants'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'
import RiceBowlIcon from '../components/RiceBowlIcon'
import SlotIcon from '../components/SlotIcon'
import FriendsSearchModal from '../components/FriendsSearchModal'
import WishCategoryIcon from '../components/WishCategoryIcon'
import { WISH_CATEGORY_OPTIONS } from '../lib/potConstants'
import LinkPreviewCard, { extractFirstUrl, textWithoutUrl } from '../components/LinkPreviewCard'
import ReportModal from '../components/ReportModal'
import { MoreHorizontalIcon } from '../components/GroupIcons'
import NotificationBell from '../components/NotificationBell'
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
  // 날짜 네비 바 좌우 스와이프로 날짜 이동
  const dateSwipeStart = useRef(null)
  const handleDateSwipeStart = (e) => { dateSwipeStart.current = { x: e.clientX, y: e.clientY } }
  const handleDateSwipeEnd = (e) => {
    if (!dateSwipeStart.current) return
    const dx = e.clientX - dateSwipeStart.current.x
    const dy = e.clientY - dateSwipeStart.current.y
    dateSwipeStart.current = null
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    setCurrentDate(d => addDays(d, dx < 0 ? 1 : -1))
  }
  const [friendGroupFilter, setFriendGroupFilter] = useState(null) // null = 전체, 아니면 group.id
  const [selectedFriendId, setSelectedFriendId] = useState(null)
  const [friendSheetTab, setFriendSheetTab] = useState('status') // 'status' | 'wish'
  const [friendWishPlaces, setFriendWishPlaces] = useState([])
  const [friendWishLoading, setFriendWishLoading] = useState(false)
  const [wishLikeBusyId, setWishLikeBusyId] = useState(null)
  const [openWishCommentsId, setOpenWishCommentsId] = useState(null)
  const [reportTarget, setReportTarget] = useState(null) // { targetType, targetId } | null
  const [wishMenuOpenId, setWishMenuOpenId] = useState(null)
  const [wishCommentsMap, setWishCommentsMap] = useState({}) // wish_place_id -> comments[]
  const [wishCommentsLoading, setWishCommentsLoading] = useState(false)
  const [newWishCommentText, setNewWishCommentText] = useState('')
  const [wishCommentSending, setWishCommentSending] = useState(false)
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

  const { friendIdsWithNewWish, markFriendsWishSeen, loaded: badgesLoaded } = useNavBadges()
  // 배지 데이터가 서버에서 도착한(loaded) 시점 값을 스냅샷으로 고정 — 이후 markFriendsWishSeen이
  // 전역 상태를 지워도 이번 방문 동안은 아바타 점이 유지된다. 다음 방문부터 반영됨.
  // loaded 전에 스냅샷을 찍으면(새로고침 직후 이 페이지가 첫 화면일 때) 항상 빈 값으로
  // 고정되고 seen 처리까지 먼저 나가버리는 레이스가 있어, loaded될 때까지 기다린다.
  const [newWishFriendIds, setNewWishFriendIds] = useState(new Set())
  const wishSeenMarked = useRef(false)
  useEffect(() => {
    if (!badgesLoaded || wishSeenMarked.current) return
    wishSeenMarked.current = true
    setNewWishFriendIds(new Set(friendIdsWithNewWish))
    markFriendsWishSeen()
  }, [badgesLoaded])

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
    setOpenWishCommentsId(null)
    setNewWishCommentText('')
  }, [selectedFriendId])

  useEffect(() => {
    if (friendSheetTab !== 'wish' || !selectedFriendId) return
    setFriendWishLoading(true)
    getFriendWishPlaces(selectedFriendId)
      .then(setFriendWishPlaces)
      .catch(e => console.error(e))
      .finally(() => setFriendWishLoading(false))
  }, [friendSheetTab, selectedFriendId])

  const toggleWishLike = async (place) => {
    if (wishLikeBusyId) return
    setWishLikeBusyId(place.id)
    const wasLiked = place.liked_by_me
    setFriendWishPlaces(prev => prev.map(p => p.id === place.id
      ? { ...p, liked_by_me: !wasLiked, like_count: p.like_count + (wasLiked ? -1 : 1) }
      : p))
    try {
      if (wasLiked) await unlikeWishPlace(place.id, user.id)
      else await likeWishPlace(place.id, user.id)
    } catch (e) {
      console.error(e)
      setFriendWishPlaces(prev => prev.map(p => p.id === place.id
        ? { ...p, liked_by_me: wasLiked, like_count: p.like_count + (wasLiked ? 1 : -1) }
        : p))
    } finally {
      setWishLikeBusyId(null)
    }
  }

  const toggleWishComments = (place) => {
    const next = openWishCommentsId === place.id ? null : place.id
    setOpenWishCommentsId(next)
    setNewWishCommentText('')
    if (next && !wishCommentsMap[next]) {
      setWishCommentsLoading(true)
      getWishPlaceComments(next)
        .then(comments => setWishCommentsMap(prev => ({ ...prev, [next]: comments })))
        .catch(e => console.error(e))
        .finally(() => setWishCommentsLoading(false))
    }
  }

  const sendWishComment = async (place) => {
    const content = newWishCommentText.trim()
    if (!content || wishCommentSending) return
    setWishCommentSending(true)
    try {
      const comment = await addWishPlaceComment(place.id, user.id, content)
      setWishCommentsMap(prev => ({ ...prev, [place.id]: [...(prev[place.id] ?? []), comment] }))
      setFriendWishPlaces(prev => prev.map(p => p.id === place.id ? { ...p, comment_count: p.comment_count + 1 } : p))
      setNewWishCommentText('')
    } catch (e) {
      console.error(e)
    } finally {
      setWishCommentSending(false)
    }
  }

  const removeWishComment = async (place, commentId) => {
    setWishCommentsMap(prev => ({ ...prev, [place.id]: (prev[place.id] ?? []).filter(c => c.id !== commentId) }))
    setFriendWishPlaces(prev => prev.map(p => p.id === place.id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    try {
      await deleteWishPlaceComment(commentId)
    } catch (e) {
      console.error(e)
      getWishPlaceComments(place.id).then(comments => setWishCommentsMap(prev => ({ ...prev, [place.id]: comments }))).catch(() => {})
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
        <span style={styles.headerTitle}>친구</span>
        <div style={styles.headerRight}>
          <button style={styles.findFriendsBtn} onClick={() => { setFriendsModalTab('search'); setShowFriendsModal(true) }}>
            친구 찾기
          </button>
          <NotificationBell />
        </div>
      </div>

      <div
        style={{ ...styles.dateNav, touchAction: 'pan-y' }}
        onPointerDown={handleDateSwipeStart}
        onPointerUp={handleDateSwipeEnd}
        onPointerCancel={() => { dateSwipeStart.current = null }}
      >
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, -1))} aria-label="이전 날짜">‹</button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          <span style={{ ...styles.relBadge, background: relLabel.color }}>{relLabel.label}</span>
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setCurrentDate(TODAY)}>오늘로</button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))} aria-label="다음 날짜">›</button>
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
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <div style={{ fontWeight: 700 }}>아직 친구가 없어요</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              그룹 멤버이거나 친구 찾기로 추가하면{'\n'}여기 표시됩니다.
            </p>
            <button style={{ ...styles.findFriendsBtn, marginTop: 4 }} onClick={() => { setFriendsModalTab('search'); setShowFriendsModal(true) }}>
              친구 찾기
            </button>
          </div>
        ) : displayedFriends.length === 0 ? (
          <div style={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <div style={{ fontWeight: 700 }}>이 그룹엔 친구가 없어요</div>
          </div>
        ) : (
          <div style={{ ...styles.friendList, opacity: statusLoading ? 0.5 : 1 }}>
            {displayedFriends.map(friend => {
              const statusChips = SLOT_KEYS
                .filter(slot => friend.statusMap[slot])
                .map(slot => ({ slot, opt: SLOT_STATUS_OPTIONS.find(o => o.key === friend.statusMap[slot].status) }))
              const hasNewWish = newWishFriendIds.has(friend.id)
              return (
                <div key={friend.id} style={styles.friendRow} onClick={() => setSelectedFriendId(friend.id)}>
                  <div style={styles.avatarWrap}>
                    {friend.avatar_url ? (
                      <img src={friend.avatar_url} alt="" style={styles.avatarImg} />
                    ) : (
                      <div style={styles.avatar}>{friend.nickname[0]}</div>
                    )}
                    {hasNewWish && <span style={styles.avatarDot} />}
                  </div>
                  <div style={styles.friendInfo}>
                    <div style={styles.friendNameRow}>
                      <span style={styles.friendName}>{friend.nickname}</span>
                      {friendGroupFilter === null && friend.groups.map(g => (
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
          <div className="thin-scrollbar" style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetHeader}>
              {selectedFriend.avatar_url ? (
                <img src={selectedFriend.avatar_url} alt="" style={styles.avatarLgImg} />
              ) : (
                <div style={styles.avatarLg}>{selectedFriend.nickname[0]}</div>
              )}
              <div style={styles.sheetHeaderInfo}>
                <div style={styles.sheetName}>{selectedFriend.nickname}</div>
                <div style={styles.friendGroups}>
                  {selectedFriend.groups.map(g => (
                    <span key={g.id} style={styles.groupTag}>{g.name}</span>
                  ))}
                </div>
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
              >가고 싶은 곳{newWishFriendIds.has(selectedFriendId) && <span style={styles.sheetTabDot} />}</button>
            </div>

            {friendSheetTab === 'wish' ? (
              friendWishLoading ? (
                <p style={styles.noGroupNote}>불러오는 중...</p>
              ) : friendWishPlaces.length === 0 ? (
                <p style={styles.noGroupNote}>아직 등록한 곳이 없어요.</p>
              ) : (
                <div style={styles.friendWishList}>
                  {friendWishPlaces.map(place => {
                    const commentsOpen = openWishCommentsId === place.id
                    const comments = wishCommentsMap[place.id] ?? []
                    return (
                      <div key={place.id} style={styles.friendWishItem}>
                        <div style={styles.friendWishCategoryRow}>
                          <WishCategoryIcon category={place.category} size={20} />
                          <span style={styles.friendWishCategoryLabel}>
                            {WISH_CATEGORY_OPTIONS.find(o => o.key === place.category)?.label ?? '좋아하는 곳'}
                          </span>
                        </div>
                        <LinkPreviewCard text={place.content} />
                        {(() => {
                          const text = textWithoutUrl(place.content, extractFirstUrl(place.content))
                          return text && <div style={styles.friendWishText}>{text}</div>
                        })()}
                        <div style={styles.wishReactionRow}>
                          <button
                            style={{ ...styles.wishLikeBtn, ...(place.liked_by_me ? styles.wishLikeBtnActive : {}) }}
                            onClick={() => toggleWishLike(place)}
                            disabled={wishLikeBusyId === place.id}
                          >
                            {place.liked_by_me ? '❤️' : '🤍'} {place.like_count > 0 ? place.like_count : ''}
                          </button>
                          <button style={styles.wishCommentToggleBtn} onClick={() => toggleWishComments(place)}>
                            💬 {place.comment_count > 0 ? place.comment_count : '댓글'}
                          </button>
                          <div style={{ position: 'relative', marginLeft: 'auto' }}>
                            <button
                              style={styles.wishMoreBtn}
                              onClick={() => setWishMenuOpenId(id => id === place.id ? null : place.id)}
                              aria-label="더보기"
                            >
                              <MoreHorizontalIcon size={16} />
                            </button>
                            {wishMenuOpenId === place.id && (
                              <>
                                <div style={styles.menuBackdrop} onClick={() => setWishMenuOpenId(null)} />
                                <div style={styles.wishMoreDropdown}>
                                  <button
                                    style={styles.wishMoreItem}
                                    onClick={() => { setWishMenuOpenId(null); setReportTarget({ targetType: 'wish_place', targetId: place.id }) }}
                                  >
                                    🚨 신고하기
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        {commentsOpen && (
                          <div style={styles.wishCommentsBox}>
                            {wishCommentsLoading && comments.length === 0 ? (
                              <p style={styles.noGroupNote}>불러오는 중...</p>
                            ) : comments.length === 0 ? (
                              <p style={styles.noGroupNote}>아직 댓글이 없어요.</p>
                            ) : (
                              <div style={styles.wishProposalsList}>
                                {comments.map(c => (
                                  <div key={c.id} style={styles.wishProposalRow}>
                                    {c.avatar_url ? (
                                      <img src={c.avatar_url} alt="" style={styles.wishProposalAvatarImg} />
                                    ) : (
                                      <div style={styles.wishProposalAvatar}>{c.nickname?.[0] ?? '?'}</div>
                                    )}
                                    <div style={styles.wishProposalTextCol}>
                                      <span style={styles.wishProposalName}>{c.nickname}</span>
                                      <span style={styles.wishProposalMessage}>{c.content}</span>
                                    </div>
                                    {c.user_id === user.id ? (
                                      <button style={styles.wishProposalDismiss} onClick={() => removeWishComment(place, c.id)}>삭제</button>
                                    ) : (
                                      <button
                                        style={styles.wishProposalDismiss}
                                        onClick={() => setReportTarget({ targetType: 'wish_place_comment', targetId: c.id })}
                                      >
                                        신고
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                              <input
                                style={{ ...styles.proposeInput, flex: 1 }}
                                placeholder="댓글 달기"
                                value={newWishCommentText}
                                onChange={e => setNewWishCommentText(e.target.value)}
                                maxLength={200}
                                onKeyDown={e => { if (e.key === 'Enter') sendWishComment(place) }}
                              />
                              <button
                                style={{ ...styles.wishCommentToggleBtn, opacity: newWishCommentText.trim() && !wishCommentSending ? 1 : 0.4 }}
                                onClick={() => sendWishComment(place)}
                                disabled={!newWishCommentText.trim() || wishCommentSending}
                              >등록</button>
                            </div>
                          </div>
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
                        <span style={styles.statusSlotName}>
                          <span style={styles.slotIconWrapper}>
                            <SlotIcon slot={slot} size={30} />
                          </span>
                          {slot}
                        </span>
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

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          onClose={() => setReportTarget(null)}
        />
      )}

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: {
    height: 44, padding: '0 var(--spacing-md)', position: 'sticky', top: 0,
    background: 'rgba(250,248,245,0.95)', zIndex: 10, backdropFilter: 'blur(8px)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontFamily: 'var(--font-title)', fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 6 },
  findFriendsBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-a07)', border: '1px solid var(--color-primary-a27)', borderRadius: 'var(--radius-full)', padding: '6px 12px', cursor: 'pointer' },

  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 'var(--font-size-base)' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-a07)', border: '1px solid var(--color-primary-a27)', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },

  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  friendGroupFilterRow: { display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2, marginBottom: 4 },
  friendGroupFilterChip: { flexShrink: 0, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  friendGroupFilterChipActive: { color: 'var(--color-primary)', background: 'var(--color-primary-a10)', border: '1px solid var(--color-primary)' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)' },

  friendList: { display: 'flex', flexDirection: 'column', gap: 8 },
  friendRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', cursor: 'pointer' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-sm)', flexShrink: 0 },
  avatarImg: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  avatarWrap: { position: 'relative', flexShrink: 0, display: 'inline-flex' },
  avatarDot: {
    position: 'absolute', top: -1, right: -1, width: 9, height: 9, borderRadius: '50%',
    background: 'var(--color-danger)', border: '1.5px solid var(--color-surface-2)',
  },
  friendInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  friendNameRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  friendName: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  friendGroups: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  groupTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-primary-a10)', color: 'var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 600 },
  friendChevron: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-lg)', flexShrink: 0 },
  statusChipRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  miniChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', whiteSpace: 'nowrap' },

  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '80vh', overflowY: 'auto' },
  sheetHeader: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 6 },
  sheetHeaderInfo: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, paddingTop: 4 },
  avatarLg: { width: 56, height: 56, borderRadius: '50%', background: '#9B9285', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-lg)', flexShrink: 0 },
  avatarLgImg: { width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  sheetName: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  sheetDivider: { height: 1, background: 'var(--color-border)', margin: '12px 0 8px' },
  sheetTabs: { display: 'flex', gap: 6, marginBottom: 12 },
  sheetTabBtn: { position: 'relative', flex: 1, padding: '9px 0', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  sheetTabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary-a10)', color: 'var(--color-primary)' },
  sheetTabDot: { position: 'absolute', top: 6, right: 10, width: 7, height: 7, borderRadius: '50%', background: 'var(--color-danger)', border: '1.5px solid var(--color-surface)' },
  sheetSectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 },
  friendWishList: { display: 'flex', flexDirection: 'column', gap: 10 },
  friendWishItem: { display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  friendWishCategoryRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  friendWishCategoryLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  friendWishText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, marginTop: 4 },
  wishReactionRow: { display: 'flex', gap: 8, marginTop: 4 },
  wishLikeBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  wishLikeBtnActive: { color: 'var(--color-primary)', background: 'var(--color-primary-a08)', border: '1px solid var(--color-primary-a27)' },
  wishCommentToggleBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' },
  wishCommentsBox: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' },
  wishProposalsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  wishProposalRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  wishProposalAvatar: { width: 26, height: 26, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--font-size-2xs)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wishProposalAvatarImg: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  wishProposalTextCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  wishProposalName: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text)' },
  wishProposalMessage: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  wishProposalDismiss: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  wishMoreBtn: {
    width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent',
    color: 'var(--color-text-muted)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  wishMoreDropdown: {
    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 112,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
  },
  wishMoreItem: {
    width: '100%', padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  statusCell: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1.5px solid transparent' },
  statusCellSelected: { background: 'var(--color-primary-a10)', border: '1.5px solid var(--color-primary)' },
  statusSlotName: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 },
  slotIconWrapper: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0 },
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
  groupPickTagActive: { background: 'var(--color-primary-a10)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  proposeInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
