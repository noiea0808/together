import { useRef, useMemo } from 'react'

// 가로 스크롤(scroll-snap) 캐러셀에 마우스 클릭+드래그 스와이프를 붙여주는 훅.
// 터치는 브라우저가 기본으로 스크롤을 처리하므로, pointerType이 'mouse'일 때만 개입한다.
export function useDragScroll() {
  const drag = useRef({ active: false, startX: 0, startScrollLeft: 0 })

  return useMemo(() => ({
    onPointerDown: (e) => {
      if (e.pointerType !== 'mouse') return
      const el = e.currentTarget
      drag.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft }
      el.setPointerCapture?.(e.pointerId)
    },
    onPointerMove: (e) => {
      if (!drag.current.active) return
      e.currentTarget.scrollLeft = drag.current.startScrollLeft - (e.clientX - drag.current.startX)
    },
    onPointerUp: (e) => {
      drag.current.active = false
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    },
    onPointerCancel: () => { drag.current.active = false },
  }), [])
}
