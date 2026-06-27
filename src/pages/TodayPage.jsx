import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers, getGroupStatuses, getGroupPots, upsertStatus, deleteStatus } from '../lib/db'
import { supabase } from '../lib/supabase'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import PotCard from '../components/PotCard'
import BottomNav from '../components/BottomNav'

const SLOT_ORDER = ['아침', '점심', '저녁', '오전간식', '오후간식', '야식']

function toDateStr(date) {
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '')
}
function formatDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
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

      // 내 상태 초기화 — 전체 그룹 중 내 상태가 있는 것 모두 반영
      const slots = {}
      myGroups.forEach(g => {
        const myStatuses = newStatusesMap[g.id]?.filter(s => s.user_id === user.id) ?? []
        myStatuses.forEach(s => {
          slots[s.slot] = { status: s.status, time: s.meal_time, menu: s.menu }
        })
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

      // 내 상태도 동기화 (밥팟 참여/취소 등 외부에서 바뀐 경우)
      const myStatuses = statuses.filter(s => s.user_id === user.id)
      if (myStatuses.length > 0) {
        setMySlots(prev => {
          const updated = { ...prev }
          myStatuses.forEach(s => {
            updated[s.slot] = { status: s.status, time: s.meal_time, menu: s.menu }
          })
          return updated
        })
      }
    }

    const statusSub = supabase
      .channel(`daily_status_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_status' },
        (payload) => {
          const groupId = payload.new?.group_id ?? payload.old?.group_id
          if (groupId && groupsRef.current.some(g => g.id === groupId)) {
            reloadGroup(groupId)
          }
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
    // 모든 내 그룹에 상태 저장
    for (const g of groups) {
      await upsertStatus({ userId: user.id, groupId: g.id, date: dateStr, slot, status: statusKey, meal_time: mySlots[slot]?.time, menu: mySlots[slot]?.menu })
    }
  }

  const setSlotField = async (slot, key, val) => {
    const updated = { ...(mySlots[slot] ?? {}), [key]: val }
    setMySlots(prev => ({ ...prev, [slot]: updated }))
    if (updated.status) {
      for (const g of groups) {
        await upsertStatus({ userId: user.id, groupId: g.id, date: dateStr, slot, status: updated.status, meal_time: updated.time, menu: updated.menu })
      }
    }
  }

  const clearSlot = async (slot) => {
    setMySlots(prev => { const n = { ...prev }; delete n[slot]; return n })
    setOpenDropdown(null)
    for (const g of groups) {
      await deleteStatus({ userId: user.id, groupId: g.id, date: dateStr, slot })
    }
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
          {isToday && <span style={styles.todayBadge}>오늘</span>}
        </div>
        <button style={styles.navBtn} onClick={() => setCurrentDate(d => addDays(d, 1))}>→</button>
      </div>

      {/* 내 슬롯 그리드 */}
      <div style={styles.myCard}>
        <div style={styles.myCardTitle}>오늘 나는</div>
        <div style={styles.slotGrid}>
          {SLOT_ORDER.map(slot => {
            const data = mySlots[slot]
            const opt = SLOT_STATUS_OPTIONS.find(o => o.key === data?.status)
            const isSelected = selectedSlot === slot
            const isDropOpen = openDropdown === slot

            // 내가 참여 중인 밥팟이 있는 슬롯인지 확인
            const isInPot = Object.values(potsMap).flat()
              .some(p => p.slot === slot && p.pot_members?.some(pm => pm.user_id === user.id))
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
                      ? <>{lockedOpt.emoji} {lockedOpt.label} 🔒</>
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
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 그룹별 현황 */}
      <div style={styles.sectionTitle}>{selectedSlot} 현황</div>
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
      {groups.map(group => {
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
            onNavigate={navigate}
            onRefresh={loadData}
          />
        )
      })}

      <button style={styles.addGroupBtn} onClick={() => navigate('/group-setup')}>
        + 그룹 만들기 / 참여하기
      </button>
    </div>
    <BottomNav />
    </div>
  )
}

function GroupSlotCard({ group, slot, members, statuses, pots, myUserId, mySlotData, onNavigate, onRefresh }) {
  const [showInvite, setShowInvite] = useState(false)
  const [copied, setCopied] = useState(null) // 'code' | 'link' | null

  const isInPot = pots.some(p => p.pot_members?.some(pm => pm.user_id === myUserId))

  const getMemberData = (userId) => {
    if (userId === myUserId) {
      // 내가 이 그룹 슬롯의 팟에 참여중이면 참여중으로 고정
      if (isInPot) return { ...mySlotData, status: '참여중' }
      return mySlotData ?? null
    }
    return statuses.find(s => s.user_id === userId && s.slot === slot) ?? null
  }

  const hasActivity = members.some(m => getMemberData(m.id)?.status) || pots.length > 0

  const copyText = (text, type) => {
    navigator.clipboard?.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={{ ...styles.groupCard, opacity: hasActivity ? 1 : 0.45 }}>
      <div style={styles.groupHeader}>
        <span style={styles.groupName}>{group.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasActivity && <span style={styles.activityDot} />}
          <button style={styles.inviteBtn} onClick={() => setShowInvite(v => !v)}>
            {showInvite ? '닫기' : '초대'}
          </button>
        </div>
      </div>

      {showInvite && (
        <div style={styles.invitePanel}>
          <div style={styles.inviteLabel}>초대 코드</div>
          <div style={styles.inviteCodeBox}>
            <span style={styles.inviteCode}>{group.invite_code}</span>
            <button
              style={{ ...styles.inviteCopyBtn, background: copied === 'code' ? '#4CAF50' : 'var(--color-primary)' }}
              onClick={() => copyText(group.invite_code, 'code')}
            >
              {copied === 'code' ? '✓' : '복사'}
            </button>
          </div>
          <div style={styles.inviteLabel} >초대 링크</div>
          <div style={styles.inviteCodeBox}>
            <span style={{ ...styles.inviteCode, fontSize: 11, color: 'var(--color-text-muted)' }}>
              {window.location.origin}/join/{group.invite_code}
            </span>
            <button
              style={{ ...styles.inviteCopyBtn, background: copied === 'link' ? '#4CAF50' : 'var(--color-primary)' }}
              onClick={() => copyText(`${window.location.origin}/join/${group.invite_code}`, 'link')}
            >
              {copied === 'link' ? '✓' : '복사'}
            </button>
          </div>
        </div>
      )}


      <div style={styles.memberList}>
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
      </div>

      {pots.length > 0 && (
        <div style={styles.potsArea}>
          <div style={styles.potsLabel}>열린 밥팟</div>
          {pots.map(pot => <PotCard key={pot.id} pot={pot} />)}
        </div>
      )}

      <button style={styles.createBtn} onClick={() => onNavigate('/create')}>
        + 밥팟 만들기
      </button>
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
  sectionTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  groupCard: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', transition: 'opacity 0.2s' },
  groupHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px var(--spacing-md)', background: 'var(--color-surface-2)' },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  inviteBtn: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)44', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
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
