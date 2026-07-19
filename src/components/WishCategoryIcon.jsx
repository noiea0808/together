// 작은 크기(리스트/피커)에서도 구분되도록, 3D PNG 대신 배지+굵은 심볼 형태의 벡터 아이콘을 쓴다.
// 배경이 같은 원형(브랜드 컬러)이라 실루엣이 아니라 안쪽 심볼 모양만으로 카테고리를 구분한다.
const GLYPHS = {
  like: (
    <path
      fill="#fff"
      d="M12 18.1l-.87-.79C7.42 13.9 4.8 11.53 4.8 8.66c0-2.31 1.84-4.16 4.16-4.16 1.31 0 2.57.61 3.37 1.57.8-.96 2.06-1.57 3.37-1.57 2.31 0 4.16 1.85 4.16 4.16 0 2.87-2.63 5.24-6.33 8.66l-.53.48z"
    />
  ),
  curious: (
    <text x="12" y="17" textAnchor="middle" fontSize="13.5" fontWeight="800" fill="#fff" fontFamily="inherit">?</text>
  ),
  together: (
    <>
      <circle cx="8.7" cy="10.2" r="2.9" fill="#fff" />
      <circle cx="15.3" cy="10.2" r="2.9" fill="#fff" opacity="0.7" />
      <path d="M3.8 18.5c0-2.6 2.1-4.3 4.9-4.3s4.9 1.7 4.9 4.3" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <path d="M10.4 18.5c0-2.1 1.6-3.6 3.6-4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" fill="none" opacity="0.7" />
    </>
  ),
  frequent: (
    <path
      fill="#fff"
      d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8a8 8 0 007.75-6h-2.08A6 6 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
    />
  ),
}

// 가고 싶은 곳 목록/등록 화면에서 쓰는 카테고리 아이콘.
export default function WishCategoryIcon({ category, size = 24, style, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0, ...style }} {...props}>
      <rect width="24" height="24" rx="7" fill="var(--color-primary)" />
      {GLYPHS[category] ?? GLYPHS.like}
    </svg>
  )
}
