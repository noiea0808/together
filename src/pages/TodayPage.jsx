import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getTodayBoard, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus, updateGroupName, leaveGroup, getMyStatuses, getGroupShareSettings, setGroupShareSetting, setGroupShareSettingBulk, leavePot, leavePotWithCleanup, deletePot, updatePotCreator, getGroupDefaultPotConfigs, ensureDefaultPots, updateGroupNickname, getPotByInviteCode, updateGroupOrder } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCache, setCache, invalidateCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import PotCard from '../components/PotCard'
import BottomNav from '../components/BottomNav'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'

const SLOT_ORDER = ['아침', '점심', '저녁', '오전간식', '오후간식', '야식']

const SLOT_TIME_PRESETS = {
  '아침':    ['07:00', '07:30', '08:00', '08:30', '09:00'],
  '오전간식': ['09:30', '10:00', '10:30', '11:00'],
  '점심':    ['11:30', '12:00', '12:30', '13:00'],
  '오후간식': ['14:00', '14:30', '15:00', '15:30'],
  '저녁':    ['17:30', '18:00', '18:30', '19:00', '19:30'],
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

  const initialDate = (() => {
    const d = searchParams.get('date')
    if (d) { const parsed = new Date(d); parsed.setHours(0,0,0,0); if (!isNaN(parsed)) return parsed }
    return TODAY
  })()
  const [currentDate, setCurrentDate] = useState(initialDate)
  const [selectedSlot, setSelectedSlot] = useState(
    () => localStorage.getItem('lastSelectedSlot') || '점심'
  )
  const [editingSlot, setEditingSlot] = useState(null)   // 팝업 열린 슬롯
  const [draftData, setDraftData] = useState({})          // 팝업 임시 입력값
  const [slotEndPickerOpen, setSlotEndPickerOpen] = useState(false)
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
  // 그룹 순서 편집
  const [editingOrder, setEditingOrder] = useState(false)
  const [localGroups, setLocalGroups] = useState([])

  const dateStr = toDateStr(currentDate)
  const isToday = currentDate.getTime() === TODAY.getTime()

  // 팝업 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(editingSlot || showResetConfirm || createConflict || shareTogglePending || showJoinPot))
  useEscKey(useCallback(() => {
    if (slotEndPickerOpen) { setSlotEndPickerOpen(false); return }
    if (editingSlot) { setEditingSlot(null); return }
    if (showJoinPot) { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError(''); return }
    if (editingOrder) { cancelEditingOrder(); return }
    if (shareTogglePending) { setShareTogglePending(null); return }
    if (createConflict) { setCreateConflict(null); return }
    if (showResetConfirm) { setShowResetConfirm(false); return }
  }, [slotEndPickerOpen, editingSlot, showJoinPot, editingOrder, shareTogglePending, createConflict, showResetConfirm]))

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
      .subscribe()

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
      .subscribe()

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
      .subscribe()

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

  if (loading) {
    return <div style={styles.loadingPage}>🍚<br /><span style={{ fontSize: 14, marginTop: 8 }}>불러오는 중...</span></div>
  }


  return (
    <div style={styles.wrap}>
    <div style={styles.page}>
      {/* 날짜 네비 — sticky 고정 */}
      <div style={styles.dateNav}>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, -1))}>
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          {(() => { const r = getRelativeLabel(currentDate); return <span style={{ ...styles.relBadge, background: r.color }}>{r.label}</span> })()}
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setCurrentDate(TODAY)}>오늘로</button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))}>
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d="M1.5 1.5L7.5 7.5L1.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* 나의 상태 슬롯 그리드 */}
      <div style={styles.myCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={styles.myCardTitle}>오늘 나는?</div>
          <button style={styles.resetAllBtn} onClick={() => setShowResetConfirm(true)}>
            ↺ 초기화
          </button>
        </div>
        <div style={styles.slotGrid}>
          {SLOT_ORDER.map(slot => {
            const data = mySlots[slot]
            const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
            const isSelected = selectedSlot === slot
            const isPastDate = currentDate < TODAY

            const myPotsInSlot = Object.values(potsMap).flat()
              .filter(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
              .sort((a, b) => (a.meal_time ?? '').localeCompare(b.meal_time ?? ''))
            const potCount = myPotsInSlot.length
            const earliestPot = myPotsInSlot[0]
            const isInPot = potCount > 0
            const hasDefaultPot = Object.values(potsMap).flat()
              .some(p => p.slot === slot && p.is_default)
            const lockedOpt = isInPot ? SLOT_STATUS_OPTIONS.find(o => o.key === '참여중') : null
            const displayOpt = lockedOpt ?? opt

            const cardStatusOpt = isInPot ? lockedOpt : displayOpt
            const cardBg = isPastDate ? '#F0EEEB' : cardStatusOpt ? (cardStatusOpt.bg ?? cardStatusOpt.color + '15') : 'var(--color-surface)'
            const cardBorder = isPastDate ? '#E8E3DE' : isSelected ? 'var(--color-primary)' : cardStatusOpt ? (cardStatusOpt.border ?? 'var(--color-border)') : 'var(--color-border)'

            return (
              <div
                key={slot}
                style={{
                  background: cardBg,
                  border: `${isSelected && !isPastDate ? 2 : 1.5}px solid ${cardBorder}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  opacity: isPastDate ? 0.65 : 1,
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'border-color 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* 제목부: 탭하면 현황만 보기 (편집 없음) */}
                <div
                  style={{
                    padding: '8px 9px 7px',
                    borderBottom: `1px solid ${cardStatusOpt ? (cardStatusOpt.border ?? 'var(--color-border)') : 'var(--color-border)'}`,
                    background: 'rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                  onClick={() => {
                    setSelectedSlot(slot)
                    localStorage.setItem('lastSelectedSlot', slot)
                  }}
                >
                  <span style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', fontWeight: 700, letterSpacing: '-0.1px' }}>
                    {({ '아침': '🌅', '점심': '☀️', '저녁': '🌙', '오전간식': '☕', '오후간식': '🍵', '야식': '🌃' })[slot]} {slot}
                  </span>
                  {hasDefaultPot && (
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#4CAF50', background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 4, padding: '1px 4px', lineHeight: 1.4 }}>기본</span>
                  )}
                </div>

                {/* 설정부: 탭하면 현황 보기 + 편집 가능 */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 62,
                    padding: '8px 9px 9px',
                    cursor: isPastDate ? 'default' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                  onClick={() => {
                    if (isPastDate) return
                    setSelectedSlot(slot)
                    localStorage.setItem('lastSelectedSlot', slot)
                    openSlotEditor(slot)
                  }}
                >
                  {isInPot ? (
                    <>
                      <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 800, color: '#FF6B35' }}>{lockedOpt.label}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94' }}>
                        {earliestPot.meal_time?.slice(0, 5)}{earliestPot.end_time ? `~${earliestPot.end_time.slice(0, 5)}` : ''}
                      </span>
                      {earliestPot.title && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{earliestPot.title}</span>
                      )}
                    </>
                  ) : displayOpt ? (
                    <>
                      <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 800, color: displayOpt.color }}>{displayOpt.label}</span>
                      {data?.time && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94' }}>
                          {data.time.slice(0, 5)}{data.end_time ? `~${data.end_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                      {data?.menu && (
                        <span style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.menu}</span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: '#C8BEB4', letterSpacing: '-0.1px' }}>
                      {isPastDate ? '' : '탭해서 설정'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 그룹별 현황 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={styles.sectionTitle}>{selectedSlot} 현황</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {groups.length > 1 && !editingOrder && (
            <button style={styles.collapseAllBtn} onClick={startEditingOrder}>순서 편집</button>
          )}
          {!editingOrder && (
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
          <button style={styles.emptyBtn} onClick={() => navigate('/group-setup')}>
            그룹 만들기 / 참여하기
          </button>
        </div>
      )}
      {(() => {
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
      })()}

      <div style={styles.bottomBtnRow}>
        <button style={styles.addGroupBtn} onClick={() => navigate('/group-setup')}>
          + 그룹 만들기 / 참여하기
        </button>
        <button style={styles.joinPotBtn} onClick={() => setShowJoinPot(true)}>
          🍚 밥팟 참여하기
        </button>
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
            const lockedOpt = SLOT_STATUS_OPTIONS.find(o => o.key === '참여중')
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
                onClick={() => setDraftData(prev => {
                  const needsTimeInit = o.key !== 'skip' && !prev.time
                  const newTime = needsTimeInit ? carouselTimeToStr(getCarouselTime(null)) : prev.time
                  const dur = prev.duration_minutes ?? 60
                  return {
                    ...prev,
                    status: o.key,
                    time: newTime,
                    end_time: (needsTimeInit && o.key !== 'skip') ? addSlotMinutes(newTime, dur) : prev.end_time,
                  }
                })}
              >
                {o.emoji} {o.label}
              </button>
            ))}
          </div>

          {/* 시간 / 메뉴 */}
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
                    {!draftData.status ? '상태를 먼저 선택하세요' : '패스는 시간/메뉴를 입력할 수 없어요'}
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
                    {/* 직접 입력 */}
                    {(() => {
                      const isCustom = timeOn && !fieldDisabled && !(SLOT_TIME_PRESETS[editingSlot] ?? []).some(t => draftData.time?.startsWith(t))
                      return (
                        <label style={{
                          padding: '6px 11px',
                          border: `1.5px solid ${isCustom ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          borderRadius: 99,
                          background: isCustom ? 'rgba(255,107,53,0.09)' : 'transparent',
                          color: isCustom ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          fontSize: 12,
                          fontWeight: isCustom ? 700 : 500,
                          cursor: fieldDisabled ? 'not-allowed' : 'pointer',
                          opacity: fieldDisabled ? 0.3 : 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          position: 'relative',
                        }}>
                          {isCustom && draftData.time ? draftData.time.slice(0, 5) : '직접 입력'}
                          <input
                            type="time"
                            disabled={fieldDisabled}
                            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: fieldDisabled ? 'not-allowed' : 'pointer', width: '100%' }}
                            value={draftData.time?.slice(0, 5) ?? ''}
                            onChange={e => {
                              const val = e.target.value
                              if (!val) return
                              setDraftData(prev => ({
                                ...prev,
                                time: val + ':00',
                                end_time: (prev.duration_minutes ?? 0) > 0 ? addSlotMinutes(val + ':00', prev.duration_minutes) : prev.end_time,
                              }))
                            }}
                          />
                        </label>
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
                {/* 메뉴 행 */}
                <div style={{ ...styles.slotPopupFieldWrap, marginTop: 8, opacity: fieldDisabled ? 0.25 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ ...styles.slotPopupFieldLabel, flexShrink: 0 }}>메뉴</div>
                    <input
                      style={{ ...styles.slotPopupInput, flex: 1, background: fieldDisabled ? '#F0F0F0' : 'var(--color-surface)', cursor: fieldDisabled ? 'not-allowed' : 'auto' }}
                      placeholder="메뉴를 입력하세요"
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
          <div style={{ fontSize: 36 }}>🍚</div>
          <div style={styles.dialogTitle}>밥팟 참여하기</div>
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
              참여하기
            </button>
            <button style={styles.dialogBtnCancel} onClick={() => { setShowJoinPot(false); setJoinPotInput(''); setJoinPotError('') }}>취소</button>
          </div>
        </div>
      </div>
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

  // 설정 시트가 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(showSettings || confirmRemoveMember))

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

  const getMemberData = (userId) => {
    if (userId === myUserId) {
      if (!isShared) return null
      // mySlots는 time 키 사용 → 표시용 meal_time으로 매핑
      const mine = mySlotData ? { ...mySlotData, meal_time: mySlotData.time } : null
      if (isInThisGroupPot) {
        const myPot = pots.find(p => p.pot_members?.some(pm => pm.user_id === myUserId))
        return { ...mine, status: '참여중', meal_time: myPot?.meal_time ?? mine?.meal_time }
      }
      if (amIInAnyPot) {
        // 다른 그룹 팟 참여 → 약속있음. 팟 시간은 파생된 statuses 행에서 가져옴
        const derived = statuses.find(s => s.user_id === myUserId && s.slot === slot)
        return { status: 'closed', meal_time: derived?.meal_time ?? null }
      }
      return mine
    }
    const s = statuses.find(s => s.user_id === userId && s.slot === slot)
    if (!s || s.is_hidden) return null
    // 참여중인데 이 그룹 팟에 없으면 → 다른 그룹 팟 참여중 → 약속있음으로 표시
    if (s.status === '참여중') {
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
  const [showUnset, setShowUnset] = useState(false)
  const [statusFilter, setStatusFilter] = useState(null)

  // Filter tabs: always show all 4 options
  const filterTabs = [
    ...SLOT_STATUS_OPTIONS.map(o => ({ ...o, count: statusCounts[o.key] ?? 0 })),
    { key: 'unset', label: '미설정', color: '#A89E94', bg: '#F5F0EB', border: '#DDD5CC', count: unsetMembers.length },
  ]

  // Filtered member lists based on active filter
  const filteredActive = statusFilter && statusFilter !== 'unset'
    ? activeMembers.filter(m => getMemberData(m.id)?.status === statusFilter)
    : statusFilter === 'unset' ? [] : activeMembers
  const showUnsetSection = statusFilter === 'unset' ? true : statusFilter === null

  return (
    <div style={styles.groupCard}>
      {/* 그룹 헤더 */}
      <div style={styles.groupHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ ...styles.groupName, color: isShared ? 'var(--color-text)' : '#B0A89E' }}>{group.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isInThisGroupPot ? (
            <span style={styles.toggleLocked}>🍚 참여중</span>
          ) : (
            <button
              style={{
                fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                color: isShared ? '#FF6B35' : '#B0A89E',
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
                        <div style={{ ...styles.avatar, background: '#888' }}>
                          {member.nickname[0]}
                        </div>
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
              <span>🍚</span><span style={styles.sheetRowLabel}>기본 밥팟 추가</span>
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



      {!collapsed && (
        <div style={{ padding: '0 0 2px' }}>
          {/* 상태 필터 탭 */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {filterTabs.map(tab => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(isActive ? null : tab.key)}
                  style={{
                    fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                    color: isActive ? tab.color : '#A89E94',
                    background: isActive ? (tab.bg ?? tab.color + '18') : '#F5F0EB',
                    border: `1px solid ${isActive ? (tab.border ?? tab.color + '44') : '#E8E3DE'}`,
                    borderRadius: 99, padding: '3px 10px',
                    cursor: 'pointer', fontFamily: 'inherit',
                    opacity: tab.count === 0 ? 0.4 : 1,
                  }}
                >
                  {tab.label} {tab.count}
                </button>
              )
            })}
          </div>

          {/* 활동 멤버 */}
          {filteredActive.map((member) => {
            const data = getMemberData(member.id)
            const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
            const isMe = member.id === myUserId
            return (
              <div key={member.id} style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 0',
                borderBottom: `1px solid #F5F0EB`,
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: isMe ? 'var(--color-primary)' : '#A89E94',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 800, flexShrink: 0,
                }}>{member.nickname[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: '#1A1A1A', letterSpacing: '-0.2px' }}>
                    {member.nickname}{isMe ? ' (나)' : ''}
                  </span>
                  {(data?.meal_time || data?.menu) && (
                    <div style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {data.meal_time?.slice(0, 5)}{data.meal_time && data.menu ? ' · ' : ''}{data.menu}
                    </div>
                  )}
                </div>
                {opt && !statusFilter && (
                  <span style={{
                    fontSize: 'var(--font-size-2xs)', fontWeight: 700,
                    color: opt.color,
                    background: opt.bg ?? opt.color + '18',
                    border: `1px solid ${opt.border ?? opt.color + '44'}`,
                    borderRadius: 99, padding: '2px 9px', whiteSpace: 'nowrap',
                  }}>{opt.label}</span>
                )}
              </div>
            )
          })}

          {/* 미설정 멤버 */}
          {unsetMembers.length > 0 && showUnsetSection && (
            <>
              {statusFilter !== 'unset' ? (
                <button
                  onClick={() => setShowUnset(v => !v)}
                  style={{
                    width: '100%', padding: '7px 0', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    color: '#B0A89E', fontSize: 'var(--font-size-xs)', fontFamily: 'inherit',
                  }}
                >
                  <span>미설정 {unsetMembers.length}명</span>
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>{showUnset ? '▴' : '▾'}</span>
                </button>
              ) : null}
              {(statusFilter === 'unset' || showUnset) && unsetMembers.map(member => (
                <div key={member.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '5px 0', opacity: 0.45,
                  borderBottom: '1px solid #F5F0EB',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: member.id === myUserId ? 'var(--color-primary)' : '#C0B8B0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 'var(--font-size-xs)', fontWeight: 800, flexShrink: 0,
                  }}>{member.nickname[0]}</div>
                  <span style={{ flex: 1, fontSize: 'var(--font-size-sm)', color: '#6B7280', letterSpacing: '-0.2px' }}>
                    {member.nickname}{member.id === myUserId ? ' (나)' : ''}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {!collapsed && pots.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {pots.map(pot => (
            <div
              key={pot.id}
              style={{
                background: '#FAF8F5', border: '1.5px solid #EDE8E3', borderRadius: 11,
                padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
              onClick={() => onNavigate(`/pot/${pot.id}`)}
            >
              <span style={{ fontSize: 16 }}>🍚</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pot.title}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', marginTop: 1 }}>
                  {pot.meal_time?.slice(0, 5)} · {pot.pot_members?.length ?? 0}/{pot.max_people}명
                </div>
              </div>
              <span style={{ color: '#C8BEB4', fontSize: 14 }}>›</span>
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <button
          style={{
            width: '100%', padding: 9, marginTop: 9,
            background: 'transparent', border: '1.5px dashed #FFB899',
            borderRadius: 11, color: '#FF6B35',
            fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}
          onClick={() => onCreatePot(group.id, slot)}
        >+ 밥팟 만들기</button>
      )}
    </div>
  )
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  page: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 80 },
  loadingPage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, gap: 8 },
  emptyGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--color-border)' },
  emptyBtn: { marginTop: 4, padding: '12px 28px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dateNav: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.96)', backdropFilter: 'blur(8px)', margin: '0 calc(-1 * var(--spacing-md))', width: 'calc(100% + 2 * var(--spacing-md))' },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface)', color: '#A89E94', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.10)', flexShrink: 0 },
  settingBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  todayBadge: { fontSize: 'var(--font-size-xs)', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  todayBtn: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '2px 8px', cursor: 'pointer' },
  myCard: { background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' },
  myCardTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.4px' },
  resetAllBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--radius-full)', cursor: 'pointer', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' },
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
  slotPopupBtns: { display: 'flex', gap: 8 },
  slotPopupSave: { flex: 1, padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  slotPopupCancel: { padding: '13px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: '#f44336', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  slotCard: { display: 'flex', flexDirection: 'column', border: '1.5px solid', borderRadius: 'var(--radius-md)', transition: 'border-color 0.15s', overflow: 'hidden' },
  slotName: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px 4px 9px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer' },
  sectionTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.4px' },
  groupCard: { background: '#FFFFFF', border: '1.5px solid #EDE8E3', borderRadius: 18, padding: 14, marginBottom: 10, transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.3px' },
  inviteBtn: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  groupSettingsBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '0 2px' },
  groupCollapseBtn: { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '0 2px', color: 'var(--color-text-muted)' },
  collapseAllBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', cursor: 'pointer' },
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
  bottomBtnRow: { display: 'flex', gap: 8 },
  addGroupBtn: { flex: 1, padding: 14, background: 'var(--color-surface-2)', border: '1.5px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
  joinPotBtn: { flex: 1, padding: 14, background: 'rgba(255,107,53,0.07)', border: '1.5px dashed var(--color-primary)', borderRadius: 'var(--radius-lg)', color: 'var(--color-primary)', fontWeight: 600, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
