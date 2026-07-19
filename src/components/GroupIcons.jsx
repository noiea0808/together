// 앱 전역에서 쓰는 라인 아이콘 세트 (원래 그룹 팝업 전용이었으나 이모지 아이콘을
// 대체하며 공용으로 확장됨). 이모지 대신 stroke 기반 SVG로 통일 — currentColor를
// 따라가므로 버튼 배경이 밝든 어둡든 색이 항상 정확히 맞는다.
function IconBase({ size = 20, strokeWidth = 1.8, children, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </svg>
  )
}

export function UsersIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  )
}

export function UserPlusIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </IconBase>
  )
}

export function UserIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </IconBase>
  )
}

export function PencilIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </IconBase>
  )
}

export function SendIcon(props) {
  return (
    <IconBase {...props}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </IconBase>
  )
}

export function LogOutIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </IconBase>
  )
}

export function CrownIcon(props) {
  return (
    <IconBase {...props} strokeWidth={props.strokeWidth ?? 1.6}>
      <path d="M3 18h18l-1.2-8.4-4.3 3.6-2.5-5.4-2.5 5.4-4.3-3.6L3 18z" strokeLinejoin="round" />
      <line x1="4" y1="21" x2="20" y2="21" />
    </IconBase>
  )
}

export function SettingsIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.1 5.9l-1.5 1.5M7.4 16.6l-1.5 1.5M18.1 18.1l-1.5-1.5M7.4 7.4L5.9 5.9" />
    </IconBase>
  )
}

export function SlidersIcon(props) {
  return (
    <IconBase {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="11" cy="18" r="2" fill="currentColor" />
    </IconBase>
  )
}

export function UndoIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </IconBase>
  )
}

// 접기/펼치기 토글 공용 — 방향은 호출부에서 style.transform으로 회전시켜 표현한다
// (펼침: 0deg 아래를 향함 / 접힘: -90deg 오른쪽을 향함 등).
export function ChevronDownIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 9l6 6 6-6" />
    </IconBase>
  )
}

export function MegaphoneIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 10v4a1 1 0 0 0 1 1h2l7 4V5L6 9H4a1 1 0 0 0-1 1z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
      <path d="M20 7a7 7 0 0 1 0 10" />
    </IconBase>
  )
}

export function MailIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 7l9 6 9-6" />
    </IconBase>
  )
}

// 점 3개 — stroke가 아닌 fill 아이콘이라 IconBase를 쓰지 않는다.
export function MoreHorizontalIcon({ size = 20, style, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style} {...props}>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  )
}
