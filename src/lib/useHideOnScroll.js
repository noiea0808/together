import { useEffect, useRef, useState } from 'react'

// 스크롤을 아래로 내리면 true(숨김), 위로 올리면 false(노출).
// 페이지 최상단 근처(threshold 이내)에서는 항상 노출.
export function useHideOnScroll({ threshold = 48, delta = 6 } = {}) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    lastY.current = window.scrollY

    const update = () => {
      const y = window.scrollY
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
