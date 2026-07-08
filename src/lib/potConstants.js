export const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']
export const SLOT_EMOJI = { '아침': '🌅', '오전간식': '☕', '점심': '☀️', '오후간식': '🍵', '저녁': '🌙', '야식': '🌃' }

export const SLOT_TIME_PRESETS = {
  '아침':    ['07:00', '07:30', '08:00', '08:30', '09:00'],
  '오전간식': ['09:30', '10:00', '10:30', '11:00'],
  '점심':    ['11:00', '11:30', '12:00', '12:30', '13:00'],
  '오후간식': ['14:00', '14:30', '15:00', '15:30'],
  '저녁':    ['17:00', '17:30', '18:00', '18:30', '19:00'],
  '야식':    ['21:00', '21:30', '22:00', '23:00'],
}

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
