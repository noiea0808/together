import together from '../assets/icons/pot-together.png'
import tray from '../assets/icons/pot-tray.png'
import chat from '../assets/icons/pot-chat.png'
import salad from '../assets/icons/pot-salad.png'
import ready from '../assets/icons/pot-ready.png'
import party from '../assets/icons/pot-party.png'
import care from '../assets/icons/pot-care.png'
import map from '../assets/icons/pot-map.png'
import delivery from '../assets/icons/pot-delivery.png'
import random from '../assets/icons/pot-random.png'

export const POT_ICON_SRC = { together, tray, chat, salad, ready, party, care, map, delivery, random }

// 밥팟 카드 왼쪽에 쓰는 사용자 선택 아이콘. icon이 없으면(과거 밥팟 등) null을 반환하니,
// 호출부에서 RiceBowlIcon 등으로 대체해야 한다.
export default function PotIcon({ icon, size = 24, style, ...props }) {
  const src = POT_ICON_SRC[icon]
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', filter: 'drop-shadow(0 2px 3px rgba(43,34,24,0.24))', ...style }}
      {...props}
    />
  )
}
