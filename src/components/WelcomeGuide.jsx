import { useRef, useState } from 'react'
import RiceBowlIcon from './RiceBowlIcon'
import InstallAppPrompt from './InstallAppPrompt'
import guideAsk from '../assets/guide/guide-ask.png'
import guideGroup from '../assets/guide/guide-group.png'
import guideMoment from '../assets/guide/guide-moment.png'
import guideWish from '../assets/guide/guide-wish.png'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 비로그인 사용자가 /onboarding 진입 시 매번 보는 전체화면 소개 — 기능 나열이 아니라
// 서비스를 만든 마음과 쓰임을 감성적으로 전달하는 데 목적이 있다. 스킵 가능.
const PAGES = [
  {
    shot: guideAsk,
    title: '점약있어요?',
    body: '점심을 제안했다가\n이미 약속이 있다는 답에\n괜히 머쓱해진 순간들.\n\n그런 사소한 어려움을\n조금 더 편하게 풀고 싶었어요.',
  },
  {
    shot: guideGroup,
    title: '그룹을 만들어요',
    body: '팀이나 친구들과 그룹을 만들면\n서로의 오늘 상황이 자연스럽게 보여요.\n\n굳이 묻지 않아도,\n같이 먹을 사람을 쉽게 찾을 수 있어요.',
  },
  {
    shot: guideMoment,
    title: '기록이 추억이 돼요',
    body: '함께한 밥팟에 사진이나 한마디를 남겨보세요.\n그 순간들이 모먼트에 차곡차곡 쌓여요.',
  },
  {
    shot: guideWish,
    title: '가고 싶던 곳, 같이 가요',
    body: '평소 가보고 싶었던 곳을 등록해보세요.\n같이 가고 싶은 친구들과 공유돼요.\n맘이 맞는 친구와 같이 가도록 해요.',
  },
  {
    icon: <RiceBowlIcon size={88} />,
    title: '함께 먹을 사람을\n더 편하게 찾도록',
    body: '같이 먹자를 홈 화면에 두고\n필요할 때 가볍게 열어보세요.',
    extra: <InstallAppPrompt hideDesc variant="subtle" />,
  },
]

// 슬라이드 안 요소(스샷/제목/본문)가 한 덩어리가 아니라 순서대로 살짝 지연되며 떠오르게
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const ANIM = {
  shot: { animation: `guideShotReveal 1.4s ${EASE} both` },
  item: { animation: `guideItemRise 1.2s ${EASE} both` },
}

export default function WelcomeGuide({ onDone }) {
  const [index, setIndex] = useState(0)
  const drag = useRef({ active: false, startX: 0 })
  const total = PAGES.length
  const isLast = index === total - 1
  const page = PAGES[index]

  const onPointerDown = (e) => {
    drag.current = { active: true, startX: e.clientX }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const endDrag = (e) => {
    if (!drag.current.active) return
    const deltaX = e.clientX - drag.current.startX
    const THRESHOLD = 50
    if (deltaX < -THRESHOLD && index < total - 1) setIndex(i => i + 1)
    else if (deltaX > THRESHOLD && index > 0) setIndex(i => i - 1)
    drag.current.active = false
  }

  const goNext = () => { if (isLast) onDone(); else setIndex(i => i + 1) }
  const goBack = () => setIndex(i => Math.max(0, i - 1))

  let delay = 0
  const nextDelay = (step) => { const d = delay; delay += step; return `${d}ms` }

  return (
    <div style={styles.overlay}>
      <div
        style={styles.track}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={() => { drag.current.active = false }}
      >
        <div key={index} style={styles.slide}>
          <div style={{ ...styles.iconWrap, ...ANIM.shot, animationDelay: nextDelay(220) }}>
            {page.icon}
            {page.shot && <img src={page.shot} alt="" style={styles.shot} />}
          </div>
          {page.tagline && (
            <p style={{ ...styles.tagline, ...ANIM.item, animationDelay: nextDelay(180) }}>{page.tagline}</p>
          )}
          {page.title && (
            <h1 style={{ ...styles.title, ...ANIM.item, animationDelay: nextDelay(180) }}>{page.title}</h1>
          )}
          <p style={{ ...styles.body, ...ANIM.item, animationDelay: nextDelay(180) }}>{page.body}</p>
          {page.extra && (
            <div style={{ ...styles.extra, ...ANIM.item, animationDelay: nextDelay(180) }}>{page.extra}</div>
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.dots}>
          {PAGES.map((_, i) => (
            <span key={i} style={{ ...styles.dot, ...(i === index ? styles.dotActive : null) }} />
          ))}
        </div>
        <div style={styles.buttonsRow}>
          {index > 0 && (
            <button style={styles.backBtn} onClick={goBack}>이전</button>
          )}
          <button style={styles.nextBtn} onClick={goNext}>
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
        <button style={styles.skip} onClick={onDone}>건너뛰기</button>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'var(--color-bg)', display: 'flex', flexDirection: 'column',
    paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
  },
  skip: {
    background: 'none', border: 'none', color: 'var(--color-text-muted)',
    fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', padding: 8,
  },
  track: { flex: 1, overflow: 'hidden', touchAction: 'pan-y' },
  slide: {
    width: '100%', height: '100%', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '48px var(--spacing-lg) var(--spacing-lg)', textAlign: 'center',
    overflowY: 'auto',
  },
  // 남는 공간을 전부 차지해서 그 안에서 사진이 가운데 오도록 하는 스페이서 겸 컨테이너.
  // 텍스트 영역은 자기 높이만큼만 차지하니 자연히 하단에 남는다.
  iconWrap: {
    flex: '1 1 0%', minHeight: 0, width: '100%', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  shot: { width: 'min(85vw, 340px)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border)' },
  tagline: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-base)', fontWeight: 600, lineHeight: 1.4, margin: '0 0 2px' },
  title: { fontFamily: 'var(--font-title)', fontSize: 28, fontWeight: 900, color: 'var(--color-text)', lineHeight: 1.3, letterSpacing: '-0.5px', margin: '0 0 14px', whiteSpace: 'pre-line' },
  body: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 },
  extra: { marginTop: 'var(--spacing-xl)', width: 'min(78vw, calc(var(--max-width) * 0.78))' },
  footer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md) var(--spacing-lg) var(--spacing-lg)' },
  dots: { display: 'flex', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--color-border)', transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)' },
  dotActive: { background: 'var(--color-primary)', width: 16 },
  buttonsRow: { display: 'flex', gap: 8, width: 'min(78vw, calc(var(--max-width) * 0.78))' },
  backBtn: {
    flex: 1, padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)',
    border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.3px',
  },
  nextBtn: { ...PRIMARY_ACTION_BUTTON, flex: 2 },
}
