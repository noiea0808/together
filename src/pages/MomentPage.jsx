import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMomentPots, getPublicMomentPots } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import BottomNav from '../components/BottomNav'
import RiceBowlIcon from '../components/RiceBowlIcon'
import PotSocialSection from '../components/PotSocialSection'

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 지난 날짜의 밥팟은 무조건 종료로 보고, 오늘 날짜 밥팟은 종료 시각이 지났을 때만 종료로 본다.
// (시간 미정 밥팟은 당일엔 종료로 치지 않음 — PotDetailPage의 isPotExpired와 동일한 규칙)
function isPotEnded(pot) {
  const todayStr = toDateStr(new Date())
  if (pot.date < todayStr) return true
  if (pot.date > todayStr || !pot.end_time) return false
  const [h, m] = pot.end_time.slice(0, 5).split(':').map(Number)
  const expiry = new Date(`${pot.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
  return new Date() > expiry
}

function dateSectionLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today - d) / 86400000)
  if (diffDays === 0) return '오늘'
  if (diffDays === 1) return '어제'
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function MomentCard({ pot, groupName, currentUserId, onChange, onOpenDetail }) {
  const participants = (pot.pot_members ?? []).map(pm => {
    const groupNickname = pm.users?.group_members?.find(gm => gm.group_id === pot.group_id)?.nickname
    return { id: pm.user_id, nickname: groupNickname || (pm.users?.nickname ?? '?'), avatar_url: pm.users?.avatar_url }
  })
  const canPost = participants.some(p => p.id === currentUserId)
  const commentCount = pot.pot_comments?.[0]?.count ?? 0
  const timeStr = pot.meal_time ? `${pot.meal_time.slice(0, 5)}${pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''}` : '미정'
  const dateLabel = new Date(`${pot.date}T00:00:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

  const socialRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const footer = (
    <div style={S.footerRow}>
      <div style={S.avatarGroup}>
        {participants.slice(0, 5).map((p, i) => (
          <div key={p.id} style={{ ...S.avatarDot, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i, ...(p.avatar_url ? S.avatarDotImg : {}) }}>
            {p.avatar_url ? <img src={p.avatar_url} alt="" style={S.avatarImgInner} /> : p.nickname[0]}
          </div>
        ))}
        {participants.length > 5 && <span style={S.avatarOverflow}>+{participants.length - 5}</span>}
      </div>
      <div style={S.footerRight}>
        {commentCount > 0 && <span style={S.commentBadge}>💬 {commentCount}</span>}
        {canPost && (
          <div style={{ position: 'relative' }}>
            <button style={S.menuBtn} onClick={() => setMenuOpen(o => !o)}>⋯</button>
            {menuOpen && (
              <>
                <div style={S.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div style={S.menuDropdown}>
                  <button
                    style={S.menuItem}
                    onClick={() => { setMenuOpen(false); socialRef.current?.openPhotoPicker() }}
                  >
                    📷 사진 등록
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={S.potCard}>
      <div style={S.potHeaderText} onClick={() => onOpenDetail(pot.id)}>
        <div style={S.groupTitleRow}>
          <span style={S.groupLabel}>{groupName}</span>
          <span style={S.potTitle}>{pot.title}</span>
          {pot.moment_scope === 'participants' && <span style={S.scopeChip}>참여자만</span>}
        </div>
        <div style={S.potMeta}>
          {pot.menu && <span style={S.menuText}>{pot.menu}</span>}
          <span style={S.metaSub}>{dateLabel} · {pot.slot}{timeStr !== '미정' ? ` · ${timeStr}` : ''}</span>
        </div>
      </div>
      <PotSocialSection ref={socialRef} potId={pot.id} currentUserId={currentUserId} canPost={canPost} onChange={onChange} compact footer={footer} />
    </div>
  )
}

export default function MomentPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [tab, setTab] = useState('mine') // 'mine' | 'public'
  const [groupNames, setGroupNames] = useState({})
  const [minePots, setMinePots] = useState(null)
  const [publicPots, setPublicPots] = useState(null)
  const [mineLoading, setMineLoading] = useState(true)
  const [publicLoading, setPublicLoading] = useState(false)

  const invalidateBoard = () => {
    if (user) invalidateCache(`board:${user.id}:`, { prefix: true })
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setMineLoading(true)
    getMyGroups(user.id)
      .then(async myGroups => {
        if (cancelled) return
        setGroupNames(Object.fromEntries(myGroups.map(g => [g.id, g.name])))
        const groupIds = myGroups.map(g => g.id)
        const data = await getGroupMomentPots(groupIds, user.id, toDateStr(new Date()))
        if (cancelled) return
        setMinePots(data.filter(isPotEnded))
      })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setMineLoading(false) })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    if (tab !== 'public' || publicPots !== null) return
    let cancelled = false
    setPublicLoading(true)
    getPublicMomentPots(toDateStr(new Date()))
      .then(data => { if (!cancelled) setPublicPots(data.filter(isPotEnded)) })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setPublicLoading(false) })
    return () => { cancelled = true }
  }, [tab, publicPots])

  const pots = tab === 'mine' ? minePots : publicPots
  const isLoading = tab === 'mine' ? mineLoading : publicLoading
  const openDetail = (potId) => navigate(`/pot/${potId}`)

  const items = (pots ?? []).reduce((acc, pot) => {
    acc.items.push({ pot, showDateHeader: acc.lastDate !== pot.date })
    acc.lastDate = pot.date
    return acc
  }, { items: [], lastDate: null }).items

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.headerTitle}>모먼트</span>
        <div style={S.tabRow}>
          <button style={{ ...S.tabBtn, ...(tab === 'mine' ? S.tabBtnActive : {}) }} onClick={() => setTab('mine')}>내 그룹</button>
          <button style={{ ...S.tabBtn, ...(tab === 'public' ? S.tabBtnActive : {}) }} onClick={() => setTab('public')}>전체</button>
        </div>
      </div>

      <div style={S.list}>
        {isLoading ? (
          <div style={S.loadingState}><RiceBowlIcon size={40} /></div>
        ) : items.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 40 }}>📸</div>
            <div style={{ fontWeight: 700 }}>아직 공유된 모먼트가 없어요</div>
            <p style={S.emptyDesc}>
              {tab === 'mine'
                ? "종료된 밥팟 상세에서 공유 범위를 '그룹공유'로\n바꾸면 여기 모여요."
                : "공유 범위가 '전체공유'인 밥팟이 여기 모여요."}
            </p>
          </div>
        ) : items.map(({ pot, showDateHeader }) => (
          <div key={pot.id}>
            {showDateHeader && <div style={S.dateHeader}>{dateSectionLabel(pot.date)}</div>}
            <MomentCard
              pot={pot}
              groupName={tab === 'mine' ? (groupNames[pot.group_id] ?? '') : (pot.groups?.name ?? '')}
              currentUserId={user.id}
              onChange={invalidateBoard}
              onOpenDetail={openDetail}
            />
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    padding: '18px 20px 12px', position: 'sticky', top: 0,
    background: 'rgba(250,248,245,0.95)', zIndex: 10, backdropFilter: 'blur(8px)', flexShrink: 0,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 900, color: '#1A1A1A', letterSpacing: '-0.6px', flexShrink: 0 },
  tabRow: { display: 'flex', gap: 6 },
  tabBtn: {
    padding: '6px 14px', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700,
    color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  tabBtnActive: { background: '#FFF4EF', border: '1px solid var(--color-primary)', color: 'var(--color-primary)' },

  list: { flex: 1, overflowY: 'auto', padding: '4px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 },
  loadingState: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, padding: 40 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '60px 24px', textAlign: 'center' },
  emptyDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0, whiteSpace: 'pre-line', lineHeight: 1.6 },

  dateHeader: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', padding: '6px 2px' },

  potCard: { background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  potHeaderText: { minWidth: 0, cursor: 'pointer' },
  groupTitleRow: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 },
  groupLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', flexShrink: 0 },
  potTitle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  scopeChip: {
    flexShrink: 0, padding: '2px 7px', borderRadius: 'var(--radius-full)',
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)',
  },
  potMeta: { display: 'flex', flexDirection: 'column', gap: 1, marginTop: 3 },
  menuText: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },
  metaSub: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  commentBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)' },

  footerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  footerRight: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 },
  avatarGroup: { display: 'flex', alignItems: 'center', flexShrink: 0 },
  avatarDot: {
    width: 24, height: 24, borderRadius: '50%',
    background: '#A89E93', color: '#fff', fontSize: 10, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid var(--color-surface-2)', boxSizing: 'border-box',
  },
  avatarDotImg: { background: 'transparent', padding: 0, overflow: 'hidden' },
  avatarImgInner: { width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' },
  avatarOverflow: { marginLeft: 2, fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)' },

  menuBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent',
    color: 'var(--color-text-muted)', fontSize: 16, fontWeight: 900, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
  },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  menuDropdown: {
    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: 128,
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.12)', overflow: 'hidden',
  },
  menuItem: {
    width: '100%', padding: '10px 12px', background: 'none', border: 'none', textAlign: 'left',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
}
