import { useState, useEffect, useMemo } from 'react'
import { getLunchReminderConfig, updateLunchReminderConfig, getHolidays, addHoliday, deleteHoliday } from '../../lib/adminDb'

const TODAY = new Date()
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export default function NotificationSettingsPage() {
  const [config, setConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configError, setConfigError] = useState(null)
  const [configSaving, setConfigSaving] = useState(false)

  // 달력에 표시 중인 연/월 (month는 0~11)
  const [viewYear, setViewYear] = useState(TODAY.getFullYear())
  const [viewMonth, setViewMonth] = useState(TODAY.getMonth())
  const [holidays, setHolidays] = useState([])
  const [holidaysLoading, setHolidaysLoading] = useState(true)
  const [holidaysError, setHolidaysError] = useState(null)
  const [busyDate, setBusyDate] = useState(null)

  const [messageDraft, setMessageDraft] = useState({ title: '', body: '' })
  const [messageDirty, setMessageDirty] = useState(false)
  const [messageSaving, setMessageSaving] = useState(false)

  const loadConfig = () => {
    setConfigLoading(true)
    setConfigError(null)
    getLunchReminderConfig()
      .then(data => { setConfig(data); setMessageDraft({ title: data.title ?? '', body: data.body ?? '' }); setMessageDirty(false) })
      .catch(e => { setConfig(null); setConfigError(e.message || String(e)) })
      .finally(() => setConfigLoading(false))
  }
  useEffect(loadConfig, [])

  const loadHolidays = () => {
    setHolidaysLoading(true)
    setHolidaysError(null)
    getHolidays(viewYear)
      .then(setHolidays)
      .catch(e => { setHolidays([]); setHolidaysError(e.message || String(e)) })
      .finally(() => setHolidaysLoading(false))
  }
  useEffect(loadHolidays, [viewYear])

  const holidayMap = useMemo(() => new Map(holidays.map(h => [h.date, h.name])), [holidays])

  const goMonth = (delta) => {
    let y = viewYear, m = viewMonth + delta
    if (m < 0) { m = 11; y -= 1 }
    else if (m > 11) { m = 0; y += 1 }
    setViewYear(y)
    setViewMonth(m)
  }

  const toggleEnabled = async () => {
    if (!config || configSaving) return
    setConfigSaving(true)
    try {
      const updated = await updateLunchReminderConfig({ enabled: !config.enabled })
      setConfig(updated)
    } catch (e) {
      alert('변경 실패: ' + e.message)
    } finally {
      setConfigSaving(false)
    }
  }

  const saveSendTime = async (value) => {
    if (!config || configSaving) return
    setConfigSaving(true)
    try {
      const updated = await updateLunchReminderConfig({ send_time: value })
      setConfig(updated)
    } catch (e) {
      alert('변경 실패: ' + e.message)
    } finally {
      setConfigSaving(false)
    }
  }

  const saveMessage = async () => {
    if (!config || messageSaving || !messageDraft.title.trim() || !messageDraft.body.trim()) return
    setMessageSaving(true)
    try {
      const updated = await updateLunchReminderConfig({ title: messageDraft.title.trim(), body: messageDraft.body.trim() })
      setConfig(updated)
      setMessageDraft({ title: updated.title, body: updated.body })
      setMessageDirty(false)
    } catch (e) {
      alert('변경 실패: ' + e.message)
    } finally {
      setMessageSaving(false)
    }
  }

  // 클릭 한 번으로 바로 토글 — 쉬는 날이면 해제, 아니면 즉시 등록(이름은 기본값)
  const handleToggleDay = async (dateStr) => {
    if (busyDate) return
    const existingName = holidayMap.get(dateStr)
    setBusyDate(dateStr)
    try {
      if (existingName) {
        await deleteHoliday(dateStr)
      } else {
        await addHoliday(dateStr, '휴일')
      }
      loadHolidays()
    } catch (e) {
      alert('변경 실패: ' + e.message)
    } finally {
      setBusyDate(null)
    }
  }

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    return cells
  }, [viewYear, viewMonth])

  return (
    <div>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>알림 설정</h1>
          <p style={s.subtitle}>점심 상태를 안 정한 사용자에게 보내는 리마인드 알림의 발송 여부와 시각, 쉬는 날(주말 자동 제외 + 공휴일)을 관리합니다.</p>
        </div>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>점심 상태 리마인드</h2>
        {configLoading ? (
          <p style={s.muted}>불러오는 중...</p>
        ) : !config ? (
          <div>
            <p style={s.errorText}>설정을 불러오지 못했습니다.</p>
            {configError && <p style={s.errorDetail}>{configError}</p>}
            <p style={s.muted}>
              scripts/add_lunch_reminder_admin_config.sql 을 Supabase SQL Editor에서 실행했는지 확인해주세요.
              (lunch_reminder_config 테이블이 아직 없으면 이 화면이 이 메시지를 띄웁니다.)
            </p>
            <button style={s.retryBtn} onClick={loadConfig}>다시 시도</button>
          </div>
        ) : (
          <div style={s.configRow}>
            <div style={s.configItem}>
              <label style={s.label}>전체 발송</label>
              <button style={{ ...s.toggle, ...(config.enabled ? s.toggleOn : {}) }} onClick={toggleEnabled} disabled={configSaving}>
                {config.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div style={s.configItem}>
              <label style={s.label}>발송 시각</label>
              <input
                style={s.timeInput}
                type="time"
                value={config.send_time?.slice(0, 5) ?? '09:30'}
                onChange={e => saveSendTime(e.target.value)}
                disabled={configSaving}
              />
            </div>
            {config.last_sent_date && (
              <span style={s.lastSent}>마지막 발송: {config.last_sent_date}</span>
            )}
          </div>
        )}

        {config && (
          <div style={s.messageBox}>
            <div style={s.formRow}>
              <label style={s.label}>알림 제목</label>
              <input
                style={s.input}
                value={messageDraft.title}
                onChange={e => { setMessageDraft(d => ({ ...d, title: e.target.value })); setMessageDirty(true) }}
                maxLength={60}
              />
            </div>
            <div style={s.formRow}>
              <label style={s.label}>알림 본문</label>
              <textarea
                style={{ ...s.input, height: 64, resize: 'vertical', fontFamily: 'inherit' }}
                value={messageDraft.body}
                onChange={e => { setMessageDraft(d => ({ ...d, body: e.target.value })); setMessageDirty(true) }}
                maxLength={200}
              />
            </div>
            <button
              style={s.saveBtn}
              onClick={saveMessage}
              disabled={!messageDirty || messageSaving || !messageDraft.title.trim() || !messageDraft.body.trim()}
            >
              {messageSaving ? '저장 중...' : '문구 저장'}
            </button>
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={s.cardHeaderRow}>
          <h2 style={s.cardTitle}>쉬는 날 관리</h2>
          <div style={s.monthNav}>
            <button style={s.navBtn} onClick={() => goMonth(-1)}>‹</button>
            <span style={s.monthLabel}>{viewYear}년 {viewMonth + 1}월</span>
            <button style={s.navBtn} onClick={() => goMonth(1)}>›</button>
          </div>
        </div>
        <p style={s.calendarHint}>날짜를 클릭해 쉬는 날로 등록/해제하세요. 주말(토·일)은 리마인드에서 자동으로 제외되니 등록하지 않아도 됩니다.</p>

        {holidaysError && <p style={s.errorDetail}>{holidaysError}</p>}

        <div style={s.weekRow}>
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={w} style={{ ...s.weekLabel, color: i === 0 ? '#E04545' : i === 6 ? '#3B6FE0' : '#8A8AA0' }}>{w}</div>
          ))}
        </div>
        <div style={s.grid}>
          {calendarCells.map((d, i) => {
            if (d === null) return <div key={`blank-${i}`} style={s.cell} />
            const dateStr = toDateStr(viewYear, viewMonth, d)
            const weekday = (i % 7)
            const holidayName = holidayMap.get(dateStr)
            const isWeekend = weekday === 0 || weekday === 6
            const isToday = dateStr === toDateStr(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate())
            return (
              <button
                key={dateStr}
                style={{
                  ...s.cell,
                  ...s.dayCell,
                  ...(holidayName ? s.dayCellHoliday : {}),
                  ...(isToday ? s.dayCellToday : {}),
                  opacity: busyDate === dateStr ? 0.5 : 1,
                }}
                onClick={() => handleToggleDay(dateStr)}
                disabled={holidaysLoading || busyDate === dateStr}
              >
                <span style={{ color: holidayName ? '#fff' : isWeekend ? (weekday === 0 ? '#E04545' : '#3B6FE0') : '#1A1A1A' }}>{d}</span>
                {holidayName && <span style={s.dayCellLabel}>{holidayName}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: 800, margin: 0 },
  subtitle: { fontSize: 13, color: '#6A6A80', marginTop: 6, maxWidth: 540, lineHeight: 1.5 },
  muted: { color: '#8A8AA0', fontSize: 14 },
  errorText: { color: '#E04545', fontSize: 14, fontWeight: 700, margin: '0 0 6px' },
  errorDetail: { color: '#E04545', fontSize: 12, fontFamily: 'monospace', background: '#FFF0F0', padding: '8px 10px', borderRadius: 6, marginBottom: 10, wordBreak: 'break-all' },
  retryBtn: { marginTop: 8, background: '#F0F0F4', color: '#4A4A60', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  card: { background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: 20, marginBottom: 20 },
  cardHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: 700, margin: '0 0 14px' },

  configRow: { display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' },
  configItem: { display: 'flex', alignItems: 'center', gap: 10 },
  label: { fontSize: 12, fontWeight: 700, color: '#4A4A60' },
  toggle: { border: '1.5px solid #D0D0DC', background: '#fff', color: '#9090A8', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  toggleOn: { borderColor: '#34A853', background: '#34A853', color: '#fff' },
  timeInput: { padding: '7px 10px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 13, outline: 'none' },
  lastSent: { fontSize: 12, color: '#8A8AA0' },

  messageBox: { marginTop: 16, paddingTop: 16, borderTop: '1px solid #F0F0F4', display: 'flex', flexDirection: 'column', gap: 12 },
  formRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  input: { padding: '9px 12px', border: '1.5px solid #DDD', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%', fontFamily: 'inherit' },
  saveBtn: { alignSelf: 'flex-start', background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },

  monthNav: { display: 'flex', alignItems: 'center', gap: 10 },
  navBtn: { width: 28, height: 28, borderRadius: '50%', border: '1px solid #DDD', background: '#fff', color: '#4A4A60', cursor: 'pointer', fontSize: 14, lineHeight: 1 },
  monthLabel: { fontSize: 14, fontWeight: 700, minWidth: 90, textAlign: 'center' },
  calendarHint: { fontSize: 12, color: '#8A8AA0', marginBottom: 14 },

  weekRow: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 },
  weekLabel: { textAlign: 'center', fontSize: 11, fontWeight: 700, padding: '4px 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 },
  cell: { minHeight: 56 },
  dayCell: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 2,
    padding: '6px 2px', border: '1px solid #EEE', borderRadius: 8, background: '#FAFAFC',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  dayCellHoliday: { background: '#E04545', border: '1px solid #E04545' },
  dayCellToday: { boxShadow: '0 0 0 1.5px #FF6B35 inset' },
  dayCellLabel: { fontSize: 10, color: '#fff', fontWeight: 700, lineHeight: 1.2, textAlign: 'center', wordBreak: 'break-all' },
}
