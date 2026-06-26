export const ME = {
  id: 'user-1',
  nickname: '나',
}

export const GROUPS = [
  { id: 'group-1', name: '개발팀', emoji: '💻' },
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

export const STATUSES = {
  'group-1': [
    { user_id: 'user-2', status: '점심' },
    { user_id: 'user-3', status: '점심' },
    { user_id: 'user-4', status: '패스' },
    { user_id: 'user-5', status: '저녁' },
  ],
  'group-2': [
    { user_id: 'user-6', status: '점심' },
    { user_id: 'user-7', status: '커피' },
    { user_id: 'user-8', status: null },
  ],
}

export const POTS = {
  'group-1': [
    {
      id: 'pot-1',
      group_id: 'group-1',
      title: '김치찌개팟',
      meal_time: '12:10',
      max_people: 4,
      is_public: false,
      created_by: 'user-2',
      members: ['user-2', 'user-3'],
    },
    {
      id: 'pot-2',
      group_id: 'group-1',
      title: '편의점 런치',
      meal_time: '12:30',
      max_people: 3,
      is_public: true,
      created_by: 'user-5',
      members: ['user-5'],
    },
  ],
  'group-2': [
    {
      id: 'pot-3',
      group_id: 'group-2',
      title: '스타벅스 커피',
      meal_time: '14:00',
      max_people: 4,
      is_public: false,
      created_by: 'user-7',
      members: ['user-7', 'user-6'],
    },
  ],
}

// PotDetailPage에서 id로 찾을 수 있도록 flat 버전도 export
export const ALL_POTS = Object.values(POTS).flat()
export const ALL_MEMBERS = Object.values(MEMBERS).flat()
