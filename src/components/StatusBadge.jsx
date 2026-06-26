import { SLOT_STATUS_OPTIONS } from '../mock/data'

export default function StatusBadge({ status }) {
  if (!status) return <span style={styles.empty}>미설정</span>
  const opt = SLOT_STATUS_OPTIONS.find(o => o.key === status)
  if (!opt) return <span style={styles.empty}>미설정</span>
  return (
    <span style={{ ...styles.badge, background: opt.color + '22', color: opt.color, border: `1px solid ${opt.color}44` }}>
      {opt.emoji} {opt.label}
    </span>
  )
}

const styles = {
  badge: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)',
    fontWeight: 600,
  },
  empty: {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--color-text-muted)',
  },
}
