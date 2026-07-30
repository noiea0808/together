import { useRef, useState } from 'react'
import RiceBowlIcon from './RiceBowlIcon'
import InstallAppPrompt from './InstallAppPrompt'
import AskRejectedIllustration from './AskRejectedIllustration'
import guideGroup from '../assets/guide/guide-group.png'
import guideMoment from '../assets/guide/guide-moment.png'
import guideWish from '../assets/guide/guide-wish.png'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 비로그인 사용자가 /onboarding 진입 시 매번 보는 전체화면 소개 — 기능 나열이 아니라
// 서비스를 만든 마음과 쓰임을 감성적으로 전달하는 데 목적이 있다. 스킵 가능.
const PAGES = [
  {
    icon: <AskRejectedIllustration />,
    body: '먼저 물어보기 어색해서, 결국 혼자 먹은 적 있으시죠.\n그런 순간들이 조금 더 쉬워졌으면 해서 만들었어요.',
  },
  {
    shot: guideGroup,
    title: '그룹을 만들어요',
    body: '팀이나 친구들과 그룹을 만들면\n서로의 오늘 상황이 자연스럽게 보여요.\n굳이 묻지 않아도, 같이 먹을 사람을 쉽게 찾을 수 있어요.',
  },
  {
    shot: guideMoment,
    title: '기록이 추억이 돼요',
    body: '함께한 밥팟에 사진이나 한마디를 남겨보세요.\n그 순간들이 모먼트에 차곡차곡 쌓여요.',
  },
  {
    shot: guideWish,
    title: '가고 싶던 곳, 같이 가요',
    body: '평소 가보고 싶었던 곳을 등록해보세요.\n그룹원과 공유되고, 다음엔 정말 같이 갈 수 있어요.',
  },
  {
    icon: <RiceBowlIcon size={88} />,
    title: '매일, 자연스럽게',
    body: '앱스토어 없이 홈 화면에 추가해두면\n언제든 바로 열 수 있어요.',
    extra: <InstallAppPrompt hideDesc />,
  },
]

export default function WelcomeGuide({ onDone }) {
  const [index, setIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const drag = useRef({ active: false, startX: 0 })
  const total = PAGES.length
  const isLast = index === total - 1

  const onPointerDown = (e) => {
    drag.current = { active: true, startX: e.clientX }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current.active) return
    setDragX(e.clientX - drag.current.startX)
  }
  const endDrag = () => {
    if (!drag.current.active) return
    const THRESHOLD = 50
    if (dragX < -THRESHOLD && index < total - 1) setIndex(i => i + 1)
    else if (dragX > THRESHOLD && index > 0) setIndex(i => i - 1)
    drag.current.active = false
    setDragX(0)
  }

  const goNext = () => { if (isLast) onDone(); else setIndex(i => i + 1) }
  const goBack = () => setIndex(i => Math.max(0, i - 1))

  return (
    <div style={styles.overlay}>
      <div
        style={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          style={{
            ...styles.slides,
            transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
            transition: drag.current.active ? 'none' : 'transform 0.3s ease',
          }}
        >
          {PAGES.map((p, i) => (
            <div key={i} style={styles.slide}>
              <div style={styles.iconWrap}>
                {p.icon}
                {p.shot && (
                  <img
                    src={p.shot}
                    alt=""
                    style={{
                      ...styles.shot,
                      animation: i === index ? 'guideShotRise 0.5s ease-out both' : 'none',
                    }}
                  />
                )}
              </div>
              {p.tagline && <p style={styles.tagline}>{p.tagline}</p>}
              {p.title && <h1 style={styles.title}>{p.title}</h1>}
              <p style={styles.body}>{p.body}</p>
              {p.extra && <div style={styles.extra}>{p.extra}</div>}
            </div>
          ))}
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
  slides: { display: 'flex', width: '100%', height: '100%' },
  slide: {
    flex: '0 0 100%', width: '100%', height: '100%', boxSizing: 'border-box',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '48px var(--spacing-lg) var(--spacing-lg)', textAlign: 'center',
    overflowY: 'auto',
  },
  iconWrap: { marginBottom: 24 },
  shot: { width: 'min(85vw, 340px)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', border: '1px solid var(--color-border)' },
  tagline: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-base)', fontWeight: 600, lineHeight: 1.4, margin: '0 0 2px' },
  title: { fontFamily: 'var(--font-title)', fontSize: 28, fontWeight: 900, color: 'var(--color-text)', lineHeight: 1.3, letterSpacing: '-0.5px', margin: '0 0 14px' },
  body: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0 },
  extra: { marginTop: 'var(--spacing-xl)', width: 'min(78vw, calc(var(--max-width) * 0.78))' },
  footer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md) var(--spacing-lg) var(--spacing-lg)' },
  dots: { display: 'flex', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--color-border)' },
  dotActive: { background: 'var(--color-primary)', width: 16 },
  buttonsRow: { display: 'flex', gap: 8, width: 'min(78vw, calc(var(--max-width) * 0.78))' },
  backBtn: {
    flex: 1, padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)',
    border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.3px',
  },
  nextBtn: { ...PRIMARY_ACTION_BUTTON, flex: 2 },
}
