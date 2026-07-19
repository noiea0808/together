import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import {
  updateNickname, uploadAvatar, deleteAccount, setDiscoverable,
  getWishPlaces, addWishPlace, updateWishPlace, deleteWishPlace, updateWishPlaceOrder,
  getMyGroups, setWishPlaceShares, getMyWishPlaceProposals, deleteWishPlaceProposal,
} from '../lib/db'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { isPushSupported, getPushSubscription, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import BottomNav from '../components/BottomNav'
import InstallAppPrompt from '../components/InstallAppPrompt'
import AvatarCropModal from '../components/AvatarCropModal'
import AutoTextarea from '../components/AutoTextarea'
import LinkPreviewCard, { extractFirstUrl, textWithoutUrl } from '../components/LinkPreviewCard'
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

  const [tab, setTab] = useState(() => searchParams.get('tab') === 'wish' ? 'wish' : 'info') // 'info' | 'wish'
  const [wishPlaces, setWishPlaces] = useState([])
  const [wishLoading, setWishLoading] = useState(false)
  const [newWishText, setNewWishText] = useState('')
  const [newWishGroupIds, setNewWishGroupIds] = useState([])
  const [addingWish, setAddingWish] = useState(false)
  const [editingWishId, setEditingWishId] = useState(null)
  const [editingWishText, setEditingWishText] = useState('')
  const [editingWishGroupIds, setEditingWishGroupIds] = useState([])
  const [savingWishEdit, setSavingWishEdit] = useState(false)
  const [confirmDeleteWishId, setConfirmDeleteWishId] = useState(null)
  const [reorderingWish, setReorderingWish] = useState(false)
  const [localWishPlaces, setLocalWishPlaces] = useState([])
  const [savingWishOrder, setSavingWishOrder] = useState(false)
  const [myGroups, setMyGroups] = useState([])
  const [wishProposals, setWishProposals] = useState([])
  const [expandedProposalsWishId, setExpandedProposalsWishId] = useState(null)
  const [showAddWishModal, setShowAddWishModal] = useState(false)
  const [openWishMenuId, setOpenWishMenuId] = useState(null)

  useEffect(() => {
    if (!isPushSupported()) return
    getPushSubscription().then((sub) => setPushEnabled(!!sub)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab !== 'wish' || !user) return
    setWishLoading(true)
    Promise.all([getWishPlaces(user.id), getMyGroups(user.id), getMyWishPlaceProposals()])
      .then(([places, groups, proposals]) => {
        setWishPlaces(places)
        setMyGroups(groups)
        setWishProposals(proposals)
      })
      .catch(e => console.error(e))
      .finally(() => setWishLoading(false))
  }, [tab, user?.id])

  const openAddWishModal = () => {
    setNewWishText('')
    setNewWishGroupIds([])
    setShowAddWishModal(true)
  }

  const handleAddWish = async () => {
    if (!newWishText.trim() || addingWish) return
    setAddingWish(true)
    try {
      const place = await addWishPlace(user.id, newWishText.trim())
      if (newWishGroupIds.length > 0) {
        await setWishPlaceShares(place.id, newWishGroupIds)
        place.wish_place_shares = newWishGroupIds.map(group_id => ({ group_id }))
      }
      setWishPlaces(prev => [...prev, place])
      setNewWishText('')
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
    setEditingWishGroupIds((place.wish_place_shares ?? []).map(s => s.group_id))
  }

  const cancelEditWish = () => {
    setEditingWishId(null)
    setEditingWishText('')
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
      await updateWishPlace(editingWishId, content)
      await setWishPlaceShares(editingWishId, editingWishGroupIds)
      const shares = editingWishGroupIds.map(group_id => ({ group_id }))
      setWishPlaces(prev => prev.map(p => p.id === editingWishId ? { ...p, content, wish_place_shares: shares } : p))
      cancelEditWish()
    } catch (e) {
      console.error(e)
    } finally {
      setSavingWishEdit(false)
    }
  }

  const handleDismissProposal = async (id) => {
    setWishProposals(prev => prev.filter(p => p.id !== id))
    try {
      await deleteWishPlaceProposal(id)
    } catch (e) {
      console.error(e)
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

  const startReorderWish = () => {
    setLocalWishPlaces([...wishPlaces])
    setReorderingWish(true)
  }

  const moveWish = (idx, dir) => {
    setLocalWishPlaces(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const saveWishOrder = async () => {
    setSavingWishOrder(true)
    try {
      const orders = localWishPlaces.map((p, i) => ({ id: p.id, sort_order: i }))
      await updateWishPlaceOrder(user.id, orders)
      setWishPlaces(localWishPlaces)
      setReorderingWish(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingWishOrder(false)
    }
  }

  const cancelReorderWish = () => {
    setReorderingWish(false)
    setLocalWishPlaces([])
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
        <span style={styles.headerTitle}>MY</span>
        <div style={styles.headerBtns}>
          <button style={styles.headerGuideBtn} onClick={() => navigate('/guide')}>사용법</button>
          <button style={styles.headerLogoutBtn} onClick={handleLogout}>로그아웃</button>
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

        {/* 알림 받기 */}
        {isPushSupported() && (
          <div style={styles.section}>
            {isIOS && !isInstalled ? (
              <p style={styles.installDesc}>홈 화면에 앱을 추가하면 알림을 켤 수 있어요.</p>
            ) : (
              <>
                <div style={styles.infoRow}>
                  <span style={styles.infoValue}>알림 받기</span>
                  <ToggleSwitch on={pushEnabled} onClick={handleTogglePush} disabled={pushLoading} label="알림 받기" />
                </div>
                <p style={styles.installDesc}>밥팟 초대, 참여, 댓글 소식을 알려드려요.</p>
              </>
            )}
            {pushError && <p style={styles.avatarErrorMsg}>{pushError}</p>}
          </div>
        )}

        {/* 홈 화면 설치 */}
        <div style={styles.section}>
          <InstallAppPrompt />
        </div>

        {/* 회원 탈퇴 — 실수 방지를 위해 작고 눈에 띄지 않게. 로그아웃은 헤더로 이동 */}
        <div style={{ marginTop: 'auto' }}>
          <div style={styles.withdrawWrap}>
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
          {!reorderingWish && (
            <div style={styles.wishHeaderBtns}>
              {wishPlaces.length > 1 && (
                <button style={styles.wishOrderToggle} onClick={startReorderWish}>순서 변경</button>
              )}
              <button style={styles.wishAddTriggerBtn} onClick={openAddWishModal}>+ 등록</button>
            </div>
          )}
        </div>

        {reorderingWish ? (
          <>
            <div style={styles.wishList}>
              {localWishPlaces.map((place, idx) => (
                <div key={place.id} style={styles.orderRow}>
                  <span style={styles.orderHandle}>☰</span>
                  <span style={styles.orderName}>{place.content}</span>
                  <div style={styles.orderBtns}>
                    <button
                      style={{ ...styles.orderBtn, opacity: idx === 0 ? 0.25 : 1 }}
                      onClick={() => moveWish(idx, -1)}
                      disabled={idx === 0}
                    >↑</button>
                    <button
                      style={{ ...styles.orderBtn, opacity: idx === localWishPlaces.length - 1 ? 0.25 : 1 }}
                      onClick={() => moveWish(idx, 1)}
                      disabled={idx === localWishPlaces.length - 1}
                    >↓</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.wishOrderActions}>
              <button style={{ ...styles.dialogBtnPrimary, opacity: savingWishOrder ? 0.6 : 1 }} onClick={saveWishOrder} disabled={savingWishOrder}>
                {savingWishOrder ? '저장 중...' : '저장'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={cancelReorderWish} disabled={savingWishOrder}>취소</button>
            </div>
          </>
        ) : wishLoading ? (
          <p style={styles.installDesc}>불러오는 중...</p>
        ) : wishPlaces.length === 0 ? (
          <p style={styles.installDesc}>아직 등록한 곳이 없어요. 가고 싶은 식당을 적어보세요!</p>
        ) : (
          <div style={styles.wishList}>
            {wishPlaces.map(place => (
              <div key={place.id} style={styles.wishItem}>
                <div style={styles.wishCardTop}>
                  <span style={styles.wishScopeBadge}>
                    {place.wish_place_shares?.length > 0 ? `🔒 ${place.wish_place_shares.length}개 그룹만` : '🔒 나만 보기'}
                  </span>
                  <div style={{ position: 'relative' }}>
                    <button style={styles.wishMenuBtn} onClick={() => setOpenWishMenuId(openWishMenuId === place.id ? null : place.id)}>⋯</button>
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
                  const itemProposals = wishProposals.filter(p => p.wish_place_id === place.id)
                  if (itemProposals.length === 0) return null
                  const isExpanded = expandedProposalsWishId === place.id
                  return (
                    <div style={styles.wishProposalsBox}>
                      <button
                        style={styles.wishProposalsToggle}
                        onClick={() => setExpandedProposalsWishId(isExpanded ? null : place.id)}
                      >
                        💬 {itemProposals.length}명이 같이 가고 싶어해요 {isExpanded ? '▴' : '▾'}
                      </button>
                      {isExpanded && (
                        <div style={styles.wishProposalsList}>
                          {itemProposals.map(p => (
                            <div key={p.id} style={styles.wishProposalRow}>
                              {p.from_avatar_url ? (
                                <img src={p.from_avatar_url} alt="" style={styles.wishProposalAvatarImg} />
                              ) : (
                                <div style={styles.wishProposalAvatar}>{p.from_nickname?.[0] ?? '?'}</div>
                              )}
                              <div style={styles.wishProposalTextCol}>
                                <span style={styles.wishProposalName}>
                                  {p.from_nickname}{p.group_name ? ` · ${p.group_name}` : ''}
                                </span>
                                {p.message && <span style={styles.wishProposalMessage}>{p.message}</span>}
                              </div>
                              <button style={styles.wishProposalDismiss} onClick={() => handleDismissProposal(p.id)}>닫기</button>
                            </div>
                          ))}
                        </div>
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
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.wishModalTitle}>{editingWishId ? '가고 싶은 곳 수정' : '가고 싶은 곳 등록'}</div>
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
  headerTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  headerBtns: { display: 'flex', alignItems: 'center', gap: 4 },
  headerGuideBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' },
  headerLogoutBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

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

  withdrawWrap: { textAlign: 'center', marginTop: 14 },
  withdrawLink: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', textDecoration: 'underline', cursor: 'pointer', padding: 4, opacity: 0.6 },
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
  tabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },

  wishHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  wishCount: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  wishHeaderBtns: { display: 'flex', alignItems: 'center', gap: 6 },
  wishOrderToggle: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '4px 12px', cursor: 'pointer' },
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
  groupPickTagActive: { background: 'var(--color-primary)18', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  wishCardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wishScopeBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
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
  wishProposalsToggle: { alignSelf: 'flex-start', fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  wishProposalsList: { display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)' },
  wishProposalRow: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  wishProposalAvatar: { width: 26, height: 26, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--font-size-2xs)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  wishProposalAvatarImg: { width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  wishProposalTextCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  wishProposalName: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text)' },
  wishProposalMessage: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  wishProposalDismiss: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' },

  wishOrderActions: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },

  orderRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  orderHandle: { fontSize: 16, color: 'var(--color-text-muted)', flexShrink: 0 },
  orderName: { flex: 1, fontWeight: 700, fontSize: 'var(--font-size-sm)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  orderBtns: { display: 'flex', gap: 4, flexShrink: 0 },
  orderBtn: { width: 32, height: 32, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
