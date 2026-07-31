import { useCallback, useEffect, useRef, useState } from 'react'

// 스크롤을 아래로 내리면 true(숨김), 위로 올리면 false(노출).
// 페이지 최상단 근처(threshold 이내)에서는 항상 노출.
export function useHideOnScroll({ threshold = 48, delta = 6 } = {}) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    lastY.current = window.scrollY

    const update = () => {
      // 모바일 오버스크롤(고무줄 바운스) 구간에서는 scrollY가 범위를 벗어나며 미세하게
      // 진동하는데, 이걸 그대로 diff에 반영하면 헤더가 보였다 숨었다를 반복해 떨려 보인다.
      // 유효 범위로 클램프해서 바운스 중엔 diff가 0에 가깝게 유지되도록 한다.
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const y = Math.min(Math.max(window.scrollY, 0), maxScroll)
      const diff = y - lastY.current
      if (y < threshold) setHidden(false)
      else if (diff > delta) setHidden(true)
      else if (diff < -delta) setHidden(false)
      lastY.current = y
      ticking.current = false
    }

    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(update)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold, delta])

  return hidden
}

// 문서(window)가 아니라 자체 스크롤 컨테이너(overflowY:auto인 본문 div)를 감시하는 버전 —
// 일정/모먼트/친구/내 계정처럼 헤더가 고정이고 본문만 내부 스크롤되는 페이지용.
// [hidden, bindScroll]을 반환하며, bindScroll을 스크롤 컨테이너의 ref로 붙이면 된다.
// 콜백 ref라서 로딩 화면 뒤에 조건부로 뒤늦게 마운트되는 엘리먼트에도 안전하게 붙는다
// (RefObject + useEffect 조합이었다면 로딩 중 첫 렌더에 target.current가 null이라
// 리스너가 영영 안 붙는 문제가 생긴다).
export function useHideOnScrollContainer({ threshold = 48, delta = 6 } = {}) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const ticking = useRef(false)
  const cleanup = useRef(null)

  const bindScroll = useCallback((el) => {
    cleanup.current?.()
    cleanup.current = null
    if (!el) return

    lastY.current = el.scrollTop

    const update = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
      const y = Math.min(Math.max(el.scrollTop, 0), maxScroll)
      const diff = y - lastY.current
      if (y < threshold) setHidden(false)
      else if (diff > delta) setHidden(true)
      else if (diff < -delta) setHidden(false)
      lastY.current = y
      ticking.current = false
    }

    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(update)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    cleanup.current = () => el.removeEventListener('scroll', onScroll)
  }, [threshold, delta])

  useEffect(() => () => cleanup.current?.(), [])

  return [hidden, bindScroll]
}
