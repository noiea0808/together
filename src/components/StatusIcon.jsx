import unset from '../assets/icons/status-unset.png'
import open from '../assets/icons/status-open.png'
import skip from '../assets/icons/status-skip.png'
import closed from '../assets/icons/status-closed.png'
import inPot from '../assets/icons/slot-lunch.png'

// 참여중/참여완료는 레퍼런스에 없어 밥공기 배지(먹는 중)로 대체 — 완료 상태는 톤을 낮춰 구분
const STATUS_ICON_SRC = {
  open,
  skip,
  closed,
  '참여중': inPot,
  '참여완료': inPot,
}

// 내 상태 카드 등에서 쓰는 상태 미니 배지 아이콘
export default function StatusIcon({ statusKey, size = 24, style, ...props }) {
  const src = STATUS_ICON_SRC[statusKey] ?? unset
  const isDone = statusKey === '참여완료'
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', filter: isDone ? 'grayscale(0.6)' : 'none', ...style }}
      {...props}
    />
  )
}
