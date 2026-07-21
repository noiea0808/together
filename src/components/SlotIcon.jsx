import breakfast from '../assets/icons/slot-breakfast.png'
import morningSnack from '../assets/icons/slot-morning-snack.png'
import lunch from '../assets/icons/slot-lunch.png'
import afternoonSnack from '../assets/icons/slot-afternoon-snack.png'
import dinner from '../assets/icons/slot-dinner.png'
import lateSnack from '../assets/icons/slot-late-snack.png'

const SLOT_ICON_SRC = {
  '아침': breakfast,
  '오전간식': morningSnack,
  '점심': lunch,
  '오후간식': afternoonSnack,
  '저녁': dinner,
  '야식': lateSnack,
}

// 끼니 슬롯별 미니 배지 아이콘
export default function SlotIcon({ slot, size = 24, muted = false, style, ...props }) {
  const src = SLOT_ICON_SRC[slot]
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', opacity: muted ? 0.55 : 1, filter: `${muted ? 'grayscale(0.4) ' : ''}drop-shadow(0 2px 3px rgba(43,34,24,0.18))`, ...style }}
      {...props}
    />
  )
}
