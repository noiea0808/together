import { useRef, useMemo } from 'react'

// 스냅 복구 타이밍 — scrollTo({behavior:'smooth'})가 끝나기 전에 스냅을 다시 켜면
// 브라우저가 진행 중인 부드러운 스크롤을 끊어버려서, 넉넉히 기다렸다가 되돌린다.
const SNAP_RESTORE_MS = 420

// 가로 스크롤(scroll-snap) 캐러셀에 마우스 클릭+드래그 스와이프를 붙여주는 훅.
// 터치는 브라우저가 기본으로 스크롤을 처리하므로, pointerType이 'mouse'일 때만 개입한다.
export function useDragScroll() {
  const drag = useRef(null)
  const savedSnap = useRef(null)   // 드래그 동안 꺼둔 scroll-snap 원래 값
  const restoreTimer = useRef(null)

  return useMemo(() => {
    const restoreSnapLater = (el) => {
      clearTimeout(restoreTimer.current)
      restoreTimer.current = setTimeout(() => {
        if (savedSnap.current == null) return
        el.style.scrollSnapType = savedSnap.current
        savedSnap.current = null
      }, SNAP_RESTORE_MS)
    }

    const end = (e) => {
      const d = drag.current
      if (!d) return
      drag.current = null
      const el = d.el
      el.releasePointerCapture?.(e.pointerId)
      el.style.cursor = d.cursor
      el.style.userSelect = d.userSelect

      // 스냅이 꺼진 상태로 손을 뗐으니 어느 카드로 갈지는 직접 정한다. 반 칸(50%)을 넘겨야
      // 넘어가는 기본 스냅 규칙은 마우스로는 너무 뻑뻑해서, 짧게 튕겨도 넘어가도록 낮춘다.
      const page = el.clientWidth || 1
      const deltaX = (e.clientX ?? d.startX) - d.startX
      const threshold = Math.max(40, page * 0.15)
      const startIndex = Math.round(d.startScrollLeft / page)
      const maxIndex = Math.max(0, Math.round((el.scrollWidth - page) / page))
      let target = startIndex
      if (deltaX <= -threshold) target = Math.min(startIndex + 1, maxIndex)
      else if (deltaX >= threshold) target = Math.max(startIndex - 1, 0)

      el.scrollTo({ left: target * page, behavior: 'smooth' })
      restoreSnapLater(el)
    }

    return {
      onPointerDown: (e) => {
        if (e.pointerType !== 'mouse') return
        // 버튼 위에서 누른 경우까지 포인터를 캡처해버리면, mouseup이 이 컨테이너로
        // 리다이렉트되면서 버튼과 클릭 대상이 갈려 click 이벤트가 아예 발생하지 않는다
        // (사진 카드의 '⋯' 편집 버튼이 마우스로는 안 눌리던 원인). 버튼 위에서는 드래그
        // 스크롤을 개입시키지 않고 클릭이 정상 동작하도록 그대로 통과시킨다.
        if (e.target.closest('button, a, input, textarea, select')) return
        const el = e.currentTarget
        clearTimeout(restoreTimer.current)
        drag.current = {
          el,
          startX: e.clientX,
          startScrollLeft: el.scrollLeft,
          cursor: el.style.cursor,
          userSelect: el.style.userSelect,
        }
        // scroll-snap-type이 mandatory인 채로 scrollLeft를 건드리면, 브라우저가 그때마다
        // 가장 가까운 스냅 지점으로 되돌려버려서 드래그가 아예 안 먹는 것처럼 보인다.
        // 드래그하는 동안만 스냅을 끄고, 손을 뗀 뒤 목적지로 보내고 나서 되살린다.
        if (savedSnap.current == null) savedSnap.current = el.style.scrollSnapType
        el.style.scrollSnapType = 'none'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
        el.setPointerCapture?.(e.pointerId)
      },
      onPointerMove: (e) => {
        if (!drag.current) return
        drag.current.el.scrollLeft = drag.current.startScrollLeft - (e.clientX - drag.current.startX)
      },
      onPointerUp: end,
      onPointerCancel: end,
      // 카드 대부분이 <img>라 그냥 두면 마우스 드래그가 브라우저 기본 이미지 끌기로
      // 넘어가면서 pointercancel이 나고 스와이프가 중간에 끊긴다.
      onDragStart: (e) => e.preventDefault(),
    }
  }, [])
}
