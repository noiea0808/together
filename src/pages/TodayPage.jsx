import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getTodayBoard, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus, updateGroupName, leaveGroup, getMyStatuses, getGroupShareSettings, setGroupShareSettingBulk, leavePot, leavePotWithCleanup, deletePot, updatePotCreator, getGroupDefaultPotConfigs, ensureDefaultPots, updateGroupNickname, getPotByInviteCode, updateGroupOrder, getMyPotsForSlot, getMyPotSlotsForDate, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation, getMyFriends, getFriendsStatuses, getFriendShareSettings, setFriendShareSettingBulk, inviteGroupFriend, getPublicOrigin, getGroupSearchSettings, setGroupPassword, setGroupAllowSearch } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCache, setCache, invalidateCache } from '../lib/cache'
import { shareLink, copyToClipboard, canShare } from '../lib/share'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import { isPotTimeExpired, getJoinedStatusLabel } from '../lib/potConstants'
import PotCard from '../components/PotCard'
import GroupSetupModal from '../components/GroupSetupModal'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import { usePageHeader } from '../lib/HeaderConfigContext'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { UsersIcon, UserIcon, PencilIcon, SendIcon, LogOutIcon, CrownIcon, SlidersIcon, UndoIcon, ChevronDownIcon, BroadcastIcon, BroadcastOffIcon, MoreHorizontalIcon, SearchIcon, LockIcon } from '../components/GroupIcons'
import SlotIcon from '../components/SlotIcon'
import StatusIcon from '../components/StatusIcon'
import PotIcon from '../components/PotIcon'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import { SLOT_THEME, SLOT_CHIP_COLOR } from '../lib/slotTheme'
import { avatarColor } from '../lib/avatarColor'
import { getRelativeLabel, REL_TONE_FILL, REL_TONE_TEXT } from '../lib/relativeDay'

// 받침 유무에 따라 은/는을 골라 단어에 붙인다 (한글 유니코드 완성형 범위에서 종성 코드로 판별).
function withEunNeun(word) {
  const last = word[word.length - 1]
  const code = last.charCodeAt(0) - 0xAC00
  if (code < 0 || code > 11171) return `${word}은` // 한글 완성형이 아니면(숫자 등) 기본값
  return code % 28 === 0 ? `${word}는` : `${word}은`
}

// "오늘 오전간식"처럼 날짜+슬롯 앞부분이 길어지면, 브라우저가 아무 데서나 줄바꿈하기 전에
// 미리 그 뒤에서 끊어준다 — '아침'/'점심' 같은 짧은 조합은 한 줄 그대로 둔다.
function dayslotSep(dayLabel, slot) {
  return (dayLabel.length + slot.length) > 4 ? '\n' : ' '
}

// 상태값별 내 상태 카드 보조 문구 — dayLabel은 조회 중인 날짜에 맞는 상대 표현('오늘'/'내일'/'모레'/'N일 뒤')
const STATUS_SUBTEXT = {
  open: (slot, dayLabel) => `${dayLabel} ${slot}${dayslotSep(dayLabel, slot)}같이 먹을 수 있어요`,
  closed: (slot, dayLabel) => `${dayLabel} ${withEunNeun(slot)}${dayslotSep(dayLabel, slot)}약속이 있어요`,
  skip: (slot) => `이번 ${slot}은 쉬어갈게요`,
}

// 매번 같은 문장이면 지루하니 몇 가지 배리에이션을 두고, 날짜+슬롯 기준으로 고정 선택한다
// (매 리렌더마다 바뀌면 화면이 깜빡이는 것처럼 보여서 랜덤이 아니라 해시로 고정값을 고른다).
const STATUS_SUBTEXT_EMPTY_VARIANTS = [
  (slot, dayLabel) => `${dayLabel} ${withEunNeun(slot)}${dayslotSep(dayLabel, slot)}누구랑 먹을거에요?`,
  (slot, dayLabel) => `${dayLabel} ${slot}${dayslotSep(dayLabel, slot)}메뉴는 정했어요?`,
  (slot, dayLabel) => `${dayLabel} ${slot}엔${dayslotSep(dayLabel, slot)}뭐 드실 거예요?`,
  (slot, dayLabel) => `${dayLabel} ${slot},${dayslotSep(dayLabel, slot)}같이 먹을 사람 구해볼까요?`,
  (slot, dayLabel) => `${dayLabel} ${withEunNeun(slot)}${dayslotSep(dayLabel, slot)}아직 안 정했죠?`,
]
function hashString(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
function statusSubtextEmpty(slot, dayLabel, dateStr) {
  const variant = STATUS_SUBTEXT_EMPTY_VARIANTS[hashString(`${dateStr}-${slot}`) % STATUS_SUBTEXT_EMPTY_VARIANTS.length]
  return variant(slot, dayLabel)
}

// 상태 선택 팝업의 버튼 부제 — 슬롯명은 팝업 타이틀에 이미 나오므로 빼고, 뜻만 짧게.
// 메인 카드에 쓰는 STATUS_SUBTEXT(슬롯명 포함, 문장형)와는 용도가 달라 별도로 둔다.
const STATUS_BTN_SUBTEXT = {
  open: '같이 먹을 수 있어요',
  closed: '이미 약속이 있어요',
  skip: '이번엔 쉬어갈게요',
}

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

const SLOT_TIME_PRESETS = {
  '아침':    ['07:00', '07:30', '08:00', '08:30', '09:00'],
  '오전간식': ['09:30', '10:00', '10:30', '11:00'],
  '점심':    ['11:00', '11:30', '12:00', '12:30', '13:00'],
  '오후간식': ['14:00', '14:30', '15:00', '15:30'],
  '저녁':    ['17:00', '17:30', '18:00', '18:30', '19:00'],
  '야식':    ['21:00', '21:30', '22:00', '23:00'],
}

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 지금 시각에 가장 가까운 슬롯 — 각 슬롯의 첫 프리셋 시각을 기준으로, 그 시각을 지난 슬롯 중 가장 늦은 것을 고른다.
// (예: 11시 → 점심, 아침 시작 07:00 이전 새벽 시간대는 기본값인 아침으로 유지)
function getTimeBasedSlot(date = new Date()) {
  const nowMin = date.getHours() * 60 + date.getMinutes()
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let result = SLOT_ORDER[0]
  for (const slot of SLOT_ORDER) {
    if (nowMin >= toMin(SLOT_TIME_PRESETS[slot][0])) result = slot
  }
  return result
}

// 오늘 안에서 직접 고른 슬롯이 있으면 그걸, 없으면(하루가 바뀌었거나 처음 진입) 시간대 기본값을 보여준다.
function getDefaultSlot() {
  try {
    const stored = JSON.parse(localStorage.getItem('lastSelectedSlot') || 'null')
    if (stored?.slot && stored.date === toDateStr(new Date())) return stored.slot
  } catch {}
  return getTimeBasedSlot()
}

function rememberSlot(slot) {
  localStorage.setItem('lastSelectedSlot', JSON.stringify({ slot, date: toDateStr(new Date()) }))
}

function formatDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
// 자정을 넘겨도 항상 실제 오늘을 가리키도록 호출 시점에 계산 — 모듈 로드 시 한 번만 고정하면
// 앱을 자정 너머까지 켜둔 세션에서 "오늘"이 실제로는 어제인 상태로 굳어버린다.
function getToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d
}

// 드래그 도중 텍스트가 선택됐는지 — 마우스로 천천히/빠르게 텍스트를 드래그해도, 실제로 글자가
// 선택돼 있으면 스와이프 제스처가 아니라 텍스트 선택 시도였다고 판단해 내비게이션을 건너뛴다.
function isTextBeingSelected() {
  const selection = window.getSelection?.()
  return !!selection && selection.toString().length > 0
}

function sortPots(pots) {
  const byTime = (a, b) => a.meal_time.localeCompare(b.meal_time)
  return [
    ...pots.filter(p => p.is_default).sort(byTime),
    ...pots.filter(p => !p.is_default).sort(byTime),
  ]
}

export default function TodayPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useUser()
  usePageHeader({ brand: { icon: <RiceBowlIcon size={40} />, label: '같이 먹자' } })

  const TODAY = getToday()
  const initialDate = (() => {
    const d = searchParams.get('date')
    if (d) { const parsed = new Date(d); parsed.setHours(0,0,0,0); if (!isNaN(parsed)) return parsed }
    return TODAY
  })()
  const [currentDate, setCurrentDate] = useState(initialDate)
  const [selectedSlot, setSelectedSlot] = useState(getDefaultSlot)
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('lastViewMode') || 'group'
  )
  const [slideDir, setSlideDir] = useState('next')
  // 전환 중 함께 화면에 걸쳐두는 "밀려나가는" 이전 슬롯 — 트랙 애니메이션이 끝나면 null로 비운다.
  const [prevSlot, setPrevSlot] = useState(null)
  const slotTransitionTimer = useRef(null)
  useEffect(() => () => clearTimeout(slotTransitionTimer.current), [])
  const swipeStart = useRef(null)
  // 나의 상태 카드가 스와이프된다는 걸 처음 진입한 사용자에게만 몸으로 알려주는 1회성 넛지.
  const [showSwipeHint, setShowSwipeHint] = useState(() => !localStorage.getItem('statusCardSwipeHintShown'))
  const dismissSwipeHint = () => { localStorage.setItem('statusCardSwipeHintShown', '1'); setShowSwipeHint(false) }

  // 메인 상태 카드 스와이프·서브탭 클릭 공용 슬롯 전환 — 방향에 따라 슬라이드 애니메이션 결정
  const goToSlot = (slot) => {
    if (slot === selectedSlot) return
    setSlideDir(SLOT_ORDER.indexOf(slot) > SLOT_ORDER.indexOf(selectedSlot) ? 'next' : 'prev')
    setPrevSlot(selectedSlot)
    setSelectedSlot(slot)
    rememberSlot(slot)
    clearTimeout(slotTransitionTimer.current)
    slotTransitionTimer.current = setTimeout(() => setPrevSlot(null), 280)
  }

  // 메인 상태 카드 위의 스와이프는 슬롯 전환 전담 — 페이지 레벨 날짜 스와이프로 버블링되지 않도록 막는다.
  // 카드 전체가 탭 영역(편집 팝업 열기)이 된 뒤로는, 드래그가 클릭으로 이어져 편집 팝업이
  // 실수로 열리지 않도록 드래그 여부를 기록해뒀다가 onClick에서 건너뛴다.
  const cardWasDragged = useRef(false)
  const handleCardSwipeStart = (e) => {
    e.stopPropagation()
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const handleCardSwipeEnd = (e) => {
    if (!swipeStart.current) return
    e.stopPropagation()
    const dx = e.clientX - swipeStart.current.x
    const dy = e.clientY - swipeStart.current.y
    swipeStart.current = null
    if (isTextBeingSelected()) return // 텍스트를 드래그로 선택한 경우 — 속도와 무관하게 스와이프로 취급하지 않는다
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    cardWasDragged.current = true
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    const idx = visibleSlots.indexOf(selectedSlot)
    if (idx === -1) return // 보정 useEffect가 아직 selectedSlot을 옮기기 전인 찰나 — 스와이프는 건너뛴다
    if (dx < 0 && idx < visibleSlots.length - 1) goToSlot(visibleSlots[idx + 1])
    else if (dx > 0 && idx > 0) goToSlot(visibleSlots[idx - 1])
  }

  // 날짜 전환 시 페이지 전체가 밀려나는 방향 — next(내일 방향)/prev(어제 방향)
  const [dateSlideDir, setDateSlideDir] = useState('next')
  const goToDate = (updater) => {
    setCurrentDate(d => {
      const next = updater(d)
      setDateSlideDir(next > d ? 'next' : 'prev')
      return next
    })
  }

  // 메인 상태 카드를 제외한 나머지 화면 영역 스와이프 — 전후 날짜로 이동
  const pageSwipeStart = useRef(null)
  const handlePageSwipeStart = (e) => {
    pageSwipeStart.current = { x: e.clientX, y: e.clientY }
  }
  const handlePageSwipeEnd = (e) => {
    if (!pageSwipeStart.current) return
    const dx = e.clientX - pageSwipeStart.current.x
    const dy = e.clientY - pageSwipeStart.current.y
    pageSwipeStart.current = null
    if (isTextBeingSelected()) return // 텍스트를 드래그로 선택한 경우 — 속도와 무관하게 스와이프로 취급하지 않는다
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return
    goToDate(d => addDays(d, dx < 0 ? 1 : -1))
  }
  const [editingSlot, setEditingSlot] = useState(null)   // 팝업 열린 슬롯
  const [draftData, setDraftData] = useState({})          // 팝업 임시 입력값
  const [slotEndPickerOpen, setSlotEndPickerOpen] = useState(false)
  const [slotStartPickerOpen, setSlotStartPickerOpen] = useState(false)
  const [allCollapsed, setAllCollapsed] = useState(false)
  const [collapseKey, setCollapseKey] = useState(0) // 강제 리렌더용

  const [groups, setGroups] = useState([])
  const [membersMap, setMembersMap] = useState({})   // groupId -> members[]
  const [statusesMap, setStatusesMap] = useState({}) // groupId -> statuses[]
  const [potsMap, setPotsMap] = useState({})         // groupId -> pots[]
  const [loading, setLoading] = useState(true)

  // 친구 보기 — 그룹 유무와 무관하게 유저 단위로 한 번만 불러오고(친구 목록), 상태/공유설정은 날짜별로 불러온다.
  const [friends, setFriends] = useState([])
  const [friendStatuses, setFriendStatuses] = useState([])
  // 그룹처럼 그룹 전체가 아니라 친구 개별로 공유 on/off — { [friendId]: boolean }
  const [friendShareSettingsMap, setFriendShareSettingsMap] = useState({})
  useEffect(() => {
    if (!user) return
    getMyFriends().then(setFriends).catch(() => {})
  }, [user])
  // 이미 나와 그룹을 공유하는 친구는 "그룹 보기"에 나오므로 "친구 보기"에는 그룹 없는 친구만 남긴다.
  const groupedUserIds = new Set(Object.values(membersMap).flat().map(m => m.id))
  const ungroupedFriends = friends.filter(f => !groupedUserIds.has(f.id))

  // 내 슬롯 상태: { slot -> { status, time, menu } }
  const [mySlots, setMySlots] = useState({})
  // 날짜 전체 초기화 확인 팝업
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // 메인 상태 카드 우상단 더보기(⋮) 메뉴
  const [showCardMenu, setShowCardMenu] = useState(false)
  // 밥팟 만들기 충돌 팝업
  const [createConflict, setCreateConflict] = useState(null) // { existingPot, groupId, slot }
  // 그룹 단위 공유 설정: { [groupId]: boolean }
  const [shareSettingsMap, setShareSettingsMap] = useState({})
  // 공유 토글 등 즉시 피드백용 짧은 플로팅 토스트
  const [toastMessage, setToastMessage] = useState(null)
  const toastTimer = useRef(null)
  // 밥팟 만들기 원형 버튼 — 탭하면 짧게 회전한 뒤 생성 페이지로 이동
  const [fabSpinning, setFabSpinning] = useState(false)
  // 밥팟 참여하기 다이얼로그
  const [showJoinPot, setShowJoinPot] = useState(false)
  const [joinPotInput, setJoinPotInput] = useState('')
  const [joinPotError, setJoinPotError] = useState('')
  // 그룹 만들기 / 참여하기 다이얼로그
  const [showGroupSetup, setShowGroupSetup] = useState(false)
  // 그룹 순서 편집
  const [editingOrder, setEditingOrder] = useState(false)
  const [localGroups, setLocalGroups] = useState([])
  // 그룹으로 보기 — 순서 편집/모두 접기를 모아둔 더보기(⋮) 메뉴
  const [showViewMenu, setShowViewMenu] = useState(false)
  // 밥팟 나가기 확인 팝업
  const [leavePotConfirm, setLeavePotConfirm] = useState(null) // pot 객체
  const [leavingPot, setLeavingPot] = useState(false)

  const dateStr = toDateStr(currentDate)
  const isToday = currentDate.getTime() === TODAY.getTime()
  const relInfo = getRelativeLabel(currentDate)

  // 사용 슬롯 설정(MyAccountPage)은 순수 디스플레이 선호라, 꺼둔 슬롯이라도 이 날짜에 실제로
  // 뭔가 잡혀 있으면(직접 입력한 상태 또는 밥팟 참여) 예외적으로 탭에 보여준다 — 그래야 끄기
  // 자체가 기존 일정/참여를 숨겨서 접근 불가능하게 만들지 않는다.
  const [myPotSlotsToday, setMyPotSlotsToday] = useState([])
  useEffect(() => {
    if (!user) return
    getMyPotSlotsForDate(user.id, dateStr).then(setMyPotSlotsToday).catch(() => setMyPotSlotsToday([]))
  }, [user, dateStr])

  const activeSlots = user?.active_slots ?? SLOT_ORDER
  const isPastView = currentDate < TODAY
  const usedSlotsToday = new Set([...Object.keys(mySlots), ...myPotSlotsToday])
  const visibleSlots = isPastView ? SLOT_ORDER : SLOT_ORDER.filter(s => activeSlots.includes(s) || usedSlotsToday.has(s))

  // 방금 끈 슬롯이 현재 선택돼 있으면(설정을 바꾸고 돌아온 경우 등) 화면에 남지 않도록 보정
  useEffect(() => {
    if (!isPastView && visibleSlots.length > 0 && !visibleSlots.includes(selectedSlot)) {
      setSelectedSlot(visibleSlots[0])
    }
  }, [isPastView, visibleSlots.join(','), selectedSlot])

  useEffect(() => {
    if (!user || ungroupedFriends.length === 0) { setFriendStatuses([]); setFriendShareSettingsMap({}); return }
    getFriendsStatuses(dateStr).then(setFriendStatuses).catch(() => {})
    getFriendShareSettings(user.id, dateStr).then(rows => {
      const map = {}
      rows.forEach(r => { map[r.friend_id] = r.is_shared })
      setFriendShareSettingsMap(map)
    }).catch(() => {})
  }, [user, dateStr, ungroupedFriends.length])

  // 팝업 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(editingSlot || showResetConfirm || createConflict || showJoinPot || showGroupSetup || leavePotConfirm))
  useEscKey(useCallback(() => {
    if (leavePotConfirm) { setLeavePotConfirm(null); return }
    if (slotEndPickerOpen) { setSlotEndPickerOpen(false); return }
    if (slotStartPickerOpen) { setSlotStartPickerOpen(false); return }
    if (editingSlot) { setEditingSlot(null); return }
    if (showJoinPot) { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError(''); return }
    if (showGroupSetup) { setShowGroupSetup(false); return }
    if (editingOrder) { cancelEditingOrder(); return }
    if (createConflict) { setCreateConflict(null); return }
    if (showResetConfirm) { setShowResetConfirm(false); return }
    if (showCardMenu) { setShowCardMenu(false); return }
    if (showViewMenu) { setShowViewMenu(false); return }
  }, [leavePotConfirm, slotEndPickerOpen, slotStartPickerOpen, editingSlot, showJoinPot, showGroupSetup, editingOrder, createConflict, showResetConfirm, showCardMenu, showViewMenu]))

  useEffect(() => {
    if (isToday) setSearchParams({}, { replace: true })
    else setSearchParams({ date: dateStr }, { replace: true })
  }, [dateStr])

  // 캐시 스냅샷 → 화면 상태 반영
  const applySnapshot = useCallback((snap) => {
    setGroups(snap.groups)
    setMembersMap(snap.membersMap)
    setStatusesMap(snap.statusesMap)
    setPotsMap(snap.potsMap)
    setMySlots(snap.mySlots)
    setShareSettingsMap(snap.shareSettingsMap)
  }, [])

  // 특정 날짜의 보드 데이터를 가져와 캐시에 저장만 한다(화면 상태는 건드리지 않음) —
  // 현재 날짜 로드와 전후 날짜 프리페치가 이 로직을 공유한다.
  const fetchBoardSnapshot = useCallback(async (forDateStr) => {
    const key = `board:${user.id}:${forDateStr}`
    const myGroups = await getMyGroups(user.id)
    if (myGroups.length === 0) {
      const snap = { groups: [], membersMap: {}, statusesMap: {}, potsMap: {}, mySlots: {}, shareSettingsMap: {} }
      setCache(key, snap)
      return snap
    }

    const groupIds = myGroups.map(g => g.id)
    // 보드(멤버/상태/팟) 일괄 + 내 상태 + 공유설정 병렬 — 그룹 수와 무관하게 상수 횟수 쿼리
    const [board, myStatuses, shareRows] = await Promise.all([
      getTodayBoard(groupIds, forDateStr, user.id),
      getMyStatuses(user.id, forDateStr),
      getGroupShareSettings(user.id, forDateStr).catch(() => []),
    ])

    // 기본 밥팟 자동 생성
    await Promise.all(myGroups.map(async g => {
      const configs = await getGroupDefaultPotConfigs(g.id)
      await ensureDefaultPots(g.id, forDateStr, configs)
    }))
    // 자동 생성 후 팟 목록 재조회
    const refreshed = await getTodayBoard(groupIds, forDateStr, user.id)

    // 내 상태 (사용자 의향 원본)
    const slots = {}
    myStatuses.forEach(s => {
      slots[s.slot] = { status: s.status, time: s.meal_time, end_time: s.end_time, menu: s.menu }
    })

    // 그룹 공유 설정
    const settingsMap = {}
    shareRows.forEach(row => { settingsMap[row.group_id] = row.is_shared })

    const snap = {
      groups: myGroups,
      membersMap: board.membersMap,
      statusesMap: board.statusesMap,
      potsMap: refreshed.potsMap,
      mySlots: slots,
      shareSettingsMap: settingsMap,
    }
    setCache(key, snap)
    return snap
  }, [user])

  // 데이터 로드 — 캐시 우선(stale-while-revalidate)
  const loadData = useCallback(async ({ force = false } = {}) => {
    if (!user) return
    const key = `board:${user.id}:${dateStr}`

    // 1) 캐시 확인: 있으면 즉시 반영(스피너 생략). 신선하고 강제 아니면 네트워크 생략.
    const cached = getCache(key)
    if (cached) {
      applySnapshot(cached.data)
      setLoading(false)
      if (!cached.stale && !force) return
    } else {
      setLoading(true)
    }

    // 2) 백그라운드 재검증(또는 최초 로드)
    try {
      const snap = await fetchBoardSnapshot(dateStr)
      applySnapshot(snap)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user, dateStr, applySnapshot, fetchBoardSnapshot])

  useEffect(() => { loadData() }, [loadData])

  // 스와이프로 넘기자마자 화면이 바로 뜨도록, 전후 날짜의 보드 데이터를 미리 캐시에 채워둔다.
  useEffect(() => {
    if (!user) return
    ;[addDays(currentDate, -1), addDays(currentDate, 1)].forEach(d => {
      const adjDateStr = toDateStr(d)
      const key = `board:${user.id}:${adjDateStr}`
      const cached = getCache(key)
      if (cached && !cached.stale) return
      fetchBoardSnapshot(adjDateStr).catch(() => {})
    })
  }, [user, currentDate, fetchBoardSnapshot])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 실시간 구독 — 상태/밥팟 변경 시 영향받는 그룹만, 디바운스로 묶어서 재로드
  const groupsRef = useRef([])
  useEffect(() => { groupsRef.current = groups }, [groups])
  const membersMapRef = useRef({})
  useEffect(() => { membersMapRef.current = membersMap }, [membersMap])

  useEffect(() => {
    if (!user) return
    const key = `board:${user.id}:${dateStr}`

    // 단일 그룹 재조회 (실시간 변경분 반영 + 캐시 무효화)
    const reloadGroup = async (groupId) => {
      const configs = await getGroupDefaultPotConfigs(groupId)
      await ensureDefaultPots(groupId, dateStr, configs) // 다른 기기의 기본팟 설정 변경분 재생성
      const [statuses, pots] = await Promise.all([
        getGroupStatuses(groupId, dateStr, user.id),
        getGroupPots(groupId, dateStr),
      ])
      setStatusesMap(prev => ({ ...prev, [groupId]: statuses }))
      setPotsMap(prev => ({ ...prev, [groupId]: pots }))
      invalidateCache(key) // 라이브 갱신본과 캐시 불일치 방지 → 다음 로드 시 재검증
    }

    // 디바운스 스케줄러 — 연속 변경을 250ms로 묶어 그룹별 1회만 재조회
    let timer = null
    const pending = new Set()
    const scheduleReload = (groupIds) => {
      const ids = groupIds.length ? groupIds : groupsRef.current.map(g => g.id)
      ids.forEach(id => pending.add(id))
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const flush = [...pending]; pending.clear(); timer = null
        flush.forEach(reloadGroup)
      }, 250)
    }

    // 변경된 유저가 속한 내 그룹만 추려냄 (멤버 목록 기준, 모르면 빈 배열→전체 폴백)
    const groupsForUser = (userId) => {
      if (!userId) return []
      const mm = membersMapRef.current
      return groupsRef.current
        .filter(g => (mm[g.id] ?? []).some(m => m.id === userId))
        .map(g => g.id)
    }

    const statusSub = supabase
      .channel(`daily_status_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_status' },
        (payload) => {
          const changedUserId = payload.new?.user_id ?? payload.old?.user_id
          // 내 상태가 바뀐 경우 (다른 기기/팟 참여 등) → mySlots 갱신
          if (changedUserId === user.id) {
            const s = payload.new
            if (s?.slot) {
              setMySlots(prev => ({
                ...prev,
                [s.slot]: s.status
                  ? { status: s.status, time: s.meal_time, end_time: s.end_time, menu: s.menu }
                  : undefined
              }))
            }
          }
          // 변경된 유저가 속한 그룹만 갱신
          scheduleReload(groupsForUser(changedUserId))
        }
      )
      .subscribe((status, err) => {
        if (status !== 'SUBSCRIBED') console.log('[realtime] daily_status', status, err ?? '')
      })

    const potSub = supabase
      .channel(`pot_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_pots' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            scheduleReload([groupId])
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pot_members' },
        (payload) => {
          // pot_members엔 group_id가 없으니 변경 유저가 속한 그룹만 (모르면 전체)
          const changedUserId = payload.new?.user_id ?? payload.old?.user_id
          scheduleReload(groupsForUser(changedUserId))
        }
      )
      .subscribe((status, err) => {
        if (status !== 'SUBSCRIBED') console.log('[realtime] pot_changes', status, err ?? '')
      })

    const defaultPotConfigSub = supabase
      .channel(`default_pot_configs_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_default_pot_configs' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            scheduleReload([groupId])
          }
        }
      )
      .subscribe((status, err) => {
        if (status !== 'SUBSCRIBED') console.log('[realtime] default_pot_configs', status, err ?? '')
      })

    const shareSub = supabase
      .channel(`share_settings_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_share_settings' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            scheduleReload([groupId])
          }
          // 내 설정이 바뀐 경우 shareSettingsMap도 갱신 — group_share_settings는 슬롯 구분 없이
          // 그룹×날짜 단위이므로(row.group_id -> boolean) 오늘 날짜에 대한 변경만 반영한다.
          // 대량 upsert(전후 60일)는 다른 날짜 row에 대해서도 이벤트를 쏘므로 date로 걸러야 한다.
          if (payload.new?.user_id === user.id && payload.new?.date === dateStr) {
            setShareSettingsMap(prev => ({ ...prev, [payload.new.group_id]: payload.new.is_shared }))
          }
        }
      )
      .subscribe((status, err) => {
        if (status !== 'SUBSCRIBED') console.log('[realtime] share_settings', status, err ?? '')
      })

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(statusSub)
      supabase.removeChannel(potSub)
      supabase.removeChannel(defaultPotConfigSub)
      supabase.removeChannel(shareSub)
    }
  }, [user, dateStr])

  // 포그라운드 복귀 시 stale 데이터 갱신
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadData()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadData])

  const addSlotMinutes = (timeStr, minutes) => {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':').map(Number)
    const total = h * 60 + m + minutes
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  const openSlotEditor = (slot) => {
    setEditingSlot(slot)
    const saved = mySlots[slot] ?? {}
    const time = saved.time ?? null
    const savedEnd = saved.end_time ? saved.end_time.slice(0, 5) : null
    setDraftData({ ...saved, end_time: savedEnd ?? (time ? addSlotMinutes(time, 60) : null), duration_minutes: 60 })
    setSlotEndPickerOpen(false)
  }

  const saveSlotEditor = async () => {
    const slot = editingSlot
    setEditingSlot(null)
    if (!draftData.status) {
      // 상태 미설정이면 삭제
      setMySlots(prev => { const n = { ...prev }; delete n[slot]; return n })
      await deleteStatus({ userId: user.id, date: dateStr, slot })
    } else {
      setMySlots(prev => ({ ...prev, [slot]: draftData }))
      await upsertStatus({ userId: user.id, date: dateStr, slot, status: draftData.status, meal_time: draftData.time, end_time: draftData.end_time || null, menu: draftData.menu })
    }
  }

  const clearSlot = async (slot) => {
    setMySlots(prev => { const n = { ...prev }; delete n[slot]; return n })
    setEditingSlot(null)
    await deleteStatus({ userId: user.id, date: dateStr, slot })
  }

  // 팟에서 나가기 (초기화 시 사용) — 방장이면 위임 처리, 기본팟 아니고 마지막 멤버면 삭제
  const leavePotClean = async (pot) => {
    if (pot.is_default) {
      await leavePot(pot.id, user.id)
      return
    }
    const members = pot.pot_members ?? []
    if (members.length <= 1) {
      await deletePot(pot.id)
    } else {
      if (pot.created_by === user.id) {
        const next = members.find(pm => pm.user_id !== user.id)
        if (next) await updatePotCreator(pot.id, next.user_id)
      }
      await leavePot(pot.id, user.id)
    }
  }

  const resetSlot = async (slot) => {
    const myPotsInSlot = Object.values(potsMap).flat()
      .filter(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
    await Promise.all(myPotsInSlot.map(leavePotClean))
    await deleteStatus({ userId: user.id, date: dateStr, slot })
    setMySlots(prev => { const n = { ...prev }; delete n[slot]; return n })
    loadData({ force: true })
  }

  const resetAll = async () => {
    setShowResetConfirm(false)
    const allMyPots = Object.values(potsMap).flat()
      .filter(p => p.pot_members?.some(pm => pm.user_id === user.id))
    await Promise.all(allMyPots.map(leavePotClean))
    await Promise.all(
      SLOT_ORDER.filter(slot => mySlots[slot]).map(slot => deleteStatus({ userId: user.id, date: dateStr, slot }))
    )
    setMySlots({})
    loadData({ force: true })
  }

  const handleLeavePot = async () => {
    if (!leavePotConfirm || leavingPot) return
    setLeavingPot(true)
    try {
      await leavePotWithCleanup(leavePotConfirm.id, user.id)
      setLeavePotConfirm(null)
      loadData({ force: true })
    } catch (e) {
      console.error(e)
    } finally {
      setLeavingPot(false)
    }
  }

  const startEditingOrder = () => {
    setLocalGroups([...groups])
    setEditingOrder(true)
  }

  const moveGroup = (idx, dir) => {
    setLocalGroups(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const saveGroupOrder = async () => {
    const orders = localGroups.map((g, i) => ({ groupId: g.id, sort_order: i }))
    await updateGroupOrder(user.id, orders)
    setEditingOrder(false)
    invalidateCache(`board:${user.id}:`, { prefix: true })
    loadData({ force: true })
  }

  const cancelEditingOrder = () => {
    setEditingOrder(false)
    setLocalGroups([])
  }

  const handleJoinPotByCode = async () => {
    const raw = joinPotInput.trim()
    if (!raw) { setJoinPotError('초대 코드를 입력해주세요'); return }
    // 6자리 초대코드 또는 링크(/pot/UUID) 모두 허용
    const linkMatch = raw.match(/\/pot\/([0-9a-f-]{36})/i)
    if (linkMatch) {
      setShowJoinPot(false); setJoinPotInput(''); setJoinPotError('')
      navigate(`/pot/${linkMatch[1]}`)
      return
    }
    const pot = await getPotByInviteCode(raw)
    if (!pot) { setJoinPotError('코드를 다시 확인해주세요'); return }
    setShowJoinPot(false); setJoinPotInput(''); setJoinPotError('')
    navigate(`/pot/${pot.id}`)
  }

  const handleCreatePot = (groupId, slot) => {
    const myPotsInSlot = Object.values(potsMap).flat()
      .filter(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
    if (myPotsInSlot.length > 0) {
      setCreateConflict({ existingPot: myPotsInSlot[0], groupId, slot })
    } else {
      navigate(`/create?group_id=${groupId}&slot=${slot}&date=${dateStr}`)
    }
  }

  // 원형 밥팟 만들기 버튼 — 짧게 한 바퀴 돌고 나서 생성 흐름(또는 충돌 팝업)으로 넘어간다
  const handleFabCreatePot = () => {
    if (fabSpinning || groups.length === 0) return
    setFabSpinning(true)
    setTimeout(() => {
      setFabSpinning(false)
      handleCreatePot(groups[0].id, selectedSlot)
    }, 320)
  }

  const applyShare = (groupId, isShared) => {
    setShareSettingsMap(prev => ({ ...prev, [groupId]: isShared }))
  }

  // 짧게 떴다 사라지는 플로팅 토스트 — 연달아 호출되면 이전 타이머를 취소하고 다시 보여준다
  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToastMessage(message)
    toastTimer.current = setTimeout(() => setToastMessage(null), 2200)
  }, [])

  // 공유/비공유 토글 — '오늘만 적용' 없이 항상 해당 날짜 포함 전후 모든 날짜에 적용
  const handleToggleShare = async (groupId, isShared) => {
    applyShare(groupId, isShared)
    showToast(isShared ? '내 상태를 그룹에 공유해요' : '내 상태 공유를 중지해요')
    try { await setGroupShareSettingBulk(user.id, groupId, dateStr, isShared) } catch {}
  }

  const applyFriendShare = (friendId, isShared) => {
    setFriendShareSettingsMap(prev => ({ ...prev, [friendId]: isShared }))
  }

  // 그룹과 달리 친구는 개별 단위로 켜고 끈다 — 같은 방식으로 항상 전후 60일씩 적용
  const handleToggleFriendShare = async (friendId, isShared) => {
    applyFriendShare(friendId, isShared)
    showToast(isShared ? '이 친구에게 내 상태를 공유해요' : '이 친구에게 내 상태 공유를 멈춰요')
    try { await setFriendShareSettingBulk(user.id, friendId, dateStr, isShared) } catch {}
  }

  // 슬롯별 현재 상태 요약 — 메인 표시창 / 서브 표시창 공용
  const getSlotInfo = (slot) => {
    const data = mySlots[slot]
    const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
    const isPastDate = currentDate < TODAY

    const myPotsInSlot = Object.values(potsMap).flat()
      .filter(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
      .sort((a, b) => (a.meal_time ?? '').localeCompare(b.meal_time ?? ''))
    const potCount = myPotsInSlot.length
    const earliestPot = myPotsInSlot[0]
    const isInPot = potCount > 0
    const inPotExpired = isInPot && isPotTimeExpired(dateStr, earliestPot?.end_time)
    const lockedLabel = isInPot ? getJoinedStatusLabel(dateStr, earliestPot?.meal_time, earliestPot?.end_time, (earliestPot?.pot_members?.length ?? 0) === 1) : null
    const lockedOpt = isInPot ? { ...SLOT_STATUS_OPTIONS.find(o => o.key === (inPotExpired ? '참여완료' : '참여중')), label: lockedLabel } : null
    const displayOpt = lockedOpt ?? opt

    let timeStr = null, desc = null
    if (isInPot) {
      timeStr = `${earliestPot.meal_time?.slice(0, 5) ?? ''}${earliestPot.end_time ? ` ~ ${earliestPot.end_time.slice(0, 5)}` : ''}`
      const groupName = groups.find(g => g.id === earliestPot.group_id)?.name
      desc = groupName ? `${groupName}에서 ${lockedLabel}` : `${earliestPot.title} 밥팟에 ${inPotExpired ? '참여 완료' : '참여 중'}`
    } else if (data?.time) {
      timeStr = `${data.time.slice(0, 5)}${data.end_time ? ` ~ ${data.end_time.slice(0, 5)}` : ''}`
      desc = data?.menu ?? null
    }

    return {
      key: displayOpt?.key ?? null,
      label: displayOpt?.label ?? null,
      color: displayOpt?.color ?? 'var(--warm-500)',
      bg: isPastDate ? 'var(--warm-100)' : (displayOpt?.bg ?? 'var(--color-surface)'),
      border: isPastDate ? 'var(--warm-300)' : (displayOpt?.border ?? 'var(--color-border)'),
      timeStr,
      desc,
      isInPot,
      isDuplicatePot: potCount > 1,
      isPastDate,
    }
  }

  if (loading) {
    return <div style={styles.loadingPage}><RiceBowlIcon size={72} /><br /><span style={{ fontSize: 14, marginTop: 8 }}>불러오는 중...</span></div>
  }


  return (
    <div style={styles.wrap}>
    <div
      style={styles.page}
      onPointerDown={handlePageSwipeStart}
      onPointerUp={handlePageSwipeEnd}
      onPointerCancel={() => { pageSwipeStart.current = null }}
    >
      {/* 날짜 네비 — 헤더 바로 아래에 sticky 고정 */}
      <div
        style={{ ...styles.dateNav, top: 'calc(var(--header-height) + var(--safe-area-inset-top))', touchAction: 'pan-y' }}
      >
        <button style={styles.navBtn} onClick={() => goToDate(d => addDays(d, -1))}>
          <svg width="7" height="12" viewBox="0 0 9 15" fill="none"><path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          <span style={{ ...styles.relBadge, background: REL_TONE_FILL[relInfo.tone], color: REL_TONE_TEXT[relInfo.tone] }}>{relInfo.label}</span>
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => goToDate(() => TODAY)}>오늘로</button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => goToDate(d => addDays(d, 1))}>
          <svg width="7" height="12" viewBox="0 0 9 15" fill="none"><path d="M1.5 1.5L7.5 7.5L1.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* 날짜 전환 시 페이지 콘텐츠 전체가 방향에 맞춰 슬라이드-인 — 날짜만 바뀌고 끝나는
          허전함을 없애는 전환 연출. key가 dateStr이라 날짜가 바뀔 때마다 애니메이션이 재생된다. */}
      <div
        key={dateStr}
        style={{
          display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
          animation: `${dateSlideDir === 'next' ? 'pageSlideNext' : 'pageSlidePrev'} 0.22s ease-out`,
        }}
      >
      {/* 나의 상태 — 독립된 핵심 카드 하나 + 슬림한 슬롯 네비게이션 */}
      {(() => {
        const sectionInfo = getSlotInfo(selectedSlot)
        const sectionTheme = sectionInfo.isPastDate
          ? { bg: '#EFE6D6' }
          : SLOT_THEME[selectedSlot]
        const prevInfo = prevSlot ? getSlotInfo(prevSlot) : null
        // resetAll이 지우는 대상(명시적 상태 또는 참여 중인 밥팟)이 하나라도 있을 때만 메뉴 노출
        const hasResettable = SLOT_ORDER.some(s => mySlots[s]) || Object.values(potsMap).flat().some(p => p.pot_members?.some(pm => pm.user_id === user.id))
        // 카드 한 장을 그린다 — paired=true면 트랙 안에서 옆 카드와 나란히 절반씩 차지한다.
        // 카드 전체가 탭 영역 — 클릭하면 해당 슬롯 편집 팝업을 연다. 더보기(⋮) 메뉴 클릭은 별도로 막는다.
        const renderStatusCard = (slot, info, paired) => (
          <div
            key={slot}
            style={{
              ...styles.mainStatusCard, width: undefined, minWidth: 0, flex: paired ? '0 0 50%' : '0 0 100%',
              cursor: info.isPastDate ? 'default' : 'pointer',
            }}
            onClick={() => {
              if (cardWasDragged.current) { cardWasDragged.current = false; return }
              if (!info.isPastDate) openSlotEditor(slot)
            }}
          >
            <div style={styles.mainStatusHeaderRow}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={styles.mainStatusTitle}>내 {slot}</span>
                {info.isDuplicatePot && <span style={styles.duplicatePotBadge}>중복참여</span>}
              </div>
              {!info.isPastDate && hasResettable && (
                <div style={{ position: 'relative' }}>
                  <button
                    style={styles.mainStatusMenuBtn}
                    aria-label="더보기"
                    onClick={(e) => { e.stopPropagation(); setShowCardMenu(v => (slot === selectedSlot ? !v : true)) }}
                  >⋮</button>
                  {showCardMenu && slot === selectedSlot && (
                    <>
                      <div style={styles.cardMenuOverlay} onClick={(e) => { e.stopPropagation(); setShowCardMenu(false) }} />
                      <div style={styles.cardMenuDropdown} onClick={e => e.stopPropagation()}>
                        <button
                          style={styles.cardMenuItem}
                          onClick={() => { setShowCardMenu(false); setShowResetConfirm(true) }}
                        >
                          <UndoIcon size={13} strokeWidth={2.2} /> {getRelativeLabel(currentDate).label} 상태 초기화
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={styles.mainStatusBody}>
              <div style={{ ...styles.mainStatusIconWrap, opacity: info.isPastDate ? 0.6 : 1 }}>
                {/* 기본은 슬롯 아이콘, open/skip/closed처럼 사용자가 직접 고른 상태일 때만 상태 아이콘으로 바꾼다.
                    참여중/참여완료(밥팟 참여)는 직접 고른 상태가 아니라 슬롯 그대로 유지한다.
                    이 메인 카드는 흐림 효과(muted)를 쓰지 않는다 — 슬롯 탭과 달리 항상 또렷하게 보여준다. */}
                {info.key === 'open' || info.key === 'skip' || info.key === 'closed'
                  ? <StatusIcon statusKey={info.key} size={112} style={styles.mainStatusIconImg} />
                  : <SlotIcon slot={slot} size={112} style={styles.mainStatusIconImg} />}
              </div>
              <div style={styles.mainStatusTextCol}>
                {info.label ? (
                  <>
                    <span style={{ ...styles.mainStatusLabel, color: info.color }}>{info.label}</span>
                    {STATUS_SUBTEXT[info.key] && <span style={styles.mainStatusSub}>{STATUS_SUBTEXT[info.key](slot, getRelativeLabel(currentDate).label)}</span>}
                    {info.timeStr && <span style={styles.mainStatusMeta}>{info.timeStr}</span>}
                    {info.desc && <span style={styles.mainStatusDesc}>{info.desc}</span>}
                  </>
                ) : (
                  <span style={styles.mainStatusEmpty}>
                    {info.isPastDate ? '기록 없음' : statusSubtextEmpty(slot, getRelativeLabel(currentDate).label, dateStr)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
        const trackCards = prevSlot
          ? (slideDir === 'next'
              ? [renderStatusCard(prevSlot, prevInfo, true), renderStatusCard(selectedSlot, sectionInfo, true)]
              : [renderStatusCard(selectedSlot, sectionInfo, true), renderStatusCard(prevSlot, prevInfo, true)])
          : [renderStatusCard(selectedSlot, sectionInfo, false)]
        return (
      <div style={{ ...styles.myStatusSection, background: sectionTheme.bg }}>
        {/* 핵심 카드: 항상 흰 배경, 상태는 텍스트 색상으로만 강조 */}
        {/* 바깥 래퍼: 스와이프 제스처 캡처 + 최초 1회 넛지 전담. 슬롯이 바뀌어도 리마운트되지
            않아야 넛지 애니메이션이 재생 중 다시 트리거되지 않는다. */}
        <div
          style={{ touchAction: 'pan-y', animation: showSwipeHint ? 'statusCardSwipeHint 0.9s ease-in-out 0.4s' : undefined }}
          onPointerDown={handleCardSwipeStart}
          onPointerUp={handleCardSwipeEnd}
          onPointerCancel={() => { swipeStart.current = null }}
          onAnimationEnd={dismissSwipeHint}
        >
          {/* 뷰포트: 트랙 폭(전환 중엔 200%)만큼 넘치는 부분을 가려, 카드 한 장 너비만 보이게 한다. */}
          <div style={{ overflow: 'hidden', borderRadius: 16 }}>
            {/* 트랙: 전환 중엔 이전 카드 + 다음 카드를 나란히 붙여 렌더링하고, 트랙 자체를
                translateX로 밀어 이전 카드가 빠져나가는 동안 다음 카드가 뒤따라 들어오게 한다. */}
            <div
              key={prevSlot ? `${prevSlot}->${selectedSlot}` : selectedSlot}
              style={{
                display: 'flex',
                width: prevSlot ? '200%' : '100%',
                pointerEvents: prevSlot ? 'none' : 'auto',
                animation: prevSlot ? `${slideDir === 'next' ? 'slotTrackNext' : 'slotTrackPrev'} 0.26s ease-out forwards` : undefined,
              }}
            >
              {trackCards}
            </div>
          </div>
        </div>

        {/* 슬롯 네비게이션 — 사용 설정된 슬롯만 화면 폭 안에 한 번에 표시(지난 날짜는 6개 전부).
            아이콘 존은 중립색, 하단 라벨 띠가 상태색을 담당. 고를 게 하나뿐이면 선택 UI 자체가 의미 없어 숨긴다. */}
        {visibleSlots.length > 1 && (
        <div style={styles.subSlotRow}>
          {visibleSlots.map(slot => {
            const info = getSlotInfo(slot)
            const isSelected = selectedSlot === slot
            return (
              <button
                key={slot}
                style={{
                  ...styles.subSlotBtn,
                  background: '#fff',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  borderWidth: isSelected ? 2 : 1.5,
                  opacity: info.isPastDate ? 0.65 : 1,
                }}
                onClick={() => goToSlot(slot)}
              >
                <div style={styles.subSlotIconZone}>
                  {/* 아이콘 색은 선택 여부와 무관하게 "데이터 있음" 기준으로만 켠다 — 선택 안 된 슬롯도
                      상태/참여(참여완료 포함)가 있으면 바로 눈에 띄고, 선택했더라도 상태가 없으면 흐릿하게 남는다. */}
                  {info.key === 'open' || info.key === 'skip' || info.key === 'closed'
                    ? <StatusIcon statusKey={info.key} muted={!info.label} style={styles.subSlotIconImg} />
                    : <SlotIcon slot={slot} muted={!info.label} style={styles.subSlotIconImg} />}
                </div>
                <div style={{ ...styles.subSlotLabelZone, background: info.label ? info.bg : 'var(--color-surface-2)' }}>
                  <span style={{ ...styles.subSlotLabel, color: isSelected ? 'var(--color-primary-text)' : (info.label ? info.color : 'var(--warm-600)') }}>{slot}</span>
                </div>
              </button>
            )
          })}
        </div>
        )}
      </div>
        )
      })()}

      {/* 그룹별 보기 영역 전체 — 흰색 풀블리드 블록으로 상단 '내 상태' 영역과 경계를 분리 */}
      <div style={styles.lowerSection}>
        {/* 그룹별/밥팟별 보기 전환 — 하나의 세그먼트 컨트롤. 그룹이 없어도 그룹 없는 친구가 있으면 노출 */}
        {(groups.length > 0 || ungroupedFriends.length > 0) && (
          <div style={styles.viewModeTabs}>
            <button
              style={{ ...styles.viewModeTab, ...(viewMode === 'pot' ? styles.viewModeTabActive : {}) }}
              onClick={() => { setViewMode('pot'); localStorage.setItem('lastViewMode', 'pot') }}
            >밥팟 보기</button>
            <button
              style={{ ...styles.viewModeTab, ...(viewMode === 'group' ? styles.viewModeTabActive : {}) }}
              onClick={() => { setViewMode('group'); localStorage.setItem('lastViewMode', 'group') }}
            >그룹 보기</button>
            {ungroupedFriends.length > 0 && (
              <button
                style={{ ...styles.viewModeTab, ...(viewMode === 'friend' ? styles.viewModeTabActive : {}) }}
                onClick={() => { setViewMode('friend'); localStorage.setItem('lastViewMode', 'friend') }}
              >친구 보기</button>
            )}
          </div>
        )}

        {/* 오늘 열린 밥팟 — 목록이 메인 콘텐츠, 보조 컨트롤은 더보기(⋮) 메뉴로 묶어서 우측에 작게 */}
        <div style={styles.sectionTitleRow}>
          <div style={styles.sectionTitle}>{viewMode === 'group' ? `${selectedSlot} 현황` : viewMode === 'friend' ? `${selectedSlot} 친구 현황` : `${getRelativeLabel(currentDate).label} 열린 밥팟`}</div>
          {viewMode === 'group' && !editingOrder && (
            <div style={{ position: 'relative' }}>
              <button style={styles.viewMenuBtn} aria-label="더보기" onClick={() => setShowViewMenu(v => !v)}>
                <MoreHorizontalIcon size={18} />
              </button>
              {showViewMenu && (
                <>
                  <div style={styles.cardMenuOverlay} onClick={() => setShowViewMenu(false)} />
                  <div style={styles.cardMenuDropdown}>
                    {groups.length > 1 && (
                      <button style={styles.cardMenuItem} onClick={() => { setShowViewMenu(false); startEditingOrder() }}>
                        순서 편집
                      </button>
                    )}
                    <button
                      style={styles.cardMenuItem}
                      onClick={() => { setShowViewMenu(false); setAllCollapsed(v => !v); setCollapseKey(k => k + 1) }}
                    >
                      {allCollapsed ? '모두 펼치기' : '모두 접기'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {groups.length === 0 && viewMode !== 'friend' && (
          <div style={styles.emptyGroup}>
            <UsersIcon size={36} strokeWidth={1.6} style={{ color: 'var(--color-text-muted)' }} />
            <div style={{ fontWeight: 700 }}>아직 그룹이 없어요</div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center', lineHeight: 1.6 }}>
              그룹을 만들거나 초대 코드로 참여하면<br />팀원 상태를 여기서 볼 수 있어요.
            </p>
            <button style={styles.emptyBtn} onClick={() => setShowGroupSetup(true)}>
              그룹 참여하기 / 만들기
            </button>
          </div>
        )}
        <div key={viewMode} className="view-mode-content" style={styles.viewModeContent}>
          {viewMode === 'group' ? (() => {
            // 내가 이 슬롯의 어느 그룹 팟에든 참여 중인지 전체 기준으로 계산
            const amIInAnyPot = Object.values(potsMap).flat()
              .some(p => p.slot === selectedSlot && p.pot_members?.some(pm => pm.user_id === user.id))

            return groups.map(group => {
              const members = membersMap[group.id] ?? []
              const statuses = statusesMap[group.id] ?? []
              const pots = sortPots((potsMap[group.id] ?? []).filter(p => p.slot === selectedSlot))
              return (
                <GroupSlotCard
                  key={group.id}
                  group={group}
                  slot={selectedSlot}
                  members={members}
                  statuses={statuses}
                  pots={pots}
                  myUserId={user.id}
                  mySlotData={mySlots[selectedSlot]}
                  isShared={shareSettingsMap[group.id] ?? true}
                  onToggleShare={(isShared) => handleToggleShare(group.id, isShared)}
                  onShowToast={showToast}
                  amIInAnyPot={amIInAnyPot}
                  allCollapsed={allCollapsed}
                  collapseKey={collapseKey}
                  dateStr={dateStr}
                  onNavigate={navigate}
                  onRefresh={() => loadData({ force: true })}
                />
              )
            })
          })() : viewMode === 'friend' ? (
            <FriendSlotCard
              friends={ungroupedFriends}
              statuses={friendStatuses}
              slot={selectedSlot}
              myUserId={user.id}
              dateStr={dateStr}
              shareSettingsMap={friendShareSettingsMap}
              onToggleShare={handleToggleFriendShare}
              onShowToast={showToast}
            />
          ) : (
            <AllPotsView groups={groups} potsMap={potsMap} myUserId={user.id} onNavigate={navigate} dayLabel={getRelativeLabel(currentDate).label} />
          )}
        </div>

        <div style={styles.secondaryLinkRow}>
          <button style={styles.secondaryLinkBtn} onClick={() => setShowGroupSetup(true)}>그룹 참여하기 / 만들기</button>
          <span style={styles.secondaryLinkDivider}>·</span>
          <button style={styles.secondaryLinkBtn} onClick={() => setShowJoinPot(true)}>초대 코드로 밥팟 참여</button>
        </div>
      </div>
      </div>
    </div>

    {/* 주요 CTA — 밥팟별/그룹별 보기 공통 원형 플로팅 버튼 */}
    {groups.length > 0 && (
      <div style={styles.fabWrap}>
        <button style={styles.fabBtn} onClick={handleFabCreatePot} aria-label="밥팟 만들기">
          <span style={{ ...styles.fabIcon, animation: fabSpinning ? 'fabSpin 0.32s ease' : 'none' }}>+</span>
        </button>
      </div>
    )}

    {toastMessage && (
      <div style={styles.floatingToast}>{toastMessage}</div>
    )}

    {createConflict && (
      <div style={styles.overlay}>
        <div style={styles.dialog}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={styles.dialogTitle}>이미 참여 중인 밥팟이 있어요</div>
          <p style={styles.dialogDesc}>
            {createConflict.slot} 슬롯에{'\n'}
            <strong>{createConflict.existingPot.meal_time?.slice(0,5)} {createConflict.existingPot.title}</strong>{'\n'}
            에 이미 참여 중이에요.
          </p>
          <div style={styles.dialogBtns}>
            <button style={styles.dialogBtnPrimary} onClick={async () => {
              const pot = createConflict.existingPot
              const { groupId, slot } = createConflict
              setCreateConflict(null)
              await leavePotWithCleanup(pot.id, user.id)
              navigate(`/create?group_id=${groupId}&slot=${slot}&date=${dateStr}`)
            }}>
              기존 밥팟 나가고 새 팟 열기
            </button>
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} onClick={() => {
              const { groupId, slot } = createConflict
              setCreateConflict(null)
              navigate(`/create?group_id=${groupId}&slot=${slot}&date=${dateStr}`)
            }}>
              중복으로 새 팟 열기
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => setCreateConflict(null)}>취소</button>
          </div>
        </div>
      </div>
    )}

    {editingSlot && (
      <div style={styles.overlay} onClick={() => setEditingSlot(null)}>
        <div style={styles.slotPopup} onClick={e => e.stopPropagation()}>
          <div style={styles.slotPopupTitle}>{editingSlot}</div>

          {/* 밥팟 참여 중인 경우: 팟 정보 표시 (읽기 전용) */}
          {(() => {
            const myPotsInSlot = Object.values(potsMap).flat()
              .filter(p => p.slot === editingSlot && p.pot_members?.some(pm => pm.user_id === user.id))
              .sort((a, b) => (a.meal_time ?? '').localeCompare(b.meal_time ?? ''))
            if (myPotsInSlot.length === 0) return null
            const inPotExpired = isPotTimeExpired(dateStr, myPotsInSlot[0].end_time)
            const lockedOpt = { ...SLOT_STATUS_OPTIONS.find(o => o.key === (inPotExpired ? '참여완료' : '참여중')), label: getJoinedStatusLabel(dateStr, myPotsInSlot[0].meal_time, myPotsInSlot[0].end_time, (myPotsInSlot[0].pot_members?.length ?? 0) === 1) }
            return (
              <>
                <div style={styles.potInfoBanner}>
                  <span style={{ fontSize: 22 }}>{lockedOpt.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: lockedOpt.color, fontSize: 14 }}>{lockedOpt.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>밥팟에 참여 중이에요</div>
                  </div>
                </div>
                {myPotsInSlot.map(pot => {
                  const groupName = groups.find(g => g.id === pot.group_id)?.name ?? ''
                  const timeStr = pot.meal_time
                    ? pot.end_time
                      ? `${pot.meal_time.slice(0, 5)} ~ ${pot.end_time.slice(0, 5)}`
                      : pot.meal_time.slice(0, 5)
                    : null
                  return (
                    <div key={pot.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={styles.potInfoCard}>
                        {groupName && (
                          <div style={styles.potInfoRow}>
                            <span style={styles.potInfoLabel}>그룹</span>
                            <span style={styles.potInfoValue}>{groupName}</span>
                          </div>
                        )}
                        <div style={styles.potInfoRow}>
                          <span style={styles.potInfoLabel}>밥팟</span>
                          <span style={styles.potInfoValue}>{pot.title}</span>
                        </div>
                        {timeStr && (
                          <div style={styles.potInfoRow}>
                            <span style={styles.potInfoLabel}>시간</span>
                            <span style={styles.potInfoValue}>{timeStr}</span>
                          </div>
                        )}
                        <div style={styles.potInfoRow}>
                          <span style={styles.potInfoLabel}>인원</span>
                          <span style={styles.potInfoValue}>{pot.pot_members?.length ?? 0}명 참여 중</span>
                        </div>
                      </div>
                      {currentDate >= TODAY && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button style={styles.potLeaveBtn} onClick={() => setLeavePotConfirm(pot)}>
                            밥팟 나가기
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button style={styles.slotPopupCancel} onClick={() => setEditingSlot(null)}>닫기</button>
              </>
            )
          })()}

          {/* 팟 참여 중이 아닌 경우: 상태 선택 */}
          {(() => {
            const isInPot = Object.values(potsMap).flat()
              .some(p => p.slot === editingSlot && p.pot_members?.some(pm => pm.user_id === user.id))
            if (isInPot) return null

            // 지난 날짜: 입력된 상태를 열람만 (편집 불가)
            const isPastDate = currentDate < TODAY
            if (isPastDate) {
              const opt = SLOT_STATUS_OPTIONS.find(o => o.key === draftData.status)
              return (
                <>
                  {opt ? (
                    <>
                      <div style={styles.potInfoBanner}>
                        <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: opt.color, fontSize: 14 }}>{opt.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>지난 날짜는 열람만 가능해요</div>
                        </div>
                      </div>
                      {(draftData.time || draftData.menu) && (
                        <div style={styles.potInfoCard}>
                          {draftData.time && (
                            <div style={styles.potInfoRow}>
                              <span style={styles.potInfoLabel}>시간</span>
                              <span style={styles.potInfoValue}>{draftData.time.slice(0, 5)}{draftData.end_time ? `~${draftData.end_time.slice(0, 5)}` : ''}</span>
                            </div>
                          )}
                          {draftData.menu && (
                            <div style={styles.potInfoRow}>
                              <span style={styles.potInfoLabel}>메뉴</span>
                              <span style={styles.potInfoValue}>{draftData.menu}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={styles.potInfoBanner}>
                      <span style={{ fontSize: 22 }}>○</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>미설정</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>이 슬롯에 입력된 상태가 없어요</div>
                      </div>
                    </div>
                  )}
                  <button style={styles.slotPopupCancel} onClick={() => setEditingSlot(null)}>닫기</button>
                </>
              )
            }

            return <>

          {/* 상태 선택 */}
          <div style={styles.slotPopupStatusGrid}>
            <button
              style={{
                ...styles.slotPopupStatusBtn,
                borderColor: !draftData.status ? 'var(--color-primary)' : 'var(--color-border)',
                background: !draftData.status ? 'var(--color-primary-a07)' : 'var(--color-surface-2)',
                color: !draftData.status ? 'var(--color-primary-text)' : 'var(--color-text-muted)',
              }}
              onClick={() => setDraftData(prev => ({ ...prev, status: undefined }))}
            >
              <StatusIcon statusKey={undefined} size={40} />
              <span style={styles.slotPopupStatusTextCol}>
                <span style={{ ...styles.slotPopupStatusLabel, fontWeight: !draftData.status ? 700 : 500 }}>미설정</span>
              </span>
            </button>
            {SLOT_STATUS_OPTIONS.filter(o => o.selectable).map(o => (
              <button
                key={o.key}
                style={{
                  ...styles.slotPopupStatusBtn,
                  borderColor: draftData.status === o.key ? o.color : 'var(--color-border)',
                  background: draftData.status === o.key ? o.color + '15' : 'var(--color-surface-2)',
                  color: draftData.status === o.key ? o.color : 'var(--color-text)',
                }}
                onClick={() => setDraftData(prev => ({ ...prev, status: o.key }))}
              >
                <StatusIcon statusKey={o.key} size={40} />
                <span style={styles.slotPopupStatusTextCol}>
                  <span style={{ ...styles.slotPopupStatusLabel, fontWeight: draftData.status === o.key ? 700 : 500 }}>{o.label}</span>
                  <span style={styles.slotPopupStatusSub}>{STATUS_BTN_SUBTEXT[o.key]}</span>
                </span>
              </button>
            ))}
          </div>

          {/* 시간 / 메모 — 상태를 고른 뒤에만 노출. 패스는 시간/메모가 의미 없어 계속 숨김 */}
          {(draftData.status === 'open' || draftData.status === 'closed') && (() => {
            const timeOn = !!draftData.time
            const dur = draftData.duration_minutes ?? 60
            const setSlotDuration = (min) => setDraftData(prev => ({
              ...prev,
              duration_minutes: min,
              end_time: min > 0 ? addSlotMinutes(prev.time, min) : prev.end_time,
            }))
            return (
              <div style={styles.slotPopupFields}>
                {/* 시간 행 — 프리셋 버튼 */}
                <div style={{ ...styles.slotPopupFieldWrap }}>
                  <div style={styles.slotPopupFieldLabel}>시작시간</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(SLOT_TIME_PRESETS[editingSlot] ?? []).map(t => {
                      const isActive = draftData.time?.startsWith(t) ?? false
                      return (
                        <button
                          key={t}
                          style={{
                            padding: '6px 11px',
                            border: 'none',
                            borderRadius: 'var(--radius-full)',
                            background: isActive ? 'var(--color-selected)' : 'var(--color-chip-bg)',
                            color: isActive ? 'var(--color-on-selected)' : 'var(--color-text-muted)',
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 500,
                            cursor: 'pointer',
                          }}
                          onClick={() => setDraftData(prev => ({
                            ...prev,
                            time: t + ':00',
                            end_time: (prev.duration_minutes ?? 0) > 0 ? addSlotMinutes(t + ':00', prev.duration_minutes) : prev.end_time,
                          }))}
                        >{t}</button>
                      )
                    })}
                    {/* 직접 설정 */}
                    {(() => {
                      const isCustom = timeOn && !(SLOT_TIME_PRESETS[editingSlot] ?? []).some(t => draftData.time?.startsWith(t))
                      return (
                        <button
                          type="button"
                          style={{
                            padding: '6px 11px',
                            border: 'none',
                            borderRadius: 'var(--radius-full)',
                            background: isCustom ? 'var(--color-selected)' : 'var(--color-chip-bg)',
                            color: isCustom ? 'var(--color-on-selected)' : 'var(--color-text-muted)',
                            fontSize: 12,
                            fontWeight: isCustom ? 700 : 500,
                            cursor: 'pointer',
                          }}
                          onClick={() => setSlotStartPickerOpen(true)}
                        >
                          {isCustom && draftData.time ? draftData.time.slice(0, 5) : '직접 설정'}
                        </button>
                      )
                    })()}
                    {/* 시간 없음 버튼 */}
                    <button
                      style={{
                        padding: '6px 11px',
                        border: 'none',
                        borderRadius: 'var(--radius-full)',
                        background: !timeOn ? 'var(--color-selected)' : 'var(--color-chip-bg)',
                        color: !timeOn ? 'var(--color-on-selected)' : 'var(--color-text-muted)',
                        fontSize: 12,
                        fontWeight: !timeOn ? 700 : 500,
                        cursor: 'pointer',
                      }}
                      onClick={() => setDraftData(prev => ({ ...prev, time: undefined, end_time: null }))}
                    >미정</button>
                  </div>
                </div>
                {/* 종료시간 행 — 시간 ON일 때 */}
                {timeOn && (
                  <div style={{ ...styles.slotPopupFieldWrap, marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={styles.slotPopupFieldLabel}>종료시간</div>
                      <button
                        type="button"
                        style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer' }}
                        onClick={() => setSlotEndPickerOpen(v => !v)}
                      >
                        {draftData.end_time || '--:--'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                      {[{ min: 30, label: '30분' }, { min: 60, label: '1시간' }, { min: 90, label: '1.5시간' }, { min: 120, label: '2시간' }].map(o => (
                        <button key={o.min}
                          style={{ flex: 1, padding: '4px 4px', border: 'none', borderRadius: 'var(--radius-full)', background: dur === o.min ? 'var(--color-selected)' : 'var(--color-chip-bg)', fontSize: 11, cursor: 'pointer', color: dur === o.min ? 'var(--color-on-selected)' : 'var(--color-text-muted)', fontWeight: dur === o.min ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={() => setSlotDuration(o.min)}>
                          {o.label}
                        </button>
                      ))}
                      <button
                        style={{ flex: 1, padding: '4px 4px', border: 'none', borderRadius: 'var(--radius-full)', background: dur === 0 ? 'var(--color-selected)' : 'var(--color-chip-bg)', fontSize: 11, cursor: 'pointer', color: dur === 0 ? 'var(--color-on-selected)' : 'var(--color-text-muted)', fontWeight: dur === 0 ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
                        onClick={() => { setSlotDuration(0); setSlotEndPickerOpen(true) }}>
                        직접입력
                      </button>
                    </div>
                  </div>
                )}
                {/* 메모 행 */}
                <div style={{ ...styles.slotPopupFieldWrap, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...styles.slotPopupFieldLabel, flexShrink: 0 }}>메모</div>
                    <input
                      style={{ ...styles.slotPopupInput, flex: 1 }}
                      placeholder="메모를 입력하세요"
                      value={draftData.menu ?? ''}
                      onChange={e => setDraftData(prev => ({ ...prev, menu: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveSlotEditor() }}
                      maxLength={20}
                    />
                  </div>
                </div>
              </div>
            )
          })()}

          <div style={styles.slotPopupBtns}>
            <button style={styles.slotPopupSave} onClick={saveSlotEditor}>저장</button>
            <button style={styles.slotPopupCancel} onClick={() => setEditingSlot(null)}>취소</button>
          </div>
            </>
          })()}
        </div>
      </div>
    )}

    {/* 시작시간 캐러셀 팝업 (슬롯 팝업보다 위) */}
    {slotStartPickerOpen && editingSlot && (
      <div style={{ ...styles.overlay, zIndex: 400 }} onClick={() => setSlotStartPickerOpen(false)}>
        <div style={styles.timeDialog} onClick={e => e.stopPropagation()}>
          <div style={styles.timeDialogTitle}>시작 시간</div>
          <div style={styles.timeCarouselRow}>
            {(() => {
              const ct = getCarouselTime(draftData.time)
              const update = (patch) => {
                const next = { ...ct, ...patch }
                const newTime = carouselTimeToStr(next)
                setDraftData(prev => ({
                  ...prev,
                  time: newTime,
                  end_time: (prev.duration_minutes ?? 0) > 0 ? addSlotMinutes(newTime, prev.duration_minutes) : prev.end_time,
                }))
              }
              return (
                <>
                  <CarouselPicker items={CAROUSEL_AMPM} value={ct.ampm} onChange={ampm => update({ ampm })} width={56} />
                  <div style={{ width: 4 }} />
                  <CarouselPicker items={CAROUSEL_HOURS} value={ct.hour} onChange={hour => update({ hour })} width={56} />
                  <span style={styles.timeColon}>:</span>
                  <CarouselPicker items={CAROUSEL_MINUTES} value={ct.minute} onChange={minute => update({ minute })} width={56} />
                </>
              )
            })()}
          </div>
          <button style={styles.timeDoneBtn} onClick={() => setSlotStartPickerOpen(false)}>확인</button>
        </div>
      </div>
    )}

    {/* 종료시간 캐러셀 팝업 (슬롯 팝업보다 위) */}
    {slotEndPickerOpen && editingSlot && (
      <div style={{ ...styles.overlay, zIndex: 400 }} onClick={() => setSlotEndPickerOpen(false)}>
        <div style={styles.timeDialog} onClick={e => e.stopPropagation()}>
          <div style={styles.timeDialogTitle}>종료 시간</div>
          <div style={styles.timeCarouselRow}>
            {(() => {
              const endCt = getCarouselTime(draftData.end_time)
              const update = (patch) => {
                const next = { ...endCt, ...patch }
                setDraftData(prev => ({ ...prev, end_time: carouselTimeToStr(next), duration_minutes: 0 }))
              }
              return (
                <>
                  <CarouselPicker items={CAROUSEL_AMPM} value={endCt.ampm} onChange={ampm => update({ ampm })} width={56} />
                  <div style={{ width: 4 }} />
                  <CarouselPicker items={CAROUSEL_HOURS} value={endCt.hour} onChange={hour => update({ hour })} width={56} />
                  <span style={styles.timeColon}>:</span>
                  <CarouselPicker items={CAROUSEL_MINUTES} value={endCt.minute} onChange={minute => update({ minute })} width={56} />
                </>
              )
            })()}
          </div>
          <button style={styles.timeDoneBtn} onClick={() => setSlotEndPickerOpen(false)}>확인</button>
        </div>
      </div>
    )}

    {showJoinPot && (
      <div style={styles.overlay} onClick={() => { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError('') }}>
        <div style={styles.dialog} onClick={e => e.stopPropagation()}>
          <div><RiceBowlIcon size={36} /></div>
          <div style={styles.dialogTitle}>밥팟 같이 먹기</div>
          <p style={styles.dialogDesc}>초대 코드를 입력하거나{'\n'}밥팟 링크를 붙여넣으세요</p>
          <input
            style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${joinPotError ? 'var(--color-danger)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', fontSize: 16, fontWeight: 600, letterSpacing: 2, textAlign: 'center', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
            placeholder="ABC123"
            value={joinPotInput}
            onChange={e => { setJoinPotInput(e.target.value); setJoinPotError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleJoinPotByCode() }}
            maxLength={60}
            autoFocus
          />
          {joinPotError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{joinPotError}</p>}
          <div style={styles.dialogBtns}>
            <button style={styles.dialogBtnPrimary} onClick={handleJoinPotByCode}>
              같이 먹기
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError('') }}>취소</button>
          </div>
        </div>
      </div>
    )}

    {showGroupSetup && (
      <GroupSetupModal
        userId={user.id}
        onClose={() => setShowGroupSetup(false)}
        onDone={() => { setShowGroupSetup(false); invalidateCache(`board:${user.id}:`, { prefix: true }); loadData({ force: true }) }}
      />
    )}

    {editingOrder && (
      <div style={styles.overlay} onClick={cancelEditingOrder}>
        <div style={{ ...styles.dialog, maxWidth: 340, gap: 10 }} onClick={e => e.stopPropagation()}>
          <div style={styles.dialogTitle}>그룹 순서 편집</div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {localGroups.map((group, idx) => (
              <div key={group.id} style={styles.orderRow}>
                <span style={styles.orderHandle}>☰</span>
                <span style={styles.orderName}>{group.name}</span>
                <div style={styles.orderBtns}>
                  <button
                    style={{ ...styles.orderBtn, opacity: idx === 0 ? 0.25 : 1 }}
                    onClick={() => moveGroup(idx, -1)}
                    disabled={idx === 0}
                  >↑</button>
                  <button
                    style={{ ...styles.orderBtn, opacity: idx === localGroups.length - 1 ? 0.25 : 1 }}
                    onClick={() => moveGroup(idx, 1)}
                    disabled={idx === localGroups.length - 1}
                  >↓</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...styles.dialogBtns, marginTop: 4 }}>
            <button style={styles.dialogBtnPrimary} onClick={saveGroupOrder}>저장</button>
            <button style={styles.dialogBtnCancel} onClick={cancelEditingOrder}>취소</button>
          </div>
        </div>
      </div>
    )}

    {showResetConfirm && (
      <div style={styles.overlay}>
        <div style={styles.dialog}>
          <UndoIcon size={36} strokeWidth={1.8} style={{ color: 'var(--color-text)' }} />
          <div style={styles.dialogTitle}>하루 상태 초기화</div>
          <p style={styles.dialogDesc}>
            {formatDate(currentDate)}의 모든 슬롯 상태를 초기화합니다.{'\n'}
            참여 중인 밥팟에서도 자동으로 나가게 됩니다.{'\n'}
            계속하시겠어요?
          </p>
          <div style={styles.dialogBtns}>
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }} onClick={resetAll}>초기화하기</button>
            <button style={styles.dialogBtnCancel} onClick={() => setShowResetConfirm(false)}>취소</button>
          </div>
        </div>
      </div>
    )}

    {leavePotConfirm && (
      <div style={styles.overlay} onClick={() => !leavingPot && setLeavePotConfirm(null)}>
        <div style={styles.dialog} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 36 }}>🚪</div>
          <div style={styles.dialogTitle}>밥팟을 나갈까요?</div>
          <p style={styles.dialogDesc}>
            <strong>{leavePotConfirm.title}</strong>에서 나가면{'\n'}
            다시 참여하려면 새로 들어와야 해요.
          </p>
          <div style={styles.dialogBtns}>
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)', opacity: leavingPot ? 0.6 : 1 }} onClick={handleLeavePot} disabled={leavingPot}>
              {leavingPot ? '나가는 중...' : '나가기'}
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => setLeavePotConfirm(null)} disabled={leavingPot}>취소</button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

function GroupSlotCard({ group, slot, members, statuses, pots, myUserId, mySlotData, isShared, onToggleShare, onShowToast, amIInAnyPot, allCollapsed, collapseKey, dateStr, onNavigate, onRefresh }) {
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.name)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { setCollapsed(allCollapsed) }, [collapseKey])

  // 그룹 전용 닉네임 편집
  const myMember = members.find(m => m.id === myUserId)
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameValue, setNicknameValue] = useState('')

  // 멤버 관리
  const [showMemberManage, setShowMemberManage] = useState(false)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null) // { id, nickname }

  // 그룹 검색 허용 + 비밀번호 (방장 전용) — 켜려면 비밀번호가 먼저 설정돼 있어야 함.
  // searchSelected는 "허용/허용 안 함" 중 화면에 선택 표시된 쪽 — 비밀번호가 아직 없는 상태에서
  // "허용"을 누르면 곧바로 저장하지 않고 우선 선택만 표시하고 비밀번호 입력칸을 펼친다.
  const [showSearchSettings, setShowSearchSettings] = useState(false)
  const [searchSettingsLoading, setSearchSettingsLoading] = useState(false)
  const [searchAllow, setSearchAllow] = useState(false)
  const [searchSelected, setSearchSelected] = useState(false)
  const [searchHasPassword, setSearchHasPassword] = useState(false)
  const [searchPasswordInput, setSearchPasswordInput] = useState('')
  const [searchSettingsSaving, setSearchSettingsSaving] = useState(false)
  const [searchSettingsError, setSearchSettingsError] = useState(null)

  useEffect(() => {
    if (!showSearchSettings) return
    setSearchSettingsLoading(true)
    setSearchSettingsError(null)
    getGroupSearchSettings(group.id)
      .then(s => { setSearchAllow(s.allow_search); setSearchSelected(s.allow_search); setSearchHasPassword(s.has_password) })
      .catch(() => setSearchSettingsError('불러오지 못했어요.'))
      .finally(() => setSearchSettingsLoading(false))
  }, [showSearchSettings, group.id])

  const persistAllowSearch = async (next) => {
    setSearchSettingsSaving(true)
    setSearchSettingsError(null)
    try {
      await setGroupAllowSearch(group.id, next)
      setSearchAllow(next)
    } catch (e) {
      setSearchSettingsError(e.message || '저장하지 못했어요.')
      setSearchSelected(searchAllow) // 실패하면 선택 표시를 실제 저장된 상태로 되돌림
    } finally {
      setSearchSettingsSaving(false)
    }
  }

  const selectAllowSearch = (next) => {
    if (searchSettingsSaving || searchSelected === next) return
    setSearchSettingsError(null)
    setSearchSelected(next)
    // 켜는 경우인데 비밀번호가 아직 없으면, 저장은 비밀번호 입력 후로 미루고 선택 표시만 바꾼다.
    if (next && !searchHasPassword) return
    persistAllowSearch(next)
  }

  const handleSaveSearchPassword = async () => {
    if (searchSettingsSaving || searchPasswordInput.trim().length < 4) return
    setSearchSettingsSaving(true)
    setSearchSettingsError(null)
    try {
      await setGroupPassword(group.id, searchPasswordInput.trim())
      setSearchHasPassword(true)
      setSearchPasswordInput('')
      if (searchSelected && !searchAllow) {
        await setGroupAllowSearch(group.id, true)
        setSearchAllow(true)
      }
    } catch (e) {
      setSearchSettingsError(e.message || '저장하지 못했어요.')
    } finally {
      setSearchSettingsSaving(false)
    }
  }

  // 그룹 초대하기 — 친구 선택(내 다른 그룹 멤버) / 초대 코드 / 링크
  const [inviteTab, setInviteTab] = useState('friend')
  const [inviteFriends, setInviteFriends] = useState([])
  const [inviteFriendsLoading, setInviteFriendsLoading] = useState(false)
  const [invitedGroupFriendIds, setInvitedGroupFriendIds] = useState(new Set())
  const [invitingGroupFriendId, setInvitingGroupFriendId] = useState(null)

  useEffect(() => {
    if (!showInvite) return
    setInviteFriendsLoading(true)
    getMyFriends()
      .then(list => {
        const memberIds = new Set(members.map(m => m.id))
        setInviteFriends(list.filter(f => !memberIds.has(f.id)))
      })
      .catch(e => console.error(e))
      .finally(() => setInviteFriendsLoading(false))
  }, [showInvite, group.id, members])

  const handleInviteGroupFriend = async (friendId) => {
    if (invitingGroupFriendId) return
    setInvitingGroupFriendId(friendId)
    try {
      await inviteGroupFriend(group.id, myUserId, friendId)
      setInvitedGroupFriendIds(prev => new Set(prev).add(friendId))
    } catch (e) { console.error(e) }
    finally { setInvitingGroupFriendId(null) }
  }

  // 참여자 선택 → 같이 먹자 제안
  const [proposeTarget, setProposeTarget] = useState(null) // { id, nickname }
  const [proposeMenu, setProposeMenu] = useState('')
  const [proposeSending, setProposeSending] = useState(false)
  const [proposeError, setProposeError] = useState(null)
  const [pendingProposals, setPendingProposals] = useState([]) // pot_invitations rows (이 그룹+슬롯)
  const [sentInviteIds, setSentInviteIds] = useState(new Set()) // 기존 밥팟에 즉시 초대한 유저 (취소 불가)
  const isPastDate = dateStr < toDateStr(new Date())

  const reloadPendingProposals = () =>
    getMyPendingInvitationsForDate(myUserId, dateStr)
      .then(list => setPendingProposals(list.filter(inv => inv.group_id === group.id && inv.slot === slot)))
      .catch(() => {})

  useEffect(() => { reloadPendingProposals() }, [myUserId, dateStr, slot, group.id])

  const openPropose = (member) => {
    setProposeTarget(member)
    setProposeMenu('')
    setProposeError(null)
  }
  const closePropose = () => setProposeTarget(null)

  const handleCancelProposal = async (e, invitationId) => {
    e.stopPropagation()
    try {
      await cancelPotInvitation(invitationId, myUserId)
      await reloadPendingProposals()
    } catch (err) {
      console.error(err)
    }
  }

  const sendPropose = async () => {
    if (!proposeTarget || proposeSending) return
    setProposeSending(true)
    setProposeError(null)
    try {
      const existing = await getMyPotsForSlot(myUserId, group.id, dateStr, slot)
      if (existing.length > 0) {
        await invitePotFriend(existing[0].pot_id, myUserId, proposeTarget.id, proposeMenu.trim() || null)
        setSentInviteIds(prev => new Set(prev).add(proposeTarget.id))
      } else {
        await proposeMealTogether({
          groupId: group.id, fromUserId: myUserId, toUserId: proposeTarget.id,
          date: dateStr, slot, meal_time: null, menu: proposeMenu.trim() || null,
        })
        await reloadPendingProposals()
      }
      setProposeTarget(null)
    } catch (e) {
      console.error(e)
      setProposeError('제안을 보내지 못했어요.')
    } finally {
      setProposeSending(false)
    }
  }

  // 설정 시트가 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(showSettings || editingName || editingNickname || showMemberManage || showSearchSettings || showInvite || confirmRemoveMember || proposeTarget))

  // 참여 중인 슬롯은 무조건 공유 상태라 끌 수 없다 — 시도하면 이유를 토스트로 알려주고 끝낸다.
  // (정상적으로 토글이 적용됐을 때의 안내 토스트는 상위 handleToggleShare가 띄운다)
  const handleToggleSharing = () => {
    if (isInThisGroupPot) {
      onShowToast?.('참여 중인 밥팟이 있어 오늘은 내 상태 공유를 멈출 수 없어요')
      return
    }
    onToggleShare(!isShared)
  }

  const isMaster = group.created_by === myUserId

  const handleSaveName = async () => {
    if (nameValue.trim().length < 4) return
    await updateGroupName(group.id, nameValue.trim())
    setEditingName(false)
    setShowSettings(false)
    onRefresh()
  }

  const handleLeave = async () => {
    await leaveGroup(group.id, myUserId)
    onRefresh()
  }

  const handleEditNicknameOpen = () => {
    setNicknameValue(myMember?.group_nickname ?? '')
    setEditingNickname(true)
  }

  const handleSaveNickname = async () => {
    await updateGroupNickname(myUserId, group.id, nicknameValue)
    setEditingNickname(false)
    setShowSettings(false)
    onRefresh()
  }

  const handleResetNickname = async () => {
    await updateGroupNickname(myUserId, group.id, null)
    setEditingNickname(false)
    setShowSettings(false)
    onRefresh()
  }

  const handleRemoveMember = async () => {
    if (!confirmRemoveMember) return
    await leaveGroup(group.id, confirmRemoveMember.id)
    setConfirmRemoveMember(null)
    setShowSettings(false)
    onRefresh()
  }

  const isInPot = amIInAnyPot // 전체 그룹 기준 (상태 표시용)
  const isInThisGroupPot = pots.some(p => p.pot_members?.some(pm => pm.user_id === myUserId)) // 이 그룹 팟 참여 여부 (헤더 색상용)
  // 참여 중인 슬롯은 공유 선호(isShared)와 무관하게 무조건 공유된 것으로 취급한다
  const effectiveIsShared = isInThisGroupPot || isShared
  const myGroupPot = isInThisGroupPot ? pots.find(p => p.pot_members?.some(pm => pm.user_id === myUserId)) : null
  const isMyGroupPotExpired = isInThisGroupPot && isPotTimeExpired(dateStr, myGroupPot?.end_time)
  const myPotMemberIds = new Set((myGroupPot?.pot_members ?? []).map(pm => pm.user_id))

  const getMemberData = (userId) => {
    if (userId === myUserId) {
      if (!isShared) return null
      // mySlots는 time 키 사용 → 표시용 meal_time으로 매핑
      const mine = mySlotData ? { ...mySlotData, meal_time: mySlotData.time } : null
      if (isInThisGroupPot) {
        const status = isMyGroupPotExpired ? '참여완료' : '참여중'
        return { ...mine, status, meal_time: myGroupPot?.meal_time ?? mine?.meal_time, end_time: myGroupPot?.end_time ?? mine?.end_time }
      }
      if (amIInAnyPot) {
        // 다른 그룹 팟 참여 → 약속있음. 팟 시간은 파생된 statuses 행에서 가져옴
        const derived = statuses.find(s => s.user_id === myUserId && s.slot === slot)
        return { status: 'closed', meal_time: derived?.meal_time ?? null, end_time: derived?.end_time ?? null }
      }
      return mine
    }
    const s = statuses.find(s => s.user_id === userId && s.slot === slot)
    if (!s || s.is_hidden) return null
    // 참여중인데 이 그룹 팟에 없으면 → 다른 그룹 팟 참여중 → 약속있음으로 표시
    if (s.status === '참여중' || s.status === '참여완료') {
      const isInThisPot = pots.some(p => p.pot_members?.some(pm => pm.user_id === userId))
      if (!isInThisPot) return { ...s, status: 'closed' }
    }
    return s
  }

  const hasActivity = members.some(m => getMemberData(m.id)?.status) || pots.length > 0

  const inviteLink = `${getPublicOrigin()}/join/${group.invite_code}`

  // 복사 성공 여부를 확인하고 표시한다 — 예전엔 실패해도 "✓"가 떠서 빈 클립보드를 붙여넣게 됐다.
  const copyText = async (text, type) => {
    setCopyFailed(false)
    if (await copyToClipboard(text)) {
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } else {
      setCopyFailed(true)
    }
  }

  // OS 공유 시트 — 카톡 등으로 바로 보낼 수 있어 복사→앱전환→붙여넣기 과정을 없앤다.
  const handleShareInvite = async () => {
    setCopyFailed(false)
    const result = await shareLink({
      title: `${group.name} 그룹 초대`,
      text: `"${group.name}" 그룹에 초대할게요. 같이 먹자에서 오늘 뭐 먹을지 맞춰봐요!`,
      url: inviteLink,
    })
    if (result === 'copied') {
      setCopied('link')
      setTimeout(() => setCopied(null), 2000)
    } else if (result === 'failed') {
      setCopyFailed(true)
    }
  }

  // Status counts for filter tabs
  const statusCounts = {}
  members.forEach(member => {
    const data = getMemberData(member.id)
    if (data?.status) statusCounts[data.status] = (statusCounts[data.status] ?? 0) + 1
  })

  // Separate active and unset members
  const activeMembers = members.filter(m => getMemberData(m.id)?.status)
  const unsetMembers = members.filter(m => !getMemberData(m.id)?.status)
  const [statusFilter, setStatusFilter] = useState('open')
  // 날짜/슬롯을 바꿔가며 볼 때는 '같이 가능' 필터가 선택된 상태로 리셋
  useEffect(() => { setStatusFilter('open') }, [dateStr, slot])

  // Filter tabs: 같이 가능 / 참여중 / 참여완료 / 약속있음 / 패스 / 미설정 순서 고정
  const FILTER_TAB_ORDER = ['open', '참여중', '참여완료', 'closed', 'skip']
  const filterTabs = [
    ...FILTER_TAB_ORDER.map(key => ({ ...SLOT_STATUS_OPTIONS.find(o => o.key === key), count: statusCounts[key] ?? 0 })),
    { key: 'unset', label: '미설정', color: 'var(--color-text-muted)', bg: 'var(--color-border)', border: 'var(--warm-400)', count: unsetMembers.length },
  ]

  // 태그 선택 해제 시 아무도 표시하지 않음 — 전체 보기 옵션은 없음
  const displayedMembers = !statusFilter
    ? []
    : statusFilter === 'unset'
      ? unsetMembers
      : activeMembers.filter(m => getMemberData(m.id)?.status === statusFilter)

  return (
    <div style={styles.groupCard}>
      {/* 그룹 헤더 — 카드가 아닌 얇은 라벨 행 */}
      <div style={styles.groupHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ ...styles.groupName, color: effectiveIsShared ? 'var(--color-text)' : 'var(--warm-600)' }}>{group.name}</span>
          <div style={{ position: 'relative' }}>
            <button style={styles.viewMenuBtn} aria-label="더보기" onClick={() => setShowGroupMenu(v => !v)}>
              <MoreHorizontalIcon size={15} />
            </button>
            {showGroupMenu && (
              <>
                <div style={styles.cardMenuOverlay} onClick={() => setShowGroupMenu(false)} />
                <div style={styles.cardMenuDropdown}>
                  <button
                    style={{ ...styles.cardMenuItem, color: 'var(--color-danger)' }}
                    onClick={() => { setShowGroupMenu(false); setConfirmLeave(true) }}
                  >
                    그룹 나가기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* 참여 중인 슬롯은 무조건 공유되므로(effectiveIsShared) 배지는 항상 공유 상태로 보이지만,
              버튼 자체는 계속 눌러서 이후 날짜들에 대한 공유 선호를 바꿀 수 있다 */}
          <button
            style={styles.groupHeaderIconBtn}
            onClick={handleToggleSharing}
            aria-label={effectiveIsShared ? '공유중' : '비공유'}
          >
            {effectiveIsShared ? <BroadcastIcon size={15} strokeWidth={2} /> : <BroadcastOffIcon size={15} strokeWidth={2} />}
          </button>
          <button style={styles.groupHeaderIconBtn} onClick={() => { setShowSettings(v => !v); setEditingName(false); setEditingNickname(false); setShowMemberManage(false); setConfirmLeave(false); setShowInvite(false) }} aria-label="그룹 설정">
            <SlidersIcon size={15} strokeWidth={2} />
          </button>
          <button style={{ ...styles.groupHeaderIconBtn, color: 'var(--color-text)' }} onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? '펼치기' : '접기'}>
            <ChevronDownIcon size={15} strokeWidth={2.4} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
        </div>
      </div>

      {/* 그룹 상태 요약 — 펼친 상태에선 아래 상태 필터 탭과 내용이 겹쳐 접혀 있을 때만 한눈에 보기 칩으로 표시 */}
      {collapsed && (
        <div style={styles.groupStatusSummary}>
          {(() => {
            const openOpt = SLOT_STATUS_OPTIONS.find(o => o.key === 'open')
            return (
              <span style={{ ...styles.groupStatusChip, color: openOpt.color, background: openOpt.bg, border: `1px solid ${openOpt.border}` }}>같이가능 {statusCounts['open'] ?? 0}</span>
            )
          })()}
          {(statusCounts['참여중'] ?? 0) > 0 && (() => {
            const opt = SLOT_STATUS_OPTIONS.find(o => o.key === '참여중')
            return (
              <span style={{ ...styles.groupStatusChip, color: opt.color, background: opt.bg, border: `1px solid ${opt.border}` }}>{opt.label} {statusCounts['참여중']}</span>
            )
          })()}
          {(statusCounts['참여완료'] ?? 0) > 0 && (
            <span style={{ ...styles.groupStatusChip, color: 'var(--color-chip-text)', background: 'var(--warm-100)', border: '1px solid var(--warm-300)' }}>{SLOT_STATUS_OPTIONS.find(o => o.key === '참여완료').label} {statusCounts['참여완료']}</span>
          )}
          <span style={{ ...styles.groupStatusChip, color: 'var(--color-text-muted)', background: 'var(--warm-100)', border: '1px solid var(--warm-300)' }}>미설정 {unsetMembers.length}</span>
        </div>
      )}

      {/* 그룹 설정 바텀시트 */}
      {showSettings && (
        <div style={styles.sheetOverlay} onClick={() => { setShowSettings(false); setEditingName(false); setEditingNickname(false); setShowMemberManage(false); setShowSearchSettings(false); setShowInvite(false) }}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>

            {/* 타이틀 */}
            <div style={{ ...styles.sheetTitleRow, justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={styles.sheetTitle}>{group.name}</div>
                <div style={styles.sheetMaster}>
                  <CrownIcon size={13} />
                  {isMaster ? '나 (방장)' : (members.find(m => m.id === group.created_by)?.nickname ?? '?')} 방장
                </div>
              </div>
            </div>

            <div style={styles.sheetDivider} />

            {/* 방장 관리 — 방장에게만 보이는 항목들을 한데 모아 위쪽에 배치 */}
            {isMaster && (
              <>
                <div style={styles.sheetSectionLabel}>방장 관리</div>
                <button style={styles.sheetRow} onClick={() => setEditingName(true)}>
                  <span style={{ ...styles.sheetRowIcon, ...styles.sheetRowIconMaster }}><PencilIcon size={17} /></span>
                  <span style={styles.sheetRowLabel}>그룹명 변경</span>
                  <span style={styles.sheetRowChevron}>›</span>
                </button>
                <button style={styles.sheetRow} onClick={() => setShowMemberManage(true)}>
                  <span style={{ ...styles.sheetRowIcon, ...styles.sheetRowIconMaster }}><UsersIcon size={17} /></span>
                  <span style={styles.sheetRowLabel}>멤버 관리</span>
                  <span style={styles.sheetRowChevron}>›</span>
                </button>
                <button style={styles.sheetRow} onClick={() => setShowSearchSettings(true)}>
                  <span style={{ ...styles.sheetRowIcon, ...styles.sheetRowIconMaster }}><SearchIcon size={17} /></span>
                  <span style={styles.sheetRowLabel}>그룹 검색 허용</span>
                  <span style={styles.sheetRowChevron}>›</span>
                </button>
                <div style={styles.sheetSectionLabel}>공통</div>
              </>
            )}

            {/* 그룹내 닉네임 변경 */}
            <button style={styles.sheetRow} onClick={handleEditNicknameOpen}>
              <span style={styles.sheetRowIcon}><UserIcon size={17} /></span>
              <span style={styles.sheetRowLabel}>
                그룹내 닉네임 변경
                {myMember?.group_nickname && (
                  <span style={styles.sheetNicknameBadge}>{myMember.group_nickname}</span>
                )}
              </span>
              <span style={styles.sheetRowChevron}>›</span>
            </button>

            {/* 기본 밥팟 추가 */}
            <button style={styles.sheetRow} onClick={() => { setShowSettings(false); onNavigate(`/group/${group.id}/settings`) }}>
              <span style={styles.sheetRowIcon}><RiceBowlIcon size={18} /></span>
              <span style={styles.sheetRowLabel}>기본 밥팟 추가</span>
            </button>

            {/* 그룹 초대하기 */}
            <button style={styles.sheetRow} onClick={() => { setShowInvite(true); setInviteTab('friend') }}>
              <span style={styles.sheetRowIcon}><SendIcon size={16} /></span>
              <span style={styles.sheetRowLabel}>그룹 초대하기</span>
              <span style={styles.sheetRowChevron}>›</span>
            </button>

            {/* 닫기 */}
            <button style={styles.sheetClose} onClick={() => setShowSettings(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 그룹명 변경 팝업 */}
      {editingName && (
        <div style={styles.overlay} onClick={() => { setEditingName(false); setNameValue(group.name) }}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={styles.dialogIconBadge}><PencilIcon size={24} /></div>
            <div style={styles.dialogTitle}>그룹명 변경</div>
            <input
              style={styles.dialogInput}
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              maxLength={20}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              placeholder="새 그룹명 (4자 이상)"
            />
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, opacity: nameValue.trim().length >= 4 ? 1 : 0.4 }} onClick={handleSaveName} disabled={nameValue.trim().length < 4}>저장</button>
              <button style={styles.dialogBtnCancel} onClick={() => { setEditingName(false); setNameValue(group.name) }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 그룹내 닉네임 변경 팝업 */}
      {editingNickname && (
        <div style={styles.overlay} onClick={() => setEditingNickname(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={styles.dialogIconBadge}><UserIcon size={24} /></div>
            <div style={styles.dialogTitle}>그룹내 닉네임 변경</div>
            <p style={styles.dialogDesc}>기본 닉네임: {myMember?.default_nickname}</p>
            <input
              style={styles.dialogInput}
              value={nicknameValue}
              onChange={e => setNicknameValue(e.target.value)}
              placeholder={myMember?.default_nickname ?? '닉네임'}
              maxLength={10}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSaveNickname()}
            />
            {myMember?.group_nickname && (
              <button style={styles.sheetResetNicknameBtn} onClick={handleResetNickname}>
                기본 닉네임으로 되돌리기
              </button>
            )}
            <div style={styles.dialogBtns}>
              <button style={styles.dialogBtnPrimary} onClick={handleSaveNickname}>저장</button>
              <button style={styles.dialogBtnCancel} onClick={() => setEditingNickname(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 멤버 관리 팝업 */}
      {showMemberManage && (
        <div style={styles.overlay} onClick={() => setShowMemberManage(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={styles.dialogIconBadge}><UsersIcon size={24} /></div>
            <div style={styles.dialogTitle}>멤버 관리</div>
            <div style={styles.memberManageList}>
              {members.filter(m => m.id !== myUserId).length === 0 && (
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', padding: '4px 0' }}>다른 멤버가 없어요</div>
              )}
              {members.filter(m => m.id !== myUserId).map(member => (
                <div key={member.id} style={styles.sheetMemberRow}>
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ ...styles.avatar, background: avatarColor(member.nickname) }}>
                      {member.nickname[0]}
                    </div>
                  )}
                  <span style={styles.sheetMemberName}>{member.nickname}</span>
                  <button
                    style={styles.sheetRemoveBtn}
                    onClick={() => setConfirmRemoveMember({ id: member.id, nickname: member.nickname })}
                  >
                    내보내기
                  </button>
                </div>
              ))}
            </div>
            <button style={styles.dialogBtnCancel} onClick={() => setShowMemberManage(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 그룹 검색 허용 팝업 (방장 전용) */}
      {showSearchSettings && (
        <div style={styles.overlay} onClick={() => setShowSearchSettings(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={styles.dialogIconBadge}><SearchIcon size={22} /></div>
            <div style={styles.dialogTitle}>그룹 검색 허용</div>
            <p style={styles.dialogDesc}>켜면 그룹 이름 검색으로 누구나 찾을 수 있어요.{'\n'}참여하려면 비밀번호를 입력해야 해요.</p>

            {searchSettingsLoading ? (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>불러오는 중...</p>
            ) : (
              <>
                <div style={styles.searchToggleRow}>
                  <button
                    style={{ ...styles.searchToggleBtn, ...(!searchSelected ? styles.searchToggleBtnActive : {}) }}
                    onClick={() => selectAllowSearch(false)}
                    disabled={searchSettingsSaving}
                  >
                    허용 안 함
                  </button>
                  <button
                    style={{ ...styles.searchToggleBtn, ...(searchSelected ? styles.searchToggleBtnActive : {}) }}
                    onClick={() => selectAllowSearch(true)}
                    disabled={searchSettingsSaving}
                  >
                    허용
                  </button>
                </div>

                {searchSelected && (
                  <>
                    <div style={styles.searchPasswordRow}>
                      <LockIcon size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      <input
                        style={styles.searchPasswordInput}
                        type="password"
                        placeholder={searchHasPassword ? '****' : '비밀번호 설정 (4자 이상)'}
                        value={searchPasswordInput}
                        onChange={e => setSearchPasswordInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveSearchPassword()}
                        disabled={searchSettingsSaving}
                      />
                      <button
                        style={{ ...styles.searchPasswordSaveBtn, opacity: searchPasswordInput.trim().length >= 4 ? 1 : 0.4 }}
                        onClick={handleSaveSearchPassword}
                        disabled={searchPasswordInput.trim().length < 4 || searchSettingsSaving}
                      >
                        저장
                      </button>
                    </div>
                    {searchHasPassword ? (
                      <p style={styles.searchPasswordHint}>비밀번호가 설정돼 있어요 · 바꾸려면 새로 입력하고 저장하세요</p>
                    ) : (
                      <p style={styles.searchPasswordHint}>비밀번호를 저장해야 검색 허용이 켜져요</p>
                    )}
                  </>
                )}
              </>
            )}

            {searchSettingsError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{searchSettingsError}</p>}

            <button style={styles.dialogBtnCancel} onClick={() => setShowSearchSettings(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 그룹 초대하기 팝업 — "같이 먹자고 하기"와 동일한 구성(친구 선택/초대 코드/링크) */}
      {showInvite && (
        <div style={styles.overlay} onClick={() => setShowInvite(false)}>
          <div style={styles.shareDialog} onClick={e => e.stopPropagation()}>
            <div style={styles.dialogIconBadge}><SendIcon size={22} /></div>
            <div style={styles.dialogTitle}>그룹 초대하기</div>

            <div style={styles.shareTabs}>
              <button style={{ ...styles.shareTabBtn, ...(inviteTab === 'friend' ? styles.shareTabBtnActive : {}) }} onClick={() => setInviteTab('friend')}>친구 선택</button>
              <button style={{ ...styles.shareTabBtn, ...(inviteTab === 'code' ? styles.shareTabBtnActive : {}) }} onClick={() => setInviteTab('code')}>초대 코드</button>
              <button style={{ ...styles.shareTabBtn, ...(inviteTab === 'link' ? styles.shareTabBtnActive : {}) }} onClick={() => setInviteTab('link')}>링크</button>
            </div>

            {inviteTab === 'friend' && (
              <div style={styles.shareFriendList}>
                {inviteFriendsLoading ? (
                  <div style={styles.shareFriendEmpty}>불러오는 중...</div>
                ) : inviteFriends.length === 0 ? (
                  <div style={styles.shareFriendEmpty}>초대할 수 있는 친구가 없어요.{'\n'}(친구 관리에서 먼저 친구를 추가해보세요)</div>
                ) : inviteFriends.map(f => {
                  const invited = invitedGroupFriendIds.has(f.id)
                  return (
                    <div key={f.id} style={styles.shareFriendRow}>
                      <span style={styles.shareFriendName}>{f.nickname}</span>
                      <button
                        style={{ ...styles.shareCopyBtn, background: invited ? 'var(--color-success)' : 'var(--color-primary)', opacity: invitingGroupFriendId === f.id ? 0.6 : 1 }}
                        onClick={() => handleInviteGroupFriend(f.id)}
                        disabled={invited || invitingGroupFriendId === f.id}
                      >
                        {invited ? '보냈어요 ✓' : invitingGroupFriendId === f.id ? '보내는 중...' : '초대'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {inviteTab === 'code' && (
              <div style={styles.sharePanel}>
                <div style={styles.shareLabel}>초대 코드</div>
                <div style={styles.shareRow}>
                  <span style={{ ...styles.shareText, fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>{group.invite_code}</span>
                  <button style={{ ...styles.shareCopyBtn, background: copied === 'code' ? 'var(--color-success)' : 'var(--color-primary)' }} onClick={() => copyText(group.invite_code, 'code')}>
                    {copied === 'code' ? '✓' : '복사'}
                  </button>
                </div>
              </div>
            )}

            {inviteTab === 'link' && (
              <div style={styles.sharePanel}>
                {canShare() && (
                  <button style={{ ...PRIMARY_ACTION_BUTTON, marginBottom: 10 }} onClick={handleShareInvite}>
                    초대 링크 보내기
                  </button>
                )}
                <div style={styles.shareLabel}>초대 링크</div>
                <div style={styles.shareRow}>
                  <span style={styles.shareText}>{inviteLink}</span>
                  <button style={{ ...styles.shareCopyBtn, background: copied === 'link' ? 'var(--color-success)' : 'var(--color-primary)' }} onClick={() => copyText(inviteLink, 'link')}>
                    {copied === 'link' ? '✓' : '복사'}
                  </button>
                </div>
              </div>
            )}

            {copyFailed && <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 }}>복사하지 못했어요. 링크를 길게 눌러 직접 복사해주세요.</p>}

            <button style={styles.dialogBtnCancel} onClick={() => setShowInvite(false)}>닫기</button>
          </div>
        </div>
      )}

      {/* 그룹 나가기 확인 팝업 */}
      {confirmLeave && (
        <div style={styles.overlay} onClick={() => setConfirmLeave(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ ...styles.dialogIconBadge, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><LogOutIcon size={24} /></div>
            <div style={styles.dialogTitle}>{group.name} 나가기</div>
            <p style={styles.dialogDesc}>정말 이 그룹을 나가시겠어요?{'\n'}나가면 그룹의 일정 현황을 볼 수 없게 돼요.</p>
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }} onClick={handleLeave}>나가기</button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmLeave(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {confirmRemoveMember && (
        <div style={styles.overlay} onClick={() => setConfirmRemoveMember(null)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>👋</div>
            <div style={styles.dialogTitle}>{confirmRemoveMember.nickname}님을{'\n'}내보낼까요?</div>
            <p style={styles.dialogDesc}>그룹에서 제외되면{'\n'}다시 초대코드로 참여해야 해요.</p>
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }} onClick={handleRemoveMember}>내보내기</button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmRemoveMember(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {proposeTarget && (
        <div style={styles.overlay} onClick={closePropose}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🍚</div>
            <div style={styles.dialogTitle}>{proposeTarget.nickname}님에게{'\n'}{slot} 같이 먹자고 제안할까요?</div>
            <input
              style={styles.proposeMenuInput}
              placeholder="메뉴나 한마디 (선택)"
              value={proposeMenu}
              onChange={e => setProposeMenu(e.target.value)}
              maxLength={40}
              autoFocus
            />
            {proposeError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{proposeError}</p>}
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.memberProposeSendBtn, opacity: proposeSending ? 0.6 : 1 }} onClick={sendPropose} disabled={proposeSending}>
                {proposeSending ? '보내는 중...' : '제안 보내기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={closePropose}>취소</button>
            </div>
          </div>
        </div>
      )}


      {!collapsed && (
        <div style={styles.memberSection}>
          {/* 상태 필터 탭 */}
          <div className="no-scrollbar" style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 6 }}>
            {filterTabs.filter(tab => tab.key === 'open' || tab.count > 0).map(tab => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(isActive ? null : tab.key)}
                  style={{
                    fontSize: 'var(--font-size-2xs)', fontWeight: 600,
                    color: isActive ? tab.color : 'var(--color-text-muted)',
                    background: isActive ? (tab.key === '참여완료' ? 'var(--color-border)' : (tab.bg ?? tab.color + '18')) : 'var(--warm-100)',
                    border: `1px solid ${isActive ? (tab.key === '참여완료' ? 'var(--warm-400)' : (tab.border ?? tab.color + '44')) : 'var(--warm-300)'}`,
                    borderRadius: 'var(--radius-full)', padding: '3px 9px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    opacity: (tab.count === 0 && tab.key !== 'open') ? 0.4 : 1,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {tab.label} {tab.count}
                </button>
              )
            })}
          </div>

          {/* 멤버 목록 — 선택된 태그의 상태에 해당하는 멤버만 표시 */}
          {displayedMembers.map((member) => {
            const data = getMemberData(member.id)
            const isMe = member.id === myUserId
            const timeStr = data?.meal_time
              ? `${data.meal_time.slice(0, 5)}${data.end_time ? `~${data.end_time.slice(0, 5)}` : ''}`
              : ''
            return (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 0',
                borderBottom: `1px solid var(--warm-100)`,
              }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--color-border)', boxSizing: 'border-box' }} />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: isMe ? 'var(--color-selected)' : 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 700, flexShrink: 0,
                    border: '2px solid var(--color-border)', boxSizing: 'border-box',
                  }}>{member.nickname[0]}</div>
                )}
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text)', letterSpacing: '-0.2px', flexShrink: 0 }}>
                  {member.nickname}{isMe ? ' (나)' : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {timeStr}
                </span>
                {!isMe && !isPastDate && !myPotMemberIds.has(member.id) && (() => {
                  const pendingInv = pendingProposals.find(inv => inv.to_user_id === member.id)
                  if (pendingInv) {
                    return (
                      <button style={styles.memberCancelBtn} onClick={e => handleCancelProposal(e, pendingInv.id)}>
                        제안함 ✓ · 취소
                      </button>
                    )
                  }
                  if (sentInviteIds.has(member.id)) {
                    return <span style={styles.memberProposeDone}>초대함</span>
                  }
                  return <button style={styles.memberProposeBtn} onClick={() => openPropose(member)}>같이 먹자</button>
                })()}
              </div>
            )
          })}
        </div>
      )}

      {!collapsed && pots.length > 0 && (
        <div style={styles.groupMealList}>
          {pots.map(pot => (
            <MealPodCard key={pot.id} pot={pot} myUserId={myUserId} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

// 친구 보기 — 나와 그룹을 공유하지 않는 친구의 오늘 상태를 나열하고, "같이 먹자" 제안도 보낼 수 있다.
// 제안을 수락하면 그룹에 속하지 않은(group_id NULL) 2인 밥팟이 새로 생긴다(둘만의 약속이라 그룹 팟과 구분).
// 그룹 카드와 달리 설정/초대/기존 팟에 초대하기 같은 그룹 전용 기능은 없다(그룹이 없으니 붙일 곳이 없음).
function FriendSlotCard({ friends, statuses, slot, myUserId, dateStr, shareSettingsMap, onToggleShare, onShowToast }) {
  const [proposeTarget, setProposeTarget] = useState(null) // { id, nickname }
  const [proposeMenu, setProposeMenu] = useState('')
  const [proposeSending, setProposeSending] = useState(false)
  const [proposeError, setProposeError] = useState(null)
  const [pendingProposals, setPendingProposals] = useState([]) // pot_invitations(그룹 없는 것만, 이 슬롯)
  const isPastDate = dateStr < toDateStr(new Date())

  const reloadPendingProposals = () =>
    getMyPendingInvitationsForDate(myUserId, dateStr)
      .then(list => setPendingProposals(list.filter(inv => !inv.group_id && inv.slot === slot)))
      .catch(() => {})

  useEffect(() => { reloadPendingProposals() }, [myUserId, dateStr, slot])

  const openPropose = (friend) => {
    setProposeTarget(friend)
    setProposeMenu('')
    setProposeError(null)
  }
  const closePropose = () => setProposeTarget(null)

  const handleCancelProposal = async (e, invitationId) => {
    e.stopPropagation()
    try {
      await cancelPotInvitation(invitationId, myUserId)
      await reloadPendingProposals()
    } catch (err) {
      console.error(err)
    }
  }

  const sendPropose = async () => {
    if (!proposeTarget || proposeSending) return
    setProposeSending(true)
    setProposeError(null)
    try {
      await proposeMealTogether({
        groupId: null, fromUserId: myUserId, toUserId: proposeTarget.id,
        date: dateStr, slot, meal_time: null, menu: proposeMenu.trim() || null,
      })
      await reloadPendingProposals()
      setProposeTarget(null)
    } catch (e) {
      console.error(e)
      setProposeError('제안을 보내지 못했어요.')
    } finally {
      setProposeSending(false)
    }
  }

  useScrollLock(!!proposeTarget)

  const getFriendData = (friendId) => statuses.find(s => s.user_id === friendId && s.slot === slot) ?? null

  return (
    <div style={styles.groupCard}>
      <div style={styles.groupHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={styles.groupName}>친구</span>
        </div>
      </div>
      <div style={styles.memberSection}>
        {friends.map(friend => {
          const data = getFriendData(friend.id)
          const opt = data?.status ? SLOT_STATUS_OPTIONS.find(o => o.key === data.status) : null
          const timeStr = data?.meal_time
            ? `${data.meal_time.slice(0, 5)}${data.end_time ? `~${data.end_time.slice(0, 5)}` : ''}`
            : ''
          const pendingInv = pendingProposals.find(inv => inv.to_user_id === friend.id)
          return (
            <div key={friend.id} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 0',
              borderBottom: `1px solid var(--warm-100)`,
            }}>
              {friend.avatar_url ? (
                <img src={friend.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--color-border)', boxSizing: 'border-box' }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--color-text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 700, flexShrink: 0,
                  border: '2px solid var(--color-border)', boxSizing: 'border-box',
                }}>{friend.nickname[0]}</div>
              )}
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text)', letterSpacing: '-0.2px', flexShrink: 0 }}>
                {friend.nickname}
              </span>
              {/* 이 친구에게 내 상태를 공유할지 — 그룹처럼 그룹 전체가 아니라 친구마다 개별로 켜고 끈다.
                  이미 같이 있는 팟(참여중/참여완료)이면 상대가 어차피 알고 있으니 끌 수 없게 잠근다. */}
              {(() => {
                const isFriendShared = shareSettingsMap[friend.id] ?? true
                const isLocked = data?.status === '참여중' || data?.status === '참여완료'
                return (
                  <button
                    style={{ ...styles.groupHeaderIconBtn, width: 24, height: 24 }}
                    aria-label={isFriendShared ? '공유중' : '비공유'}
                    onClick={() => {
                      if (isLocked) {
                        onShowToast?.('같이 있는 밥팟이 있어 오늘은 이 친구에게 공유를 멈출 수 없어요')
                        return
                      }
                      onToggleShare(friend.id, !isFriendShared)
                    }}
                  >
                    {isFriendShared ? <BroadcastIcon size={13} strokeWidth={2} /> : <BroadcastOffIcon size={13} strokeWidth={2} />}
                  </button>
                )
              })()}
              <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {timeStr}
              </span>
              {opt ? (
                <span style={{ fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: opt.color, background: opt.bg, border: `1px solid ${opt.border}`, borderRadius: 'var(--radius-full)', padding: '3px 9px', flexShrink: 0 }}>
                  {opt.label}
                </span>
              ) : (
                <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>미설정</span>
              )}
              {/* 참여중/참여완료는 same_pot_as_me일 때만 나오는 상태라 이미 이 친구와 같이 있는 팟 — 다시 제안할 필요 없음 */}
              {!isPastDate && data?.status !== '참여중' && data?.status !== '참여완료' && (
                pendingInv ? (
                  <button style={styles.memberCancelBtn} onClick={e => handleCancelProposal(e, pendingInv.id)}>
                    제안함 ✓ · 취소
                  </button>
                ) : (
                  <button style={styles.memberProposeBtn} onClick={() => openPropose(friend)}>같이 먹자</button>
                )
              )}
            </div>
          )
        })}
      </div>

      {proposeTarget && (
        <div style={styles.overlay} onClick={closePropose}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🍚</div>
            <div style={styles.dialogTitle}>{proposeTarget.nickname}님에게{'\n'}{slot} 같이 먹자고 제안할까요?</div>
            <input
              style={styles.proposeMenuInput}
              placeholder="메뉴나 한마디 (선택)"
              value={proposeMenu}
              onChange={e => setProposeMenu(e.target.value)}
              maxLength={40}
              autoFocus
            />
            {proposeError && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: 0 }}>{proposeError}</p>}
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.memberProposeSendBtn, opacity: proposeSending ? 0.6 : 1 }} onClick={sendPropose} disabled={proposeSending}>
                {proposeSending ? '보내는 중...' : '제안 보내기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={closePropose}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 그룹별 보기 전용 — 팀명을 반복하지 않는 슬림한 타임 행 (밥팟별 보기의 독립 카드와 의도적으로 다른 형태)
// 밥팟별 보기 — 슬롯 구분 없이 해당 날짜에 열린 전체 밥팟을 그룹/슬롯 순으로 나열
function AllPotsView({ groups, potsMap, myUserId, onNavigate, dayLabel }) {
  const allPots = Object.entries(potsMap)
    .flatMap(([groupId, pots]) => pots.map(pot => ({ pot, groupName: groups.find(g => g.id === groupId)?.name ?? '' })))
    .sort((a, b) => {
      const slotDiff = SLOT_ORDER.indexOf(a.pot.slot) - SLOT_ORDER.indexOf(b.pot.slot)
      if (slotDiff !== 0) return slotDiff
      return (a.pot.meal_time ?? '').localeCompare(b.pot.meal_time ?? '')
    })

  if (allPots.length === 0) {
    return (
      <div style={styles.emptyGroup}>
        <RiceBowlIcon size={36} />
        <div style={{ fontWeight: 700 }}>{dayLabel} 열린 밥팟이 없어요</div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center', lineHeight: 1.6 }}>
          그룹으로 보기에서 밥팟을 만들어보세요.
        </p>
      </div>
    )
  }

  return (
    <div style={potListStyles.listContainer}>
      {allPots.map(({ pot, groupName }) => (
        <MealPodCard key={pot.id} pot={pot} groupName={groupName} showMeta myUserId={myUserId} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

// 그룹별 보기 · 밥팟별 보기 공용 카드 — showMeta일 때만 상단에 슬롯/그룹 태그 표시
// 참여 여부와 무관하게 동일한 구성: 제목/메뉴, 시간/참여자 아바타, 오른쪽 참여 버튼. 메모는 카드에 노출하지 않는다.
function MealPodCard({ pot, groupName, showMeta = false, myUserId, onNavigate }) {
  const potParticipants = (pot.pot_members ?? []).map(pm => {
    const groupNickname = pm.users?.group_members?.find(gm => gm.group_id === pot.group_id)?.nickname
    return { id: pm.user_id, nickname: groupNickname || (pm.users?.nickname ?? '?'), is_guest: pm.users?.is_guest, avatar_url: pm.users?.avatar_url }
  })
  const filled = potParticipants.length
  const isFull = filled >= pot.max_people
  const isJoined = potParticipants.some(p => p.id === myUserId)
  const expired = isPotTimeExpired(pot.date, pot.end_time)
  const timeStr = pot.meal_time?.slice(0, 5)
  const endStr = pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''
  const visibleAvatars = potParticipants.slice(0, 4)
  const extraCount = potParticipants.length - visibleAvatars.length

  const metaRow = showMeta && (
    <div style={potListStyles.metaRow}>
      <span style={{
        ...potListStyles.slotBadge,
        color: SLOT_CHIP_COLOR[pot.slot]?.text ?? potListStyles.slotBadge.color,
        background: SLOT_CHIP_COLOR[pot.slot]?.bg ?? potListStyles.slotBadge.background,
        border: `1px solid ${SLOT_CHIP_COLOR[pot.slot]?.border ?? 'transparent'}`,
      }}>
        {pot.slot}
      </span>
      <span style={potListStyles.groupNameText}>{groupName}</span>
    </div>
  )

  const buttonStyle = isJoined
    ? potListStyles.joinBtnJoined
    : (expired || isFull) ? potListStyles.joinBtnFull : {}
  const buttonLabel = isJoined
    ? getJoinedStatusLabel(pot.date, pot.meal_time, pot.end_time, filled === 1)
    : expired ? '종료' : isFull ? '마감' : '참여'

  return (
    <div style={potListStyles.card} onClick={() => onNavigate(`/pot/${pot.id}`)}>
      {/* 끼니 · 그룹명 — 밥팟별 보기에서만 표시 (그룹별 보기는 이미 슬롯/그룹 문맥 안이라 생략) */}
      {metaRow}

      <div style={potListStyles.mainRow}>
        {/* 썸네일 — 사용자가 고른 아이콘이 있으면 그걸, 없으면 예전 방식대로 대체 */}
        <div style={pot.icon || pot.is_default ? potListStyles.iconThumb : { ...potListStyles.iconThumb, background: 'var(--color-surface-2)' }}>
          {pot.icon
            ? <PotIcon icon={pot.icon} size={54} />
            : pot.is_default ? <RiceBowlIcon size={47} /> : <span style={{ fontSize: 36 }}>🎉</span>}
        </div>

        <div style={potListStyles.contentCol}>
          {/* 1행: 제목 · 메뉴 */}
          <div style={potListStyles.row1}>
            <span style={{ ...potListStyles.title, maxWidth: pot.menu ? '55%' : '100%' }}>{pot.title}</span>
            {pot.menu && <span style={potListStyles.menuText}>· {pot.menu}</span>}
          </div>

          {/* 2행: 시간 · 참여자 아바타 — 인원수 텍스트 대신 실제 참여자 얼굴(이니셜/사진)로 보여준다 */}
          <div style={potListStyles.row2}>
            {timeStr && <span style={potListStyles.time}>{timeStr}{endStr}</span>}
            {filled > 0 && (
              <div style={potListStyles.avatarGroup}>
                {visibleAvatars.map((m, i) => (
                  <span key={m.id} style={{ ...potListStyles.avatarDot, marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i, ...(m.avatar_url ? potListStyles.avatarDotImg : {}) }}>
                    {m.avatar_url ? <img src={m.avatar_url} alt="" style={potListStyles.avatarImgInner} /> : m.nickname[0]}
                    {m.is_guest && <span style={potListStyles.guestMark}>G</span>}
                  </span>
                ))}
                {extraCount > 0 && <span style={{ ...potListStyles.avatarDot, marginLeft: -6 }}>+{extraCount}</span>}
              </div>
            )}
          </div>
        </div>

        <button type="button" style={{ ...potListStyles.joinBtn, ...buttonStyle }}>
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}

const potListStyles = {
  listContainer: { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 12px 10px', background: 'var(--color-surface-2)', borderRadius: 16 },
  card: {
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.05)', borderRadius: 14,
    padding: '12px 14px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 7,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  mainRow: { display: 'flex', alignItems: 'center', gap: 10 },
  iconThumb: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
  contentCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  row1: { display: 'flex', alignItems: 'baseline', gap: 5, overflow: 'hidden' },
  title: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '55%' },
  menuText: { fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--warm-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row2: { display: 'flex', alignItems: 'center', gap: 8 },
  time: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0 },
  avatarGroup: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatarDot: {
    width: 20, height: 20, borderRadius: '50%',
    background: 'var(--warm-500)', color: '#fff', fontSize: 9, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1.5px solid #fff', flexShrink: 0, position: 'relative',
  },
  avatarDotImg: { background: 'transparent', padding: 0, overflow: 'hidden' },
  avatarImgInner: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' },
  guestMark: { position: 'absolute', bottom: -2, right: -2, fontSize: 7, color: '#fff', background: 'var(--color-selected)', borderRadius: '50%', width: 9, height: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
  joinBtn: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: '#fff',
    background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-full)',
    padding: '6px 14px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
  },
  joinBtnFull: { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' },
  joinBtnJoined: { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 },
  slotBadge: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-chip-text)',
    background: 'var(--color-chip-bg)', borderRadius: 'var(--radius-full)',
    padding: '3px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3,
  },
  groupNameText: { fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  page: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 'calc(var(--bottom-nav-space) + 12px)', touchAction: 'pan-y' },
  loadingPage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, gap: 8 },
  emptyGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--color-border)' },
  emptyBtn: { marginTop: 4, padding: '12px 28px', background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,107,53,0.32)' },
  // margin-top을 -spacing-md로 줘서 .page의 top padding을 상쇄 — 안 그러면 날짜 네비가
  // 헤더보다 그 padding만큼 아래서 시작해, 스크롤 초반에 sticky 고정 지점(top)까지
  // 따라 올라가는 티가 난다(완전히 고정이 아니라 살짝 움직이는 것처럼 보임).
  // 일정/친구/내 계정의 헤더 아래 영역과 높이를 맞추려고 padding·버튼 크기를 그쪽 기준(10px, 34px)에 맞췄다.
  dateNav: { position: 'sticky', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.96)', backdropFilter: 'blur(8px)', margin: 'calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-md)) 0', width: 'calc(100% + 2 * var(--spacing-md))' },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0 },
  settingBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  // 날짜 행은 날짜(700) > 상대 라벨(600) 순으로 굵기를 벌려둔다. 예전에는 800/700/700이라
  // 셋이 같은 대역에 몰려 위계가 없었고, 굵은 획이 색 면적을 키워 색이 실제보다 무겁게 보였다.
  datePrimary: { fontWeight: 700, fontSize: 'var(--font-size-base)' },
  relBadge: { fontSize: 'var(--font-size-xs)', fontWeight: 600, borderRadius: 'var(--radius-full)', padding: '2px 8px' },
  // 배경·글자색은 relativeDay의 REL_TONE_FILL/REL_TONE_TEXT가 날짜에 따라 인라인으로 넣어준다.
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-chip-text)', background: 'var(--color-surface)', border: '1px solid var(--color-selected-a20)', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },
  myStatusSection: { display: 'flex', flexDirection: 'column', gap: 6, margin: 'calc(-1 * var(--spacing-md))', padding: 'var(--spacing-md)', background: '#EFE6D6' },
  slotResetBtn: { marginLeft: 3, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', opacity: 0.6, lineHeight: 1 },
  slotBody: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px 10px', minHeight: 68 },
  slotStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  slotMeta: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  slotEmpty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  slotPopup: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  slotPopupTitle: { fontWeight: 700, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  slotPopupStatusGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  slotPopupStatusBtn: {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1.5px solid', borderRadius: 14, cursor: 'pointer', transition: 'all 0.12s',
    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
  },
  slotPopupStatusTextCol: { display: 'flex', flexDirection: 'column', gap: 1 },
  slotPopupStatusLabel: { fontSize: 'var(--font-size-sm)' },
  slotPopupStatusSub: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 400, lineHeight: 1.3 },
  slotPopupFields: { display: 'flex', flexDirection: 'column', gap: 4, animation: 'slotPopupFieldsIn 0.18s ease-out' },
  slotPopupFieldWrap: { display: 'flex', flexDirection: 'column', gap: 4, transition: 'opacity 0.15s' },
  slotPopupFieldLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  slotPopupInput: { width: '100%', padding: '10px var(--spacing-sm)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', color: 'var(--color-text)', boxSizing: 'border-box' },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 700, fontSize: 'var(--font-size-base)' },
  timeDoneBtn: { ...PRIMARY_ACTION_BUTTON },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0' },
  timeCarouselSep: { width: 1, height: 40, background: 'var(--color-border)', flexShrink: 0, margin: '0 4px' },
  timeColon: { fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)', lineHeight: 1, paddingBottom: 2 },
  potInfoBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-success-border)' },
  potInfoCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  potInfoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  potInfoLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', width: 32, flexShrink: 0 },
  potInfoValue: { fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text)' },
  potLeaveBtn: { padding: '6px 12px', background: 'none', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-full)', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' },
  slotPopupBtns: { display: 'flex', gap: 8 },
  slotPopupSave: { ...PRIMARY_ACTION_BUTTON, width: 'auto', flex: 1 },
  slotPopupCancel: { padding: '13px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  floatingToast: {
    position: 'fixed', bottom: 'calc(76px + var(--safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
    maxWidth: 'calc(var(--max-width) - 32px)', zIndex: 400, background: 'rgba(30,25,20,0.8)', color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, padding: '10px 18px', borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)', textAlign: 'center', backdropFilter: 'blur(4px)',
    pointerEvents: 'none', animation: 'toastIn 0.22s ease',
  },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(26,20,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  dialogIconBadge: {
    width: 52, height: 52, borderRadius: '50%', background: 'var(--color-surface-2)', color: 'var(--color-chip-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dialogTitle: { fontWeight: 700, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  mainStatusMenuBtn: {
    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 700, lineHeight: 1, letterSpacing: '-1px', padding: '0 0 6px',
    borderRadius: '50%', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-text-muted)',
  },
  cardMenuOverlay: { position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' },
  cardMenuDropdown: {
    position: 'absolute', top: 30, right: 0, zIndex: 91, minWidth: 148,
    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)', padding: 4,
  },
  cardMenuItem: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box',
    padding: '9px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none',
    border: 'none', color: 'var(--color-text)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  mainStatusCard: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 16, background: '#fff', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mainStatusHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  mainStatusTitle: { fontWeight: 600, fontSize: 'var(--font-size-xs)', letterSpacing: '-0.2px', color: 'var(--color-text-muted)' },
  duplicatePotBadge: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-chip-text)', background: 'var(--color-surface)', border: '1px solid var(--color-primary-a20)', borderRadius: 'var(--radius-full)', padding: '1px 6px', fontWeight: 500 },
  mainStatusBody: { display: 'flex', alignItems: 'center', gap: 12 },
  // 아이콘 원본 png에 연한 받침 원이 같이 그려져 있어, 확대 후 원형으로 잘라내 여백을 줄이고 흰 테두리로 마무리한다.
  mainStatusIconWrap: {
    width: 86, height: 86, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '3px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
  },
  mainStatusIconImg: { width: 112, height: 112, flexShrink: 0 },
  mainStatusTextCol: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0, minHeight: 60 },
  mainStatusLabel: { fontSize: 'var(--font-size-lg)', fontWeight: 700, letterSpacing: '-0.3px' },
  mainStatusSub: { fontSize: 'var(--font-size-xs)', color: 'var(--warm-800)', fontWeight: 600, whiteSpace: 'pre-line', lineHeight: 1.4 },
  mainStatusMeta: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  mainStatusDesc: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mainStatusEmpty: { fontSize: 'var(--font-size-base)', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'pre-line', lineHeight: 1.4 },
  // 슬롯이 4개보다 적으면 남는 공간을 가운데로 몰아준다 — 버튼 자체가 커지지 않도록 justifyContent로 처리
  subSlotRow: { display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 4 },
  // flex-basis를 "4개 배열 기준 크기"로 고정하고 grow는 0으로 꺼서, 슬롯이 4개보다 적어도 이 크기 밑으로
  // 커지지 않는다. 4개보다 많으면(5~6개) shrink:1이 동일하게 나눠 줄여서 기존처럼 한 줄에 다 들어간다.
  subSlotBtn: { display: 'flex', flexDirection: 'column', flex: '0 1 calc((100% - 12px) / 4)', minWidth: 0, height: 60, boxSizing: 'border-box', padding: 0, border: '1.5px solid', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', WebkitTapHighlightColor: 'transparent' },
  subSlotIconZone: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  subSlotIconImg: { position: 'absolute', top: '50%', left: '50%', width: '80%', height: '80%', transform: 'translate(-50%, -50%)', objectFit: 'cover' },
  subSlotLabelZone: { flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '1px 0 4px' },
  subSlotLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '-0.3px' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontWeight: 700, fontSize: 'var(--font-size-base)', letterSpacing: '-0.4px' },
  groupCard: { marginBottom: 11, padding: '12px 12px 10px', background: 'var(--color-surface-2)', borderRadius: 16, transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupName: { fontWeight: 700, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.3px', color: 'var(--color-text)' },
  groupStatusSummary: { display: 'flex', gap: 6, marginBottom: 10 },
  groupStatusChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, borderRadius: 'var(--radius-full)', padding: '3px 9px', whiteSpace: 'nowrap' },
  memberSection: { padding: '0 0 4px', marginBottom: 2, borderBottom: '1px solid var(--warm-300)' },
  memberProposeBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-chip-text)', background: 'var(--color-primary-a08)', border: '1px solid var(--color-selected-a20)', borderRadius: 'var(--radius-full)', padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  memberProposeDone: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-success)', whiteSpace: 'nowrap' },
  memberCancelBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-success)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', textDecoration: 'underline' },
  memberProposeSendBtn: { ...PRIMARY_ACTION_BUTTON },
  proposeMenuInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  groupMealList: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  inviteBtn: { fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-chip-text)', background: 'var(--color-surface)', border: '1px solid var(--color-selected-a20)', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  groupHeaderIconBtn: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', border: '1px solid var(--warm-300)', borderRadius: '50%', fontSize: 14, color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, boxSizing: 'border-box' },
  viewMenuBtn: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--color-border)', borderRadius: '50%', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, boxSizing: 'border-box' },
  lowerSection: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', margin: '0 calc(-1 * var(--spacing-md))', padding: 'var(--spacing-md)', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', boxShadow: '0 -1px 6px rgba(0,0,0,0.03)' },
  viewModeTabs: { display: 'flex', gap: 6 },
  viewModeTab: { flex: 1, padding: '6px 0', fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-text-muted)', background: 'var(--color-chip-bg)', border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s' },
  viewModeTabActive: { color: 'var(--color-on-selected)', background: 'var(--color-selected)' },
  viewModeContent: { display: 'flex', flexDirection: 'column', gap: 4 },
  orderRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  orderHandle: { fontSize: 16, color: 'var(--color-text-muted)', flexShrink: 0 },
  orderName: { flex: 1, fontWeight: 700, fontSize: 'var(--font-size-base)' },
  orderBtns: { display: 'flex', gap: 4, flexShrink: 0 },
  orderBtn: { width: 32, height: 32, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  toggleWrap: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, whiteSpace: 'nowrap' },
  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(26,20,15,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: 'var(--color-surface)', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 28px rgba(26,20,15,0.14)', padding: 'var(--spacing-lg)', paddingBottom: 'calc(32px + var(--safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 6 },
  sheetTitleRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontWeight: 700, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  sheetMaster: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-chip-text)',
    background: 'var(--color-chip-bg)', border: '1px solid var(--color-selected-a12)',
    borderRadius: 'var(--radius-full)', padding: '3px 11px',
  },
  sheetDivider: { height: 1, background: 'var(--color-border)', margin: '8px 0 6px' },
  sheetSectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', padding: '10px 12px 4px' },
  sheetRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--color-bg)', border: 'none', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'left' },
  sheetRowIcon: {
    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
    background: 'var(--color-surface-2)', color: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  // 방장 전용 항목(그룹명 변경/멤버 관리/그룹 검색 허용) 아이콘 배지 — "그룹 나가기"의 danger 톤과
  // 같은 방식으로, 소제목 없이도 한눈에 방장 전용 항목임을 구분할 수 있게 한다.
  sheetRowIconMaster: { background: 'var(--color-chip-bg)', color: 'var(--color-chip-text)' },
  sheetRowLabel: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  sheetRowChevron: { fontSize: 10, color: 'var(--color-text-muted)' },
  sheetClose: { width: '100%', padding: 12, marginTop: 10, background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  sheetNicknameBadge: { fontSize: 'var(--font-size-xs)', fontWeight: 500, color: 'var(--color-chip-text)', background: 'var(--color-chip-bg)', border: '1px solid var(--color-selected-a12)', borderRadius: 'var(--radius-full)', padding: '1px 7px' },
  sheetMemberRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  sheetMemberName: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 600 },
  sheetRemoveBtn: { flexShrink: 0, padding: '5px 12px', background: 'none', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-danger)', cursor: 'pointer' },
  sheetResetNicknameBtn: { padding: '6px 0', background: 'none', border: 'none', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' },
  memberManageList: { width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '50vh', overflowY: 'auto' },

  dialogInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' },

  searchToggleRow: { display: 'flex', width: '100%', gap: 6 },
  searchToggleBtn: { flex: 1, padding: '9px 0', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-chip-bg)', fontSize: 'var(--font-size-xs)', fontWeight: 400, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  searchToggleBtnActive: { background: 'var(--color-selected)', color: 'var(--color-on-selected)' },
  searchPasswordRow: { width: '100%', display: 'flex', alignItems: 'center', gap: 6 },
  searchPasswordInput: { flex: 1, minWidth: 0, padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' },
  searchPasswordSaveBtn: { flexShrink: 0, padding: '10px 14px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  searchPasswordHint: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', margin: 0 },

  shareDialog: { width: '100%', maxWidth: 360, maxHeight: '80vh', overflowY: 'auto', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  shareTabs: { display: 'flex', width: '100%', gap: 6 },
  shareTabBtn: { flex: 1, padding: '8px 0', border: 'none', borderRadius: 'var(--radius-full)', background: 'var(--color-chip-bg)', fontSize: 'var(--font-size-xs)', fontWeight: 400, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  shareTabBtnActive: { background: 'var(--color-selected)', color: 'var(--color-on-selected)' },
  shareFriendList: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60, maxHeight: '40vh', overflowY: 'auto' },
  shareFriendRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  shareFriendName: { fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  shareFriendEmpty: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0', whiteSpace: 'pre-line', lineHeight: 1.5 },
  sharePanel: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  shareLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' },
  shareText: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-text)', wordBreak: 'break-all', lineHeight: 1.4 },
  shareCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, cursor: 'pointer' },
  invitePanel: { margin: '0 var(--spacing-md) var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 },
  inviteLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  inviteCodeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', border: '1px solid var(--color-border)' },
  inviteCode: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 700, letterSpacing: 2, color: 'var(--color-text)', wordBreak: 'break-all' },
  inviteCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--color-selected)' },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 'var(--font-size-xs)' },
  memberName: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, flexShrink: 0 },
  memberInfo: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, overflow: 'hidden' },
  memberMeta: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  metaDot: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-border)' },
  memberStatus: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, whiteSpace: 'nowrap' },
  memberStatusEmpty: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  potsArea: { padding: '10px var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 },
  potsLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' },
  createBtn: { width: '100%', padding: 12, background: 'none', border: 'none', borderTop: '1px solid var(--color-border)', color: 'var(--color-primary-text)', fontWeight: 600, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
  fabWrap: {
    position: 'fixed', bottom: 'calc(72px + var(--safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: 'var(--max-width)', zIndex: 90, pointerEvents: 'none',
  },
  fabBtn: {
    position: 'absolute', right: 16, bottom: 0, width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))', color: '#fff', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,107,53,0.4)', pointerEvents: 'auto',
  },
  fabIcon: { display: 'inline-block', fontSize: 36, fontWeight: 500, lineHeight: 1 },
  secondaryLinkRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: -6 },
  secondaryLinkBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit' },
  secondaryLinkDivider: { color: 'var(--color-border)', fontSize: 'var(--font-size-xs)' },
}
