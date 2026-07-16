import { useLayoutEffect, useRef } from 'react'

// 내용이 늘어나면 높이가 자동으로 커지는 textarea.
// 메모 입력에서 줄바꿈을 하며 여러 줄을 쓸 수 있도록 한다.
export default function AutoTextarea({ value, style, minRows = 1, maxRows = 8, ...props }) {
  const ref = useRef(null)

  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const maxHeight = lineHeight * maxRows
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  useLayoutEffect(resize, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      style={{ resize: 'none', overflowY: 'hidden', lineHeight: 1.5, ...style }}
      {...props}
    />
  )
}
