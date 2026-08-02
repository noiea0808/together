import { useRef, useMemo } from 'react'

// 가로 스크롤(scroll-snap) 캐러셀에 마우스 클릭+드래그 스와이프를 붙여주는 훅.
// 터치는 브라우저가 기본으로 스크롤을 처리하므로, pointerType이 'mouse'일 때만 개입한다.
export function useDragScroll() {
  const drag = useRef({ active: false, startX: 0, startScrollLeft: 0 })

  return useMemo(() => ({
    onPointerDown: (e) => {
      if (e.pointerType !== 'mouse') return
      // 버튼 위에서 누른 경우까지 포인터를 캡처해버리면, mouseup이 이 컨테이너로
      // 리다이렉트되면서 버튼과 클릭 대상이 갈려 click 이벤트가 아예 발생하지 않는다
      // (사진 카드의 '⋯' 편집 버튼이 마우스로는 안 눌리던 원인). 버튼 위에서는 드래그
      // 스크롤을 개입시키지 않고 클릭이 정상 동작하도록 그대로 통과시킨다.
      if (e.target.closest('button')) return
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
