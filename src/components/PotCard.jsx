import { useNavigate } from 'react-router-dom'
import { ALL_MEMBERS } from '../mock/data'

export default function PotCard({ pot }) {
  const navigate = useNavigate()
  const creator = ALL_MEMBERS.find(m => m.id === pot.created_by)
  const filled = pot.members.length
  const isFull = filled >= pot.max_people

  return (
    <div style={styles.card} onClick={() => navigate(`/pot/${pot.id}`)}>
      <div style={styles.top}>
        <span style={styles.time}>{pot.meal_time}</span>
        {pot.is_public && <span style={styles.public}>공개</span>}
      </div>
      <div style={styles.title}>{pot.title}</div>
      <div style={styles.bottom}>
        <span style={styles.creator}>{creator?.nickname} 개설</span>
        <span style={{ ...styles.count, color: isFull ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
          {filled}/{pot.max_people}명
        </span>
      </div>
      <div style={styles.dots}>
        {Array.from({ length: pot.max_people }).map((_, i) => (
          <span key={i} style={{ ...styles.dot, background: i < filled ? 'var(--color-primary)' : 'var(--color-border)' }} />
        ))}
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--spacing-md)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
  },
  top: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 4 },
  time: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-primary)' },
  public: {
    fontSize: 10, background: '#eee', borderRadius: 4, padding: '1px 6px',
    color: 'var(--color-text-muted)',
  },
  title: { fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 8 },
  bottom: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  creator: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  count: { fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  dots: { display: 'flex', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
}
