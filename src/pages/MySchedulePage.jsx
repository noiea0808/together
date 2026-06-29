import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMySchedule } from '../lib/db'
import { getCache, setCache } from '../lib/cache'
import { SLOT_STATUS_OPTIONS } from '../mock/data'
import BottomNav from '../components/BottomNav'

const SLOT_ORDER = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']
const SLOT_SHORT = ['아침', '오전', '점심', '오후', '저녁', '야식']

function toDateStr(d) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 이번 주 일요일부터 다음 주 토요일까지 14일
function getTwoWeekDates() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // 이번 주 일요일 (day=0)
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - today.getDay())
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
  const [expandedDates, setExpandedDates] = useState(new Set())

  const dates = getTwoWeekDates()
  const fromDate = toDateStr(dates[0])
  const toDate = toDateStr(dates[dates.length - 1])

  useEffect(() => {
    if (!user) return
    const key = `schedule:${user.id}:${fromDate}:${toDate}`

    // 캐시 우선 — 탭 재방문 시 즉시 표시(스피너 생략) 후 백그라운드 재검증
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
        // 날짜 상세는 기본 닫힘
      })
      .finally(() => setLoading(false))
  }, [user, fromDate, toDate])

  // date별 grouping
  const byDate = {}
  statuses.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = {}
    byDate[s.date][s.slot] = s
  })

  const toggleDate = (dateStr) => {
    setExpandedDates(prev => {
      const next = new Set(prev)
      next.has(dateStr) ? next.delete(dateStr) : next.add(dateStr)
      return next
    })
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>나의 일정</span>
      </div>

      <div style={styles.list}>
        {loading ? (
          <div style={styles.empty}>🍚</div>
        ) : dates.map((date, idx) => {
          const dateStr = toDateStr(date)
          const dayStatuses = byDate[dateStr] ?? {}
          const hasStatus = Object.keys(dayStatuses).length > 0
          const isToday = date.getTime() === TODAY.getTime()
          const isPast = date < TODAY
          const isExpanded = expandedDates.has(dateStr)
          const dow = date.getDay() // 0=일, 6=토
          const isWeekend = dow === 0 || dow === 6
          // 첫 번째 날짜이거나 해당 월의 1일인 경우에만 월 표시
          const showMonth = idx === 0 || date.getDate() === 1

          return (
            <div key={dateStr} style={{ ...styles.dayBlock, opacity: isPast && !hasStatus ? 0.4 : 1 }}>
              {/* 날짜 행 */}
              <div style={{ ...styles.dayRow, background: isToday ? 'rgba(255,107,53,0.1)' : 'transparent' }} onClick={() => toggleDate(dateStr)}>
                {/* 날짜 */}
                <div style={styles.dateCol}>
                  <div style={{ ...styles.dateMonth, visibility: showMonth ? 'visible' : 'hidden' }}>
                    {date.getMonth() + 1}월
                  </div>
                  <div style={{
                    ...styles.dateNum,
                    color: isToday
                      ? 'var(--color-primary)'
                      : isWeekend
                      ? '#E53935'
                      : isPast ? 'var(--color-text-muted)' : 'var(--color-text)'
                  }}>
                    {date.getDate()}
                  </div>
                  <div style={{
                    ...styles.dateDay,
                    color: isWeekend ? '#E53935' : 'var(--color-text-muted)'
                  }}>
                    {date.toLocaleDateString('ko-KR', { weekday: 'short' })}
                  </div>
                  {isToday && <div style={styles.todayDot} />}
                </div>

                {/* 미니 슬롯 6개 */}
                <div style={styles.miniSlots}>
                  {SLOT_ORDER.map((slot, i) => {
                    const s = dayStatuses[slot]
                    const opt = s ? SLOT_STATUS_OPTIONS.find(o => o.key === s.status) : null
                    return (
                      <div
                        key={slot}
                        style={{
                          ...styles.miniSlot,
                          background: opt ? opt.color + '20' : 'var(--color-surface-2)',
                          border: `1px solid ${opt ? opt.color + '55' : 'var(--color-border)'}`,
                        }}
                        title={slot}
                      >
                        <div style={styles.miniSlotLabel}>{SLOT_SHORT[i]}</div>
                        <div style={styles.miniSlotEmoji}>{opt ? opt.emoji : '·'}</div>
                      </div>
                    )
                  })}
                </div>

              </div>

              {/* 상세 펼침 */}
              {isExpanded && (
                <div style={styles.detail}>
                  {hasStatus ? (
                    <>
                      {SLOT_ORDER.filter(slot => dayStatuses[slot]).map(slot => {
                        const s = dayStatuses[slot]
                        const opt = SLOT_STATUS_OPTIONS.find(o => o.key === s.status)
                        return (
                          <div key={slot} style={styles.detailRow}>
                            <span style={styles.detailSlot}>{slot}</span>
                            <span style={styles.detailTime}>{s.meal_time?.slice(0, 5) || '—'}</span>
                            <span style={styles.detailMenu}>{s.menu || '—'}</span>
                            {opt && (
                              <span style={{ ...styles.detailStatus, color: opt.color, background: opt.color + '15' }}>
                                {opt.emoji} {opt.label}
                              </span>
                            )}
                          </div>
                        )
                      })}
                      <div style={styles.detailGoRow}>
                        <button style={styles.detailGoBtn} onClick={() => navigate(`/today?date=${dateStr}`)}>
                          해당 일자로 이동하기 →
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={styles.detailEmpty}>
                      <span>설정된 상태가 없어요</span>
                      <button style={styles.detailSetBtn} onClick={() => navigate(`/today?date=${dateStr}`)}>
                        해당 일자로 이동하기 →
                      </button>
                    </div>
                  )}
                </div>
              )}
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
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0,
  },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-xl)' },
  list: { flex: 1, overflowY: 'auto', paddingBottom: 80 },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, padding: 40 },

  dayBlock: { borderBottom: '1px solid var(--color-border)' },

  dayRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px var(--spacing-md)',
    cursor: 'pointer',
  },
  dateCol: {
    width: 32, flexShrink: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  dateMonth: { fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', lineHeight: 1 },
  dateNum: { fontSize: 17, fontWeight: 800, lineHeight: 1 },
  dateDay: { fontSize: 10, color: 'var(--color-text-muted)' },
  todayDot: { width: 4, height: 4, borderRadius: '50%', background: 'var(--color-primary)', marginTop: 2 },

  miniSlots: { flex: 1, display: 'flex', gap: 4 },
  miniSlot: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '3px 2px', borderRadius: 6, minWidth: 0,
  },
  miniSlotLabel: { fontSize: 9, color: 'var(--color-text-muted)', fontWeight: 600, lineHeight: 1 },
  miniSlotEmoji: { fontSize: 14, lineHeight: 1.3 },


  detail: {
    marginLeft: 58, marginRight: 'var(--spacing-md)', marginBottom: 8,
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
  },
  detailRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px var(--spacing-md)',
    borderBottom: '1px solid var(--color-border)',
  },
  detailSlot: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', width: 48, flexShrink: 0 },
  detailTime: { fontSize: 12, fontWeight: 600, width: 40, flexShrink: 0 },
  detailMenu: { flex: 1, fontSize: 12, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detailStatus: {
    fontSize: 11, fontWeight: 700, borderRadius: 'var(--radius-full)',
    padding: '2px 8px', flexShrink: 0,
  },
  detailEmpty: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px var(--spacing-md)',
    fontSize: 12, color: 'var(--color-text-muted)',
  },
  detailSetBtn: {
    fontSize: 12, fontWeight: 700, color: 'var(--color-primary)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  },
  detailGoRow: {
    display: 'flex', justifyContent: 'flex-end',
    padding: '8px var(--spacing-md)',
  },
  detailGoBtn: {
    fontSize: 12, fontWeight: 700, color: 'var(--color-primary)',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  },
}
