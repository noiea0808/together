import { useRef, useEffect, useState } from 'react'

export const CAROUSEL_AMPM    = ['오전', '오후']
export const CAROUSEL_HOURS   = ['01','02','03','04','05','06','07','08','09','10','11','12']
export const CAROUSEL_MINUTES = ['00','05','10','15','20','25','30','35','40','45','50','55']

// 현재 시각 기준 캐러셀 기본값 (또는 기존 time 파싱)
export function getCarouselTime(timeStr) {
  const src = timeStr ? timeStr.split(':').map(Number) : (() => { const n = new Date(); return [n.getHours(), n.getMinutes()] })()
  const [h, m] = src
  const ampm = h < 12 ? '오전' : '오후'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const nearestMin = CAROUSEL_MINUTES.reduce((a, b) =>
    Math.abs(parseInt(b) - m) < Math.abs(parseInt(a) - m) ? b : a)
  return { ampm, hour: String(hour12).padStart(2, '0'), minute: nearestMin }
}

export function carouselTimeToStr({ ampm, hour, minute }) {
  let h = Number(hour) % 12
  if (ampm === '오후') h += 12
  return `${String(h).padStart(2, '0')}:${minute}`
}

const STEP_PX = 26 // 드래그 한 칸 이동 거리

export default function CarouselPicker({ items, value, onChange, disabled, width = 56 }) {
  const idx = Math.max(0, items.indexOf(value))
  const get = (offset) => items[((idx + offset) % items.length + items.length) % items.length]

  // 값이 바뀔 때 슬라이드 애니메이션을 재생하기 위한 상태 (방향 + 토큰)
  const [anim, setAnim] = useState({ dir: 0, n: 0 })

  const wheelAcc = useRef(0)
  const drag = useRef({ active: false, startY: 0, acc: 0 })
  const rootRef = useRef(null)

  // 최신 step 함수를 ref로 유지 (네이티브 wheel 리스너가 참조)
  const stepRef = useRef(null)
  stepRef.current = (dir) => {
    if (disabled) return
    setAnim(a => ({ dir, n: a.n + 1 }))
    onChange(get(dir))
  }
  const step = (dir) => stepRef.current(dir)

  // 휠 — passive가 아닌 네이티브 리스너로 등록해 preventDefault 가능
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const handler = (e) => {
      if (disabled) return
      e.preventDefault()
      wheelAcc.current += e.deltaY
      while (Math.abs(wheelAcc.current) >= 30) {
        const dir = wheelAcc.current > 0 ? 1 : -1
        stepRef.current(dir)
        wheelAcc.current -= dir * 30
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [disabled])

  const onPointerDown = (e) => {
    if (disabled) return
    drag.current = { active: true, startY: e.clientY, acc: 0 }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current.active) return
    const dy = e.clientY - drag.current.startY
    drag.current.startY = e.clientY
    drag.current.acc += dy
    while (Math.abs(drag.current.acc) >= STEP_PX) {
      // 아래로 끌면(↓) 이전 항목, 위로 끌면(↑) 다음 항목
      const dir = drag.current.acc > 0 ? -1 : 1
      step(dir)
      drag.current.acc -= (drag.current.acc > 0 ? 1 : -1) * STEP_PX
    }
  }
  const endDrag = () => { drag.current.active = false; drag.current.acc = 0 }

  const sideCell = {
    height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, opacity: 0.3, cursor: disabled ? 'default' : 'pointer',
    color: 'var(--color-text-muted)', width: '100%',
  }

  return (
    <div
      ref={rootRef}
      style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none', touchAction: 'none', cursor: disabled ? 'default' : 'ns-resize', overflow: 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div style={sideCell} onClick={() => step(-1)}>{get(-1)}</div>
      <div style={{ height: 40, width: '100%', position: 'relative', overflow: 'hidden',
        borderTop: '1.5px solid var(--color-primary)', borderBottom: '1.5px solid var(--color-primary)',
        background: 'rgba(255,107,53,0.05)' }}
      >
        <div
          key={anim.n}
          style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 800, color: 'var(--color-text)',
            animation: anim.dir !== 0 ? `${anim.dir > 0 ? 'carouselUp' : 'carouselDown'} 0.18s ease-out` : 'none',
          }}
        >{get(0)}</div>
      </div>
      <div style={sideCell} onClick={() => step(1)}>{get(1)}</div>
    </div>
  )
}
