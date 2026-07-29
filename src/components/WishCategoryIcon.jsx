import like from '../assets/icons/wish-like.png'
import curious from '../assets/icons/wish-curious.png'
import together from '../assets/icons/wish-together.png'
import frequent from '../assets/icons/wish-frequent.png'

const WISH_ICON_SRC = { like, curious, together, frequent }

// 가고 싶은 곳 목록/등록 화면에서 쓰는 카테고리 아이콘.
export default function WishCategoryIcon({ category, size = 24, style, ...props }) {
  const src = WISH_ICON_SRC[category] ?? WISH_ICON_SRC.like
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', flexShrink: 0, ...style }}
      {...props}
    />
  )
}
