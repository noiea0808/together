export const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

export const SLOT_TIME_PRESETS = {
  '아침':    ['07:00', '07:30', '08:00', '08:30', '09:00'],
  '오전간식': ['09:30', '10:00', '10:30', '11:00'],
  '점심':    ['11:00', '11:30', '12:00', '12:30', '13:00'],
  '오후간식': ['14:00', '14:30', '15:00', '15:30'],
  '저녁':    ['17:00', '17:30', '18:00', '18:30', '19:00'],
  '야식':    ['21:00', '21:30', '22:00', '23:00'],
}

// 밥팟 카드 왼쪽 썸네일 — 열기/수정 시 사용자가 직접 고르는 아이콘. 값은 DB의 meal_pots.icon /
// group_default_pot_configs.icon 문자열과 그대로 매핑되므로, 키를 바꾸면 기존 데이터와 어긋난다.
export const POT_ICON_KEYS = ['together', 'tray', 'chat', 'salad', 'ready', 'party', 'care', 'map', 'delivery', 'random']

// 가고 싶은 곳 카테고리 — 값은 DB의 wish_places.category와 그대로 매핑되므로, 키를 바꾸면 기존 데이터와 어긋난다.
export const WISH_CATEGORY_OPTIONS = [
  { key: 'like', label: '좋아하는 곳' },
  { key: 'curious', label: '궁금한 곳' },
  { key: 'together', label: '같이 가고 싶은 곳' },
  { key: 'frequent', label: '자주 가는 곳' },
]

export const MOMENT_SCOPE_OPTIONS = [
  { value: 'participants', label: '참여자만' },
  { value: 'group', label: '그룹공유' },
  { value: 'public', label: '전체공유' },
]

export const DURATION_OPTIONS = [
  { min: 30, label: '30분' },
  { min: 60, label: '1시간' },
  { min: 90, label: '1.5시간' },
  { min: 120, label: '2시간' },
]

export function isPotTimeExpired(date, end_time) {
  if (!date || !end_time) return false
  const [h, m] = end_time.slice(0, 5).split(':').map(Number)
  const expiry = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
  return new Date() > expiry
}

export function isPotTimeStarted(date, meal_time) {
  if (!date || !meal_time) return false
  const [h, m] = meal_time.slice(0, 5).split(':').map(Number)
  const start = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`)
  return new Date() >= start
}

// 참여 확정된 밥팟의 표시용 라벨 — 시작 전엔 '먹기로 함', 진행 중엔 '먹는 중', 종료 후엔 '먹었음'
export function getJoinedStatusLabel(date, meal_time, end_time) {
  if (isPotTimeExpired(date, end_time)) return '같이 먹었음'
  if (isPotTimeStarted(date, meal_time)) return '같이 먹는 중'
  return '같이 먹기로 함'
}
