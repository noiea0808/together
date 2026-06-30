export const ME = { id: 'user-1', nickname: '나' }

export const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

export const SLOT_STATUS_OPTIONS = [
  { key: 'open',   label: '열려있음', emoji: '🟢', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', selectable: true },
  { key: 'skip',   label: '패스',      emoji: '🙅', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0', selectable: true },
  { key: 'closed', label: '약속있음',  emoji: '🔒', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', selectable: true },
  { key: '참여중', label: '참여중',    emoji: '🍚', color: '#FF6B35', bg: '#FFF4EF', border: '#FFD6C0', selectable: false },
]

export const GROUPS = [
  { id: 'group-1', name: '개발팀',      emoji: '💻' },
  { id: 'group-2', name: '대학 친구들', emoji: '🎓' },
]

export const MEMBERS = {
  'group-1': [
    { id: 'user-1', nickname: '나' },
    { id: 'user-2', nickname: '김팀장' },
    { id: 'user-3', nickname: '이사원' },
    { id: 'user-4', nickname: '박대리' },
    { id: 'user-5', nickname: '최주임' },
  ],
  'group-2': [
    { id: 'user-1', nickname: '나' },
    { id: 'user-6', nickname: '민준' },
    { id: 'user-7', nickname: '서연' },
    { id: 'user-8', nickname: '지호' },
  ],
}

// STATUSES[groupId] = [{ user_id, slot, status, time?, menu? }]
export const STATUSES = {
  'group-1': [
    { user_id: 'user-2', slot: '점심',  status: '모집중', time: '12:10', menu: '김치찌개' },
    { user_id: 'user-3', slot: '점심',  status: 'closed', time: '12:00', menu: '도시락' },
    { user_id: 'user-4', slot: '점심',  status: 'skip' },
    { user_id: 'user-4', slot: '저녁',  status: '모집중', time: '18:30' },
    { user_id: 'user-5', slot: '저녁',  status: '모집중', time: '18:30', menu: '삼겹살' },
    { user_id: 'user-2', slot: '아침',  status: 'skip' },
  ],
  'group-2': [
    { user_id: 'user-6', slot: '점심',    status: '모집중', time: '12:30' },
    { user_id: 'user-7', slot: '오후간식', status: '모집중', time: '14:00', menu: '스타벅스' },
    { user_id: 'user-8', slot: '저녁',    status: 'closed', menu: '가족 약속' },
    { user_id: 'user-6', slot: '저녁',    status: '모집중', time: '19:00', menu: '치킨' },
  ],
}

// POTS[groupId] = [pot]
// is_default: true → 기본 밥팟 (개설자 없음, 참여자만)
export const POTS = {
  'group-1': [
    {
      id: 'pot-1', group_id: 'group-1', slot: '점심',
      title: '김치찌개팟', meal_time: '12:10',
      max_people: 4, is_public: false, is_default: false,
      created_by: 'user-2', members: ['user-2', 'user-3'],
    },
    {
      id: 'pot-2', group_id: 'group-1', slot: '점심',
      title: '편의점 런치', meal_time: '12:30',
      max_people: 3, is_public: true, is_default: false,
      created_by: 'user-5', members: ['user-5'],
    },
    {
      id: 'pot-6', group_id: 'group-1', slot: '점심',
      title: '점심 기본팟', meal_time: '12:00',
      max_people: 6, is_public: false, is_default: true,
      created_by: null, members: ['user-4'],
    },
    {
      id: 'pot-4', group_id: 'group-1', slot: '저녁',
      title: '삼겹살팟', meal_time: '18:30',
      max_people: 4, is_public: false, is_default: false,
      created_by: 'user-4', members: ['user-4', 'user-5'],
    },
  ],
  'group-2': [
    {
      id: 'pot-3', group_id: 'group-2', slot: '오후간식',
      title: '스타벅스 커피', meal_time: '14:00',
      max_people: 4, is_public: false, is_default: false,
      created_by: 'user-7', members: ['user-7', 'user-6'],
    },
    {
      id: 'pot-7', group_id: 'group-2', slot: '저녁',
      title: '저녁 기본팟', meal_time: '18:00',
      max_people: 8, is_public: false, is_default: true,
      created_by: null, members: [],
    },
    {
      id: 'pot-5', group_id: 'group-2', slot: '저녁',
      title: '치킨맥주팟', meal_time: '19:00',
      max_people: 6, is_public: false, is_default: false,
      created_by: 'user-6', members: ['user-6'],
    },
  ],
}

export const ALL_POTS = Object.values(POTS).flat()
export const ALL_MEMBERS = Object.values(MEMBERS).flat()
