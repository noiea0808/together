import { useEffect } from 'react'

// 모달/팝업이 열려 있는 동안 배경(문서) 스크롤을 잠근다.
// 여러 팝업이 동시에/중첩으로 열려도 카운트로 안전하게 처리.
let lockCount = 0
let savedScrollY = 0

function lock() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    const b = document.body
    b.style.position = 'fixed'
    b.style.top = `-${savedScrollY}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.width = '100%'
    b.style.overflow = 'hidden'
  }
  lockCount++
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    const b = document.body
    b.style.position = ''
    b.style.top = ''
    b.style.left = ''
    b.style.right = ''
    b.style.width = ''
    b.style.overflow = ''
    window.scrollTo(0, savedScrollY)
  }
}

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
