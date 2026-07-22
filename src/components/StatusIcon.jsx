import unset from '../assets/icons/status-unset.png'
import open from '../assets/icons/status-open.png'
import skip from '../assets/icons/status-skip.png'
import closed from '../assets/icons/status-closed.png'

const STATUS_ICON_SRC = { open, skip, closed }

// 내 상태 카드 등에서 쓰는 상태 미니 배지 아이콘.
// 참여중/참여완료(밥팟 참여)는 사용자가 직접 고른 상태가 아니라 SlotIcon(끼니 슬롯)으로 그린다.
export default function StatusIcon({ statusKey, size = 24, muted = false, style, ...props }) {
  const src = STATUS_ICON_SRC[statusKey] ?? unset
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', opacity: muted ? 0.55 : 1, filter: `${muted ? 'grayscale(0.4) ' : ''}drop-shadow(0 2px 3px rgba(43,34,24,0.24))`, ...style }}
      {...props}
    />
  )
}
