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
