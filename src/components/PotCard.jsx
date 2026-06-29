import { useNavigate } from 'react-router-dom'

function isPotExpired(pot) {
  if (!pot.end_time || !pot.date) return false
  const [h, m] = pot.end_time.slice(0, 5).split(':').map(Number)
  const expiry = new Date(`${pot.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
  return new Date() > expiry
}

export default function PotCard({ pot }) {
  const navigate = useNavigate()

  // DB 구조: pot_members: [{ user_id, users: { nickname } }]
  // mock 구조: members: ['user-id', ...]
  const participants = pot.pot_members
    ? pot.pot_members.map(pm => ({ id: pm.user_id, nickname: pm.users?.nickname ?? '?' }))
    : (pot.members ?? []).map(id => ({ id, nickname: '?' }))

  const filled = participants.length
  const isFull = filled >= pot.max_people
  const creatorNickname = pot.is_default ? null : (pot.users?.nickname ?? null)
  const expired = isPotExpired(pot)

  return (
    <div
      style={{ ...styles.card, ...(pot.is_default ? styles.defaultCard : {}), ...(expired ? styles.expiredCard : {}) }}
      onClick={() => navigate(`/pot/${pot.id}`)}
    >
      <div style={styles.top}>
        <span style={{ ...styles.time, color: expired ? '#9E9E9E' : pot.is_default ? '#4CAF50' : 'var(--color-primary)' }}>
          {typeof pot.meal_time === 'string' ? pot.meal_time.slice(0, 5) : pot.meal_time}
          {pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''}
        </span>
        <span style={styles.title}>{pot.title}</span>
        {pot.is_default && <span style={styles.defaultTag}>기본팟</span>}
        {pot.is_default && pot.modifier?.nickname && (
          <span style={styles.modifierTag}>✎ {pot.modifier.nickname}</span>
        )}
        {pot.is_public && <span style={styles.publicTag}>공개</span>}
        <span style={{ ...styles.menu, color: pot.menu ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
          {pot.menu || '미정'}
        </span>
        <span style={{ ...styles.count, color: isFull ? '#4CAF50' : 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {filled}/{pot.max_people}명
        </span>
      </div>

      <div style={styles.members}>
        {participants.map((member, i) => {
          const isCreator = !pot.is_default && i === 0
          return (
            <div key={member.id} style={styles.memberChip}>
              <div style={{ ...styles.avatar, background: isCreator ? 'var(--color-primary)' : '#888' }}>
                {member.nickname[0]}
              </div>
              <span style={styles.memberName}>
                {member.nickname}{isCreator ? ' 👑' : ''}
              </span>
            </div>
          )
        })}
        {Array.from({ length: pot.max_people - filled }).map((_, i) => (
          <div key={`empty-${i}`} style={styles.emptySlot}>+</div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', padding: '10px var(--spacing-md)',
    cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  defaultCard: { background: '#F1F8F1', border: '1px solid #C8E6C9', boxShadow: 'none' },
  expiredCard: { background: '#F5F5F5', border: '1px solid #E0E0E0', boxShadow: 'none', opacity: 0.65 },
  top: { display: 'flex', alignItems: 'center', gap: 6 },
  time: { fontSize: 13, fontWeight: 700, flexShrink: 0 },
  title: { fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  defaultTag: { fontSize: 10, background: '#E8F5E9', borderRadius: 4, padding: '1px 6px', color: '#4CAF50', flexShrink: 0, fontWeight: 600 },
  modifierTag: { fontSize: 10, background: '#F5F5F5', borderRadius: 4, padding: '1px 6px', color: '#9E9E9E', flexShrink: 0 },
  publicTag: { fontSize: 10, background: '#eee', borderRadius: 4, padding: '1px 6px', color: 'var(--color-text-muted)', flexShrink: 0 },
  menu: { fontSize: 12, fontWeight: 600, flexShrink: 0 },
  count: { fontSize: 12, fontWeight: 600, flexShrink: 0 },
  members: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  memberChip: { display: 'flex', alignItems: 'center', gap: 4 },
  avatar: { width: 22, height: 22, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, flexShrink: 0 },
  memberName: { fontSize: 11, color: 'var(--color-text-muted)' },
  emptySlot: { width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-border)' },
}
