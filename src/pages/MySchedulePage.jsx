import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMySchedule } from '../lib/db'
import { getCache, setCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'
import RiceBowlIcon from '../components/RiceBowlIcon'
import AppHeader from '../components/AppHeader'

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function formatDate(date) {
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function toDateStr(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTwoWeekDates(offset = 0) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay() + offset * 14)
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + i)
    return d
  })
}

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)

export default function MySchedulePage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)

  const dates = getTwoWeekDates(weekOffset)
  const fromDate = toDateStr(dates[0])
  const toDate = toDateStr(dates[dates.length - 1])
  const rangeLabel = `${formatDate(dates[0])} ~ ${formatDate(dates[13])}`

  useEffect(() => {
    if (!user) return
    const key = `schedule:${user.id}:${fromDate}:${toDate}`
    const cached = getCache(key)
    if (cached) {
      setStatuses(cached.data)
      setLoading(false)
      if (!cached.stale) return
    }
    getMySchedule(user.id, fromDate, toDate)
      .then(data => {
        setStatuses(data)
        setCache(key, data)
      })
      .finally(() => setLoading(false))
  }, [user, fromDate, toDate])

  const byDate = {}
  statuses.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = {}
    byDate[s.date][s.slot] = s
  })

  return (
    <div style={S.page}>
      <AppHeader title="일정" />

      <div style={S.dateNav}>
        <button style={S.navBtn} onClick={() => setWeekOffset(o => o - 1)} aria-label="이전 2주">‹</button>
        <span style={S.dateNavLabel}>{rangeLabel}</span>
        <button style={S.navBtn} onClick={() => setWeekOffset(o => o + 1)} aria-label="다음 2주">›</button>
      </div>

      <div style={S.list}>
        {loading ? (
          <div style={S.empty}><RiceBowlIcon size={40} /></div>
        ) : dates.map((date, idx) => {
          const dateStr = toDateStr(date)
          const dayStatuses = byDate[dateStr] ?? {}
          const hasStatus = Object.keys(dayStatuses).length > 0
          const isToday = date.getTime() === TODAY.getTime()
          const isPast = date < TODAY
          const dow = date.getDay()
          const isWeekend = dow === 0 || dow === 6
          const showMonth = idx === 0 || date.getDate() === 1

          const dayColor = isToday ? 'var(--color-primary)' : isWeekend ? '#E53935' : isPast ? 'var(--color-text-muted)' : '#1A1A1A'
          const cardBg = isToday ? '#FFF4EF' : '#FFFFFF'
          const cardBorder = isToday ? '#FFD6C0' : '#EDE8E3'

          const chips = SLOT_ORDER
            .filter(slot => dayStatuses[slot])
            .map(slot => ({
              slot,
              opt: SLOT_STATUS_OPTIONS.find(o => o.key === dayStatuses[slot].status),
            }))

          return (
            <div key={dateStr} style={{ padding: '0 16px' }}>
              {showMonth && (
                <div style={S.monthLabel}>{date.getMonth() + 1}월</div>
              )}
              <div
                style={{ ...S.card, background: cardBg, border: `1.5px solid ${cardBorder}` }}
                onClick={() => navigate(`/today?date=${dateStr}`)}
              >
                <div style={S.row}>
                  <div style={S.dateCol}>
                    <div style={{ ...S.dayNum, color: dayColor }}>{date.getDate()}</div>
                    <div style={{ ...S.dayName, color: dayColor }}>
                      {date.toLocaleDateString('ko-KR', { weekday: 'short' })}
                    </div>
                  </div>
                  <div style={S.chipsArea}>
                    {hasStatus ? chips.map(({ slot, opt }) => opt && (
                      <span key={slot} style={{ ...S.chip, color: opt.color, background: opt.bg, border: `1px solid ${opt.border}` }}>
                        {slot} · {opt.label}
                      </span>
                    )) : (
                      <span style={S.noStatus}>미설정</span>
                    )}
                  </div>
                  {isToday && <span style={S.todayBadge}>오늘</span>}
                  <span style={S.goIcon}>›</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <BottomNav />
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },

  dateNav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  navBtn: { width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 'var(--font-size-base)' },
  dateNavLabel: { fontWeight: 800, fontSize: 'var(--font-size-base)' },

  list: { flex: 1, overflowY: 'auto', paddingBottom: 80, paddingTop: 4 },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, padding: 40 },

  monthLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', padding: '12px 4px 6px', letterSpacing: '0.3px' },
  card: { borderRadius: 15, padding: '12px 14px', marginBottom: 7, cursor: 'pointer' },
  row: { display: 'flex', alignItems: 'center', gap: 10 },

  dateCol: { minWidth: 38, textAlign: 'center', flexShrink: 0 },
  dayNum: { fontSize: 'var(--font-size-lg)', fontWeight: 900, lineHeight: 1.1 },
  dayName: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, marginTop: 1 },

  chipsArea: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minWidth: 0 },
  chip: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', whiteSpace: 'nowrap' },
  noStatus: { fontSize: 'var(--font-size-2xs)', color: '#B8B0A6' },
  todayBadge: { background: 'var(--color-primary)', color: 'white', fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', flexShrink: 0 },
  goIcon: { color: '#ADA59B', fontSize: 'var(--font-size-base)', fontWeight: 700, flexShrink: 0 },
}
