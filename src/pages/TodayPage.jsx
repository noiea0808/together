import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getTodayBoard, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus, updateGroupName, leaveGroup, getMyStatuses, getGroupShareSettings, setGroupShareSetting, setGroupShareSettingBulk, leavePot, leavePotWithCleanup, deletePot, updatePotCreator, getGroupDefaultPotConfigs, ensureDefaultPots, updateGroupNickname, getPotByInviteCode, updateGroupOrder, getMyPotsForSlot, invitePotFriend, proposeMealTogether, getMyPendingInvitationsForDate, cancelPotInvitation } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCache, setCache, invalidateCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import { isPotTimeExpired } from '../lib/potConstants'
import PotCard from '../components/PotCard'
import BottomNav from '../components/BottomNav'
import Header from '../components/Header'
import GroupSetupModal from '../components/GroupSetupModal'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import RiceBowlIcon from '../components/RiceBowlIcon'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']
const SLOT_EMOJI = { '아침': '🌅', '점심': '☀️', '저녁': '🌙', '오전간식': '☕', '오후간식': '🍵', '야식': '🌃' }

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
function formatDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function getRelativeLabel(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / (1000 * 60 * 60 * 24))
  if (diff === 0)  return { label: '오늘',   color: 'var(--color-primary)' }
  if (diff === -1) return { label: '어제',   color: '#2196F3' }
  if (diff === -2) return { label: '엊그제', color: '#2196F3' }
  if (diff === 1)  return { label: '내일',   color: '#4CAF50' }
  if (diff === 2)  return { label: '모레',   color: '#4CAF50' }
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
  const [selectedSlot, setSelectedSlot] = useState(
    () => localStorage.getItem('lastSelectedSlot') || '점심'
  )
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('lastViewMode') || 'group'
  )
  const subSlotRowRef = useRef(null)
  // scrollBy({behavior:'smooth'}) 옵션객체 시그니처는 일부 인앱 브라우저(WebView)에서 지원이 불안정해
  // CSS scrollBehavior + 직접 scrollLeft 대입 방식(범용 호환)으로 스크롤한다.
  const scrollSubSlots = (dir) => {
    const el = subSlotRowRef.current
    if (!el) return
    el.scrollLeft += dir * 200
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
  // 밥팟 만들기 충돌 팝업
  const [createConflict, setCreateConflict] = useState(null) // { existingPot, groupId, slot }
  // 공유 토글 범위 선택 팝업
  const [shareTogglePending, setShareTogglePending] = useState(null) // { groupId, slot, isShared }
  // 그룹×슬롯 단위 공유 설정: { [groupId]: { [slot]: boolean } }
  const [shareSettingsMap, setShareSettingsMap] = useState({})
  // 밥팟 참여하기 다이얼로그
  const [showJoinPot, setShowJoinPot] = useState(false)
  const [joinPotInput, setJoinPotInput] = useState('')
  const [joinPotError, setJoinPotError] = useState('')
  // 그룹 만들기 / 참여하기 다이얼로그
  const [showGroupSetup, setShowGroupSetup] = useState(false)
  // 그룹 순서 편집
  const [editingOrder, setEditingOrder] = useState(false)
  const [localGroups, setLocalGroups] = useState([])
  // 밥팟 나가기 확인 팝업
  const [leavePotConfirm, setLeavePotConfirm] = useState(null) // pot 객체
  const [leavingPot, setLeavingPot] = useState(false)

  const dateStr = toDateStr(currentDate)
  const isToday = currentDate.getTime() === TODAY.getTime()

  // 팝업 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(editingSlot || showResetConfirm || createConflict || shareTogglePending || showJoinPot || showGroupSetup || leavePotConfirm))
  useEscKey(useCallback(() => {
    if (leavePotConfirm) { setLeavePotConfirm(null); return }
    if (slotEndPickerOpen) { setSlotEndPickerOpen(false); return }
    if (slotStartPickerOpen) { setSlotStartPickerOpen(false); return }
    if (editingSlot) { setEditingSlot(null); return }
    if (showJoinPot) { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError(''); return }
    if (showGroupSetup) { setShowGroupSetup(false); return }
    if (editingOrder) { cancelEditingOrder(); return }
    if (shareTogglePending) { setShareTogglePending(null); return }
    if (createConflict) { setCreateConflict(null); return }
    if (showResetConfirm) { setShowResetConfirm(false); return }
  }, [leavePotConfirm, slotEndPickerOpen, slotStartPickerOpen, editingSlot, showJoinPot, showGroupSetup, editingOrder, shareTogglePending, createConflict, showResetConfirm]))

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
        getTodayBoard(groupIds, dateStr),
        getMyStatuses(user.id, dateStr),
        getGroupShareSettings(user.id, dateStr).catch(() => []),
      ])

      // 기본 밥팟 자동 생성
      await Promise.all(myGroups.map(async g => {
        const configs = await getGroupDefaultPotConfigs(g.id)
        await ensureDefaultPots(g.id, dateStr, configs)
      }))
      // 자동 생성 후 팟 목록 재조회
      const refreshed = await getTodayBoard(groupIds, dateStr)

      // 내 상태 (사용자 의향 원본)
      const slots = {}
      myStatuses.forEach(s => {
        slots[s.slot] = { status: s.status, time: s.meal_time, end_time: s.end_time, menu: s.menu }
      })

      // 그룹 공유 설정
      const settingsMap = {}
      shareRows.forEach(row => {
        if (!settingsMap[row.group_id]) settingsMap[row.group_id] = {}
        settingsMap[row.group_id][row.slot] = row.is_shared
      })

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
      const [statuses, pots] = await Promise.all([
        getGroupStatuses(groupId, dateStr),
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

    const shareSub = supabase
      .channel(`share_settings_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_share_settings' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            scheduleReload([groupId])
          }
          // 내 설정이 바뀐 경우 shareSettingsMap도 갱신
          if (payload.new?.user_id === user.id) {
            const { group_id, slot, is_shared } = payload.new
            setShareSettingsMap(prev => ({
              ...prev,
              [group_id]: { ...(prev[group_id] ?? {}), [slot]: is_shared },
            }))
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

  const applyShare = (groupId, slot, isShared) => {
    setShareSettingsMap(prev => ({
      ...prev,
      [groupId]: { ...(prev[groupId] ?? {}), [slot]: isShared },
    }))
  }

  // 토글 클릭 → 팝업 띄우기
  const handleToggleShare = (groupId, slot, isShared) => {
    setShareTogglePending({ groupId, slot, isShared })
  }

  // 이 날짜만 적용
  const confirmShareSingle = async () => {
    const { groupId, slot, isShared } = shareTogglePending
    setShareTogglePending(null)
    applyShare(groupId, slot, isShared)
    try { await setGroupShareSetting(user.id, groupId, dateStr, slot, isShared) } catch {}
  }

  // 오늘 이후 전체 적용
  const confirmShareBulk = async () => {
    const { groupId, slot, isShared } = shareTogglePending
    setShareTogglePending(null)
    applyShare(groupId, slot, isShared)
    try { await setGroupShareSettingBulk(user.id, groupId, dateStr, slot, isShared) } catch {}
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
    const lockedOpt = isInPot ? SLOT_STATUS_OPTIONS.find(o => o.key === (inPotExpired ? '참여완료' : '참여중')) : null
    const displayOpt = lockedOpt ?? opt

    let timeStr = null, desc = null
    if (isInPot) {
      timeStr = `${earliestPot.meal_time?.slice(0, 5) ?? ''}${earliestPot.end_time ? `~${earliestPot.end_time.slice(0, 5)}` : ''}${potCount > 1 ? ` · ${potCount}타임` : ''}`
      const groupName = groups.find(g => g.id === earliestPot.group_id)?.name
      desc = groupName ? `${groupName}에서 같이 먹는 중` : earliestPot.title
    } else if (data?.time) {
      timeStr = `${data.time.slice(0, 5)}${data.end_time ? `~${data.end_time.slice(0, 5)}` : ''}`
      desc = data?.menu ?? null
    }

    return {
      emoji: displayOpt?.emoji ?? SLOT_EMOJI[slot],
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
    <Header hidden={headerHidden} />
    <div style={styles.page}>
      {/* 날짜 네비 — sticky 고정, 헤더가 접히면 그 자리(top:0)까지 따라 올라간다 */}
      <div style={{ ...styles.dateNav, top: headerHidden ? 0 : 44 }}>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, -1))}>
          <svg width="7" height="12" viewBox="0 0 9 15" fill="none"><path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          {(() => { const r = getRelativeLabel(currentDate); return <span style={{ ...styles.relBadge, background: r.color }}>{r.label}</span> })()}
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setCurrentDate(TODAY)}>오늘로</button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))}>
          <svg width="7" height="12" viewBox="0 0 9 15" fill="none"><path d="M1.5 1.5L7.5 7.5L1.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* 나의 상태 — 독립된 핵심 카드 하나 + 슬림한 슬롯 네비게이션 */}
      <div style={styles.myStatusSection}>
        {/* 핵심 카드: 항상 흰 배경, 상태는 텍스트 색상으로만 강조 */}
        {(() => {
          const info = getSlotInfo(selectedSlot)
          return (
            <div style={styles.mainStatusCard}>
              <div style={styles.mainStatusHeaderRow}>
                <span style={styles.mainStatusTitle}>내 {selectedSlot} 상태</span>
                {!info.isPastDate && (
                  <button style={styles.mainStatusChangeBtn} onClick={() => openSlotEditor(selectedSlot)}>변경</button>
                )}
              </div>
              <div style={styles.mainStatusBody}>
                <div style={styles.mainStatusIconWrap}>
                  <span style={{ fontSize: 20 }}>{SLOT_EMOJI[selectedSlot]}</span>
                </div>
                <div style={styles.mainStatusTextCol}>
                  {info.label ? (
                    <>
                      <span style={{ ...styles.mainStatusLabel, color: info.color }}>{info.label}</span>
                      {info.timeStr && <span style={styles.mainStatusMeta}>{info.timeStr}</span>}
                      {info.desc && <span style={styles.mainStatusDesc}>{info.desc}</span>}
                    </>
                  ) : (
                    <span style={styles.mainStatusEmpty}>
                      {info.isPastDate ? '기록 없음' : '탭해서 상태를 설정해보세요'}
                    </span>
                  )}
                </div>
                {info.isInPot && <RiceBowlIcon size={30} style={{ flexShrink: 0, opacity: 0.8 }} />}
              </div>
            </div>
          )
        })()}

        {/* 슬림한 한 줄 슬롯 네비게이션 — 화살표는 양 끝에 분리되어 카드와 겹치지 않음 */}
        <div style={styles.subSlotWrap}>
          <button style={styles.subSlotArrowBtn} onClick={() => scrollSubSlots(-1)} aria-label="이전">
            <svg width="6" height="10" viewBox="0 0 9 15" fill="none"><path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={styles.subSlotRow} className="no-scrollbar" ref={subSlotRowRef}>
            {SLOT_ORDER.map(slot => {
              const info = getSlotInfo(slot)
              const isSelected = selectedSlot === slot
              return (
                <button
                  key={slot}
                  style={{
                    ...styles.subSlotBtn,
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    background: isSelected ? 'rgba(255,107,53,0.06)' : '#fff',
                    opacity: info.isPastDate ? 0.65 : 1,
                  }}
                  onClick={() => {
                    setSelectedSlot(slot)
                    localStorage.setItem('lastSelectedSlot', slot)
                  }}
                >
                  <span style={styles.subSlotEmojiWrap}>{SLOT_EMOJI[slot]}</span>
                  <span style={styles.subSlotTextCol}>
                    <span style={{ ...styles.subSlotLabel, color: isSelected ? 'var(--color-primary)' : '#9E958B' }}>{slot}</span>
                    <span style={{ ...styles.subSlotStatus, color: info.label ? info.color : '#ADA59B' }}>{info.label ?? '미정'}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <button style={styles.subSlotArrowBtn} onClick={() => scrollSubSlots(1)} aria-label="다음">
            <svg width="6" height="10" viewBox="0 0 9 15" fill="none"><path d="M1.5 1.5L7.5 7.5L1.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* 초기화 — 핵심 카드 밖, 보조 텍스트 링크로 */}
        <div style={styles.resetLinkRow}>
          <button style={styles.resetAllBtn} onClick={() => setShowResetConfirm(true)}>↺ 하루 초기화</button>
        </div>
      </div>

      {/* 그룹별/밥팟별 보기 전환 — 하나의 세그먼트 컨트롤 */}
      {groups.length > 0 && (
        <div style={styles.viewModeTabs}>
          <button
            style={{ ...styles.viewModeTab, ...(viewMode === 'group' ? styles.viewModeTabActive : {}) }}
            onClick={() => { setViewMode('group'); localStorage.setItem('lastViewMode', 'group') }}
          >그룹별 보기</button>
          <button
            style={{ ...styles.viewModeTab, ...(viewMode === 'pot' ? styles.viewModeTabActive : {}) }}
            onClick={() => { setViewMode('pot'); localStorage.setItem('lastViewMode', 'pot') }}
          >밥팟별 보기</button>
        </div>
      )}

      {/* 오늘 열린 밥팟 — 목록이 메인 콘텐츠, 보조 컨트롤은 우측에 작게 */}
      <div style={styles.sectionTitleRow}>
        <div style={styles.sectionTitle}>{viewMode === 'group' ? `${selectedSlot} 현황` : '오늘 열린 밥팟'}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {viewMode === 'group' && groups.length > 1 && !editingOrder && (
            <button style={styles.collapseAllBtn} onClick={startEditingOrder}>순서 편집</button>
          )}
          {viewMode === 'group' && !editingOrder && (
            <button style={styles.collapseAllBtn} onClick={() => { setAllCollapsed(v => !v); setCollapseKey(k => k + 1) }}>
              {allCollapsed ? '모두 펼치기' : '모두 접기'}
            </button>
          )}
        </div>
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
                isShared={shareSettingsMap[group.id]?.[selectedSlot] ?? true}
                onToggleShare={(isShared) => handleToggleShare(group.id, selectedSlot, isShared)}
                amIInAnyPot={amIInAnyPot}
                allCollapsed={allCollapsed}
                collapseKey={collapseKey}
                dateStr={dateStr}
                onNavigate={navigate}
                onRefresh={() => loadData({ force: true })}
                onCreatePot={handleCreatePot}
              />
            )
          })
        })() : (
          <AllPotsView groups={groups} potsMap={potsMap} myUserId={user.id} onNavigate={navigate} />
        )}
      </div>

      {/* 주요 CTA — 밥팟별 보기에서만 전역 CTA를 강하게 노출(그룹별 보기는 그룹마다 자체 생성 버튼이 있음) */}
      {groups.length > 0 && viewMode === 'pot' && (
        <button style={styles.primaryCreateBtn} onClick={() => handleCreatePot(groups[0].id, selectedSlot)}>
          + 밥팟 만들기
        </button>
      )}
      <div style={styles.secondaryLinkRow}>
        <button style={styles.secondaryLinkBtn} onClick={() => setShowGroupSetup(true)}>그룹 만들기 / 참여하기</button>
        <span style={styles.secondaryLinkDivider}>·</span>
        <button style={styles.secondaryLinkBtn} onClick={() => setShowJoinPot(true)}>초대 코드로 참여</button>
      </div>
    </div>
    <BottomNav />

    {shareTogglePending && (
      <div style={styles.overlay}>
        <div style={styles.dialog}>
          <div style={{ fontSize: 32 }}>{shareTogglePending.isShared ? '🔓' : '🔒'}</div>
          <div style={styles.dialogTitle}>
            {shareTogglePending.isShared ? '상태 공유' : '상태 비공유'}
          </div>
          <p style={styles.dialogDesc}>
            이후 날짜에도 모두 적용할까요?{'\n'}
            <span style={{ fontSize: 12 }}>
              (그룹: 해당 그룹 · 슬롯: {shareTogglePending.slot})
            </span>
          </p>
          <div style={styles.dialogBtns}>
            <button style={styles.dialogBtnPrimary} onClick={confirmShareBulk}>
              오늘 이후 모두 적용
            </button>
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }} onClick={confirmShareSingle}>
              오늘만 적용
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => setShareTogglePending(null)}>취소</button>
          </div>
        </div>
      </div>
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
            const lockedOpt = SLOT_STATUS_OPTIONS.find(o => o.key === (inPotExpired ? '참여완료' : '참여중'))
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
                    <div key={pot.id} style={styles.potInfoCard}>
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
                      {currentDate >= TODAY && (
                        <button style={styles.potLeaveBtn} onClick={() => setLeavePotConfirm(pot)}>
                          밥팟 나가기
                        </button>
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
                fontWeight: !draftData.status ? 700 : 400,
              }}
              onClick={() => setDraftData(prev => ({ ...prev, status: undefined }))}
            >
              ○ 미설정
            </button>
            {SLOT_STATUS_OPTIONS.filter(o => o.selectable).map(o => (
              <button
                key={o.key}
                style={{
                  ...styles.slotPopupStatusBtn,
                  borderColor: draftData.status === o.key ? o.color : 'var(--color-border)',
                  background: draftData.status === o.key ? o.color + '15' : 'var(--color-surface-2)',
                  color: draftData.status === o.key ? o.color : 'var(--color-text)',
                  fontWeight: draftData.status === o.key ? 700 : 400,
                }}
                onClick={() => setDraftData(prev => ({ ...prev, status: o.key }))}
              >
                {o.emoji} {o.label}
              </button>
            ))}
          </div>

          {/* 시간 / 메모 */}
          {(() => {
            const fieldDisabled = !draftData.status || draftData.status === 'skip'
            const showEndTime = !fieldDisabled && (draftData.status === 'open' || draftData.status === 'closed')
            const ct = getCarouselTime(draftData.time)
            const updateCarousel = (patch) => {
              const next = { ...ct, ...patch }
              const newTime = carouselTimeToStr(next)
              setDraftData(prev => ({
                ...prev,
                time: newTime,
                end_time: (prev.duration_minutes ?? 0) > 0 ? addSlotMinutes(newTime, prev.duration_minutes) : prev.end_time,
              }))
            }
            const timeOn = !!draftData.time
            const carouselDisabled = fieldDisabled || !timeOn
            const dur = draftData.duration_minutes ?? 60
            const setSlotDuration = (min) => setDraftData(prev => ({
              ...prev,
              duration_minutes: min,
              end_time: min > 0 ? addSlotMinutes(prev.time, min) : prev.end_time,
            }))
            const endCt = getCarouselTime(draftData.end_time)
            const updateEndCarousel = (patch) => {
              const next = { ...endCt, ...patch }
              setDraftData(prev => ({ ...prev, end_time: carouselTimeToStr(next), duration_minutes: 0 }))
            }
            return (
              <div style={styles.slotPopupFields}>
                {fieldDisabled && (
                  <div style={styles.slotPopupDisabledBanner}>
                    {!draftData.status ? '상태를 먼저 선택하세요' : '패스는 시간/메모를 입력할 수 없어요'}
                  </div>
                )}
                {/* 시간 행 — 프리셋 버튼 */}
                <div style={{ ...styles.slotPopupFieldWrap }}>
                  <div style={styles.slotPopupFieldLabel}>시작시간</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(SLOT_TIME_PRESETS[editingSlot] ?? []).map(t => {
                      const isActive = !fieldDisabled && (draftData.time?.startsWith(t) ?? false)
                      return (
                        <button
                          key={t}
                          disabled={fieldDisabled}
                          style={{
                            padding: '6px 11px',
                            border: `1.5px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 99,
                            background: isActive ? 'rgba(255,107,53,0.09)' : 'transparent',
                            color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontSize: 12,
                            fontWeight: isActive ? 700 : 500,
                            cursor: fieldDisabled ? 'not-allowed' : 'pointer',
                            opacity: fieldDisabled ? 0.3 : 1,
                          }}
                          onClick={() => !fieldDisabled && setDraftData(prev => ({
                            ...prev,
                            time: t + ':00',
                            end_time: (prev.duration_minutes ?? 0) > 0 ? addSlotMinutes(t + ':00', prev.duration_minutes) : prev.end_time,
                          }))}
                        >{t}</button>
                      )
                    })}
                    {/* 직접 설정 */}
                    {(() => {
                      const isCustom = timeOn && !fieldDisabled && !(SLOT_TIME_PRESETS[editingSlot] ?? []).some(t => draftData.time?.startsWith(t))
                      return (
                        <button
                          type="button"
                          disabled={fieldDisabled}
                          style={{
                            padding: '6px 11px',
                            border: `1.5px solid ${isCustom ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            borderRadius: 99,
                            background: isCustom ? 'rgba(255,107,53,0.09)' : 'transparent',
                            color: isCustom ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontSize: 12,
                            fontWeight: isCustom ? 700 : 500,
                            cursor: fieldDisabled ? 'not-allowed' : 'pointer',
                            opacity: fieldDisabled ? 0.3 : 1,
                          }}
                          onClick={() => !fieldDisabled && setSlotStartPickerOpen(true)}
                        >
                          {isCustom && draftData.time ? draftData.time.slice(0, 5) : '직접 설정'}
                        </button>
                      )
                    })()}
                    {/* 시간 없음 버튼 */}
                    <button
                      disabled={fieldDisabled}
                      style={{
                        padding: '6px 11px',
                        border: `1.5px solid ${!timeOn && !fieldDisabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 99,
                        background: !timeOn && !fieldDisabled ? 'rgba(255,107,53,0.09)' : 'transparent',
                        color: !timeOn && !fieldDisabled ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        fontSize: 12,
                        fontWeight: !timeOn && !fieldDisabled ? 700 : 500,
                        cursor: fieldDisabled ? 'not-allowed' : 'pointer',
                        opacity: fieldDisabled ? 0.3 : 1,
                      }}
                      onClick={() => !fieldDisabled && setDraftData(prev => ({ ...prev, time: undefined, end_time: null }))}
                    >미정</button>
                  </div>
                </div>
                {/* 종료시간 행 — open/closed 이고 시간 ON일 때 */}
                {showEndTime && timeOn && (
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
                          style={{ flex: 1, padding: '4px 4px', border: `1.5px solid ${dur === o.min ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', background: dur === o.min ? 'var(--color-primary)18' : 'transparent', fontSize: 11, cursor: 'pointer', color: dur === o.min ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: dur === o.min ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
                          onClick={() => setSlotDuration(o.min)}>
                          {o.label}
                        </button>
                      ))}
                      <button
                        style={{ flex: 1, padding: '4px 4px', border: `1.5px solid ${dur === 0 ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-full)', background: dur === 0 ? 'var(--color-primary)18' : 'transparent', fontSize: 11, cursor: 'pointer', color: dur === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: dur === 0 ? 700 : 500, whiteSpace: 'nowrap', textAlign: 'center' }}
                        onClick={() => { setSlotDuration(0); setSlotEndPickerOpen(true) }}>
                        직접입력
                      </button>
                    </div>
                  </div>
                )}
                {/* 메모 행 */}
                <div style={{ ...styles.slotPopupFieldWrap, marginTop: 8, opacity: fieldDisabled ? 0.25 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...styles.slotPopupFieldLabel, flexShrink: 0 }}>메모</div>
                    <input
                      style={{ ...styles.slotPopupInput, flex: 1, background: fieldDisabled ? '#F0F0F0' : 'var(--color-surface)', cursor: fieldDisabled ? 'not-allowed' : 'auto' }}
                      placeholder="메모를 입력하세요"
                      value={draftData.menu ?? ''}
                      onChange={e => setDraftData(prev => ({ ...prev, menu: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') saveSlotEditor() }}
                      maxLength={20}
                      disabled={fieldDisabled}
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
            style={{ width: '100%', padding: '11px 14px', border: `1.5px solid ${joinPotError ? '#f44336' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', fontSize: 16, fontWeight: 700, letterSpacing: 2, textAlign: 'center', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
            placeholder="ABC123"
            value={joinPotInput}
            onChange={e => { setJoinPotInput(e.target.value); setJoinPotError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleJoinPotByCode() }}
            maxLength={60}
            autoFocus
          />
          {joinPotError && <p style={{ fontSize: 12, color: '#f44336', margin: 0 }}>{joinPotError}</p>}
          <div style={styles.dialogBtns}>
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-primary)' }} onClick={handleJoinPotByCode}>
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
            <button style={{ ...styles.dialogBtnPrimary, background: 'var(--color-primary)' }} onClick={saveGroupOrder}>저장</button>
            <button style={styles.dialogBtnCancel} onClick={cancelEditingOrder}>취소</button>
          </div>
        </div>
      </div>
    )}

    {showResetConfirm && (
      <div style={styles.overlay}>
        <div style={styles.dialog}>
          <div style={{ fontSize: 36 }}>↺</div>
          <div style={styles.dialogTitle}>하루 상태 초기화</div>
          <p style={styles.dialogDesc}>
            {formatDate(currentDate)}의 모든 슬롯 상태를 초기화합니다.{'\n'}
            참여 중인 밥팟에서도 자동으로 나가게 됩니다.{'\n'}
            계속하시겠어요?
          </p>
          <div style={styles.dialogBtns}>
            <button style={styles.dialogBtnPrimary} onClick={resetAll}>초기화하기</button>
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
            <button style={{ ...styles.dialogBtnPrimary, opacity: leavingPot ? 0.6 : 1 }} onClick={handleLeavePot} disabled={leavingPot}>
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

function GroupSlotCard({ group, slot, members, statuses, pots, myUserId, mySlotData, isShared, onToggleShare, amIInAnyPot, allCollapsed, collapseKey, dateStr, onNavigate, onRefresh, onCreatePot }) {
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
  useScrollLock(!!(showSettings || confirmRemoveMember || proposeTarget))

  const handleToggleSharing = () => onToggleShare(!isShared)

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
    { key: 'unset', label: '미설정', color: '#857B72', bg: '#F5F0EB', border: '#C7BFB6', count: unsetMembers.length },
  ]

  // 태그 미선택 시 전체 멤버(미설정 포함)를 한 목록으로, 태그 선택 시 해당 상태만 표시
  const displayedMembers = !statusFilter
    ? members
    : statusFilter === 'unset'
      ? unsetMembers
      : activeMembers.filter(m => getMemberData(m.id)?.status === statusFilter)

  return (
    <div style={styles.groupCard}>
      {/* 그룹 헤더 — 카드가 아닌 얇은 라벨 행 */}
      <div style={styles.groupHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ ...styles.groupName, color: isShared ? 'var(--color-text)' : '#8F877D' }}>{group.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isInThisGroupPot ? (
            <span style={styles.toggleLocked}>{isMyGroupPotExpired ? '✅ 참여완료' : <><RiceBowlIcon size={14} /> 같이 먹기로 함</>}</span>
          ) : (
            <button
              style={{
                fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                color: isShared ? '#FF6B35' : '#8F877D',
                background: isShared ? '#FFF4EF' : '#F5F0EB',
                border: `1px solid ${isShared ? '#FFD6C0' : '#E8E3DE'}`,
                borderRadius: 99, padding: '3px 9px', cursor: 'pointer',
              }}
              onClick={handleToggleSharing}
            >{isShared ? '공유중' : '비공유'}</button>
          )}
          <button style={styles.groupSettingsBtn} onClick={() => { setShowSettings(v => !v); setEditingName(false); setConfirmLeave(false); setShowInvite(false) }}>⚙️</button>
          <button style={styles.groupCollapseBtn} onClick={() => setCollapsed(v => !v)}>{collapsed ? '▸' : '▾'}</button>
        </div>
      </div>

      {/* 그룹 상태 요약 — 펼친 상태에선 아래 상태 필터 탭과 내용이 겹쳐 접혀 있을 때만 한눈에 보기 칩으로 표시 */}
      {collapsed && (
        <div style={styles.groupStatusSummary}>
          <span style={{ ...styles.groupStatusChip, color: '#2E9E4F', background: '#E8F5E9' }}>같이가능 {statusCounts['open'] ?? 0}</span>
          <span style={{ ...styles.groupStatusChip, color: '#FF6B35', background: '#FFF4EF' }}>같이 먹기로 함 {(statusCounts['참여중'] ?? 0) + (statusCounts['참여완료'] ?? 0)}</span>
          <span style={{ ...styles.groupStatusChip, color: '#857B72', background: '#F5F0EB' }}>미설정 {unsetMembers.length}</span>
        </div>
      )}

      {/* 그룹 설정 바텀시트 */}
      {showSettings && (
        <div style={styles.sheetOverlay} onClick={() => { setShowSettings(false); setEditingName(false); setEditingNickname(false); setShowInvite(false) }}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>

            {/* 타이틀 + 나가기 아이콘 */}
            <div style={styles.sheetTitleRow}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={styles.sheetTitle}>{group.name}</div>
                <div style={styles.sheetMaster}>
                  👑 {isMaster ? '나 (방장)' : (members.find(m => m.id === group.created_by)?.nickname ?? '?')} 방장
                </div>
              </div>
              <button style={styles.sheetLeaveIcon} onClick={() => setConfirmLeave(true)} title="그룹 나가기">🚪</button>
            </div>

            <div style={styles.sheetDivider} />

            {/* 1. 그룹명 변경 (방장만) */}
            {isMaster && (
              <div>
                <button style={styles.sheetRow} onClick={() => { setEditingName(v => !v); setEditingNickname(false); setShowInvite(false) }}>
                  <span>✏️</span>
                  <span style={styles.sheetRowLabel}>그룹명 변경</span>
                  <span style={styles.sheetRowChevron}>{editingName ? '▴' : '▾'}</span>
                </button>
                {editingName && (
                  <div style={styles.sheetInlineExpand}>
                    <div style={styles.sheetInlineInputRow}>
                      <input
                        style={styles.sheetInlineInput}
                        value={nameValue}
                        onChange={e => setNameValue(e.target.value)}
                        maxLength={20}
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                        placeholder="새 그룹명"
                      />
                      <button style={styles.sheetInlineSave} onClick={handleSaveName}>저장</button>
                      <button style={styles.sheetInlineCancel} onClick={() => { setEditingName(false); setNameValue(group.name) }}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. 그룹내 닉네임 변경 */}
            <div>
              <button style={styles.sheetRow} onClick={() => { setEditingNickname(v => !v); setEditingName(false); setShowInvite(false); if (!editingNickname) handleEditNicknameOpen() }}>
                <span>👤</span>
                <span style={styles.sheetRowLabel}>
                  그룹내 닉네임 변경
                  {myMember?.group_nickname && (
                    <span style={styles.sheetNicknameBadge}>{myMember.group_nickname}</span>
                  )}
                </span>
                <span style={styles.sheetRowChevron}>{editingNickname ? '▴' : '▾'}</span>
              </button>
              {editingNickname && (
                <div style={styles.sheetInlineExpand}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>
                    기본 닉네임: {myMember?.default_nickname}
                  </div>
                  <div style={styles.sheetInlineInputRow}>
                    <input
                      style={styles.sheetInlineInput}
                      value={nicknameValue}
                      onChange={e => setNicknameValue(e.target.value)}
                      placeholder={myMember?.default_nickname ?? '닉네임'}
                      maxLength={10}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleSaveNickname()}
                    />
                    <button style={styles.sheetInlineSave} onClick={handleSaveNickname}>저장</button>
                    <button style={styles.sheetInlineCancel} onClick={() => setEditingNickname(false)}>취소</button>
                  </div>
                  {myMember?.group_nickname && (
                    <button style={styles.sheetResetNicknameBtn} onClick={handleResetNickname}>
                      기본 닉네임으로 되돌리기
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. 멤버 관리 (방장만) */}
            {isMaster && (
              <div>
                <button style={styles.sheetRow} onClick={() => { setShowMemberManage(v => !v); setEditingName(false); setEditingNickname(false); setShowInvite(false) }}>
                  <span>👥</span>
                  <span style={styles.sheetRowLabel}>멤버 관리</span>
                  <span style={styles.sheetRowChevron}>{showMemberManage ? '▴' : '▾'}</span>
                </button>
                {showMemberManage && (
                  <div style={styles.sheetInlineExpand}>
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
                )}
              </div>
            )}

            {/* 4. 기본 밥팟 추가 */}
            <button style={styles.sheetRow} onClick={() => { setShowSettings(false); onNavigate(`/group/${group.id}/settings`) }}>
              <RiceBowlIcon size={20} /><span style={styles.sheetRowLabel}>기본 밥팟 추가</span>
            </button>

            {/* 4. 그룹 초대하기 */}
            <div>
              <button style={styles.sheetRow} onClick={() => { setShowInvite(v => !v); setEditingName(false); setEditingNickname(false) }}>
                <span>📨</span>
                <span style={styles.sheetRowLabel}>그룹 초대하기</span>
                <span style={styles.sheetRowChevron}>{showInvite ? '▴' : '▾'}</span>
              </button>
              {showInvite && (
                <div style={styles.sheetInlineExpand}>
                  <div style={styles.sheetInviteLabel}>초대 코드</div>
                  <div style={styles.sheetInviteCodeBox}>
                    <span style={styles.sheetInviteCode}>{group.invite_code}</span>
                    <button style={{ ...styles.sheetInviteCopyBtn, background: copied === 'code' ? '#4CAF50' : 'var(--color-primary)' }}
                      onClick={() => copyText(group.invite_code, 'code')}>
                      {copied === 'code' ? '✓' : '복사'}
                    </button>
                  </div>
                  <div style={{ ...styles.sheetInviteLabel, marginTop: 6 }}>초대 링크</div>
                  <div style={styles.sheetInviteCodeBox}>
                    <span style={{ ...styles.sheetInviteCode, fontSize: 11 }}>{`${window.location.origin}/join/${group.invite_code}`}</span>
                    <button style={{ ...styles.sheetInviteCopyBtn, background: copied === 'link' ? '#4CAF50' : 'var(--color-primary)' }}
                      onClick={() => copyText(`${window.location.origin}/join/${group.invite_code}`, 'link')}>
                      {copied === 'link' ? '✓' : '복사'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 닫기 */}
            <button style={styles.sheetClose} onClick={() => { setShowSettings(false); setEditingName(false); setEditingNickname(false); setShowInvite(false) }}>
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 그룹 나가기 확인 팝업 */}
      {confirmLeave && (
        <div style={styles.overlay} onClick={() => setConfirmLeave(false)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🚪</div>
            <div style={styles.dialogTitle}>{group.name} 나가기</div>
            <p style={styles.dialogDesc}>정말 이 그룹을 나가시겠어요?{'\n'}나가면 그룹의 일정 현황을 볼 수 없게 돼요.</p>
            <div style={styles.dialogBtns}>
              <button style={styles.dialogBtnPrimary} onClick={handleLeave}>나가기</button>
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
              <button style={styles.dialogBtnPrimary} onClick={handleRemoveMember}>내보내기</button>
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
            {proposeError && <p style={{ fontSize: 12, color: '#f44336', margin: 0 }}>{proposeError}</p>}
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
          <div className="no-scrollbar" style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 10 }}>
            {filterTabs.filter(tab => tab.key === 'open' || tab.count > 0).map(tab => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(isActive ? null : tab.key)}
                  style={{
                    fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                    color: isActive ? tab.color : '#857B72',
                    background: isActive ? (tab.bg ?? tab.color + '18') : '#F5F0EB',
                    border: `1px solid ${isActive ? (tab.border ?? tab.color + '44') : '#E8E3DE'}`,
                    borderRadius: 99, padding: '3px 9px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    opacity: (tab.count === 0 && tab.key !== 'open') ? 0.4 : 1,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {tab.key === 'open' ? `${tab.emoji} ` : ''}{tab.label} {tab.count}
                </button>
              )
            })}
          </div>

          {/* 멤버 목록 (태그 미선택 시 미설정 포함 전체) */}
          {displayedMembers.map((member) => {
            const data = getMemberData(member.id)
            const opt = data?.status
              ? SLOT_STATUS_OPTIONS.find(o => o.key === data.status)
              : { key: 'unset', label: '미설정', color: '#857B72', bg: '#F5F0EB', border: '#C7BFB6' }
            const isMe = member.id === myUserId
            const timeStr = data?.meal_time
              ? `${data.meal_time.slice(0, 5)}${data.end_time ? `~${data.end_time.slice(0, 5)}` : ''}`
              : ''
            const isOpen = opt?.key === 'open'
            return (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 0',
                borderBottom: `1px solid #F5F0EB`,
              }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: isMe ? 'var(--color-primary)' : '#857B72',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 800, flexShrink: 0,
                  }}>{member.nickname[0]}</div>
                )}
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, color: '#1A1A1A', letterSpacing: '-0.2px', flexShrink: 0 }}>
                  {member.nickname}{isMe ? ' (나)' : ''}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--font-size-xs)', color: '#857B72', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {timeStr}
                </span>
                {opt && (isOpen || !statusFilter) && (
                  <span style={isOpen ? {
                    fontSize: 'var(--font-size-2xs)', fontWeight: 800,
                    color: '#fff', background: opt.color,
                    border: `1px solid ${opt.color}`,
                    borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap', flexShrink: 0,
                  } : {
                    fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                    color: opt.color,
                    background: opt.bg ?? opt.color + '18',
                    border: `1px solid ${opt.border ?? opt.color + '44'}`,
                    borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{opt.label}</span>
                )}
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
                  return <button style={styles.memberProposeBtn} onClick={() => openPropose(member)}>🍚 같이 먹자</button>
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

      {!collapsed && (
        <button style={styles.groupCreateBtn} onClick={() => onCreatePot(group.id, slot)}>
          + {group.name}에 밥팟 만들기
        </button>
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
          그룹별 보기에서 밥팟을 만들어보세요.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {allPots.map(({ pot, groupName }) => (
        <MealPodCard key={pot.id} pot={pot} groupName={groupName} showMeta myUserId={myUserId} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

// 그룹별 보기 · 밥팟별 보기 공용 카드 — showMeta일 때만 상단에 슬롯/그룹 태그 표시
function MealPodCard({ pot, groupName, showMeta = false, myUserId, onNavigate }) {
  const potParticipants = (pot.pot_members ?? []).map(pm => {
    const groupNickname = pm.users?.group_members?.find(gm => gm.group_id === pot.group_id)?.nickname
    return { id: pm.user_id, nickname: groupNickname || (pm.users?.nickname ?? '?'), is_guest: pm.users?.is_guest }
  })
  const filled = potParticipants.length
  const isFull = filled >= pot.max_people
  const isJoined = potParticipants.some(p => p.id === myUserId)
  const timeStr = pot.meal_time?.slice(0, 5)
  const endStr = pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''
  const visibleAvatars = potParticipants.slice(0, 4)
  const extraCount = potParticipants.length - visibleAvatars.length

  return (
    <div
      style={potListStyles.card}
      onClick={() => onNavigate(`/pot/${pot.id}`)}
    >
      {/* 끼니 · 그룹명 — 밥팟별 보기에서만 표시 (그룹별 보기는 이미 슬롯/그룹 문맥 안이라 생략) */}
      {showMeta && (
        <div style={potListStyles.metaRow}>
          <span style={potListStyles.metaBadge}>{SLOT_EMOJI[pot.slot]} {pot.slot}</span>
          <span style={potListStyles.metaBadge}>👥 {groupName}</span>
        </div>
      )}

      {/* 1순위: 타임명  2순위: 시간 */}
      <div style={potListStyles.row1}>
        <span style={potListStyles.icon}>{pot.is_default ? <RiceBowlIcon size={26} /> : <span style={{ fontSize: 26 }}>🎉</span>}</span>
        <span style={potListStyles.title}>{pot.title}</span>
        {timeStr && <span style={potListStyles.time}>🕒 {timeStr}{endStr}</span>}
      </div>

      {/* 메뉴 · 메모 */}
      {(pot.menu || pot.memo) && (
        <div style={potListStyles.detailCol}>
          {pot.menu && <span style={potListStyles.menuText}>🍽 {pot.menu}</span>}
          {pot.memo && <span style={potListStyles.memoText}>💬 {pot.memo}</span>}
        </div>
      )}

      {/* 3순위: 참여 인원 · 참여자 아바타 */}
      <div style={potListStyles.row3}>
        <div style={potListStyles.avatarStack}>
          {visibleAvatars.map((m, i) => (
            <span key={m.id} style={{ ...potListStyles.avatarDot, marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}>
              {m.nickname[0]}
              {m.is_guest && <span style={potListStyles.guestMark}>G</span>}
            </span>
          ))}
          {extraCount > 0 && <span style={{ ...potListStyles.avatarDot, marginLeft: -6 }}>+{extraCount}</span>}
          <span style={potListStyles.count}>{filled}/{pot.max_people}명</span>
        </div>
        <button type="button" style={{ ...potListStyles.joinBtn, ...(isJoined ? potListStyles.joinBtnJoined : isFull ? potListStyles.joinBtnFull : {}) }}>
          {isJoined ? '같이 먹기로 함' : isFull ? '마감' : '같이 먹기'}
        </button>
      </div>
    </div>
  )
}

const potListStyles = {
  card: {
    background: '#fff',
    border: '1px solid rgba(0,0,0,0.05)', borderRadius: 14,
    padding: '11px 13px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', gap: 5,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  row1: { display: 'flex', alignItems: 'center', gap: 8 },
  icon: { width: 26, height: 26, fontSize: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text)', flexShrink: 0 },
  detailCol: { display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 34 },
  menuText: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: '#5A5148', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  memoText: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  row3: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  avatarStack: { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
  avatarDot: {
    width: 20, height: 20, borderRadius: '50%',
    background: '#A89E93', color: '#fff', fontSize: 9, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1.5px solid #fff', flexShrink: 0, position: 'relative',
  },
  guestMark: { position: 'absolute', bottom: -2, right: -2, fontSize: 7, color: '#fff', background: '#FF9800', borderRadius: '50%', width: 9, height: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  count: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', marginLeft: 8, flexShrink: 0 },
  joinBtn: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#fff',
    background: 'var(--color-primary)', border: 'none', borderRadius: 99,
    padding: '6px 14px', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit',
  },
  joinBtnFull: { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' },
  joinBtnJoined: { background: '#E8F5E9', color: '#4CAF50', border: '1px solid #A5D6A7' },
  metaRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 },
  metaBadge: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#857B72',
    background: 'var(--color-surface-2)', borderRadius: 99,
    padding: '2px 8px', whiteSpace: 'nowrap',
  },
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  page: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 80 },
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
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },
  myStatusSection: { display: 'flex', flexDirection: 'column', gap: 6 },
  resetLinkRow: { display: 'flex', justifyContent: 'flex-end' },
  resetAllBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 600, padding: '2px 4px', borderRadius: 'var(--radius-full)', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-text-muted)', opacity: 0.75 },
  slotResetBtn: { marginLeft: 3, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', opacity: 0.6, lineHeight: 1 },
  slotBody: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px 10px', minHeight: 68 },
  slotStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  slotMeta: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  slotEmpty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  slotPopup: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  slotPopupTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  slotPopupStatusGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  slotPopupStatusBtn: { padding: '10px 8px', border: '1.5px solid', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', cursor: 'pointer', transition: 'all 0.12s', textAlign: 'center' },
  slotPopupFields: { display: 'flex', flexDirection: 'column', gap: 4 },
  slotPopupFieldWrap: { display: 'flex', flexDirection: 'column', gap: 4, transition: 'opacity 0.15s' },
  slotPopupFieldLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  slotPopupInput: { width: '100%', padding: '10px var(--spacing-sm)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', color: 'var(--color-text)', boxSizing: 'border-box' },
  slotPopupDisabledBanner: { fontSize: 'var(--font-size-xs)', fontWeight: 600, color: '#9E9E9E', background: '#F5F5F5', border: '1px dashed #BDBDBD', borderRadius: 'var(--radius-sm)', padding: '6px 10px', textAlign: 'center' },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeDoneBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '4px 0' },
  timeCarouselSep: { width: 1, height: 40, background: 'var(--color-border)', flexShrink: 0, margin: '0 4px' },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)', lineHeight: 1, paddingBottom: 2 },
  potInfoBanner: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#E8F5E9', borderRadius: 'var(--radius-md)', border: '1.5px solid #A5D6A7' },
  potInfoCard: { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  potInfoRow: { display: 'flex', alignItems: 'center', gap: 8 },
  potInfoLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', width: 32, flexShrink: 0 },
  potInfoValue: { fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text)' },
  potLeaveBtn: { alignSelf: 'flex-start', marginTop: 2, padding: '4px 10px', background: 'none', border: '1px solid #f44336', borderRadius: 'var(--radius-full)', color: '#f44336', fontSize: 'var(--font-size-2xs)', fontWeight: 700, cursor: 'pointer' },
  slotPopupBtns: { display: 'flex', gap: 8 },
  slotPopupSave: { ...PRIMARY_ACTION_BUTTON, width: 'auto', flex: 1 },
  slotPopupCancel: { padding: '13px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: '#f44336', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  mainStatusChangeBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer', background: 'var(--color-surface-2)', border: 'none', color: 'var(--color-text)' },
  mainStatusCard: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 16, background: '#fff', border: '1px solid var(--color-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  mainStatusHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  mainStatusTitle: { fontWeight: 600, fontSize: 'var(--font-size-xs)', letterSpacing: '-0.2px', color: 'var(--color-text-muted)' },
  mainStatusBody: { display: 'flex', alignItems: 'center', gap: 10 },
  mainStatusIconWrap: { width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mainStatusTextCol: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0, minHeight: 64 },
  mainStatusLabel: { fontSize: 'var(--font-size-lg)', fontWeight: 900, letterSpacing: '-0.3px' },
  mainStatusMeta: { fontSize: 'var(--font-size-sm)', color: '#857B72', fontWeight: 600 },
  mainStatusDesc: { fontSize: 'var(--font-size-2xs)', color: '#ADA59B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mainStatusEmpty: { fontSize: 'var(--font-size-base)', color: '#ADA59B', fontWeight: 600 },
  subSlotWrap: { display: 'flex', alignItems: 'center', gap: 4 },
  subSlotArrowBtn: { flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'transparent', color: '#C7BFB6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  subSlotRow: { display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, minWidth: 0 },
  subSlotBtn: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, boxSizing: 'border-box', padding: '0 9px', border: '1.5px solid', borderRadius: 11, cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', WebkitTapHighlightColor: 'transparent', flex: '0 0 auto', whiteSpace: 'nowrap' },
  subSlotEmojiWrap: { width: 24, height: 24, borderRadius: '50%', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 },
  subSlotTextCol: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, alignItems: 'flex-start' },
  subSlotLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700 },
  subSlotStatus: { fontSize: 'var(--font-size-2xs)', fontWeight: 600 },
  sectionTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.4px' },
  groupCard: { marginBottom: 22, padding: '12px 12px 10px', background: 'var(--color-surface-2)', borderRadius: 16, transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.3px', color: 'var(--color-text)' },
  groupStatusSummary: { display: 'flex', gap: 6, marginBottom: 10 },
  groupStatusChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap' },
  memberSection: { padding: '0 0 8px', marginBottom: 2, borderBottom: '1px solid #E8E3DC' },
  memberProposeBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#fff', background: 'var(--color-primary)', border: 'none', borderRadius: 99, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  memberProposeDone: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#4CAF50', whiteSpace: 'nowrap' },
  memberCancelBtn: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#4CAF50', background: 'none', border: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', textDecoration: 'underline' },
  memberProposeSendBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  proposeMenuInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  groupMealList: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 },
  groupCreateBtn: { width: '100%', textAlign: 'center', padding: '9px 0', marginTop: 10, background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', color: 'var(--color-text)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  inviteBtn: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  groupSettingsBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '0 2px' },
  groupCollapseBtn: { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '0 2px', color: 'var(--color-text-muted)' },
  collapseAllBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', cursor: 'pointer' },
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
  toggleLocked: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: '#4CAF50', background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 'var(--radius-full)', padding: '3px 8px', whiteSpace: 'nowrap' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, whiteSpace: 'nowrap' },
  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 4 },
  sheetTitleRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  sheetMaster: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' },
  sheetLeaveIcon: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '0 2px', opacity: 0.5, flexShrink: 0 },
  sheetDivider: { height: 1, background: 'var(--color-border)', margin: '4px 0 8px' },
  sheetRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px var(--spacing-sm)', background: 'none', border: 'none', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'left' },
  sheetRowLabel: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  sheetRowChevron: { fontSize: 10, color: 'var(--color-text-muted)' },
  sheetInlineExpand: { padding: '0 var(--spacing-sm) 10px 36px', display: 'flex', flexDirection: 'column', gap: 6 },
  sheetInlineInputRow: { display: 'flex', gap: 6, alignItems: 'center' },
  sheetInlineInput: { flex: 1, padding: '9px 12px', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', minWidth: 0 },
  sheetInlineSave: { flexShrink: 0, padding: '9px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  sheetInlineCancel: { flexShrink: 0, padding: '9px 12px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer', color: 'var(--color-text-muted)' },
  sheetClose: { width: '100%', padding: 12, marginTop: 8, background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  sheetNicknameBadge: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 'var(--radius-full)', padding: '1px 7px' },
  sheetMemberRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' },
  sheetMemberName: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 600 },
  sheetRemoveBtn: { flexShrink: 0, padding: '5px 12px', background: 'none', border: '1px solid #FFCDD2', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: '#f44336', cursor: 'pointer' },
  sheetResetNicknameBtn: { padding: '6px 0', background: 'none', border: 'none', fontSize: 'var(--font-size-sm)', color: '#9E9E9E', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' },
  sheetInviteLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  sheetInviteCodeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' },
  sheetInviteCode: { flex: 1, fontSize: 'var(--font-size-base)', fontWeight: 700, letterSpacing: 1, wordBreak: 'break-all' },
  sheetInviteCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
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
  primaryCreateBtn: { width: '100%', padding: 14, background: 'linear-gradient(135deg, #FF6B35, #FF8C5A)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 800, cursor: 'pointer', boxShadow: '0 3px 10px rgba(255,107,53,0.22)' },
  secondaryLinkRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -6 },
  secondaryLinkBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit' },
  secondaryLinkDivider: { color: 'var(--color-border)', fontSize: 'var(--font-size-xs)' },
}
