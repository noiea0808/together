import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getGuestHome } from '../lib/db'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import { isPotTimeExpired, getJoinedStatusLabel } from '../lib/potConstants'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import PotCard from '../components/PotCard'
import AppHeader from '../components/AppHeader'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const SLOT_ORDER = ['아침', '점심', '저녁', '오전간식', '오후간식', '야식']
const JOINED_OPT = SLOT_STATUS_OPTIONS.find(o => o.key === '참여중')
const DONE_OPT = SLOT_STATUS_OPTIONS.find(o => o.key === '참여완료')

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T00:00:00`)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
}

// 다른 화면들과 같은 Header + 상단 sticky 바 구성을 그대로 따른다(게스트 전용 레이아웃이
// 따로 있으면 리디자인 때마다 여기만 빠뜨리기 쉬워서, 최대한 공용 조각을 재사용한다).
export default function GuestHomePage() {
  const navigate = useNavigate()
  const { user, logout } = useUser()
  const [home, setHome] = useState(null)
  const [loading, setLoading] = useState(true)
  const headerHidden = useHideOnScroll()

  useEffect(() => {
    if (!user?.guest_pot_id) { setLoading(false); return }
    getGuestHome(user.guest_pot_id)
      .then(setHome)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [user?.guest_pot_id])

  const handleSignup = async () => {
    await logout()
    navigate('/onboarding')
  }

  // 게스트가 참여한 슬롯 → 가장 이른 팟
  const potBySlot = {}
  ;(home?.pots ?? []).forEach(p => {
    if (!potBySlot[p.slot] || (p.meal_time ?? '') < (potBySlot[p.slot].meal_time ?? '')) {
      potBySlot[p.slot] = p
    }
  })

  if (loading) {
    return <div style={styles.loadingPage}><RiceBowlIcon size={40} /><br /><span style={{ fontSize: 14, marginTop: 8 }}>불러오는 중...</span></div>
  }

  return (
    <div style={styles.wrap}>
      <AppHeader brand={{ icon: <RiceBowlIcon size={24} />, label: '같이 먹자' }} hidden={headerHidden} />
      <div style={styles.page}>
        {/* 날짜 — 이동 불가, 게스트 표시. 헤더가 접히면 그 자리까지 따라 올라간다 */}
        <div style={{ ...styles.dateNav, top: headerHidden ? 0 : 'var(--header-height)' }}>
          <span style={styles.datePrimary}>{formatDate(home?.date)}</span>
          <span style={styles.guestTag}>게스트</span>
        </div>

        {/* 오늘 나는? — 슬롯 나열하되 비활성 */}
        <div style={styles.myCard}>
          <div style={styles.myCardTitle}>오늘 나는?</div>
          <div style={styles.slotGrid}>
            {SLOT_ORDER.map(slot => {
              const pot = potBySlot[slot]
              const isInPot = !!pot
              const opt = isInPot ? { ...(isPotTimeExpired(home.date, pot.end_time) ? DONE_OPT : JOINED_OPT), label: getJoinedStatusLabel(home.date, pot.meal_time, pot.end_time, (pot.pot_members?.length ?? 0) === 1) } : null
              return (
                <div
                  key={slot}
                  style={{
                    ...styles.slotCard,
                    borderColor: isInPot ? opt.color : 'var(--color-border)',
                    background: isInPot ? opt.color + '0d' : 'var(--color-surface)',
                    opacity: isInPot ? 1 : 0.6,
                  }}
                >
                  <div style={styles.slotName}>{slot}</div>
                  <div style={styles.slotBody}>
                    {isInPot ? (
                      <>
                        <div style={styles.slotStatusRow}>
                          <span style={{ fontSize: 18, lineHeight: 1 }}>{opt.emoji}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: opt.color }}>{opt.label}</span>
                        </div>
                        <div style={styles.slotMeta}>{pot.meal_time?.slice(0, 5)}</div>
                        <div style={{ ...styles.slotMeta, fontSize: 11 }}>{pot.title}</div>
                      </>
                    ) : (
                      <div style={styles.slotEmpty}>–</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p style={styles.disabledNote}>게스트는 상태 설정 기능을 사용할 수 없어요.</p>
        </div>

        {/* 그룹 현황 — 그룹명만, 구성원 리스트 없이 참여 밥팟만 */}
        {home && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>{home.slot} 현황</div>
            <div style={styles.groupCard}>
              <div style={styles.groupName}>👥 {home.groupName}</div>
              <div style={styles.pots}>
                {home.pots.map(p => <PotCard key={p.id} pot={p} />)}
              </div>
            </div>
          </div>
        )}

        {/* 정식 가입 안내 */}
        <div style={styles.signupCard}>
          <p style={styles.signupText}>
            게스트로 참여 중이에요.<br />
            정식 가입하면 내 그룹·일정을 모두 관리할 수 있어요.
          </p>
          <button style={{ ...PRIMARY_ACTION_BUTTON, width: 'auto', padding: '12px 28px' }} onClick={handleSignup}>회원가입 하러가기</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  loadingPage: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 40, gap: 8, color: 'var(--color-text-muted)' },
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
  page: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', paddingBottom: 'calc(var(--spacing-xl) + env(safe-area-inset-bottom))' },

  dateNav: { position: 'sticky', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'rgba(250,248,245,0.96)', backdropFilter: 'blur(8px)', margin: '0 calc(-1 * var(--spacing-md))', width: 'calc(100% + 2 * var(--spacing-md))', transition: 'top 0.22s ease' },
  datePrimary: { fontWeight: 800, fontSize: 'var(--font-size-lg)', letterSpacing: '-0.3px' },
  guestTag: { fontSize: 'var(--font-size-xs)', fontWeight: 800, color: '#fff', background: '#FF9800', borderRadius: 'var(--radius-full)', padding: '2px 10px' },

  myCard: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', boxShadow: 'var(--shadow-sm)' },
  myCardTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)', letterSpacing: '-0.3px' },
  slotGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  slotCard: { display: 'flex', flexDirection: 'column', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  slotName: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px 4px 9px', background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid rgba(0,0,0,0.05)' },
  slotBody: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px 10px', minHeight: 68 },
  slotStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  slotMeta: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' },
  slotEmpty: { fontSize: 16, color: 'var(--color-border)', fontWeight: 600 },
  disabledNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', margin: '2px 0 0' },

  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)' },
  groupCard: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', boxShadow: 'var(--shadow-sm)' },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-base)', letterSpacing: '-0.3px' },
  pots: { display: 'flex', flexDirection: 'column', gap: 8 },

  signupCard: { marginTop: 'auto', textAlign: 'center', background: 'linear-gradient(135deg, #FFF4EF 0%, #FFE8DC 100%)', border: '1.5px solid #FFD6C0', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  signupText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', lineHeight: 1.6, margin: 0 },
}
