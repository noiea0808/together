import NotificationBell from './NotificationBell'

// 5개 메인 메뉴(홈/일정/모먼트/친구/내 계정) 헤더가 공통으로 쓰는 3열 레이아웃.
// 좌(제목 또는 브랜드) · 중(화면별 탐색·필터) · 우(화면별 액션 + 알림) — 각 화면은
// title/brand, centerContent, action만 갈아끼우고 높이·패딩·정렬은 절대 건드리지 않는다.
export default function AppHeader({ title, brand, centerContent, action, showNotification = true, hidden = false }) {
  return (
    <header
      className="app-header"
      style={{
        height: hidden ? 0 : 'var(--header-height)',
        opacity: hidden ? 0 : 1,
        borderBottomColor: hidden ? 'transparent' : 'var(--color-border)',
      }}
    >
      <div className="app-header__left">
        {brand ? (
          <div className="app-header__brand">
            {brand.icon}
            <span className="app-header__brand-label">{brand.label}</span>
          </div>
        ) : (
          <h1 className="app-header__title">{title}</h1>
        )}
      </div>

      <div className="app-header__center">{centerContent}</div>

      <div className="app-header__right">
        {action && <HeaderAction label={action.label} onClick={action.onClick} ariaLabel={action.ariaLabel} />}
        {showNotification && <NotificationBell />}
      </div>
    </header>
  )
}

// 화면별 보조 액션 버튼 — '친구 찾기', '사용법' 등 텍스트만 다르고 생김새는 항상 같다.
export function HeaderAction({ label, onClick, ariaLabel }) {
  return (
    <button type="button" className="app-header-action" onClick={onClick} aria-label={ariaLabel ?? label}>
      {label}
    </button>
  )
}

// 날짜 범위 이동 컨트롤(일정 화면의 중앙 영역).
export function DateNavigator({ label, onPrev, onNext, prevLabel = '이전', nextLabel = '다음' }) {
  return (
    <div className="app-header-datenav">
      <button type="button" className="app-header-datenav__btn" onClick={onPrev} aria-label={prevLabel}>‹</button>
      <span className="app-header-datenav__label">{label}</span>
      <button type="button" className="app-header-datenav__btn" onClick={onNext} aria-label={nextLabel}>›</button>
    </div>
  )
}

// 선택형 필터 컨트롤(모먼트 화면의 '내 그룹 / 전체'). dot이 true인 옵션엔 안 읽은
// 소식이 있다는 작은 배지를 붙인다.
export function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="app-header-segmented" role="group" aria-label={ariaLabel}>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`app-header-segmented__option${value === opt.value ? ' is-active' : ''}`}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.dot && <span className="app-header-segmented__dot" />}
        </button>
      ))}
    </div>
  )
}
