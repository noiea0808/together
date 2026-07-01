import { useHideOnScroll } from '../lib/useHideOnScroll'

// hidden을 상위에서 넘기면(dateNav 등 다른 sticky 요소와 동기화할 때) 그 값을 쓰고,
// 아니면 내부에서 스스로 스크롤을 감지한다.
export default function Header({ hidden: hiddenProp }) {
  const autoHidden = useHideOnScroll()
  const hidden = hiddenProp ?? autoHidden

  return (
    <div
      style={{
        ...styles.bar,
        height: hidden ? 0 : 44,
        opacity: hidden ? 0 : 1,
        borderBottomColor: hidden ? 'transparent' : 'var(--color-border)',
      }}
    >
      <span style={styles.logo}>🍚</span>
      <span style={styles.title}>같이 먹자</span>
    </div>
  )
}

const styles = {
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
    padding: '0 var(--spacing-md)',
    background: 'rgba(250,248,245,0.96)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid',
    transition: 'height 0.22s ease, opacity 0.18s ease, border-color 0.18s ease',
    flexShrink: 0,
  },
  logo: { fontSize: 18, lineHeight: 1 },
  title: { fontWeight: 900, fontSize: 'var(--font-size-sm)', letterSpacing: '-0.4px', color: 'var(--color-text)' },
}
