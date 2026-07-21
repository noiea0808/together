import { useState, useEffect, useRef } from 'react'
import { useUser } from '../lib/UserContext'
import { getActiveDailyTips } from '../lib/db'
import { useScrollLock } from '../lib/useScrollLock'
import { useDragScroll } from '../lib/useDragScroll'

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDismissedToday() {
  try {
    const stored = JSON.parse(localStorage.getItem('dailyTipDismissedDate') || 'null')
    return stored === toDateStr(new Date())
  } catch {
    return false
  }
}

function dismissToday() {
  localStorage.setItem('dailyTipDismissedDate', JSON.stringify(toDateStr(new Date())))
}

// 별표(is_featured) 팁은 가중치 2, 일반 팁은 가중치 1로 뽑아 순서를 정한다.
// 매 단계에서 남은 항목 중 가중치에 비례한 확률로 하나를 뽑아 앞으로 보내는 방식이라,
// 별표 팁이 평균적으로 더 앞쪽(끝까지 안 넘겨도 보일 위치)에 나올 확률이 두 배가 된다.
function weightedShuffle(items) {
  const pool = items.map(item => ({ item, weight: item.is_featured ? 2 : 1 }))
  const result = []
  while (pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight
      if (r <= 0) { idx = i; break }
    }
    result.push(pool.splice(idx, 1)[0].item)
  }
  return result
}

const TABS = {
  guide: { key: 'guide', label: '시작하기' },
  tip: { key: 'tip', label: '오늘의 팁' },
}

// 내 계정 > 사용법처럼, 다른 화면에서 이 팝업을 특정 탭으로 직접 열고 싶을 때 쓴다.
const OPEN_EVENT = 'daily-tip-modal:open'
export function openDailyTipModal(tab = 'tip') {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { tab } }))
}

// 로그인 후 접속할 때마다 뜨는 팝업. "시작하기"(guide, 정해진 순서)와
// "오늘의 팁"(tip, 랜덤 순서) 두 탭을 가지며, 탭은 자유롭게 오갈 수 있다.
// 시작하기 탭이 있으면 항상 그 탭을 기본으로 보여주고, 없으면 오늘의 팁을 보여준다.
// "오늘 하루 보지 않기"는 기기(로컬스토리지) 기준으로만 적용되며, 그냥 닫기는 다음 접속 때 다시 뜬다.
// GroupInviteModal과 겹치지 않도록 초대 코드가 대기 중이면 이번 접속에서는 띄우지 않는다.
export default function DailyTipModal() {
  const { user } = useUser()
  const [tabItems, setTabItems] = useState(null) // null = 미확인, { guide: [], tip: [] }
  const [activeTab, setActiveTab] = useState('tip')
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const scrollRef = useRef(null)
  const dragScroll = useDragScroll()
  // 카드가 좌우로 넘어간다는 걸 처음 진입한 사용자에게만 몸으로 알려주는 1회성 넛지.
  // TodayPage의 나의 상태 카드 넛지와 같은 애니메이션(statusCardSwipeHint)을 재사용한다.
  const [showSwipeHint, setShowSwipeHint] = useState(() => !localStorage.getItem('dailyTipSwipeHintShown'))
  const dismissSwipeHint = () => { localStorage.setItem('dailyTipSwipeHintShown', '1'); setShowSwipeHint(false) }

  useScrollLock(open)

  useEffect(() => {
    if (!user || !user.onboarded || user.is_guest) return
    if (tabItems !== null) return
    if (isDismissedToday()) return
    if (localStorage.getItem('pendingInviteCode')) return

    let cancelled = false
    getActiveDailyTips()
      .then(list => {
        if (cancelled) return
        const guide = list.filter(t => t.category === 'guide').sort((a, b) => a.sort_order - b.sort_order)
        const tip = weightedShuffle(list.filter(t => t.category !== 'guide'))
        if (guide.length === 0 && tip.length === 0) {
          setTabItems({ guide: [], tip: [] })
          return
        }
        setTabItems({ guide, tip })
        setActiveTab(guide.length > 0 ? 'guide' : 'tip')
        setOpen(true)
      })
      .catch(() => { if (!cancelled) setTabItems({ guide: [], tip: [] }) })
    return () => { cancelled = true }
  }, [user?.id, user?.onboarded, user?.is_guest])

  useEffect(() => {
    const openTab = (list, tab) => {
      const guide = list.filter(t => t.category === 'guide').sort((a, b) => a.sort_order - b.sort_order)
      const tip = weightedShuffle(list.filter(t => t.category !== 'guide'))
      const next = { guide, tip }
      setTabItems(next)
      if (next[tab]?.length > 0) {
        setActiveTab(tab)
        setIndex(0)
        setOpen(true)
      }
    }

    const handler = (e) => {
      const tab = e.detail?.tab ?? 'tip'
      if (tabItems) {
        if (tabItems[tab]?.length > 0) {
          setActiveTab(tab)
          setIndex(0)
          if (scrollRef.current) scrollRef.current.scrollLeft = 0
          setOpen(true)
        }
        return
      }
      getActiveDailyTips().then(list => openTab(list, tab)).catch(() => {})
    }

    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [tabItems])

  const items = tabItems?.[activeTab] ?? []
  const availableTabs = tabItems ? Object.keys(TABS).filter(k => tabItems[k]?.length > 0) : []

  if (!open || items.length === 0) return null

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || !el.clientWidth) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  const switchTab = (tab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setIndex(0)
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }

  const close = () => setOpen(false)

  const closeToday = () => {
    dismissToday()
    setOpen(false)
  }

  return (
    <div style={styles.overlay} onClick={close}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        {availableTabs.length > 1 ? (
          <div style={styles.tabRow}>
            {availableTabs.map(key => (
              <button
                key={key}
                style={{ ...styles.tabBtn, ...(activeTab === key ? styles.tabBtnActive : {}) }}
                onClick={() => switchTab(key)}
              >
                {TABS[key].label}
              </button>
            ))}
          </div>
        ) : (
          <div style={styles.header}>
            <span style={styles.headerTitle}>{TABS[activeTab].label}</span>
          </div>
        )}

        <div
          className="no-scrollbar"
          style={{ ...styles.scroll, animation: (showSwipeHint && items.length > 1) ? 'statusCardSwipeHint 0.9s ease-in-out 0.4s' : undefined }}
          ref={scrollRef}
          onScroll={handleScroll}
          onAnimationEnd={dismissSwipeHint}
          {...dragScroll}
        >
          {items.map(item => (
            <div key={item.id} style={styles.item}>
              {item.image_url && <img src={item.image_url} alt="" style={styles.image} loading="lazy" />}
              {item.content && <p style={styles.body}>{item.content}</p>}
            </div>
          ))}
        </div>

        {items.length > 1 && (
          <div style={styles.dotsRow}>
            {items.map((_, i) => (
              <span key={i} style={{ ...styles.dot, ...(i === index ? styles.dotActive : {}) }} />
            ))}
          </div>
        )}

        <div style={styles.btnRow}>
          <button style={styles.dismissBtn} onClick={closeToday}>오늘 하루 보지 않기</button>
          <button style={styles.closeBtn} onClick={close}>닫기</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 400, padding: 'var(--spacing-lg)',
  },
  dialog: {
    width: '100%', maxWidth: 380, background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)', padding: '20px 0', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--spacing-lg)' },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  tabRow: { display: 'flex', gap: 6, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)', padding: 4, margin: '0 var(--spacing-lg)' },
  tabBtn: {
    flex: 1, padding: '8px 10px', background: 'none', border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', cursor: 'pointer',
  },
  tabBtnActive: { background: 'var(--color-surface)', color: 'var(--color-primary, #FF6B35)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  scroll: { display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', cursor: 'grab' },
  item: {
    flex: '0 0 100%', scrollSnapAlign: 'start',
    display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
  },
  image: { width: '100%', height: 'auto', maxHeight: '60vh', objectFit: 'cover', display: 'block' },
  body: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.6, margin: 0, padding: '0 var(--spacing-lg)' },
  dotsRow: { display: 'flex', justifyContent: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-border)' },
  dotActive: { background: 'var(--color-primary, #FF6B35)' },
  btnRow: { width: '100%', display: 'flex', gap: 8, padding: '0 var(--spacing-lg)' },
  closeBtn: {
    flex: 1, padding: 11, background: 'linear-gradient(135deg, #FF6B35, #FF8C5A)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
  },
  dismissBtn: { flex: 1, padding: 11, background: 'none', color: 'var(--color-text-muted)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
