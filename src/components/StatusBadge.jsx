const CONFIG = {
  점심:  { label: '점심 가능', color: 'var(--color-status-lunch)' },
  저녁:  { label: '저녁 가능', color: 'var(--color-status-dinner)' },
  커피:  { label: '커피만',    color: 'var(--color-status-coffee)' },
  패스:  { label: '패스',      color: 'var(--color-status-pass)' },
}

export default function StatusBadge({ status }) {
  if (!status) return <span style={styles.empty}>미설정</span>
  const c = CONFIG[status]
  return (
    <span style={{ ...styles.badge, background: c.color + '22', color: c.color, border: `1px solid ${c.color}44` }}>
      {c.label}
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
