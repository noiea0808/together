import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus, updateGroupName, leaveGroup, setStatusHidden, getMyStatuses } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import PotCard from '../components/PotCard'
import BottomNav from '../components/BottomNav'

const SLOT_ORDER = ['아침', '점심', '저녁', '오전간식', '오후간식', '야식']

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
  const { user } = useUser()

  const [currentDate, setCurrentDate] = useState(TODAY)
  const [selectedSlot, setSelectedSlot] = useState('점심')
  const [openDropdown, setOpenDropdown] = useState(null)
  const [allCollapsed, setAllCollapsed] = useState(false)
  const [collapseKey, setCollapseKey] = useState(0) // 강제 리렌더용

  const [groups, setGroups] = useState([])
  const [membersMap, setMembersMap] = useState({})   // groupId -> members[]
  const [statusesMap, setStatusesMap] = useState({}) // groupId -> statuses[]
  const [potsMap, setPotsMap] = useState({})         // groupId -> pots[]
  const [loading, setLoading] = useState(true)

  // 내 슬롯 상태: { slot -> { status, time, menu } }
  // statusesMap에서 user.id 기준으로 파생하지 않고 별도 관리 (낙관적 업데이트)
  const [mySlots, setMySlots] = useState({})

  const dateStr = toDateStr(currentDate)
  const isToday = currentDate.getTime() === TODAY.getTime()

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const myGroups = await getMyGroups(user.id)
      setGroups(myGroups)
      if (myGroups.length === 0) {
        setLoading(false)
        return
      }

      const [membersResults, statusResults, potResults] = await Promise.all([
        Promise.all(myGroups.map(g => getGroupMembers(g.id).then(m => [g.id, m]))),
        Promise.all(myGroups.map(g => getGroupStatuses(g.id, dateStr).then(s => [g.id, s]))),
        Promise.all(myGroups.map(g => getGroupPots(g.id, dateStr).then(p => [g.id, p]))),
      ])

      const newMembersMap = Object.fromEntries(membersResults)
      const newStatusesMap = Object.fromEntries(statusResults)
      const newPotsMap = Object.fromEntries(potResults)

      setMembersMap(newMembersMap)
      setStatusesMap(newStatusesMap)
      setPotsMap(newPotsMap)

      // 내 상태 초기화 — 유저 기준 단일 레코드에서 직접 조회
      const myStatuses = await getMyStatuses(user.id, dateStr)
      const slots = {}
      myStatuses.forEach(s => {
        slots[s.slot] = { status: s.status, time: s.meal_time, menu: s.menu }
      })
      setMySlots(slots)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [user, dateStr, navigate])

  useEffect(() => { loadData() }, [loadData])

  // 실시간 구독 — 상태/밥팟 변경 시 해당 그룹 데이터만 재로드
  const groupsRef = useRef([])
  useEffect(() => { groupsRef.current = groups }, [groups])

  useEffect(() => {
    if (!user) return

    const reloadGroup = async (groupId) => {
      const [statuses, pots] = await Promise.all([
        getGroupStatuses(groupId, dateStr),
        getGroupPots(groupId, dateStr),
      ])
      setStatusesMap(prev => ({ ...prev, [groupId]: statuses }))
      setPotsMap(prev => ({ ...prev, [groupId]: pots }))
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
                  ? { status: s.status, time: s.meal_time, menu: s.menu }
                  : undefined
              }))
            }
          }
          // 모든 그룹 현황 갱신
          groupsRef.current.forEach(g => reloadGroup(g.id))
        }
      )
      .subscribe()

    const potSub = supabase
      .channel(`pot_changes_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_pots' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            reloadGroup(groupId)
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pot_members' },
        () => {
          groupsRef.current.forEach(g => reloadGroup(g.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(statusSub)
      supabase.removeChannel(potSub)
    }
  }, [user, dateStr])

  useEffect(() => {
    const close = () => setOpenDropdown(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  const setSlotStatus = async (slot, statusKey) => {
    setMySlots(prev => ({ ...prev, [slot]: { ...(prev[slot] ?? {}), status: statusKey } }))
    setOpenDropdown(null)
    await upsertStatus({ userId: user.id, date: dateStr, slot, status: statusKey, meal_time: mySlots[slot]?.time, menu: mySlots[slot]?.menu })
  }

  const setSlotField = async (slot, key, val) => {
    const updated = { ...(mySlots[slot] ?? {}), [key]: val }
    setMySlots(prev => ({ ...prev, [slot]: updated }))
    if (updated.status) {
      await upsertStatus({ userId: user.id, date: dateStr, slot, status: updated.status, meal_time: updated.time, menu: updated.menu })
    }
  }

  const clearSlot = async (slot) => {
    setMySlots(prev => { const n = { ...prev }; delete n[slot]; return n })
    setOpenDropdown(null)
    await deleteStatus({ userId: user.id, date: dateStr, slot })
  }

  if (loading) {
    return <div style={styles.loadingPage}>🍚<br /><span style={{ fontSize: 14, marginTop: 8 }}>불러오는 중...</span></div>
  }


  return (
    <div style={styles.wrap}>
    <div style={styles.page}>
      {/* 날짜 네비 */}
      <div style={styles.dateNav}>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, -1))}>←</button>
        <div style={styles.dateText}>
          <span style={styles.datePrimary}>{formatDate(currentDate)}</span>
          {(() => { const r = getRelativeLabel(currentDate); return <span style={{ ...styles.relBadge, background: r.color }}>{r.label}</span> })()}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))}>→</button>
      </div>

      {/* 나의 상태 슬롯 그리드 */}
      <div style={styles.myCard}>
        <div style={styles.myCardTitle}>나의 상태</div>
        <div style={styles.slotGrid}>
          {SLOT_ORDER.map(slot => {
            const data = mySlots[slot]
            const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
            const isSelected = selectedSlot === slot
            const isDropOpen = openDropdown === slot

            // 내가 참여 중인 밥팟 목록 (슬롯 기준, 시간순 정렬)
            const myPotsInSlot = Object.values(potsMap).flat()
              .filter(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
              .sort((a, b) => (a.meal_time ?? '').localeCompare(b.meal_time ?? ''))
            const potCount = myPotsInSlot.length
            const earliestPot = myPotsInSlot[0]
            const isInPot = potCount > 0
            const lockedOpt = isInPot ? SLOT_STATUS_OPTIONS.find(o => o.key === '참여중') : null

            return (
              <div
                key={slot}
                style={{
                  ...styles.slotCard,
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                  borderWidth: isSelected ? 2 : 1.5,
                  background: (lockedOpt ?? opt) ? (lockedOpt ?? opt).color + '0d' : 'var(--color-surface)',
                }}
                onClick={() => setSelectedSlot(slot)}
              >
                <div style={styles.slotName}>{slot}</div>

                <div style={styles.slotStatusLayer}>
                  <button
                    style={{
                      ...styles.slotStatusBtn,
                      color: (lockedOpt ?? opt) ? (lockedOpt ?? opt).color : 'var(--color-text-muted)',
                      borderColor: (lockedOpt ?? opt) ? (lockedOpt ?? opt).color + '55' : 'var(--color-border)',
                      background: (lockedOpt ?? opt) ? (lockedOpt ?? opt).color + '12' : 'var(--color-surface-2)',
                      cursor: isInPot ? 'default' : 'pointer',
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isInPot) return // 참여중이면 드롭다운 막기
                      setSelectedSlot(slot)
                      setOpenDropdown(prev => prev === slot ? null : slot)
                    }}
                  >
                    {lockedOpt
                      ? <>{lockedOpt.emoji} {lockedOpt.label}{potCount > 1 ? ` x${potCount}` : ''}</>
                      : opt ? <>{opt.emoji} {opt.label}</> : <span style={{ fontSize: 11 }}>+ 상태설정</span>
                    }
                  </button>

                  {isDropOpen && !isInPot && (
                    <div style={styles.dropdown} onClick={e => e.stopPropagation()}>
                      {/* 미설정 항목 항상 최상단 */}
                      <button
                        style={{
                          ...styles.dropItem,
                          background: !data?.status ? '#f5f5f522' : 'transparent',
                          color: !data?.status ? 'var(--color-text)' : 'var(--color-text-muted)',
                          fontWeight: !data?.status ? 700 : 400,
                          borderBottom: '1px solid var(--color-border)',
                        }}
                        onClick={() => clearSlot(slot)}
                      >
                        ○ 미설정
                      </button>
                      {SLOT_STATUS_OPTIONS.filter(o => o.selectable).map(o => (
                        <button
                          key={o.key}
                          style={{
                            ...styles.dropItem,
                            background: data?.status === o.key ? o.color + '18' : 'transparent',
                            color: data?.status === o.key ? o.color : 'var(--color-text)',
                            fontWeight: data?.status === o.key ? 700 : 400,
                          }}
                          onClick={() => setSlotStatus(slot, o.key)}
                        >
                          {o.emoji} {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={styles.slotDetailLayer} onClick={e => e.stopPropagation()}>
                  {isInPot ? (
                    // 팟 참여중이면 팟 정보 표시 (읽기 전용)
                    <>
                      <div style={styles.slotPotInfo}>
                        {earliestPot.meal_time?.slice(0, 5)}
                      </div>
                      <div style={{ ...styles.slotPotInfo, fontSize: 10 }}>
                        {earliestPot.title}
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="time"
                        style={{ ...styles.slotTimeInput, opacity: (!data?.status || data?.status === 'skip') ? 0.3 : 1 }}
                        value={data?.time ?? ''}
                        onChange={e => setSlotField(slot, 'time', e.target.value)}
                        disabled={!data?.status || data?.status === 'skip'}
                      />
                      <input
                        style={{ ...styles.slotMenuInput, opacity: (!data?.status || data?.status === 'skip') ? 0.3 : 1 }}
                        placeholder="메뉴"
                        value={data?.menu ?? ''}
                        onChange={e => setSlotField(slot, 'menu', e.target.value)}
                        maxLength={10}
                        disabled={!data?.status || data?.status === 'skip'}
                      />
                    </>
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
        <button style={styles.collapseAllBtn} onClick={() => { setAllCollapsed(v => !v); setCollapseKey(k => k + 1) }}>
          {allCollapsed ? '모두 펼치기' : '모두 접기'}
        </button>
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
              amIInAnyPot={amIInAnyPot}
              allCollapsed={allCollapsed}
              collapseKey={collapseKey}
              dateStr={dateStr}
              onNavigate={navigate}
              onRefresh={loadData}
            />
          )
        })
      })()}

      <button style={styles.addGroupBtn} onClick={() => navigate('/group-setup')}>
        + 그룹 만들기 / 참여하기
      </button>
    </div>
    <BottomNav />
    </div>
  )
}

function GroupSlotCard({ group, slot, members, statuses, pots, myUserId, mySlotData, amIInAnyPot, allCollapsed, collapseKey, dateStr, onNavigate, onRefresh }) {
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.name)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [sharing, setSharing] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { setCollapsed(allCollapsed) }, [collapseKey])

  // 초기 공유 상태: statusesMap에서 내 is_hidden 확인
  useEffect(() => {
    const myAnyStatus = statuses.find(s => s.user_id === myUserId)
    if (myAnyStatus) setSharing(!myAnyStatus.is_hidden)
  }, [statuses, myUserId])

  const handleToggleSharing = async () => {
    const next = !sharing
    setSharing(next)
    await setStatusHidden(myUserId, dateStr, !next)
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

  const isInPot = amIInAnyPot // 전체 그룹 기준 (상태 표시용)
  const isInThisGroupPot = pots.some(p => p.pot_members?.some(pm => pm.user_id === myUserId)) // 이 그룹 팟 참여 여부 (헤더 색상용)

  const getMemberData = (userId) => {
    if (userId === myUserId) {
      if (!sharing) return null // 비공유 상태면 내 상태 숨김
      if (isInPot) return { ...mySlotData, status: '참여중' }
      return mySlotData ?? null
    }
    const s = statuses.find(s => s.user_id === userId && s.slot === slot)
    if (!s || s.is_hidden) return null  // 숨김 처리된 상태는 표시 안 함
    return s
  }

  const hasActivity = members.some(m => getMemberData(m.id)?.status) || pots.length > 0

  const copyText = (text, type) => {
    navigator.clipboard?.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={styles.groupCard}>
      <div style={{
        ...styles.groupHeader,
        background: !sharing ? '#EEEEEE' : isInThisGroupPot ? '#E8F5E9' : 'var(--color-surface-2)',
      }}>
        {/* 좌측: 활동 도트 + 그룹명 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasActivity && <span style={styles.activityDot} />}
          <span style={{ ...styles.groupName, color: sharing ? 'var(--color-text)' : '#9E9E9E' }}>{group.name}</span>
        </div>
        {/* 우측: 토글 + 초대 + 설정 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 공유 토글 */}
          <div style={styles.toggleWrap} onClick={handleToggleSharing}>
            <div style={{ ...styles.toggleTrack, background: sharing ? 'var(--color-primary)' : '#BDBDBD' }}>
              <div style={{ ...styles.toggleThumb, transform: sharing ? 'translateX(14px)' : 'translateX(0)' }} />
            </div>
            <span style={{ ...styles.toggleLabel, color: sharing ? 'var(--color-primary)' : '#9E9E9E' }}>
              {sharing ? '공유중' : '비공유'}
            </span>
          </div>
          <button style={styles.groupSettingsBtn} onClick={() => { setShowSettings(v => !v); setEditingName(false); setConfirmLeave(false); setShowInvite(false) }}>⚙️</button>
          <button style={styles.groupCollapseBtn} onClick={() => setCollapsed(v => !v)}>{collapsed ? '▸' : '▾'}</button>
        </div>
      </div>

      {/* 그룹 설정 바텀시트 */}
      {showSettings && (
        <div style={styles.sheetOverlay} onClick={() => { setShowSettings(false); setEditingName(false); setConfirmLeave(false) }}>
          <div style={styles.sheet} onClick={e => e.stopPropagation()}>
            <div style={styles.sheetTitle}>{group.name}</div>

            {isMaster && !editingName && (
              <button style={styles.sheetRow} onClick={() => setEditingName(true)}>
                <span>✏️</span><span style={styles.sheetRowLabel}>그룹명 변경</span>
              </button>
            )}

            {isMaster && editingName && (
              <div style={styles.sheetNameEdit}>
                <div style={styles.sheetNameLabel}>새 그룹명</div>
                <input
                  style={styles.sheetNameInput}
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  maxLength={20}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                />
                <div style={styles.sheetNameBtns}>
                  <button style={styles.sheetSaveBtn} onClick={handleSaveName}>저장</button>
                  <button style={styles.sheetCancelBtn} onClick={() => { setEditingName(false); setNameValue(group.name) }}>취소</button>
                </div>
              </div>
            )}

            {!confirmLeave ? (
              <button style={{ ...styles.sheetRow, color: '#f44336' }} onClick={() => setConfirmLeave(true)}>
                <span>🚪</span><span style={styles.sheetRowLabel}>그룹 나가기</span>
              </button>
            ) : (
              <div style={styles.sheetLeaveConfirm}>
                <p style={styles.sheetLeaveText}>정말 그룹을 나가시겠어요?</p>
                <div style={styles.sheetLeaveBtns}>
                  <button style={styles.sheetLeaveYes} onClick={handleLeave}>나가기</button>
                  <button style={styles.sheetLeaveNo} onClick={() => setConfirmLeave(false)}>취소</button>
                </div>
              </div>
            )}

            {/* 초대 */}
            <div style={styles.sheetInviteSection}>
              <div style={styles.sheetInviteLabel}>초대 코드</div>
              <div style={styles.sheetInviteCodeBox}>
                <span style={styles.sheetInviteCode}>{group.invite_code}</span>
                <button style={{ ...styles.sheetInviteCopyBtn, background: copied === 'code' ? '#4CAF50' : 'var(--color-primary)' }}
                  onClick={() => copyText(group.invite_code, 'code')}>
                  {copied === 'code' ? '✓' : '복사'}
                </button>
              </div>
              <div style={styles.sheetInviteLabel}>초대 링크</div>
              <div style={styles.sheetInviteCodeBox}>
                <span style={{ ...styles.sheetInviteCode, fontSize: 11 }}>{`${window.location.origin}/join/${group.invite_code}`}</span>
                <button style={{ ...styles.sheetInviteCopyBtn, background: copied === 'link' ? '#4CAF50' : 'var(--color-primary)' }}
                  onClick={() => copyText(`${window.location.origin}/join/${group.invite_code}`, 'link')}>
                  {copied === 'link' ? '✓' : '복사'}
                </button>
              </div>
            </div>

            <button style={styles.sheetClose} onClick={() => { setShowSettings(false); setEditingName(false); setConfirmLeave(false); setShowInvite(false) }}>
              닫기
            </button>
          </div>
        </div>
      )}



      {!collapsed && <div style={styles.memberList}>
        {members.map(member => {
          const data = getMemberData(member.id)
          const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
          return (
            <div key={member.id} style={styles.memberRow}>
              <div style={{ ...styles.avatar, background: member.id === myUserId ? 'var(--color-primary)' : '#888' }}>
                {member.nickname[0]}
              </div>
              <span style={styles.memberName}>
                {member.nickname}{member.id === myUserId ? ' (나)' : ''}
              </span>
              <div style={styles.memberInfo}>
                {data?.meal_time && <span style={styles.memberMeta}>{data.meal_time.slice(0, 5)}</span>}
                {data?.meal_time && data?.menu && <span style={styles.metaDot}>·</span>}
                {data?.menu && <span style={styles.memberMeta}>{data.menu}</span>}
                {opt && (data?.meal_time || data?.menu) && <span style={styles.metaDot}>·</span>}
                {opt
                  ? <span style={{ ...styles.memberStatus, color: opt.color }}>{opt.emoji} {opt.label}</span>
                  : <span style={styles.memberStatusEmpty}>미설정</span>
                }
              </div>
            </div>
          )
        })}
      </div>}

      {!collapsed && pots.length > 0 && (
        <div style={styles.potsArea}>
          <div style={styles.potsLabel}>열린 밥팟</div>
          {pots.map(pot => <PotCard key={pot.id} pot={pot} />)}
        </div>
      )}

      {!collapsed && <button style={styles.createBtn} onClick={() => onNavigate('/create')}>
        + 밥팟 만들기
      </button>}
    </div>
  )
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  page: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 80 },
  loadingPage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, gap: 8 },
  emptyGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--color-border)' },
  emptyBtn: { marginTop: 4, padding: '12px 28px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 12px' },
  settingBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '4px 8px' },
  dateText: { display: 'flex', alignItems: 'center', gap: 8 },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  todayBadge: { fontSize: 'var(--font-size-xs)', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  relBadge: { fontSize: 'var(--font-size-xs)', color: '#fff', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 700 },
  myCard: { background: 'var(--color-surface)', border: '2px solid var(--color-primary)33', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' },
  myCardTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  slotCard: { display: 'flex', flexDirection: 'column', border: '1.5px solid', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'border-color 0.15s' },
  slotName: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center', padding: '7px 4px 4px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)', borderRadius: 'calc(var(--radius-md) - 2px) calc(var(--radius-md) - 2px) 0 0' },
  slotStatusLayer: { position: 'relative', padding: '6px 6px 4px' },
  slotStatusBtn: { width: '100%', padding: '5px 4px', border: '1px solid', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, transition: 'all 0.12s', whiteSpace: 'nowrap' },
  dropdown: { position: 'absolute', top: 'calc(100% + 2px)', left: 0, width: 150, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', zIndex: 200, overflow: 'hidden' },
  dropItem: { width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 6, border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left' },
  slotDetailLayer: { display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 6px 7px', borderTop: '1px solid rgba(0,0,0,0.05)', borderRadius: '0 0 calc(var(--radius-md) - 2px) calc(var(--radius-md) - 2px)' },
  slotTimeInput: { width: '100%', padding: '3px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, outline: 'none', background: 'var(--color-surface)', color: 'var(--color-text)' },
  slotMenuInput: { width: '100%', padding: '3px 4px', border: '1px solid var(--color-border)', borderRadius: 4, fontSize: 11, outline: 'none', background: 'var(--color-surface)', color: 'var(--color-text)' },
  slotPotInfo: { width: '100%', fontSize: 11, fontWeight: 600, color: '#4CAF50', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sectionTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  groupCard: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px var(--spacing-md)', background: 'var(--color-surface-2)' },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  inviteBtn: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
  groupSettingsBtn: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '0 2px' },
  groupCollapseBtn: { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '0 2px', color: 'var(--color-text-muted)' },
  collapseAllBtn: { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '4px 10px', cursor: 'pointer' },
  toggleWrap: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  toggleTrack: { width: 32, height: 18, borderRadius: 9, position: 'relative', transition: 'background 0.2s', flexShrink: 0 },
  toggleThumb: { position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
  toggleLabel: { fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' },
  sheetOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32, display: 'flex', flexDirection: 'column', gap: 4 },
  sheetTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 8, textAlign: 'center' },
  sheetRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px var(--spacing-sm)', background: 'none', border: 'none', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer', borderRadius: 'var(--radius-md)', width: '100%', textAlign: 'left' },
  sheetRowLabel: { flex: 1 },
  sheetNameEdit: { display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' },
  sheetNameLabel: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' },
  sheetNameInput: { width: '100%', padding: '12px var(--spacing-md)', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box' },
  sheetNameBtns: { display: 'flex', gap: 8 },
  sheetSaveBtn: { flex: 1, padding: 12, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  sheetCancelBtn: { padding: '12px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  sheetLeaveConfirm: { padding: '8px 0' },
  sheetLeaveText: { fontSize: 14, color: '#f44336', fontWeight: 600, marginBottom: 12, textAlign: 'center' },
  sheetLeaveBtns: { display: 'flex', gap: 8 },
  sheetLeaveYes: { flex: 1, padding: 12, background: '#f44336', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  sheetLeaveNo: { padding: '12px 20px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  sheetClose: { width: '100%', padding: 12, marginTop: 8, background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  sheetInviteSection: { display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' },
  sheetInviteLabel: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' },
  sheetInviteCodeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' },
  sheetInviteCode: { flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: 1, wordBreak: 'break-all' },
  sheetInviteCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  invitePanel: { margin: '0 var(--spacing-md) var(--spacing-sm)', padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 },
  inviteLabel: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' },
  inviteCodeBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', border: '1px solid var(--color-border)' },
  inviteCode: { flex: 1, fontSize: 16, fontWeight: 800, letterSpacing: 2, color: 'var(--color-text)', wordBreak: 'break-all' },
  inviteCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' },
  activityDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  memberRow: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 },
  memberName: { fontSize: 13, fontWeight: 600, flexShrink: 0 },
  memberInfo: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, overflow: 'hidden' },
  memberMeta: { fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' },
  metaDot: { fontSize: 11, color: 'var(--color-border)' },
  memberStatus: { fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  memberStatusEmpty: { fontSize: 11, color: 'var(--color-text-muted)' },
  potsArea: { padding: '10px var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 8 },
  potsLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  createBtn: { width: '100%', padding: 12, background: 'none', border: 'none', borderTop: '1px solid var(--color-border)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
  addGroupBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', border: '1.5px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
