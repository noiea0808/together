import RiceBowlIcon from '../../components/RiceBowlIcon'
import SlotIcon from '../../components/SlotIcon'
import StatusIcon from '../../components/StatusIcon'
import PotIcon from '../../components/PotIcon'
import { HomeIcon, CalendarIcon, MomentIcon, PeopleIcon, UserIcon as NavUserIcon } from '../../components/BottomNav'
import { UsersIcon, UserPlusIcon, UserIcon as GroupUserIcon, PencilIcon, SendIcon, LogOutIcon, CrownIcon } from '../../components/GroupIcons'
import { SLOT_KEYS, POT_ICON_KEYS } from '../../lib/potConstants'

// 서비스 전체에서 쓰이는 아이콘을 한 곳에 모아 분류해 보여주는 참고용 화면.
// "재사용 컴포넌트"는 실제 소스를 그대로 import해서 렌더링하므로 여기와 실제 화면이 어긋날 일이
// 없다. 반면 "개별 인라인 아이콘"은 각 페이지에 그때그때 박혀 있어 재사용되지 않는 것들이라,
// 여기서는 참고용으로만 같은 모양을 다시 그려서 보여준다(출처 표기).

const NAV_ICONS = [
  { Icon: HomeIcon, label: '오늘', path: '/today' },
  { Icon: CalendarIcon, label: '일정', path: '/schedule' },
  { Icon: MomentIcon, label: '모먼트', path: '/moment' },
  { Icon: PeopleIcon, label: '친구', path: '/group' },
  { Icon: NavUserIcon, label: '내 계정', path: '/account' },
]

const STATUS_ITEMS = [
  { key: 'open', label: 'open · 참여 가능' },
  { key: 'skip', label: 'skip · 쉬어감' },
  { key: 'closed', label: 'closed · 마감' },
  { key: '__fallback__', label: '미정 (폴백)' },
]

const GROUP_ICON_SET = [
  { Icon: UsersIcon, name: 'UsersIcon' },
  { Icon: UserPlusIcon, name: 'UserPlusIcon' },
  { Icon: GroupUserIcon, name: 'UserIcon' },
  { Icon: PencilIcon, name: 'PencilIcon' },
  { Icon: SendIcon, name: 'SendIcon' },
  { Icon: LogOutIcon, name: 'LogOutIcon' },
  { Icon: CrownIcon, name: 'CrownIcon' },
]

const EMOJI_GROUPS = [
  {
    title: '액션 · UI',
    items: [
      { emoji: '📷', label: '사진/카메라' }, { emoji: '📸', label: '사진(대체)' },
      { emoji: '🗑️', label: '삭제' }, { emoji: '✏️', label: '수정' },
      { emoji: '✕', label: '닫기' }, { emoji: '✓', label: '완료/체크' },
      { emoji: '🔒', label: '비공개' }, { emoji: '🔓', label: '공개' },
      { emoji: '👥', label: '그룹/멤버' }, { emoji: '🕒', label: '시간' },
      { emoji: '📅', label: '날짜' }, { emoji: '🔗', label: '링크' },
      { emoji: '💬', label: '코멘트' }, { emoji: '🎉', label: '초대/축하' },
      { emoji: '🙋', label: '참여/손들기' }, { emoji: '👑', label: '방장' },
      { emoji: '👋', label: '빈 상태 인사' }, { emoji: '🚪', label: '나가기' },
      { emoji: '⚠️', label: '경고' }, { emoji: '🔔', label: '알림' },
      { emoji: '✉️', label: '이메일' }, { emoji: '☰', label: '드래그 핸들' },
      { emoji: '⚙️', label: '설정' }, { emoji: '🍚', label: '같이 먹자 브랜드' },
    ],
  },
  {
    title: '관리자 사이드바 내비',
    desc: 'AdminLayout.jsx NAV_SECTIONS',
    items: [
      { emoji: '🟢', label: '가이드(사용자 상태)' }, { emoji: '📜', label: '약관' },
      { emoji: '👤', label: '사용자' }, { emoji: '👥', label: '그룹 (예정)' },
      { emoji: '📊', label: '통계 (예정)' },
    ],
  },
]

function Section({ title, desc, children }) {
  return (
    <div style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      {desc && <p style={s.sectionDesc}>{desc}</p>}
      <div style={s.grid}>{children}</div>
    </div>
  )
}

function Swatch({ label, sub, children }) {
  return (
    <div style={s.swatch}>
      <div style={s.swatchIconRow}>{children}</div>
      <div style={s.swatchLabel}>{label}</div>
      {sub && <div style={s.swatchSub}>{sub}</div>}
    </div>
  )
}

function IconBox({ children, dark = false }) {
  return <div style={{ ...s.iconBox, ...(dark ? s.iconBoxDark : {}) }}>{children}</div>
}

// ── 개별 인라인 아이콘(재사용 컴포넌트 아님) — 실제 소스와 같은 모양을 참고용으로 재현 ──
function ChevronIcon({ dir = 'right' }) {
  const d = dir === 'right' ? 'M1.5 1.5L7.5 7.5L1.5 13.5' : 'M7.5 1.5L1.5 7.5L7.5 13.5'
  return <svg width="9" height="15" viewBox="0 0 9 15" fill="none"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function CameraBadgeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.3" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}
function EditBadgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function BookmarkIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3a1 1 0 0 0-1 1v17l7-4.5 7 4.5V4a1 1 0 0 0-1-1H6Z" /></svg>
}
function GoogleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
function KakaoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24">
      <path fill="#3C1E1E" d="M12 3C6.477 3 2 6.477 2 10.8c0 2.7 1.617 5.08 4.077 6.558L5.1 21l4.523-2.94A11.3 11.3 0 0 0 12 18.6c5.523 0 10-3.477 10-7.8S17.523 3 12 3z" />
    </svg>
  )
}

const ADHOC_ICONS = [
  { Icon: () => <ChevronIcon dir="right" />, label: '화살표(다음)', sub: 'TodayPage.jsx · 날짜/슬롯 네비' },
  { Icon: () => <ChevronIcon dir="left" />, label: '화살표(이전)', sub: 'TodayPage.jsx · 날짜/슬롯 네비' },
  { Icon: CameraBadgeIcon, label: '카메라 배지', sub: 'MyAccountPage.jsx · 아바타 업로드' },
  { Icon: BellIcon, label: '알림 벨', sub: 'Header.jsx · 알림함 진입' },
  { Icon: EditBadgeIcon, label: '수정 배지', sub: 'PotDetailPage.jsx · 정보 수정' },
  { Icon: BookmarkIcon, label: '즐겨찾기(PC)', sub: 'InstallAppPrompt.jsx · PC 안내' },
  { Icon: GoogleIcon, label: 'Google 로그인', sub: 'OnboardingPage.jsx' },
  { Icon: KakaoIcon, label: 'Kakao 로그인', sub: 'OnboardingPage.jsx' },
]

export default function IconsPage() {
  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>아이콘 모음</h1>
          <p style={s.subtitle}>
            서비스 전반에서 쓰이는 아이콘을 종류별로 모았습니다. "재사용 컴포넌트"는 실제 소스를
            그대로 불러와 렌더링하고, "개별 인라인 아이콘"은 각 화면에 직접 박혀 있어 재사용되지
            않는 것들이라 참고용으로만 같은 모양을 다시 그렸습니다(출처 표기 참고).
          </p>
        </div>
      </div>

      <Section title="하단 내비게이션" desc="components/BottomNav.jsx · 선택(주황) / 비선택(회색) 상태">
        {NAV_ICONS.map(({ Icon, label, path }) => (
          <Swatch key={label} label={label} sub={path}>
            <IconBox><span style={{ color: 'var(--color-primary, #FF6B35)' }}><Icon active /></span></IconBox>
            <IconBox><span style={{ color: '#9AA' }}><Icon active={false} /></span></IconBox>
          </Swatch>
        ))}
      </Section>

      <Section title="끼니 슬롯 아이콘" desc="components/SlotIcon.jsx · 이미지 기반, slot prop: 아침/오전간식/점심/오후간식/저녁/야식. 밥팟별 보기 슬롯 칩 등에서 쓰이던 SLOT_EMOJI(potConstants.js) 텍스트 이모지 대신 이 아이콘으로 통일.">
        {SLOT_KEYS.map(slot => (
          <Swatch key={slot} label={slot}>
            <IconBox><SlotIcon slot={slot} size={40} /></IconBox>
            <IconBox><SlotIcon slot={slot} size={40} muted /></IconBox>
          </Swatch>
        ))}
      </Section>

      <Section title="상태 배지 아이콘" desc="components/StatusIcon.jsx · 이미지 기반, statusKey prop">
        {STATUS_ITEMS.map(({ key, label }) => (
          <Swatch key={key} label={label}>
            <IconBox><StatusIcon statusKey={key === '__fallback__' ? undefined : key} size={40} /></IconBox>
          </Swatch>
        ))}
      </Section>

      <Section title="밥팟 아이콘" desc="components/PotIcon.jsx · 이미지 기반, icon prop. 밥팟 열기/수정 시 PotIconPicker로 직접 고르며, 안 고르면 카드에서 RiceBowlIcon(기본팟) / 🎉(일반팟)로 대체 표시.">
        {POT_ICON_KEYS.map(key => (
          <Swatch key={key} label={key}>
            <IconBox><PotIcon icon={key} size={40} /></IconBox>
          </Swatch>
        ))}
      </Section>

      <Section title="브랜드" desc="components/RiceBowlIcon.jsx · 로고/브랜드 마크">
        <Swatch label="RiceBowlIcon">
          <IconBox><RiceBowlIcon size={40} /></IconBox>
        </Swatch>
      </Section>

      <Section title="공용 UI 아이콘 세트" desc="components/GroupIcons.jsx · stroke 기반, currentColor로 색 상속">
        {GROUP_ICON_SET.map(({ Icon, name }) => (
          <Swatch key={name} label={name}>
            <IconBox><Icon size={26} /></IconBox>
          </Swatch>
        ))}
      </Section>

      <Section title="개별 인라인 아이콘" desc="공용 컴포넌트로 분리되지 않고 각 화면에 직접 그려진 1회성 아이콘 — 아래는 참고용 재현본">
        {ADHOC_ICONS.map(({ Icon, label, sub }) => (
          <Swatch key={label} label={label} sub={sub}>
            <IconBox><Icon /></IconBox>
          </Swatch>
        ))}
      </Section>

      {EMOJI_GROUPS.map(group => (
        <Section key={group.title} title={group.title} desc={group.desc}>
          {group.items.map(({ emoji, label }) => (
            <Swatch key={label} label={label}>
              <IconBox><span style={{ fontSize: 26 }}>{emoji}</span></IconBox>
            </Swatch>
          ))}
        </Section>
      ))}
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  subtitle: { fontSize: 13, color: '#6A6A80', marginTop: 6, maxWidth: 640, lineHeight: 1.6 },

  section: { background: '#fff', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: 15, fontWeight: 800, margin: 0 },
  sectionDesc: { fontSize: 12, color: '#8A8AA0', marginTop: 4, marginBottom: 16, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(108px, 1fr))', gap: 12 },

  swatch: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '14px 8px', background: '#FAFAFC', border: '1px solid #F0F0F4', borderRadius: 10,
  },
  swatchIconRow: { display: 'flex', alignItems: 'center', gap: 6 },
  iconBox: {
    width: 44, height: 44, borderRadius: 8, background: '#fff', border: '1px solid #EEE',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#4A4A60',
  },
  iconBoxDark: { background: '#1E1E2E' },
  swatchLabel: { fontSize: 12, fontWeight: 700, color: '#1A1A1A', textAlign: 'center' },
  swatchSub: { fontSize: 10, color: '#9090A8', textAlign: 'center', lineHeight: 1.4 },
}
