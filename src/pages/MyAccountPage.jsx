import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import {
  updateNickname, uploadAvatar, deleteAccount, setDiscoverable, setLunchReminderEnabled,
  getWishPlaces, addWishPlace, updateWishPlace, deleteWishPlace, updateWishPlaceOrder,
  getMyGroups, setWishPlaceShares, getMyWishPlaceReactions, getWishPlaceComments, deleteWishPlaceComment,
  getWishPlaceLikers, addWishPlaceComment,
} from '../lib/db'
import FeedbackModal from '../components/FeedbackModal'
import NotificationBell from '../components/NotificationBell'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import BottomNav from '../components/BottomNav'
import InstallAppPrompt from '../components/InstallAppPrompt'
import AvatarCropModal from '../components/AvatarCropModal'
import AutoTextarea from '../components/AutoTextarea'
import { MoreHorizontalIcon, ChevronDownIcon } from '../components/GroupIcons'
import LinkPreviewCard, { extractFirstUrl, textWithoutUrl } from '../components/LinkPreviewCard'
import WishCategoryIcon from '../components/WishCategoryIcon'
import WishCategoryPicker from '../components/WishCategoryPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024 // 5MB

// 텍스트만 바뀌는 버튼("끄기"/"켜기")은 지금 켜져있는 상태인지 헷갈리기 쉬워서,
// on/off가 색과 위치로 바로 보이는 스위치를 대신 쓴다.
function ToggleSwitch({ on, onClick, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      style={{ ...styles.toggleTrack, background: on ? 'var(--color-primary)' : 'var(--color-border)', opacity: disabled ? 0.6 : 1 }}
    >
      <span style={{ ...styles.toggleThumb, transform: on ? 'translateX(20px)' : 'translateX(0)' }} />
    </button>
  )
}

export default function MyAccountPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, logout, login } = useUser()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const { isInstalled, isIOS } = useInstallPrompt()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawConfirm, setWithdrawConfirm] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState(null)
  const [cropFile, setCropFile] = useState(null)
  const avatarInputRef = useRef(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushError, setPushError] = useState(null)
  const [discoverable, setDiscoverableState] = useState(user?.is_discoverable ?? true)
  const [discoverableLoading, setDiscoverableLoading] = useState(false)
  const [lunchReminderEnabled, setLunchReminderState] = useState(user?.notify_lunch_reminder ?? true)
  const [lunchReminderLoading, setLunchReminderLoading] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)

  const [tab, setTab] = useState(() => searchParams.get('tab') === 'wish' ? 'wish' : 'info') // 'info' | 'wish'
  const [wishPlaces, setWishPlaces] = useState([])
  const [wishLoading, setWishLoading] = useState(false)
  const [newWishText, setNewWishText] = useState('')
  const [newWishCategory, setNewWishCategory] = useState('like')
  const [newWishGroupIds, setNewWishGroupIds] = useState([])
  const [addingWish, setAddingWish] = useState(false)
  const [editingWishId, setEditingWishId] = useState(null)
  const [editingWishText, setEditingWishText] = useState('')
  const [editingWishCategory, setEditingWishCategory] = useState('like')
  const [editingWishGroupIds, setEditingWishGroupIds] = useState([])
  const [savingWishEdit, setSavingWishEdit] = useState(false)
  const [confirmDeleteWishId, setConfirmDeleteWishId] = useState(null)
  const [movingWishId, setMovingWishId] = useState(null)
  const [myGroups, setMyGroups] = useState([])
  const [wishReactionsMap, setWishReactionsMap] = useState({}) // wish_place_id -> { like_count, comment_count }
  const [openWishCommentsId, setOpenWishCommentsId] = useState(null)
  const [wishCommentsMap, setWishCommentsMap] = useState({}) // wish_place_id -> comments[]
  const [wishCommentsLoading, setWishCommentsLoading] = useState(false)
  const [newWishCommentText, setNewWishCommentText] = useState('')
  const [wishCommentSending, setWishCommentSending] = useState(false)
  const [mentionTarget, setMentionTarget] = useState(null) // { userId, nickname } | null
  const [openWishLikersId, setOpenWishLikersId] = useState(null)
  const [wishLikersMap, setWishLikersMap] = useState({}) // wish_place_id -> likers[]
  const [wishLikersLoading, setWishLikersLoading] = useState(false)
  const [showAddWishModal, setShowAddWishModal] = useState(false)
  const [openWishMenuId, setOpenWishMenuId] = useState(null)
  const [confirmDeleteWishCommentId, setConfirmDeleteWishCommentId] = useState(null)

  useEffect(() => {
    if (!isPushSupported()) return
    getPushSubscription().then((sub) => setPushEnabled(!!sub)).catch(() => {})
  }, [])


  useEffect(() => {
    if (tab !== 'wish' || !user) return
    setWishLoading(true)
    Promise.all([getWishPlaces(user.id), getMyGroups(user.id), getMyWishPlaceReactions()])
      .then(([places, groups, reactions]) => {
        setWishPlaces(places)
        setMyGroups(groups)
        setWishReactionsMap(Object.fromEntries(reactions.map(r => [r.wish_place_id, r])))
      })
      .catch(e => console.error(e))
      .finally(() => setWishLoading(false))
  }, [tab, user?.id])

  const toggleWishComments = (place) => {
    const next = openWishCommentsId === place.id ? null : place.id
    setOpenWishCommentsId(next)
    setNewWishCommentText('')
    setMentionTarget(null)
    setConfirmDeleteWishCommentId(null)
    if (next && !wishCommentsMap[next]) {
      setWishCommentsLoading(true)
      getWishPlaceComments(next)
        .then(comments => setWishCommentsMap(prev => ({ ...prev, [next]: comments })))
        .catch(e => console.error(e))
        .finally(() => setWishCommentsLoading(false))
    }
  }

  const removeWishComment = async (place, commentId) => {
    setConfirmDeleteWishCommentId(null)
    setWishCommentsMap(prev => ({ ...prev, [place.id]: (prev[place.id] ?? []).filter(c => c.id !== commentId) }))
    setWishReactionsMap(prev => ({
      ...prev,
      [place.id]: { ...prev[place.id], comment_count: Math.max(0, (prev[place.id]?.comment_count ?? 1) - 1) },
    }))
    try {
      await deleteWishPlaceComment(commentId)
    } catch (e) {
      console.error(e)
      getWishPlaceComments(place.id).then(comments => setWishCommentsMap(prev => ({ ...prev, [place.id]: comments }))).catch(() => {})
    }
  }

  // 댓글 작성자 닉네임을 선택하면 입력창에 "@닉네임 "을 채우고, 등록 시 그 사람에게 멘션 알림을 보낸다.
  const insertMention = (comment) => {
    const tag = `@${comment.nickname} `
    setNewWishCommentText(prev => (prev.startsWith(tag) ? prev : tag + prev))
    setMentionTarget({ userId: comment.user_id, nickname: comment.nickname })
  }

  const onWishCommentTextChange = (value) => {
    setNewWishCommentText(value)
    if (mentionTarget && !value.startsWith(`@${mentionTarget.nickname} `)) {
      setMentionTarget(null)
    }
  }

  const sendWishComment = async (place) => {
    const content = newWishCommentText.trim()
    if (!content || wishCommentSending) return
    setWishCommentSending(true)
    try {
      const comment = await addWishPlaceComment(place.id, user.id, content, mentionTarget?.userId ?? null)
      setWishCommentsMap(prev => ({ ...prev, [place.id]: [...(prev[place.id] ?? []), comment] }))
      setWishReactionsMap(prev => ({
        ...prev,
        [place.id]: { ...prev[place.id], comment_count: (prev[place.id]?.comment_count ?? 0) + 1 },
      }))
      setNewWishCommentText('')
      setMentionTarget(null)
    } catch (e) {
      console.error(e)
    } finally {
      setWishCommentSending(false)
    }
  }

  const toggleWishLikers = (place) => {
    if ((wishReactionsMap[place.id]?.like_count ?? 0) === 0) return
    const next = openWishLikersId === place.id ? null : place.id
    setOpenWishLikersId(next)
    if (next && !wishLikersMap[next]) {
      setWishLikersLoading(true)
      getWishPlaceLikers(next)
        .then(likers => setWishLikersMap(prev => ({ ...prev, [next]: likers })))
        .catch(e => console.error(e))
        .finally(() => setWishLikersLoading(false))
    }
  }

  const openAddWishModal = () => {
    setNewWishText('')
    setNewWishCategory('like')
    setNewWishGroupIds([])
    setShowAddWishModal(true)
  }

  const handleAddWish = async () => {
    if (!newWishText.trim() || addingWish) return
    setAddingWish(true)
    try {
      const place = await addWishPlace(user.id, newWishText.trim(), newWishCategory)
      if (newWishGroupIds.length > 0) {
        await setWishPlaceShares(place.id, newWishGroupIds)
        place.wish_place_shares = newWishGroupIds.map(group_id => ({ group_id }))
      }
      setWishPlaces(prev => [...prev, place])
      setNewWishText('')
      setNewWishCategory('like')
      setNewWishGroupIds([])
      setShowAddWishModal(false)
    } catch (e) {
      console.error(e)
    } finally {
      setAddingWish(false)
    }
  }

  const toggleNewWishGroup = (groupId) => {
    setNewWishGroupIds(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId])
  }

  const toggleAllNewWishGroups = () => {
    setNewWishGroupIds(prev => prev.length === myGroups.length ? [] : myGroups.map(g => g.id))
  }

  const startEditWish = (place) => {
    setShowAddWishModal(false)
    setEditingWishId(place.id)
    setEditingWishText(place.content)
    setEditingWishCategory(place.category ?? 'like')
    setEditingWishGroupIds((place.wish_place_shares ?? []).map(s => s.group_id))
  }

  const cancelEditWish = () => {
    setEditingWishId(null)
    setEditingWishText('')
    setEditingWishCategory('like')
    setEditingWishGroupIds([])
  }

  const closeWishModal = () => {
    setShowAddWishModal(false)
    cancelEditWish()
  }

  const toggleEditingWishGroup = (groupId) => {
    setEditingWishGroupIds(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId])
  }

  const toggleAllEditingWishGroups = () => {
    setEditingWishGroupIds(prev => prev.length === myGroups.length ? [] : myGroups.map(g => g.id))
  }

  const handleSaveEditWish = async () => {
    if (!editingWishText.trim() || savingWishEdit) return
    setSavingWishEdit(true)
    try {
      const content = editingWishText.trim()
      await updateWishPlace(editingWishId, content, editingWishCategory)
      await setWishPlaceShares(editingWishId, editingWishGroupIds)
      const shares = editingWishGroupIds.map(group_id => ({ group_id }))
      setWishPlaces(prev => prev.map(p => p.id === editingWishId ? { ...p, content, category: editingWishCategory, wish_place_shares: shares } : p))
      cancelEditWish()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingWishEdit(false)
    }
  }

  const handleDeleteWish = async (id) => {
    setConfirmDeleteWishId(null)
    setWishPlaces(prev => prev.filter(p => p.id !== id))
    try {
      await deleteWishPlace(id)
    } catch (e) {
      console.error(e)
      getWishPlaces(user.id).then(setWishPlaces).catch(() => {})
    }
  }

  const moveWishOrder = async (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= wishPlaces.length || movingWishId) return
    const next = [...wishPlaces]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setMovingWishId(wishPlaces[idx].id)
    setWishPlaces(next)
    try {
      await updateWishPlaceOrder(user.id, next.map((p, i) => ({ id: p.id, sort_order: i, content: p.content, category: p.category })))
    } catch (e) {
      console.error(e)
      getWishPlaces(user.id).then(setWishPlaces).catch(() => {})
    } finally {
      setMovingWishId(null)
    }
  }

  const handleTogglePush = async () => {
    if (pushLoading) return
    setPushLoading(true)
    setPushError(null)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
      } else {
        await subscribeToPush(user.id)
        setPushEnabled(true)
      }
    } catch (e) {
      console.error(e)
      setPushError(e.message || '알림 설정에 실패했어요.')
    } finally {
      setPushLoading(false)
    }
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError(null)
    if (!file.type.startsWith('image/')) {
      setAvatarError('이미지 파일만 업로드할 수 있어요.')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('5MB 이하의 이미지만 업로드할 수 있어요.')
      return
    }
    setCropFile(file) // 바로 올리지 않고 편집 팝업에서 위치/확대를 고른 뒤 등록한다
  }

  const handleCropConfirm = async (blob) => {
    setAvatarUploading(true)
    try {
      // 원본 포맷(HEIC 등)과 무관하게 JPEG로 다시 인코딩해서 올린다
      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      const avatar_url = await uploadAvatar(user.id, croppedFile)
      login({ ...user, avatar_url })
      setCropFile(null)
    } catch (e) {
      console.error(e)
      setAvatarError('사진 업로드에 실패했어요. 잠시 후 다시 시도해주세요.')
      setCropFile(null)
    } finally {
      setAvatarUploading(false)
    }
  }

  const handleSave = async () => {
    if (!nickname.trim() || saving) return
    setSaving(true)
    try {
      await updateNickname(user.id, nickname.trim())
      login({ ...user, nickname: nickname.trim() })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDiscoverable = async () => {
    if (discoverableLoading) return
    setDiscoverableLoading(true)
    try {
      const next = !discoverable
      await setDiscoverable(user.id, next)
      setDiscoverableState(next)
      login({ ...user, is_discoverable: next })
    } catch (e) {
      console.error(e)
    } finally {
      setDiscoverableLoading(false)
    }
  }

  const handleToggleLunchReminder = async () => {
    if (lunchReminderLoading) return
    setLunchReminderLoading(true)
    try {
      const next = !lunchReminderEnabled
      await setLunchReminderEnabled(user.id, next)
      setLunchReminderState(next)
      login({ ...user, notify_lunch_reminder: next })
    } catch (e) {
      console.error(e)
    } finally {
      setLunchReminderLoading(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/onboarding')
  }

  const closeWithdraw = () => {
    if (withdrawing) return
    setShowWithdraw(false)
    setWithdrawConfirm('')
    setWithdrawError(null)
  }

  const handleWithdraw = async () => {
    if (withdrawConfirm !== '탈퇴' || withdrawing) return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await deleteAccount()
      await logout()
      navigate('/onboarding')
    } catch (e) {
      console.error(e)
      setWithdrawError('탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.')
      setWithdrawing(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>내 계정</span>
        <div style={styles.headerRight}>
          <button style={styles.headerGuideBtn} onClick={() => navigate('/guide')}>사용법</button>
          <NotificationBell />
        </div>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tabBtn, ...(tab === 'info' ? styles.tabBtnActive : {}) }} onClick={() => setTab('info')}>내 정보</button>
        <button style={{ ...styles.tabBtn, ...(tab === 'wish' ? styles.tabBtnActive : {}) }} onClick={() => setTab('wish')}>가고 싶은 곳</button>
      </div>

      {tab === 'info' && (
      <div style={styles.body}>
        {/* 프로필 */}
        <div style={styles.profileCard}>
          <div style={styles.avatarWrap} onClick={() => !avatarUploading && avatarInputRef.current?.click()}>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatar}>{(user?.nickname ?? '?')[0]}</div>
            )}
            <div style={styles.avatarEditBadge}>
              {avatarUploading ? (
                <span style={{ fontSize: 9 }}>...</span>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
                  <circle cx="12" cy="13" r="3.3" />
                </svg>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
          <div style={styles.profileInfo}>
            <div style={styles.profileNameRow}>
              <span style={styles.profileName}>{user?.nickname}</span>
              <button style={styles.editBtn} onClick={() => setEditing(true)}>변경</button>
            </div>
            <div style={styles.profileEmail}>{user?.email}</div>
            {saved && <p style={styles.savedMsg}>✓ 닉네임이 변경됐어요.</p>}
            {avatarError && <p style={styles.avatarErrorMsg}>{avatarError}</p>}
          </div>
        </div>

        {/* 친구 검색 노출 */}
        <div style={styles.section}>
          <div style={styles.infoRow}>
            <span style={styles.infoValue}>친구 찾기에서 내 계정 표시</span>
            <ToggleSwitch on={discoverable} onClick={handleToggleDiscoverable} disabled={discoverableLoading} label="검색 노출" />
          </div>
          <p style={styles.installDesc}>끄면 다른 사람이 이메일이나 닉네임으로 나를 찾을 수 없어요.</p>
        </div>

        {/* 알림 */}
        {isPushSupported() && (
          <div style={styles.section}>
            <span style={styles.sectionLabel}>알림</span>
            {isIOS && !isInstalled ? (
              <p style={styles.installDesc}>홈 화면에 앱을 추가하면 알림을 켤 수 있어요.</p>
            ) : (
              <div style={styles.notifList}>
                <div style={styles.infoRow}>
                  <span style={styles.infoValue}>알림 받기</span>
                  <ToggleSwitch on={pushEnabled} onClick={handleTogglePush} disabled={pushLoading} label="알림 받기" />
                </div>
                <p style={styles.installDesc}>밥팟 초대, 참여, 댓글 소식을 알려드려요.</p>
                {pushEnabled && (
                  <div style={styles.notifSubItem}>
                    <div style={styles.infoRow}>
                      <span style={styles.infoValue}>점심 상태 리마인드</span>
                      <ToggleSwitch on={lunchReminderEnabled} onClick={handleToggleLunchReminder} disabled={lunchReminderLoading} label="점심 상태 리마인드" />
                    </div>
                    <p style={styles.installDesc}>평일 점심시간 전에 상태를 안 정하면 한 번 알려드려요.</p>
                  </div>
                )}
              </div>
            )}
            {pushError && <p style={styles.avatarErrorMsg}>{pushError}</p>}
          </div>
        )}

        {/* 홈 화면 설치 — 화면 하단에 고정, 스크롤 위치와 무관하게 항상 노출 */}
        {!isInstalled && (
          <div style={styles.fixedInstallBar}>
            <InstallAppPrompt hideDesc />
          </div>
        )}

        {/* 사용자 의견 */}
        <div style={styles.section}>
          <span style={styles.sectionLabel}>의견 보내기</span>
          <div style={styles.infoRow}>
            <span style={styles.infoValue}>불편했던 점이나 바라는 점이 있나요?</span>
            <button style={styles.feedbackBtn} onClick={() => setShowFeedbackModal(true)}>의견함 열기</button>
          </div>
        </div>

        {showFeedbackModal && <FeedbackModal onClose={() => setShowFeedbackModal(false)} />}

        {/* 회원 탈퇴 · 로그아웃 — 화면 아래쪽으로 밀어 스크롤해야 보이게 해서, 실수로 누르기
            쉬운 위치(헤더)를 피한다 */}
        <div style={{ marginTop: '50vh' }}>
          <div style={styles.withdrawWrap}>
            <button style={styles.withdrawLink} onClick={handleLogout}>
              로그아웃
            </button>
            <span style={styles.withdrawDivider}>·</span>
            <button style={styles.withdrawLink} onClick={() => setShowWithdraw(true)}>
              회원 탈퇴
            </button>
          </div>
        </div>

        {/* 회원 탈퇴 경고 모달 */}
        {showWithdraw && (
          <div style={styles.modalOverlay} onClick={closeWithdraw}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.withdrawIcon}>⚠️</div>
              <div style={styles.withdrawTitle}>정말 탈퇴하시겠어요?</div>
              <div style={styles.withdrawDesc}>
                탈퇴하면 <strong>되돌릴 수 없습니다.</strong><br />
                아래 데이터가 <strong style={{ color: 'var(--color-danger)' }}>영구적으로 삭제</strong>돼요.
              </div>
              <ul style={styles.withdrawList}>
                <li>프로필 · 닉네임 정보</li>
                <li>참여 중인 모든 밥팟 기록</li>
                <li>그룹 멤버십 및 상태 기록</li>
              </ul>
              <div style={styles.withdrawConfirmLabel}>
                계속하려면 아래에 <strong>탈퇴</strong> 를 입력하세요.
              </div>
              <div style={styles.withdrawInputRow}>
                <input
                  style={styles.withdrawInput}
                  value={withdrawConfirm}
                  onChange={e => setWithdrawConfirm(e.target.value)}
                  placeholder="탈퇴"
                  disabled={withdrawing}
                  autoFocus
                />
                <button
                  style={{ ...styles.withdrawBtn, opacity: withdrawConfirm === '탈퇴' && !withdrawing ? 1 : 0.4 }}
                  onClick={handleWithdraw}
                  disabled={withdrawConfirm !== '탈퇴' || withdrawing}
                >
                  {withdrawing ? '처리 중...' : '탈퇴하기'}
                </button>
              </div>
              {withdrawError && <p style={styles.withdrawErrorMsg}>{withdrawError}</p>}
              <button style={styles.withdrawCancel} onClick={closeWithdraw} disabled={withdrawing}>
                취소
              </button>
            </div>
          </div>
        )}

      </div>
      )}

      {tab === 'wish' && (
      <div style={styles.body}>
        <div style={styles.wishHeader}>
          <span style={styles.wishCount}>{wishPlaces.length}곳</span>
          <div style={styles.wishHeaderBtns}>
            <button style={styles.wishAddTriggerBtn} onClick={openAddWishModal}>+ 등록</button>
          </div>
        </div>

        {wishLoading ? (
          <p style={styles.installDesc}>불러오는 중...</p>
        ) : wishPlaces.length === 0 ? (
          <p style={styles.installDesc}>아직 등록한 곳이 없어요. 가고 싶은 식당을 적어보세요!</p>
        ) : (
          <div style={styles.wishList}>
            {wishPlaces.map((place, idx) => (
              <div key={place.id} style={styles.wishItem}>
                <div style={styles.wishCardTop}>
                  <div style={styles.wishCategoryRow}>
                    <WishCategoryIcon category={place.category} size={26} style={{ flexShrink: 0 }} />
                    <div style={styles.wishScopeChipRow}>
                      {place.wish_place_shares?.length > 0 ? (
                        place.wish_place_shares.map(s => (
                          <span key={s.group_id} style={styles.wishScopeGroupChip}>
                            {myGroups.find(g => g.id === s.group_id)?.name ?? '그룹'}
                          </span>
                        ))
                      ) : (
                        <span style={styles.wishScopeBadge}>나만 보기</span>
                      )}
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button style={styles.wishMenuBtn} onClick={() => setOpenWishMenuId(openWishMenuId === place.id ? null : place.id)} aria-label="더보기"><MoreHorizontalIcon size={15} /></button>
                    {openWishMenuId === place.id && (
                      <>
                        <div style={styles.wishMenuBackdrop} onClick={() => setOpenWishMenuId(null)} />
                        <div style={styles.wishMenuDropdown}>
                          <button style={styles.wishMenuItem} onClick={() => { setOpenWishMenuId(null); startEditWish(place) }}>✏️ 수정</button>
                          <button style={{ ...styles.wishMenuItem, color: 'var(--color-danger)' }} onClick={() => { setOpenWishMenuId(null); setConfirmDeleteWishId(place.id) }}>🗑 삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {/* 링크는 원문 주소 대신 미리보기 카드로, 나머지 메모는 카드 뒤에 이어서 보여준다 */}
                <LinkPreviewCard text={place.content} />
                {(() => {
                  const text = textWithoutUrl(place.content, extractFirstUrl(place.content))
                  return text && <div style={styles.wishText}>{text}</div>
                })()}
                {(() => {
                  const reactions = wishReactionsMap[place.id]
                  const likeCount = reactions?.like_count ?? 0
                  const commentCount = reactions?.comment_count ?? 0
                  const showOrderBtns = wishPlaces.length > 1
                  const isExpanded = openWishCommentsId === place.id
                  const comments = wishCommentsMap[place.id] ?? []
                  const isLikersExpanded = openWishLikersId === place.id
                  const likers = wishLikersMap[place.id] ?? []
                  return (
                    <div style={styles.wishProposalsBox}>
                      <div style={styles.wishProposalsRow}>
                        <div style={styles.wishReactionRow}>
                          <button
                            style={{ ...styles.wishLikeCount, cursor: likeCount > 0 ? 'pointer' : 'default' }}
                            onClick={() => toggleWishLikers(place)}
                            disabled={likeCount === 0}
                          >
                            {likeCount > 0 ? `❤️ ${likeCount}` : '🤍 0'}
                            {likeCount > 0 && (
                              <ChevronDownIcon size={11} strokeWidth={2.4} style={{ verticalAlign: 'middle', marginLeft: 3, transform: isLikersExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                            )}
                          </button>
                          <button style={styles.wishProposalsToggle} onClick={() => toggleWishComments(place)}>
                            💬 {commentCount > 0 ? `${commentCount}개의 댓글` : '댓글'}
                            <ChevronDownIcon size={11} strokeWidth={2.4} style={{ verticalAlign: 'middle', marginLeft: 3, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                          </button>
                        </div>
                        {showOrderBtns && (
                          <div style={styles.wishOrderBtns}>
                            <button
                              style={{ ...styles.wishOrderBtn, opacity: idx === 0 ? 0.25 : 1 }}
                              onClick={() => moveWishOrder(idx, -1)}
                              disabled={idx === 0 || !!movingWishId}
                            >↑</button>
                            <button
                              style={{ ...styles.wishOrderBtn, opacity: idx === wishPlaces.length - 1 ? 0.25 : 1 }}
                              onClick={() => moveWishOrder(idx, 1)}
                              disabled={idx === wishPlaces.length - 1 || !!movingWishId}
                            >↓</button>
                          </div>
                        )}
                      </div>
                      {isLikersExpanded && (
                        wishLikersLoading && likers.length === 0 ? (
                          <p style={styles.installDesc}>불러오는 중...</p>
                        ) : likers.length === 0 ? (
                          <p style={styles.installDesc}>아직 아무도 하트를 남기지 않았어요.</p>
                        ) : (
                          <div style={styles.wishProposalsList}>
                            {likers.map(l => (
                              <div key={l.user_id} style={styles.wishProposalRow}>
                                {l.avatar_url ? (
                                  <img src={l.avatar_url} alt="" style={styles.wishProposalAvatarImg} />
                                ) : (
                                  <div style={styles.wishProposalAvatar}>{l.nickname?.[0] ?? '?'}</div>
                                )}
                                <span style={styles.wishProposalName}>{l.nickname}</span>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                      {isExpanded && (
                        <>
                          {wishCommentsLoading && comments.length === 0 ? (
                            <p style={styles.installDesc}>불러오는 중...</p>
                          ) : comments.length === 0 ? (
                            <p style={styles.installDesc}>아직 댓글이 없어요.</p>
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
                                    <button style={styles.wishProposalNameBtn} onClick={() => insertMention(c)}>{c.nickname}</button>
                                    <span style={styles.wishProposalMessage}>{c.content}</span>
                                  </div>
                                  {c.user_id === user.id && (
                                    confirmDeleteWishCommentId === c.id ? (
                                      <div style={styles.wishProposalConfirmRow}>
                                        <span style={styles.wishProposalConfirmText}>삭제할까요?</span>
                                        <button style={styles.wishProposalConfirmDanger} onClick={() => removeWishComment(place, c.id)}>삭제</button>
                                        <button style={styles.wishProposalDismiss} onClick={() => setConfirmDeleteWishCommentId(null)}>취소</button>
                                      </div>
                                    ) : (
                                      <button style={styles.wishProposalDismiss} onClick={() => setConfirmDeleteWishCommentId(c.id)}>삭제</button>
                                    )
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={styles.wishCommentInputRow}>
                            <input
                              style={{ ...styles.wishModalInput, ...styles.wishCommentInput }}
                              placeholder="댓글 달기"
                              value={newWishCommentText}
                              onChange={e => onWishCommentTextChange(e.target.value)}
                              maxLength={200}
                              onKeyDown={e => { if (e.key === 'Enter') sendWishComment(place) }}
                            />
                            <button
                              style={{ ...styles.wishProposalsToggle, opacity: newWishCommentText.trim() && !wishCommentSending ? 1 : 0.4 }}
                              onClick={() => sendWishComment(place)}
                              disabled={!newWishCommentText.trim() || wishCommentSending}
                            >등록</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {confirmDeleteWishId && (
        <div style={styles.overlay} onClick={() => setConfirmDeleteWishId(null)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🗑</div>
            <div style={styles.dialogTitle}>가고 싶은 곳을 삭제할까요?</div>
            <div style={styles.dialogBtns}>
              <button
                style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }}
                onClick={() => handleDeleteWish(confirmDeleteWishId)}
              >
                삭제
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmDeleteWishId(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {(showAddWishModal || editingWishId) && (
        <div style={styles.modalOverlay} onClick={closeWishModal}>
          <div style={{ ...styles.modal, paddingLeft: 'var(--spacing-md)', paddingRight: 'var(--spacing-md)' }} onClick={e => e.stopPropagation()}>
            <div style={styles.wishModalTitle}>{editingWishId ? '가고 싶은 곳 수정' : '가고 싶은 곳 등록'}</div>
            <div style={styles.wishScopeBox}>
              <span style={styles.wishScopeLabel}>카테고리</span>
              <WishCategoryPicker
                value={editingWishId ? editingWishCategory : newWishCategory}
                onChange={editingWishId ? setEditingWishCategory : setNewWishCategory}
              />
            </div>
            {myGroups.length > 0 && (
              <div style={styles.wishScopeBox}>
                <span style={styles.wishScopeLabel}>공개 대상 (선택 안 하면 나만 보기)</span>
                <div style={styles.wishScopeChips}>
                  {(() => {
                    const selectedIds = editingWishId ? editingWishGroupIds : newWishGroupIds
                    const toggle = editingWishId ? toggleEditingWishGroup : toggleNewWishGroup
                    const toggleAll = editingWishId ? toggleAllEditingWishGroups : toggleAllNewWishGroups
                    const allSelected = selectedIds.length === myGroups.length
                    return (
                      <>
                        <button
                          style={{ ...styles.groupPickTag, ...(allSelected ? styles.groupPickTagActive : {}) }}
                          onClick={toggleAll}
                        >전체선택</button>
                        {myGroups.map(g => (
                          <button
                            key={g.id}
                            style={{ ...styles.groupPickTag, ...(selectedIds.includes(g.id) ? styles.groupPickTagActive : {}) }}
                            onClick={() => toggle(g.id)}
                          >{g.name}</button>
                        ))}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
            <AutoTextarea
              style={styles.wishModalInput}
              placeholder="식당 이름, 메모, 링크 등을 자유롭게 적어보세요"
              value={editingWishId ? editingWishText : newWishText}
              onChange={e => editingWishId ? setEditingWishText(e.target.value) : setNewWishText(e.target.value)}
              maxLength={200}
              minRows={3}
              enterKeyHint="enter"
              autoFocus
            />
            <div style={styles.dialogBtns}>
              <button
                style={{ ...styles.dialogBtnPrimary, opacity: (editingWishId ? editingWishText : newWishText).trim() && !(editingWishId ? savingWishEdit : addingWish) ? 1 : 0.5 }}
                onClick={editingWishId ? handleSaveEditWish : handleAddWish}
                disabled={!(editingWishId ? editingWishText : newWishText).trim() || (editingWishId ? savingWishEdit : addingWish)}
              >
                {editingWishId ? (savingWishEdit ? '저장 중...' : '저장') : (addingWish ? '등록 중...' : '등록')}
              </button>
              <button style={styles.dialogBtnCancel} onClick={closeWishModal} disabled={editingWishId ? savingWishEdit : addingWish}>취소</button>
            </div>
          </div>
        </div>
      )}

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          uploading={avatarUploading}
          onCancel={() => setCropFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}

      {editing && (
        <div style={styles.overlay} onClick={() => { setEditing(false); setNickname(user?.nickname ?? '') }}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32 }}>✏️</div>
            <div style={styles.dialogTitle}>닉네임 변경</div>
            <input
              style={styles.dialogInput}
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={8}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="새 닉네임"
            />
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, opacity: nickname.trim() && !saving ? 1 : 0.5 }} onClick={handleSave} disabled={!nickname.trim() || saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => { setEditing(false); setNickname(user?.nickname ?? '') }} disabled={saving}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    height: 44, padding: '0 var(--spacing-md)', position: 'sticky', top: 0,
    background: 'rgba(250,248,245,0.95)', zIndex: 10, backdropFilter: 'blur(8px)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontFamily: 'var(--font-title)', fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 2 },
  headerGuideBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' },
  // 이 페이지는 내부 스크롤 컨테이너가 아니라 문서(페이지) 자체가 스크롤되는 구조라
  // position:sticky가 걸리지 않는다 — 그래서 fixed로 고정하고, 아래 paddingBottom을
  // 넉넉히 잡아 끝까지 스크롤하면 로그아웃/회원 탈퇴가 이 바 위로 완전히 올라오게 한다.
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 'calc(150px + env(safe-area-inset-bottom))' },

  fixedInstallBar: {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(72px + env(safe-area-inset-bottom))',
    width: '100%', maxWidth: 'var(--max-width)', boxSizing: 'border-box',
    padding: '10px var(--spacing-md)', background: 'rgba(250,248,245,0.95)', backdropFilter: 'blur(8px)',
    borderTop: '1px solid var(--color-border)', zIndex: 90,
  },

  profileCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' },
  avatarWrap: { position: 'relative', flexShrink: 0, cursor: 'pointer' },
  avatar: { width: 48, height: 48, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  avatarImg: { width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', display: 'block' },
  avatarEditBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%',
    background: '#5C5650', color: '#fff', fontSize: 11, display: 'flex',
    alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-surface-2)',
  },
  avatarErrorMsg: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-danger)', margin: 0 },
  profileInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  profileNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  profileName: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  profileEmail: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },

  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  notifList: { display: 'flex', flexDirection: 'column', gap: 8 },
  notifSubItem: { display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 14, paddingLeft: 10, borderLeft: '2px solid var(--color-border)' },

  feedbackBtn: { flexShrink: 0, padding: '7px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  infoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  infoValue: { fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  editBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '4px 12px', cursor: 'pointer' },
  savedMsg: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-success)', fontWeight: 600 },

  toggleTrack: { width: 46, height: 26, borderRadius: 13, border: 'none', padding: 2, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, boxSizing: 'border-box' },
  toggleThumb: { display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform 0.2s' },

  installDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  modal: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', textAlign: 'center' },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },

  withdrawWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  withdrawLink: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', textDecoration: 'underline', cursor: 'pointer', padding: 4, opacity: 0.6 },
  withdrawDivider: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', opacity: 0.5 },
  withdrawIcon: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  withdrawTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', marginBottom: 'var(--spacing-md)' },
  withdrawDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', textAlign: 'center', lineHeight: 1.6, marginBottom: 'var(--spacing-md)' },
  withdrawList: { margin: '0 0 var(--spacing-lg)', padding: '12px 16px 12px 32px', background: '#FFF0F0', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: '#c62828', lineHeight: 1.8 },
  withdrawConfirmLabel: { fontSize: 'var(--font-size-sm)', textAlign: 'center', marginBottom: 8, color: 'var(--color-text)' },
  withdrawInputRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--spacing-md)' },
  withdrawInput: { flex: 1, padding: '12px var(--spacing-md)', border: '1.5px solid var(--color-danger)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' },
  withdrawErrorMsg: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', textAlign: 'center', margin: '0 0 var(--spacing-sm)' },
  withdrawBtn: { flexShrink: 0, padding: '12px 16px', background: 'var(--color-danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 800, cursor: 'pointer' },
  withdrawCancel: { width: '100%', padding: 12, background: 'none', color: 'var(--color-text-muted)', border: 'none', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },

  tabs: { display: 'flex', gap: 6, padding: '10px var(--spacing-md) 0', flexShrink: 0 },
  tabBtn: { flex: 1, padding: '9px 0', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  tabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary-a10)', color: 'var(--color-primary)' },

  wishHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  wishCount: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  wishHeaderBtns: { display: 'flex', alignItems: 'center', gap: 6 },
  wishAddTriggerBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#fff', background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-full)', padding: '5px 14px', cursor: 'pointer', fontFamily: 'inherit' },

  wishList: { display: 'flex', flexDirection: 'column', gap: 10 },
  wishItem: { display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  wishText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, marginTop: 4 },
  wishModalTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 12 },
  wishModalInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' },

  wishScopeBox: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2, marginBottom: 14 },
  wishScopeLabel: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  wishScopeChips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  groupPickTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  groupPickTagActive: { background: 'var(--color-primary-a10)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  wishCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wishCategoryRow: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  wishScopeBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  wishScopeChipRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  wishScopeGroupChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px' },
  wishMenuBtn: {
    width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent',
    color: 'var(--color-text-muted)', fontSize: 16, fontWeight: 900, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0,
  },
  wishMenuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  wishMenuDropdown: {
    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 100,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
  },
  wishMenuItem: {
    width: '100%', padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },

  wishProposalsBox: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 },
  wishProposalsRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wishReactionRow: { display: 'flex', alignItems: 'center', gap: 10 },
  wishLikeCount: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', background: 'none', border: 'none', padding: 0, fontFamily: 'inherit' },
  wishProposalsToggle: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  wishProposalsList: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' },
  wishProposalRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  wishProposalAvatar: { width: 26, height: 26, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--font-size-2xs)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wishProposalAvatarImg: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  wishProposalTextCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  wishProposalName: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text)' },
  wishProposalNameBtn: { alignSelf: 'flex-start', fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' },
  wishProposalMessage: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  wishProposalDismiss: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  wishProposalConfirmRow: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 },
  wishProposalConfirmText: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  wishProposalConfirmDanger: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' },
  wishCommentInputRow: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 },
  wishCommentInput: { flex: 1, padding: '8px 12px', fontSize: 'var(--font-size-2xs)' },

  wishOrderBtns: { display: 'flex', justifyContent: 'flex-end', gap: 4, flexShrink: 0 },
  wishOrderBtn: { width: 26, height: 26, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' },
}
