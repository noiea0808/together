import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMySchedule } from '../lib/db'
import { getCache, setCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import RiceBowlIcon from '../components/RiceBowlIcon'
import SlotStatusBadge from '../components/SlotStatusBadge'
import { usePageHeader } from '../lib/HeaderConfigContext'

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
  usePageHeader({ title: '일정' })

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

  // 스와이프로 넘기자마자 화면이 바로 뜨도록, 전후 2주 구간을 미리 캐시에 채워둔다.
  useEffect(() => {
    if (!user) return
    ;[weekOffset - 1, weekOffset + 1].forEach(offset => {
      const adjDates = getTwoWeekDates(offset)
      const f = toDateStr(adjDates[0])
      const t = toDateStr(adjDates[adjDates.length - 1])
      const key = `schedule:${user.id}:${f}:${t}`
      const cached = getCache(key)
      if (cached && !cached.stale) return
      getMySchedule(user.id, f, t).then(data => setCache(key, data)).catch(() => {})
    })
  }, [user, weekOffset])

  // 2주 구간 전환 시 목록이 밀려나는 방향 — next(다음 구간 방향)/prev(이전 구간 방향)
  const [weekSlideDir, setWeekSlideDir] = useState('next')
  const goToWeek = (updater) => {
    setWeekOffset(o => {
      const next = updater(o)
      setWeekSlideDir(next > o ? 'next' : 'prev')
      return next
    })
  }

  // 목록 영역 좌우 스와이프로 이전/다음 2주 이동 (세로 스크롤과 헷갈리지 않도록 가로 이동이
  // 더 뚜렷할 때만 반응한다)
  const weekSwipeStart = useRef(null)
  const handleWeekSwipeStart = (e) => { weekSwipeStart.current = { x: e.clientX, y: e.clientY } }
  const handleWeekSwipeEnd = (e) => {
    if (!weekSwipeStart.current) return
    const dx = e.clientX - weekSwipeStart.current.x
    const dy = e.clientY - weekSwipeStart.current.y
    weekSwipeStart.current = null
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    goToWeek(o => o + (dx < 0 ? 1 : -1))
  }

  const byDate = {}
  statuses.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = {}
    byDate[s.date][s.slot] = s
  })

  return (
    <div style={S.page}>
      <div style={S.dateNav}>
        <button style={S.navBtn} onClick={() => goToWeek(o => o - 1)} aria-label="이전 2주">‹</button>
        <span style={S.dateNavLabel}>{rangeLabel}</span>
        <button style={S.navBtn} onClick={() => goToWeek(o => o + 1)} aria-label="다음 2주">›</button>
      </div>

      <div
        style={{ ...S.list, touchAction: 'pan-y' }}
        onPointerDown={handleWeekSwipeStart}
        onPointerUp={handleWeekSwipeEnd}
        onPointerCancel={() => { weekSwipeStart.current = null }}
      >
        {/* key가 weekOffset이라 구간이 바뀔 때마다 방향에 맞춰 슬라이드-인 애니메이션이 재생된다 */}
        <div
          key={weekOffset}
          style={{ animation: `${weekSlideDir === 'next' ? 'pageSlideNext' : 'pageSlidePrev'} 0.22s ease-out` }}
        >
        {loading ? (
          <div style={S.empty}><RiceBowlIcon size={72} /></div>
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
                    {hasStatus ? chips.map(({ slot, opt }) => (
                      <SlotStatusBadge key={slot} slot={slot} opt={opt} size={55} />
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
      </div>

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

  dateCol: { minWidth: 38, textAlign: 'center', flexShrink: 0, marginRight: 6 },
  dayNum: { fontSize: 'var(--font-size-lg)', fontWeight: 900, lineHeight: 1.1 },
  dayName: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, marginTop: 1 },

  chipsArea: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', minWidth: 0 },
  noStatus: { fontSize: 'var(--font-size-2xs)', color: '#B8B0A6' },
  todayBadge: { background: 'var(--color-primary)', color: 'white', fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '2px 8px', flexShrink: 0 },
  goIcon: { color: '#ADA59B', fontSize: 'var(--font-size-base)', fontWeight: 700, flexShrink: 0 },
}
