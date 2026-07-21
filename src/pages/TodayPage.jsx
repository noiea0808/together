import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getTodayBoard, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus, updateGroupName, leaveGroup, getMyStatuses, getGroupShareSettings, setGroupShareSettingBulk, leavePot, leavePotWithCleanup, deletePot, updatePotCreator, getGroupDefaultPotConfigs, ensureDefaultPots, updateGroupNickname, getPotByInviteCode, updateGroupOrder, getMyPotsForSlot, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation, getMyFriends, inviteGroupFriend } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCache, setCache, invalidateCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import { isPotTimeExpired, getJoinedStatusLabel } from '../lib/potConstants'
import PotCard from '../components/PotCard'
import BottomNav from '../components/BottomNav'
import AppHeader from '../components/AppHeader'
import GroupSetupModal from '../components/GroupSetupModal'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { UsersIcon, UserIcon, PencilIcon, SendIcon, LogOutIcon, CrownIcon, SlidersIcon, UndoIcon, ChevronDownIcon, BroadcastIcon, BroadcastOffIcon, MoreHorizontalIcon } from '../components/GroupIcons'
import SlotIcon from '../components/SlotIcon'
import StatusIcon from '../components/StatusIcon'
import PotIcon from '../components/PotIcon'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 상태값별 내 상태 카드 보조 문구
const STATUS_SUBTEXT = {
  open: (slot) => `오늘 ${slot} 같이 먹을 수 있어요`,
  closed: (slot) => `오늘 ${slot}은 약속이 있어요`,
  skip: (slot) => `이번 ${slot}은 쉬어갈게요`,
}
const STATUS_SUBTEXT_EMPTY = (slot) => `오늘 ${slot}은 어떻게 할까요?`

// 상태 선택 팝업의 버튼 부제 — 슬롯명은 팝업 타이틀에 이미 나오므로 빼고, 뜻만 짧게.
// 메인 카드에 쓰는 STATUS_SUBTEXT(슬롯명 포함, 문장형)와는 용도가 달라 별도로 둔다.
const STATUS_BTN_SUBTEXT = {
  open: '같이 먹을 수 있어요',
  closed: '이미 약속이 있어요',
  skip: '이번엔 쉬어갈게요',
}

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

// 슬롯별 분위기에 어울리는 상태 카드 배경 — 아침(새벽 노을)/오전간식(커피)/점심(한낮 햇살)/오후간식(녹차)/저녁(노을)/야식(밤)
const SLOT_THEME = {
  '아침':    { bg: '#FFF1E6', border: '#FFD9B8' },
  '오전간식': { bg: '#F3E6D8', border: '#E0C9A6' },
  '점심':    { bg: '#FFF9DB', border: '#FFE993' },
  '오후간식': { bg: '#EAF5E4', border: '#C8E6B9' },
  '저녁':    { bg: '#F7E6EE', border: '#E7C2D8' },
  '야식':    { bg: '#E6E9F5', border: '#C3CAE8' },
}

// 밥팟별 보기의 슬롯 칩용 — SLOT_THEME과 같은 색상 계열(연한 배경/테두리)에 읽히는
// 텍스트 색만 더해 재사용. 같은 슬롯이 화면마다 다른 색으로 보이지 않도록 통일.
const SLOT_CHIP_COLOR = {
  '아침':    { ...SLOT_THEME['아침'],    text: '#C2703A' },
  '오전간식': { ...SLOT_THEME['오전간식'], text: '#8B6B3D' },
  '점심':    { ...SLOT_THEME['점심'],    text: '#A67C00' },
  '오후간식': { ...SLOT_THEME['오후간식'], text: '#4C8C3C' },
  '저녁':    { ...SLOT_THEME['저녁'],    text: '#B0568C' },
  '야식':    { ...SLOT_THEME['야식'],    text: '#5C63B0' },
}

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

function getRelativeLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24))
  if (diff === 0)  return { label: '오늘',   color: 'var(--color-primary)' }
  if (diff === -1) return { label: '어제',   color: 'var(--color-info)' }
  if (diff === -2) return { label: '엊그제', color: 'var(--color-info)' }
  if (diff === 1)  return { label: '내일',   color: 'var(--color-success)' }
  if (diff === 2)  return { label: '모레',   color: 'var(--color-success)' }
  if (diff < 0)   return { label: `${Math.abs(diff)}일 전`, color: '#9E9E9E' }
  return { label: `${diff}일 뒤`, color: '#9E9E9E' }
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)

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
  const headerHidden = useHideOnScroll()

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
  const handleCardSwipeStart = (e) => { e.stopPropagation(); swipeStart.current = { x: e.clientX, y: e.clientY } }
  const handleCardSwipeEnd = (e) => {
    if (!swipeStart.current) return
    e.stopPropagation()
    const dx = e.clientX - swipeStart.current.x
    const dy = e.clientY - swipeStart.current.y
    swipeStart.current = null
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
    cardWasDragged.current = true
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    const idx = SLOT_ORDER.indexOf(selectedSlot)
    if (dx < 0 && idx < SLOT_ORDER.length - 1) goToSlot(SLOT_ORDER[idx + 1])
    else if (dx > 0 && idx > 0) goToSlot(SLOT_ORDER[idx - 1])
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
  const handlePageSwipeStart = (e) => { pageSwipeStart.current = { x: e.clientX, y: e.clientY } }
  const handlePageSwipeEnd = (e) => {
    if (!pageSwipeStart.current) return
    const dx = e.clientX - pageSwipeStart.current.x
    const dy = e.clientY - pageSwipeStart.current.y
    pageSwipeStart.current = null
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
      const myGroups = await getMyGroups(user.id)
      if (myGroups.length === 0) {
        const snap = { groups: [], membersMap: {}, statusesMap: {}, potsMap: {}, mySlots: {}, shareSettingsMap: {} }
        applySnapshot(snap)
        setCache(key, snap)
        return
      }

      const groupIds = myGroups.map(g => g.id)
      // 보드(멤버/상태/팟) 일괄 + 내 상태 + 공유설정 병렬 — 그룹 수와 무관하게 상수 횟수 쿼리
      const [board, myStatuses, shareRows] = await Promise.all([
        getTodayBoard(groupIds, dateStr, user.id),
        getMyStatuses(user.id, dateStr),
        getGroupShareSettings(user.id, dateStr).catch(() => []),
      ])

      // 기본 밥팟 자동 생성
      await Promise.all(myGroups.map(async g => {
        const configs = await getGroupDefaultPotConfigs(g.id)
        await ensureDefaultPots(g.id, dateStr, configs)
      }))
      // 자동 생성 후 팟 목록 재조회
      const refreshed = await getTodayBoard(groupIds, dateStr, user.id)

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
      applySnapshot(snap)
      setCache(key, snap)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user, dateStr, applySnapshot])

  useEffect(() => { loadData() }, [loadData])

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
      timeStr = `${earliestPot.meal_time?.slice(0, 5) ?? ''}${earliestPot.end_time ? ` ~ ${earliestPot.end_time.slice(0, 5)}` : ''}${potCount ? ` · ${potCount}타임` : ''}`
      const groupName = groups.find(g => g.id === earliestPot.group_id)?.name
      desc = groupName ? `${groupName}에서 ${lockedLabel}` : `${earliestPot.title} 밥팟에 ${inPotExpired ? '참여 완료' : '참여 중'}`
    } else if (data?.time) {
      timeStr = `${data.time.slice(0, 5)}${data.end_time ? ` ~ ${data.end_time.slice(0, 5)}` : ''}`
      desc = data?.menu ?? null
    }

    return {
      key: displayOpt?.key ?? null,
      label: displayOpt?.label ?? null,
      color: displayOpt?.color ?? '#ADA59B',
      bg: isPastDate ? '#F0EEEB' : (displayOpt?.bg ?? 'var(--color-surface)'),
      border: isPastDate ? '#E8E3DE' : (displayOpt?.border ?? 'var(--color-border)'),
      timeStr,
      desc,
      isInPot,
      isPastDate,
    }
  }

  if (loading) {
    return <div style={styles.loadingPage}><RiceBowlIcon size={40} /><br /><span style={{ fontSize: 14, marginTop: 8 }}>불러오는 중...</span></div>
  }


  return (
    <div style={styles.wrap}>
    <AppHeader brand={{ icon: <RiceBowlIcon size={24} />, label: '같이 먹자' }} hidden={headerHidden} />
    <div
      style={styles.page}
      onPointerDown={handlePageSwipeStart}
      onPointerUp={handlePageSwipeEnd}
      onPointerCancel={() => { pageSwipeStart.current = null }}
    >
      {/* 날짜 네비 — sticky 고정, 헤더가 접히면 그 자리(top:0)까지 따라 올라간다 */}
      <div
        style={{ ...styles.dateNav, top: headerHidden ? 0 : 'var(--header-height)', touchAction: 'pan-y' }}
      >
        <button style={styles.navBtn} onClick={() => goToDate(d => addDays(d, -1))}>
          <svg width="7" height="12" viewBox="0 0 9 15" fill="none"><path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          {(() => { const r = getRelativeLabel(currentDate); return <span style={{ ...styles.relBadge, background: r.color }}>{r.label}</span> })()}
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
              <span style={styles.mainStatusTitle}>내 {slot}</span>
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
                          <UndoIcon size={13} strokeWidth={2.2} /> 오늘 상태 초기화
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={styles.mainStatusBody}>
              <div style={{ ...styles.mainStatusIconWrap, opacity: info.isPastDate ? 0.6 : 1 }}>
                {info.key
                  ? <StatusIcon statusKey={info.key} size={112} style={styles.mainStatusIconImg} />
                  : <SlotIcon slot={slot} size={112} style={styles.mainStatusIconImg} />}
              </div>
              <div style={styles.mainStatusTextCol}>
                {info.label ? (
                  <>
                    <span style={{ ...styles.mainStatusLabel, color: info.color }}>{info.label}</span>
                    {STATUS_SUBTEXT[info.key] && <span style={styles.mainStatusSub}>{STATUS_SUBTEXT[info.key](slot)}</span>}
                    {info.timeStr && <span style={styles.mainStatusMeta}>{info.timeStr}</span>}
                    {info.desc && <span style={styles.mainStatusDesc}>{info.desc}</span>}
                  </>
                ) : (
                  <span style={styles.mainStatusEmpty}>
                    {info.isPastDate ? '기록 없음' : STATUS_SUBTEXT_EMPTY(slot)}
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

        {/* 슬롯 네비게이션 — 6개 슬롯을 화면 폭 안에 한 번에 표시. 아이콘 존은 중립색, 하단 라벨 띠가 상태색을 담당 */}
        <div style={styles.subSlotRow}>
          {SLOT_ORDER.map(slot => {
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
                  <SlotIcon slot={slot} muted={!isSelected} style={styles.subSlotIconImg} />
                </div>
                <div style={{ ...styles.subSlotLabelZone, background: info.label ? info.bg : 'var(--color-surface-2)' }}>
                  <span style={{ ...styles.subSlotLabel, color: isSelected ? 'var(--color-primary)' : (info.label ? info.color : '#9E958B') }}>{slot}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
        )
      })()}

      {/* 그룹별 보기 영역 전체 — 흰색 풀블리드 블록으로 상단 '내 상태' 영역과 경계를 분리 */}
      <div style={styles.lowerSection}>
        {/* 그룹별/밥팟별 보기 전환 — 하나의 세그먼트 컨트롤 */}
        {groups.length > 0 && (
          <div style={styles.viewModeTabs}>
            <button
              style={{ ...styles.viewModeTab, ...(viewMode === 'pot' ? styles.viewModeTabActive : {}) }}
              onClick={() => { setViewMode('pot'); localStorage.setItem('lastViewMode', 'pot') }}
            >밥팟 보기</button>
            <button
              style={{ ...styles.viewModeTab, ...(viewMode === 'group' ? styles.viewModeTabActive : {}) }}
              onClick={() => { setViewMode('group'); localStorage.setItem('lastViewMode', 'group') }}
            >그룹 보기</button>
          </div>
        )}

        {/* 오늘 열린 밥팟 — 목록이 메인 콘텐츠, 보조 컨트롤은 더보기(⋮) 메뉴로 묶어서 우측에 작게 */}
        <div style={styles.sectionTitleRow}>
          <div style={styles.sectionTitle}>{viewMode === 'group' ? `${selectedSlot} 현황` : '오늘 열린 밥팟'}</div>
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

        {groups.length === 0 && (
          <div style={styles.emptyGroup}>
            <div style={{ fontSize: 36 }}>👥</div>
            <div style={{ fontWeight: 700 }}>아직 그룹이 없어요</div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textAlign: 'center', lineHeight: 1.6 }}>
              그룹을 만들거나 초대 코드로 참여하면<br />팀원 상태를 여기서 볼 수 있어요.
            </p>
            <button style={styles.emptyBtn} onClick={() => setShowGroupSetup(true)}>
              그룹 만들기 / 참여하기
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
          })() : (
            <AllPotsView groups={groups} potsMap={potsMap} myUserId={user.id} onNavigate={navigate} />
          )}
        </div>

        <div style={styles.secondaryLinkRow}>
          <button style={styles.secondaryLinkBtn} onClick={() => setShowGroupSetup(true)}>그룹 만들기 / 참여하기</button>
          <span style={styles.secondaryLinkDivider}>·</span>
          <button style={styles.secondaryLinkBtn} onClick={() => setShowJoinPot(true)}>초대 코드로 밥팟 참여</button>
        </div>
      </div>
      </div>
    </div>
    <BottomNav />

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
                    <div style={{ fontWeight: 700, color: lockedOpt.color, fontSize: 14 }}>{lockedOpt.label}</div>
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
                          <div style={{ fontWeight: 700, color: opt.color, fontSize: 14 }}>{opt.label}</div>
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
                        <div style={{ fontWeight: 700, fontSize: 14 }}>미설정</div>
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
                background: !draftData.status ? 'rgba(255,107,53,0.08)' : 'var(--color-surface-2)',
                color: !draftData.status ? 'var(--color-primary)' : 'var(--color-text-muted)',
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
                            border: `1.5px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 'var(--radius-full)',
                            background: isActive ? 'rgba(255,107,53,0.09)' : 'transparent',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
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
                            border: `1.5px solid ${isCustom ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 'var(--radius-full)',
                            background: isCustom ? 'rgba(255,107,53,0.09)' : 'transparent',
                            color: isCustom ? 'var(--color-primary)' : 'var(--color-text-muted)',
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
                        border: `1.5px solid ${!timeOn ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-full)',
                        background: !timeOn ? 'rgba(255,107,53,0.09)' : 'transparent',
                        color: !timeOn ? 'var(--color-primary)' : 'var(--color-text-muted)',
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
                        style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, background: 'var(--color-surface)', color: dur > 0 ? 'var(--color-primary)' : 'var(--color-text)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px 10px', cursor: 'pointer' }}
                        onClick={() => setSlotEndPickerOpen(v => !v)}
                      >
                        {draftData.end_time || '--:--'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                      {[{ min: 30, label: '30분' }, { min: 60, label: '1시간' }, { min: 90, label: '1.5시간' }, { min: 120, label: '2시간' }].map(o => (
                        <button key={o.min}
                          style={{ flex: 1, padding: '4px 4px', border: `1.5px solid ${dur === o.min ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', background: dur === o.min ? 'rgba(255,107,53,0.09)' : 'transparent', fontSize: 11, cursor: 'pointer', color: dur === o.min ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: dur === o.min ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={() => setSlotDuration(o.min)}>
                          {o.label}
                        </button>
                      ))}
                      <button
                        style={{ flex: 1, padding: '4px 4px', border: `1.5px solid ${dur === 0 ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', background: dur === 0 ? 'rgba(255,107,53,0.09)' : 'transparent', fontSize: 11, cursor: 'pointer', color: dur === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: dur === 0 ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
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
            style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${joinPotError ? 'var(--color-danger)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', fontSize: 16, fontWeight: 700, letterSpacing: 2, textAlign: 'center', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
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
  const [showSettings, setShowSettings] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.name)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { setCollapsed(allCollapsed) }, [collapseKey])

  // 그룹 전용 닉네임 편집
  const myMember = members.find(m => m.id === myUserId)
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameValue, setNicknameValue] = useState('')

  // 멤버 관리
  const [showMemberManage, setShowMemberManage] = useState(false)
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null) // { id, nickname }

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
        await invitePotFriend(existing[0].pot_id, myUserId, proposeTarget.id)
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
  useScrollLock(!!(showSettings || editingName || editingNickname || showMemberManage || showInvite || confirmRemoveMember || proposeTarget))

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
    if (!nameValue.trim()) return
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

  const copyText = (text, type) => {
    navigator.clipboard?.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
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
    { key: 'unset', label: '미설정', color: 'var(--color-text-muted)', bg: 'var(--color-border)', border: '#C7BFB6', count: unsetMembers.length },
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
          <span style={{ ...styles.groupName, color: effectiveIsShared ? 'var(--color-text)' : '#8F877D' }}>{group.name}</span>
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
            <span style={{ ...styles.groupStatusChip, color: '#8F877D', background: '#F5F0EB', border: '1px solid #E8E3DE' }}>{SLOT_STATUS_OPTIONS.find(o => o.key === '참여완료').label} {statusCounts['참여완료']}</span>
          )}
          <span style={{ ...styles.groupStatusChip, color: 'var(--color-text-muted)', background: '#F5F0EB', border: '1px solid #E8E3DE' }}>미설정 {unsetMembers.length}</span>
        </div>
      )}

      {/* 그룹 설정 바텀시트 */}
      {showSettings && (
        <div style={styles.sheetOverlay} onClick={() => { setShowSettings(false); setEditingName(false); setEditingNickname(false); setShowMemberManage(false); setShowInvite(false) }}>
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

            {/* 1. 그룹명 변경 (방장만) */}
            {isMaster && (
              <button style={styles.sheetRow} onClick={() => setEditingName(true)}>
                <span style={styles.sheetRowIcon}><PencilIcon size={17} /></span>
                <span style={styles.sheetRowLabel}>그룹명 변경</span>
                <span style={styles.sheetRowChevron}>›</span>
              </button>
            )}

            {/* 2. 그룹내 닉네임 변경 */}
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

            {/* 3. 멤버 관리 (방장만) */}
            {isMaster && (
              <button style={styles.sheetRow} onClick={() => setShowMemberManage(true)}>
                <span style={styles.sheetRowIcon}><UsersIcon size={17} /></span>
                <span style={styles.sheetRowLabel}>멤버 관리</span>
                <span style={styles.sheetRowChevron}>›</span>
              </button>
            )}

            {/* 4. 기본 밥팟 추가 */}
            <button style={styles.sheetRow} onClick={() => { setShowSettings(false); onNavigate(`/group/${group.id}/settings`) }}>
              <span style={styles.sheetRowIcon}><RiceBowlIcon size={18} /></span>
              <span style={styles.sheetRowLabel}>기본 밥팟 추가</span>
            </button>

            {/* 5. 그룹 초대하기 */}
            <button style={styles.sheetRow} onClick={() => { setShowInvite(true); setInviteTab('friend') }}>
              <span style={styles.sheetRowIcon}><SendIcon size={16} /></span>
              <span style={styles.sheetRowLabel}>그룹 초대하기</span>
              <span style={styles.sheetRowChevron}>›</span>
            </button>

            {/* 6. 그룹 나가기 */}
            <button style={{ ...styles.sheetRow, color: 'var(--color-danger)' }} onClick={() => setConfirmLeave(true)}>
              <span style={{ ...styles.sheetRowIcon, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}><LogOutIcon size={17} /></span>
              <span style={styles.sheetRowLabel}>그룹 나가기</span>
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
              placeholder="새 그룹명"
            />
            <div style={styles.dialogBtns}>
              <button style={styles.dialogBtnPrimary} onClick={handleSaveName}>저장</button>
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
                    <div style={{ ...styles.avatar, background: '#888' }}>
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
                  <span style={{ ...styles.shareText, fontSize: 22, fontWeight: 800, letterSpacing: 4 }}>{group.invite_code}</span>
                  <button style={{ ...styles.shareCopyBtn, background: copied === 'code' ? 'var(--color-success)' : 'var(--color-primary)' }} onClick={() => copyText(group.invite_code, 'code')}>
                    {copied === 'code' ? '✓' : '복사'}
                  </button>
                </div>
              </div>
            )}

            {inviteTab === 'link' && (
              <div style={styles.sharePanel}>
                <div style={styles.shareLabel}>초대 링크</div>
                <div style={styles.shareRow}>
                  <span style={styles.shareText}>{`${window.location.origin}/join/${group.invite_code}`}</span>
                  <button style={{ ...styles.shareCopyBtn, background: copied === 'link' ? 'var(--color-success)' : 'var(--color-primary)' }} onClick={() => copyText(`${window.location.origin}/join/${group.invite_code}`, 'link')}>
                    {copied === 'link' ? '✓' : '복사'}
                  </button>
                </div>
              </div>
            )}

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
                    fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                    color: isActive ? tab.color : 'var(--color-text-muted)',
                    background: isActive ? (tab.key === '참여완료' ? 'var(--color-border)' : (tab.bg ?? tab.color + '18')) : '#F5F0EB',
                    border: `1px solid ${isActive ? (tab.key === '참여완료' ? '#C7BFB6' : (tab.border ?? tab.color + '44')) : '#E8E3DE'}`,
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
                borderBottom: `1px solid #F5F0EB`,
              }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--color-border)', boxSizing: 'border-box' }} />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: isMe ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 800, flexShrink: 0,
                    border: '2px solid var(--color-border)', boxSizing: 'border-box',
                  }}>{member.nickname[0]}</div>
                )}
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: '#1A1A1A', letterSpacing: '-0.2px', flexShrink: 0 }}>
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

// 그룹별 보기 전용 — 팀명을 반복하지 않는 슬림한 타임 행 (밥팟별 보기의 독립 카드와 의도적으로 다른 형태)
// 밥팟별 보기 — 슬롯 구분 없이 해당 날짜에 열린 전체 밥팟을 그룹/슬롯 순으로 나열
function AllPotsView({ groups, potsMap, myUserId, onNavigate }) {
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
        <div style={{ fontWeight: 700 }}>오늘 열린 밥팟이 없어요</div>
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
            <span style={potListStyles.title}>{pot.title}</span>
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
  title: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, maxWidth: '55%' },
  menuText: { fontSize: 'var(--font-size-xs)', fontWeight: 500, color: '#5A5148', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row2: { display: 'flex', alignItems: 'center', gap: 8 },
  time: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0 },
  avatarGroup: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatarDot: {
    width: 20, height: 20, borderRadius: '50%',
    background: '#A89E93', color: '#fff', fontSize: 9, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1.5px solid #fff', flexShrink: 0, position: 'relative',
  },
  avatarDotImg: { background: 'transparent', padding: 0, overflow: 'hidden' },
  avatarImgInner: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' },
  guestMark: { position: 'absolute', bottom: -2, right: -2, fontSize: 7, color: '#fff', background: '#FF9800', borderRadius: '50%', width: 9, height: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  joinBtn: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#fff',
    background: 'var(--color-primary)', border: 'none', borderRadius: 'var(--radius-full)',
    padding: '6px 14px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
  },
  joinBtnFull: { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' },
  joinBtnJoined: { background: 'var(--color-success-bg)', color: 'var(--color-success)', border: '1px solid var(--color-success-border)' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 },
  slotBadge: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary-dark)',
    background: 'rgba(255,107,53,0.08)', borderRadius: 'var(--radius-full)',
    padding: '3px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3,
  },
  groupNameText: { fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  page: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 80, touchAction: 'pan-y' },
  loadingPage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, gap: 8 },
  emptyGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--color-border)' },
  emptyBtn: { marginTop: 4, padding: '12px 28px', background: 'linear-gradient(135deg, #FF6B35, #FF8C5A)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,107,53,0.32)' },
  dateNav: { position: 'sticky', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.96)', backdropFilter: 'blur(8px)', margin: '0 calc(-1 * var(--spacing-md))', width: 'calc(100% + 2 * var(--spacing-md))', transition: 'top 0.22s ease' },
  navBtn: { width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'var(--color-surface)', color: '#A89E93', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', flexShrink: 0 },
  settingBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  todayBadge: { fontSize: 'var(--font-size-xs)', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(255,107,53,0.07)', border: '1px solid rgba(255,107,53,0.27)', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },
  myStatusSection: { display: 'flex', flexDirection: 'column', gap: 6, margin: 'calc(-1 * var(--spacing-md))', padding: 'var(--spacing-md)', background: '#EFE6D6' },
  slotResetBtn: { marginLeft: 3, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', opacity: 0.6, lineHeight: 1 },
  slotBody: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px 10px', minHeight: 68 },
  slotStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  slotMeta: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  slotEmpty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  slotPopup: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  slotPopupTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
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
  slotPopupFieldLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  slotPopupInput: { width: '100%', padding: '10px var(--spacing-sm)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', color: 'var(--color-text)', boxSizing: 'border-box' },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeDoneBtn: { ...PRIMARY_ACTION_BUTTON },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0' },
  timeCarouselSep: { width: 1, height: 40, background: 'var(--color-border)', flexShrink: 0, margin: '0 4px' },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)', lineHeight: 1, paddingBottom: 2 },
  potInfoBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--color-success-bg)', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-success-border)' },
  potInfoCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  potInfoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  potInfoLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', width: 32, flexShrink: 0 },
  potInfoValue: { fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text)' },
  potLeaveBtn: { padding: '6px 12px', background: 'none', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-full)', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  slotPopupBtns: { display: 'flex', gap: 8 },
  slotPopupSave: { ...PRIMARY_ACTION_BUTTON, width: 'auto', flex: 1 },
  slotPopupCancel: { padding: '13px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  floatingToast: {
    position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)',
    maxWidth: 'calc(var(--max-width) - 32px)', zIndex: 400, background: 'rgba(30,25,20,0.8)', color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, padding: '10px 18px', borderRadius: 'var(--radius-lg)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)', textAlign: 'center', backdropFilter: 'blur(4px)',
    pointerEvents: 'none', animation: 'toastIn 0.22s ease',
  },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(26,20,15,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  dialogIconBadge: {
    width: 52, height: 52, borderRadius: '50%', background: 'var(--color-surface-2)', color: 'var(--color-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  mainStatusMenuBtn: {
    width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 900, lineHeight: 1, letterSpacing: '-1px', padding: '0 0 6px',
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
  mainStatusBody: { display: 'flex', alignItems: 'center', gap: 12 },
  // 아이콘 원본 png에 연한 받침 원이 같이 그려져 있어, 확대 후 원형으로 잘라내 여백을 줄이고 흰 테두리로 마무리한다.
  mainStatusIconWrap: {
    width: 86, height: 86, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '3px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.06)',
  },
  mainStatusIconImg: { width: 112, height: 112, flexShrink: 0 },
  mainStatusTextCol: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0, minHeight: 60 },
  mainStatusLabel: { fontSize: 'var(--font-size-lg)', fontWeight: 900, letterSpacing: '-0.3px' },
  mainStatusSub: { fontSize: 'var(--font-size-xs)', color: '#5A5148', fontWeight: 600 },
  mainStatusMeta: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  mainStatusDesc: { fontSize: 'var(--font-size-2xs)', color: '#ADA59B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mainStatusEmpty: { fontSize: 'var(--font-size-base)', color: '#ADA59B', fontWeight: 600 },
  subSlotRow: { display: 'flex', alignItems: 'stretch', gap: 4 },
  subSlotBtn: { display: 'flex', flexDirection: 'column', flex: '1 1 0', minWidth: 0, height: 60, boxSizing: 'border-box', padding: 0, border: '1.5px solid', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', WebkitTapHighlightColor: 'transparent' },
  subSlotIconZone: { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' },
  subSlotIconImg: { position: 'absolute', top: '50%', left: '50%', width: '80%', height: '80%', transform: 'translate(-50%, -50%)', objectFit: 'cover' },
  subSlotLabelZone: { flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '1px 0 4px' },
  subSlotLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.3px' },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.4px' },
  groupCard: { marginBottom: 22, padding: '12px 12px 10px', background: 'var(--color-surface-2)', borderRadius: 16, transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.3px', color: 'var(--color-text)' },
  groupStatusSummary: { display: 'flex', gap: 6, marginBottom: 10 },
  groupStatusChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '3px 9px', whiteSpace: 'nowrap' },
  memberSection: { padding: '0 0 4px', marginBottom: 2, borderBottom: '1px solid #E8E3DC' },
  memberProposeBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.27)', borderRadius: 'var(--radius-full)', padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  memberProposeDone: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)', whiteSpace: 'nowrap' },
  memberCancelBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-success)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', textDecoration: 'underline' },
  memberProposeSendBtn: { ...PRIMARY_ACTION_BUTTON },
  proposeMenuInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  groupMealList: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  inviteBtn: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(255,107,53,0.07)', border: '1px solid rgba(255,107,53,0.27)', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  groupHeaderIconBtn: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', border: '1px solid #E2DBD3', borderRadius: '50%', fontSize: 14, color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, boxSizing: 'border-box' },
  viewMenuBtn: { width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--color-border)', borderRadius: '50%', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, boxSizing: 'border-box' },
  lowerSection: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', margin: '0 calc(-1 * var(--spacing-md))', padding: 'var(--spacing-md)', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', boxShadow: '0 -1px 6px rgba(0,0,0,0.03)' },
  viewModeTabs: { display: 'flex', gap: 6 },
  viewModeTab: { flex: 1, padding: '6px 0', fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s, color 0.15s, border-color 0.15s' },
  viewModeTabActive: { color: 'var(--color-primary)', background: 'rgba(255,107,53,0.06)', border: '1px solid var(--color-primary)', fontWeight: 700 },
  viewModeContent: { display: 'flex', flexDirection: 'column', gap: 4 },
  orderRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  orderHandle: { fontSize: 16, color: 'var(--color-text-muted)', flexShrink: 0 },
  orderName: { flex: 1, fontWeight: 700, fontSize: 'var(--font-size-base)' },
  orderBtns: { display: 'flex', gap: 4, flexShrink: 0 },
  orderBtn: { width: 32, height: 32, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  toggleWrap: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, whiteSpace: 'nowrap' },
  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(26,20,15,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: 'var(--color-surface)', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 28px rgba(26,20,15,0.14)', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 6 },
  sheetTitleRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  sheetMaster: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)',
    background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)',
    borderRadius: 'var(--radius-full)', padding: '3px 11px',
  },
  sheetDivider: { height: 1, background: 'var(--color-border)', margin: '8px 0 6px' },
  sheetRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--color-bg)', border: 'none', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'left' },
  sheetRowIcon: {
    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
    background: 'var(--color-surface-2)', color: 'var(--color-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  sheetRowLabel: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  sheetRowChevron: { fontSize: 10, color: 'var(--color-text-muted)' },
  sheetClose: { width: '100%', padding: 12, marginTop: 10, background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  sheetNicknameBadge: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 'var(--radius-full)', padding: '1px 7px' },
  sheetMemberRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  sheetMemberName: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 600 },
  sheetRemoveBtn: { flexShrink: 0, padding: '5px 12px', background: 'none', border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-danger)', cursor: 'pointer' },
  sheetResetNicknameBtn: { padding: '6px 0', background: 'none', border: 'none', fontSize: 'var(--font-size-sm)', color: '#9E9E9E', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' },
  memberManageList: { width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '50vh', overflowY: 'auto' },

  dialogInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--color-surface)', color: 'var(--color-text)' },

  shareDialog: { width: '100%', maxWidth: 360, maxHeight: '80vh', overflowY: 'auto', background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  shareTabs: { display: 'flex', width: '100%', gap: 6 },
  shareTabBtn: { flex: 1, padding: '8px 0', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'inherit' },
  shareTabBtnActive: { border: '1.5px solid var(--color-primary)', background: 'rgba(255,107,53,0.09)', color: 'var(--color-primary)' },
  shareFriendList: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60, maxHeight: '40vh', overflowY: 'auto' },
  shareFriendRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  shareFriendName: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  shareFriendEmpty: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', padding: '16px 0', whiteSpace: 'pre-line', lineHeight: 1.5 },
  sharePanel: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  shareLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' },
  shareText: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-text)', wordBreak: 'break-all', lineHeight: 1.4 },
  shareCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-2xs)', fontWeight: 700, cursor: 'pointer' },
  invitePanel: { margin: '0 var(--spacing-md) var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 },
  inviteLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  inviteCodeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', border: '1px solid var(--color-border)' },
  inviteCode: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 800, letterSpacing: 2, color: 'var(--color-text)', wordBreak: 'break-all' },
  inviteCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-xs)' },
  memberName: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, flexShrink: 0 },
  memberInfo: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, overflow: 'hidden' },
  memberMeta: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  metaDot: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-border)' },
  memberStatus: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, whiteSpace: 'nowrap' },
  memberStatusEmpty: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  potsArea: { padding: '10px var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 },
  potsLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  createBtn: { width: '100%', padding: 12, background: 'none', border: 'none', borderTop: '1px solid var(--color-border)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
  fabWrap: {
    position: 'fixed', bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)',
    width: '100%', maxWidth: 'var(--max-width)', zIndex: 90, pointerEvents: 'none',
  },
  fabBtn: {
    position: 'absolute', right: 16, bottom: 0, width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(135deg, #FF6B35, #FF8C5A)', color: '#fff', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,107,53,0.4)', pointerEvents: 'auto',
  },
  fabIcon: { display: 'inline-block', fontSize: 36, fontWeight: 500, lineHeight: 1 },
  secondaryLinkRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: -6 },
  secondaryLinkBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit' },
  secondaryLinkDivider: { color: 'var(--color-border)', fontSize: 'var(--font-size-xs)' },
}
