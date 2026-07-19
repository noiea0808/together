import { useNavigate } from 'react-router-dom'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const CONCEPTS = [
  { emoji: '👥', title: '그룹', desc: '같이 밥 먹는 사람들의 모임이에요.' },
  { emoji: '⏰', title: '슬롯', desc: '아침·점심·저녁처럼 밥 먹을 시간이에요.' },
  { emoji: '🍲', title: '밥팟', desc: '그 시간에 실제로 만들어지는 식사 약속이에요.' },
]

const STEPS = [
  { title: '그룹에 들어가기', desc: '그룹을 만들거나 초대 링크로 참여해요.' },
  { title: '오늘 상태 알려두기', desc: '같이 먹어요 / 약속 있어요 / 패스할게요 중에서 골라요.' },
  { title: '밥팟 만들거나 참여하기', desc: '마음 맞는 사람이 보이면 밥팟을 열거나 들어가요.' },
  { title: '모먼트 남기기', desc: '식사 후 사진과 코멘트를 남겨 함께 공유해요.' },
]

const EXTRAS = [
  { emoji: '🗺️', text: '가고 싶은 식당이나 메뉴를 공유할 수 있어요.' },
  { emoji: '🔍', text: '친구를 찾아 그룹에 초대할 수 있어요.' },
  { emoji: '🔔', text: '초대·참여·댓글 소식을 알림으로 받아볼 수 있어요.' },
]

export default function GuidePage() {
  const navigate = useNavigate()

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>사용법</span>
        <button style={styles.closeBtn} onClick={() => navigate(-1)} aria-label="닫기">✕</button>
      </div>

      <div style={styles.body}>
        {/* 인트로 */}
        <div style={styles.hero}>
          <div style={styles.heroImagePlaceholder}>
            <RiceBowlIcon size={56} />
          </div>
          <p style={styles.heroText}>
            "점약있어?" 매번 물어보기 귀찮았죠?<br />
            서로 오늘 상태를 알려두면, 누구와 밥 먹을지 더 쉽게 정할 수 있어요 🍚
          </p>
        </div>

        {/* 핵심 개념 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>이것만 알면 돼요</h2>
          <div style={styles.conceptGrid}>
            {CONCEPTS.map(c => (
              <div key={c.title} style={styles.conceptCard}>
                <span style={styles.conceptEmoji}>{c.emoji}</span>
                <span style={styles.conceptTitle}>{c.title}</span>
                <span style={styles.conceptDesc}>{c.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 사용 흐름 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>이렇게 써보세요</h2>
          <div style={styles.stepList}>
            {STEPS.map((s, i) => (
              <div key={s.title} style={styles.stepRow}>
                <div style={styles.stepHeader}>
                  <span style={styles.stepBadge}>{i + 1}</span>
                  <div style={styles.stepTextCol}>
                    <span style={styles.stepTitle}>{s.title}</span>
                    <span style={styles.stepDesc}>{s.desc}</span>
                  </div>
                </div>
                <div style={styles.shotPlaceholder}>스크린샷 준비 중</div>
              </div>
            ))}
          </div>
        </div>

        {/* 부가 기능 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>이런 것도 있어요</h2>
          <div style={styles.extraList}>
            {EXTRAS.map(e => (
              <div key={e.text} style={styles.extraRow}>
                <span style={styles.extraEmoji}>{e.emoji}</span>
                <span style={styles.extraText}>{e.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 마무리 CTA */}
        <div style={styles.ctaBox}>
          <p style={styles.ctaText}>오늘 누구와 먹을지 정해볼까요?</p>
          <button style={styles.ctaBtn} onClick={() => navigate('/today')}>
            오늘 상태 알려두기 →
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    height: 44, padding: '0 var(--spacing-md)', position: 'sticky', top: 0,
    background: 'rgba(250,248,245,0.95)', zIndex: 10, backdropFilter: 'blur(8px)', flexShrink: 0,
    borderBottom: '1px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontFamily: 'var(--font-title)', fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  closeBtn: {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 16, cursor: 'pointer', padding: 0,
  },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)', paddingBottom: 48 },

  hero: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-lg) var(--spacing-sm)', textAlign: 'center' },
  heroImagePlaceholder: {
    width: 96, height: 96, borderRadius: '50%', background: 'var(--color-surface-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  heroText: { fontSize: 'var(--font-size-base)', fontWeight: 600, lineHeight: 1.6, color: 'var(--color-text)', margin: 0 },

  section: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  sectionTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 800, margin: 0 },

  conceptGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  conceptCard: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px var(--spacing-md)',
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
  },
  conceptEmoji: { fontSize: 24, flexShrink: 0 },
  conceptTitle: { fontWeight: 800, fontSize: 'var(--font-size-sm)', width: 40, flexShrink: 0 },
  conceptDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },

  stepList: { display: 'flex', flexDirection: 'column', gap: 20 },
  stepRow: { display: 'flex', flexDirection: 'column', gap: 10 },
  stepHeader: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  stepBadge: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff',
    fontSize: 'var(--font-size-xs)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepTextCol: { display: 'flex', flexDirection: 'column', gap: 2 },
  stepTitle: { fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  stepDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  shotPlaceholder: {
    height: 140, marginLeft: 34, borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
  },

  extraList: { display: 'flex', flexDirection: 'column', gap: 8 },
  extraRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  extraEmoji: { fontSize: 18, flexShrink: 0 },
  extraText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)' },

  ctaBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 'var(--spacing-lg) 0' },
  ctaText: { fontWeight: 700, fontSize: 'var(--font-size-base)', margin: 0 },
  ctaBtn: { ...PRIMARY_ACTION_BUTTON, width: '100%' },
}
