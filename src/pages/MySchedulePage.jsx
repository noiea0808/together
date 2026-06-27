import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getMySchedule } from '../lib/db'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function toDateStr(d) {
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '')
}

function getDates(centerDate, range = 14) {
  return Array.from({ length: range }, (_, i) => {
    const d = new Date(centerDate)
    d.setDate(d.getDate() - 7 + i)
    return d
  })
}

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)

export default function MySchedulePage() {
  const { user } = useUser()
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)

  const dates = getDates(TODAY)
  const fromDate = toDateStr(dates[0])
  const toDate = toDateStr(dates[dates.length - 1])

  useEffect(() => {
    if (!user) return
    getMySchedule(user.id, fromDate, toDate)
      .then(setStatuses)
      .finally(() => setLoading(false))
  }, [user, fromDate, toDate])

  // date별 grouping
  const byDate = {}
  statuses.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>나의 일정</span>
      </div>

      <div style={styles.list}>
        {loading ? (
          <div style={styles.empty}>🍚</div>
        ) : dates.map(date => {
          const dateStr = toDateStr(date)
          const dayStatuses = byDate[dateStr] ?? []
          const isToday = date.getTime() === TODAY.getTime()
          const isPast = date < TODAY

          return (
            <div key={dateStr} style={{ ...styles.dayRow, opacity: isPast ? 0.6 : 1 }}>
              <div style={styles.dateCol}>
                <div style={{ ...styles.dateNum, color: isToday ? 'var(--color-primary)' : 'var(--color-text)' }}>
                  {date.getDate()}
                </div>
                <div style={styles.dateDay}>
                  {date.toLocaleDateString('ko-KR', { weekday: 'short' })}
                </div>
                {isToday && <div style={styles.todayDot} />}
              </div>

              <div style={styles.slotsCol}>
                {dayStatuses.length === 0 ? (
                  <span style={styles.noStatus}>일정 없음</span>
                ) : (
                  SLOT_ORDER.filter(slot => dayStatuses.some(s => s.slot === slot)).map(slot => {
                    const s = dayStatuses.find(d => d.slot === slot)
                    const opt = SLOT_STATUS_OPTIONS.find(o => o.key === s.status)
                    return (
                      <div key={slot} style={styles.slotChip}>
                        <span style={styles.slotName}>{slot}</span>
                        {s.meal_time && <span style={styles.slotTime}>{s.meal_time.slice(0, 5)}</span>}
                        {s.menu && <span style={styles.slotMenu}>{s.menu}</span>}
                        {opt && (
                          <span style={{ ...styles.slotStatus, color: opt.color, background: opt.color + '18' }}>
                            {opt.emoji} {opt.label}
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-xl)' },
  list: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: 70 },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  dayRow: {
    display: 'flex', gap: 'var(--spacing-md)', padding: '12px var(--spacing-md)',
    borderBottom: '1px solid var(--color-border)', alignItems: 'flex-start',
  },
  dateCol: { width: 36, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingTop: 2 },
  dateNum: { fontSize: 18, fontWeight: 800, lineHeight: 1 },
  dateDay: { fontSize: 10, color: 'var(--color-text-muted)' },
  todayDot: { width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)', marginTop: 2 },
  slotsCol: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
  noStatus: { fontSize: 12, color: 'var(--color-text-muted)', paddingTop: 4 },
  slotChip: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '6px 10px', background: 'var(--color-surface-2)',
    borderRadius: 'var(--radius-sm)',
  },
  slotName: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', minWidth: 44 },
  slotTime: { fontSize: 12, fontWeight: 600 },
  slotMenu: { fontSize: 12, color: 'var(--color-text-muted)' },
  slotStatus: { fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '1px 8px', marginLeft: 'auto' },
}
