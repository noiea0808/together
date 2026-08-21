import { useNavigate } from 'react-router-dom'
import { isPotTimeExpired } from '../lib/potConstants'

export default function PotCard({ pot }) {
  const navigate = useNavigate()

  const participants = pot.pot_members
    ? pot.pot_members.map(pm => {
        const groupNickname = pm.users?.group_members?.find(gm => gm.group_id === pot.group_id)?.nickname
        return { id: pm.user_id, nickname: groupNickname || (pm.users?.nickname ?? '?'), is_guest: pm.users?.is_guest }
      })
    : (pot.members ?? []).map(id => ({ id, nickname: '?' }))

  const filled = participants.length
  const isFull = filled >= pot.max_people
  const expired = isPotTimeExpired(pot.date, pot.end_time)
  const timeStr = typeof pot.meal_time === 'string' ? pot.meal_time.slice(0, 5) : pot.meal_time
  const endStr = pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''

  return (
    <div
      style={{
        position: 'relative',
        ...styles.card,
        ...(pot.is_default ? styles.defaultCard : {}),
        ...(expired ? (pot.is_default ? styles.expiredDefaultCard : styles.expiredNormalCard) : {}),
      }}
      onClick={() => navigate(`/pot/${pot.id}`)}
    >
      {/* 기본팟 배지 — 우상단 고정 */}
      {pot.is_default && <span style={styles.defaultBadge}>기본팟</span>}

      {/* 1줄: 시간, 공개 여부 */}
      <div style={styles.row1}>
        {/* 기본팟만 초록으로 표시한다. 일반팟 시간은 예전에 파랑이었는데, 시간은 상태가 아니라
            그냥 정보라서 채도를 가질 이유가 없었다. 지난 밥팟의 흐린 색은 카드 전체에 걸린
            opacity가 이미 처리하므로 여기서 따로 흐린 값을 고르지 않는다. */}
        <span style={{ ...styles.time, color: pot.is_default ? 'var(--color-success)' : 'var(--color-text)' }}>
          {timeStr}{endStr}
        </span>
        {pot.is_public && <span style={styles.publicTag}>공개</span>}
      </div>

      {/* 2줄: 밥팟 제목, 메뉴 */}
      <div style={styles.row2}>
        <span style={styles.title}>{pot.title}</span>
        {pot.menu && <span style={styles.menu}>{pot.menu}</span>}
      </div>

      {/* 3줄: 참여자 태그, 참여자수/인원제한 */}
      <div style={styles.row3}>
        <div style={styles.tags}>
          {participants.map(m => (
            <span key={m.id} style={styles.tag}>
              {m.nickname}{m.is_guest ? <span style={styles.guestMark}>G</span> : null}
            </span>
          ))}
          {Array.from({ length: pot.max_people - filled }).map((_, i) => (
            <span key={`empty-${i}`} style={styles.emptyTag}>+</span>
          ))}
        </div>
        <span style={{ ...styles.count, color: isFull ? 'var(--color-success)' : 'var(--color-text-muted)', flexShrink: 0 }}>
          {filled}/{pot.max_people}명
        </span>
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', padding: '10px var(--spacing-md)',
    cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column', gap: 5,
  },
  defaultCard: { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', boxShadow: 'none' },
  expiredNormalCard: { background: 'var(--warm-50)', border: '1px solid #ECDDD4', boxShadow: 'none', opacity: 0.6 },
  expiredDefaultCard: { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', boxShadow: 'none', opacity: 0.6 },
  row1: { display: 'flex', alignItems: 'center', gap: 6 },
  row2: { display: 'flex', alignItems: 'center', gap: 6 },
  row3: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  time: { fontSize: 13, fontWeight: 600, flexShrink: 0 },
  defaultBadge: { position: 'absolute', top: 8, right: 10, fontSize: 10, background: 'var(--color-success-bg)', borderRadius: 4, padding: '2px 7px', color: 'var(--color-success)', fontWeight: 600 },
  publicTag: { fontSize: 10, background: '#eee', borderRadius: 4, padding: '1px 6px', color: 'var(--color-text-muted)', flexShrink: 0 },
  title: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  menu: { fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0 },
  tags: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, flex: 1, minWidth: 0 },
  tag: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 2 },
  emptyTag: { fontSize: 11, color: 'var(--color-border)', background: 'transparent', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-full)', padding: '2px 8px' },
  guestMark: { fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 700, marginLeft: 1 },
  count: { fontSize: 12, fontWeight: 600, flexShrink: 0 },
}
