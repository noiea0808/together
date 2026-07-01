import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, createPot, joinPot, setGroupShareSetting } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'

const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

const SLOT_TIME_PRESETS = {
  '아침':    ['07:00', '07:30', '08:00', '08:30', '09:00'],
  '오전간식': ['09:30', '10:00', '10:30', '11:00'],
  '점심':    ['11:30', '12:00', '12:30', '13:00'],
  '오후간식': ['14:00', '14:30', '15:00', '15:30'],
  '저녁':    ['17:30', '18:00', '18:30', '19:00', '19:30'],
  '야식':    ['21:00', '21:30', '22:00', '23:00'],
}

const MAX_PEOPLE_OPTIONS = [2, 3, 4, 5, 6, 8]

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextFullHour() {
  const h = (new Date().getHours() + 1) % 24
  return `${String(h).padStart(2, '0')}:00`
}

function defaultTimeForSlot(slot) {
  if (slot === '아침') return '07:00'
  if (slot === '점심') return '12:00'
  if (slot === '저녁') return '19:00'
  return nextFullHour()
}

function addMins(timeStr, minutes) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function CreatePotPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useUser()

  const initialSlot = searchParams.get('slot') ?? '점심'
  const initialDate = searchParams.get('date') ?? toDateStr(new Date())
  const initialTime = defaultTimeForSlot(initialSlot)

  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({
    group_id: searchParams.get('group_id') ?? '',
    slot: initialSlot,
    meal_time: initialTime,
    end_time: addMins(initialTime, 60),
    duration_minutes: 60,
    title: '',
    menu: '',
    memo: '',
    max_people: 4,
    is_public: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeEnabled, setTimeEnabled] = useState(true)
  const [timePicker, setTimePicker] = useState(null)
  const [pickerSnapshot, setPickerSnapshot] = useState(null)

  useScrollLock(!!timePicker)
  useEscKey(useCallback(() => {
    if (timePicker) cancelTimePicker()
  }, [timePicker]))

  const openTimePicker = (which) => {
    setPickerSnapshot({ meal_time: form.meal_time, end_time: form.end_time, duration_minutes: form.duration_minutes })
    setTimePicker(which)
  }

  const cancelTimePicker = () => {
    if (pickerSnapshot) setForm(f => ({ ...f, ...pickerSnapshot }))
    setTimePicker(null)
    setPickerSnapshot(null)
  }

  const confirmTimePicker = () => {
    setTimePicker(null)
    setPickerSnapshot(null)
  }

  const applyPickerTime = (which, timeStr) => {
    if (which === 'start') setStartTime(timeStr)
    else setForm(f => ({ ...f, end_time: timeStr, duration_minutes: 0 }))
  }

  useEffect(() => {
    getMyGroups(user.id).then(g => {
      setGroups(g)
      if (g.length > 0) setForm(f => ({ ...f, group_id: f.group_id || g[0].id }))
    })
  }, [user.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const setStartTime = (val) => {
    setForm(f => ({
      ...f,
      meal_time: val,
      end_time: f.duration_minutes > 0 ? addMins(val, f.duration_minutes) : f.end_time,
    }))
  }

  const selectSlot = (s) => {
    const t = defaultTimeForSlot(s)
    setForm(f => ({ ...f, slot: s, meal_time: t, end_time: f.duration_minutes > 0 ? addMins(t, f.duration_minutes) : f.end_time }))
  }

  const doCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const pot = await createPot({
        groupId: form.group_id,
        date: initialDate,
        slot: form.slot,
        meal_time: timeEnabled ? form.meal_time : null,
        end_time: timeEnabled ? form.end_time : null,
        title: form.title.trim() || `${form.slot} ${form.meal_time}`,
        menu: form.menu.trim(),
        memo: form.memo.trim(),
        max_people: form.max_people,
        is_public: form.is_public,
        is_default: false,
        createdBy: user.id,
      })
      await joinPot(pot.id, user.id)
      await setGroupShareSetting(user.id, form.group_id, initialDate, form.slot, true).catch(() => {})
      invalidateCache(`board:${user.id}:`, { prefix: true })
      const today = toDateStr(new Date())
      navigate(initialDate === today ? '/today' : `/today?date=${initialDate}`)
    } catch (e) {
      setError('밥팟 생성에 실패했어요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.group_id || loading) return
    await doCreate()
  }

  const presets = SLOT_TIME_PRESETS[form.slot] ?? []
  const isCustomTime = timeEnabled && !presets.includes(form.meal_time)

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)}>‹</button>
        <div style={S.headerTitle}>밥팟 열기</div>
        <div style={{ width: 34 }} />
      </div>

      <div style={S.body}>
        <div style={S.hero}>
          <div style={S.heroTitle}>{'오늘 같이\n밥 먹어요 🍚'}</div>
          <div style={S.heroSub}>몇 가지만 답하면 밥팟이 열려요</div>
        </div>

        <div style={S.sections}>
          {/* 그룹 선택 */}
          {groups.length > 1 && (
            <div style={S.section}>
              <div style={S.sectionLabel}>어떤 그룹에 열까요?</div>
              <div style={S.groupRow}>
                {groups.map(g => {
                  const active = form.group_id === g.id
                  return (
                    <button key={g.id} style={{ ...S.groupBtn, ...(active ? S.groupBtnActive : {}) }} onClick={() => set('group_id', g.id)}>
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 식사 슬롯 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>어떤 식사예요?</div>
            <div style={S.chipRow}>
              {SLOT_KEYS.map(s => {
                const active = form.slot === s
                return (
                  <button key={s} style={{ ...S.chip, ...(active ? S.chipActive : {}) }} onClick={() => selectSlot(s)}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 시간 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>언제 먹을까요?</div>
            <div style={S.chipRow}>
              {presets.map(t => {
                const active = timeEnabled && form.meal_time === t
                return (
                  <button
                    key={t}
                    style={{ ...S.chip, ...(active ? S.chipActive : {}) }}
                    onClick={() => { setTimeEnabled(true); setStartTime(t) }}
                  >
                    {t}
                  </button>
                )
              })}
              <button
                style={{ ...S.chip, ...(isCustomTime ? S.chipActive : {}) }}
                onClick={() => { setTimeEnabled(true); openTimePicker('start') }}
              >
                직접입력
              </button>
              <button
                style={{ ...S.chip, ...(!timeEnabled ? S.chipActive : {}) }}
                onClick={() => setTimeEnabled(false)}
              >
                미정
              </button>
            </div>
            {isCustomTime && (
              <div style={{ fontSize: 11, color: '#FF6B35', marginTop: 6, fontWeight: 700 }}>
                {form.meal_time} 선택됨
              </div>
            )}
          </div>

          {/* 최대 인원 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>몇 명까지?</div>
            <div style={S.groupRow}>
              {MAX_PEOPLE_OPTIONS.map(n => {
                const active = form.max_people === n
                return (
                  <button key={n} style={{ ...S.groupBtn, ...(active ? S.groupBtnActive : {}) }} onClick={() => set('max_people', n)}>
                    {n}명
                  </button>
                )
              })}
            </div>
          </div>

          {/* 밥팟 이름 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>
              밥팟 이름 <span style={S.optLabel}>(선택)</span>
            </div>
            <input
              style={S.sectionInput}
              placeholder={`${form.slot} 밥팟`}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              maxLength={20}
            />
          </div>

          {/* 메뉴 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>
              뭐 먹을까요? <span style={S.optLabel}>(선택)</span>
            </div>
            <input
              style={S.sectionInput}
              placeholder="메뉴를 자유롭게 입력해요"
              value={form.menu}
              onChange={e => set('menu', e.target.value)}
              maxLength={20}
            />
          </div>

          {/* 메모 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>
              한마디 <span style={S.optLabel}>(선택)</span>
            </div>
            <input
              style={S.sectionInput}
              placeholder="예) 빠르게 먹고 와요!"
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
              maxLength={50}
            />
          </div>

          {/* 공개 범위 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>공개 범위</div>
            <div style={S.groupRow}>
              <button style={{ ...S.groupBtn, ...(!form.is_public ? S.groupBtnActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
              <button style={{ ...S.groupBtn, ...(form.is_public ? S.groupBtnActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
            </div>
            {form.is_public && <p style={{ fontSize: 'var(--font-size-xs)', color: '#A89E94', margin: '6px 0 0' }}>링크로 누구든 참여할 수 있어요.</p>}
          </div>

          {error && <p style={{ color: '#f44336', fontSize: 'var(--font-size-sm)', margin: 0 }}>{error}</p>}

          <button
            style={{ ...S.submitBtn, opacity: loading ? 0.4 : 1, marginTop: 6 }}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? '생성 중...' : '밥팟 열기 🍚'}
          </button>
        </div>
      </div>

      {/* 시간 캐러셀 팝업 */}
      {timePicker && (() => {
        const ct = getCarouselTime(timePicker === 'start' ? form.meal_time : form.end_time)
        const update = (patch) => applyPickerTime(timePicker, carouselTimeToStr({ ...ct, ...patch }))
        return (
          <div style={S.overlay} onClick={cancelTimePicker}>
            <div style={S.timeDialog} onClick={e => e.stopPropagation()}>
              <div style={S.timeDialogTitle}>{timePicker === 'start' ? '시작 시간' : '종료 시간'}</div>
              <div style={S.timeCarouselRow}>
                <CarouselPicker items={CAROUSEL_AMPM} value={ct.ampm} onChange={ampm => update({ ampm })} width={56} />
                <div style={{ width: 4 }} />
                <CarouselPicker items={CAROUSEL_HOURS} value={ct.hour} onChange={hour => update({ hour })} width={56} />
                <span style={S.timeColon}>:</span>
                <CarouselPicker items={CAROUSEL_MINUTES} value={ct.minute} onChange={minute => update({ minute })} width={56} />
              </div>
              <button style={S.timeDoneBtn} onClick={confirmTimePicker}>확인</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: {
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
    position: 'sticky', top: 0, background: 'rgba(250,248,245,0.95)', zIndex: 10,
    borderBottom: '1px solid #EDE8E3', backdropFilter: 'blur(8px)',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#EDE8E3',
    color: '#6B7280', fontSize: 20, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0,
    lineHeight: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 'var(--font-size-base)', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px' },

  body: { flex: 1, overflowY: 'auto', paddingBottom: 32 },
  hero: { padding: '22px 16px 16px' },
  heroTitle: { fontSize: 'var(--font-size-xl)', fontWeight: 900, color: '#1A1A1A', lineHeight: 1.35, letterSpacing: '-0.6px', marginBottom: 5, whiteSpace: 'pre-line' },
  heroSub: { fontSize: 'var(--font-size-sm)', color: '#A89E94' },

  sections: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 },
  section: { background: 'white', border: '1.5px solid #EDE8E3', borderRadius: 16, padding: 14 },
  sectionLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 800, color: '#FF6B35', marginBottom: 9, letterSpacing: '0.4px', textTransform: 'uppercase' },
  optLabel: { color: '#C8BEB4', fontWeight: 500, textTransform: 'none', letterSpacing: 0 },

  groupRow: { display: 'flex', gap: 7 },
  groupBtn: {
    flex: 1, padding: '9px 6px', background: '#FAF8F5', border: '1.5px solid #EDE8E3',
    borderRadius: 11, fontSize: 'var(--font-size-sm)', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.2px',
  },
  groupBtnActive: { background: '#FFF4EF', border: '2px solid #FF6B35', fontWeight: 800, color: '#FF6B35' },

  chipRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip: {
    padding: '7px 13px', background: '#FAF8F5', border: '1.5px solid #EDE8E3',
    borderRadius: 99, fontSize: 'var(--font-size-sm)', color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit',
  },
  chipActive: { background: '#FFF4EF', border: '2px solid #FF6B35', fontWeight: 800, color: '#FF6B35' },

  sectionInput: {
    width: '100%', padding: '10px 12px', border: '1.5px solid #EDE8E3', borderRadius: 11,
    fontSize: 'var(--font-size-sm)', outline: 'none', fontFamily: 'inherit', background: '#FAF8F5',
    color: '#1A1A1A', boxSizing: 'border-box',
  },

  submitBtn: {
    width: '100%', padding: 15, background: '#FF6B35', color: 'white', border: 'none',
    borderRadius: 16, fontSize: 'var(--font-size-base)', fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.3px',
  },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: '24px' },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 20, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: '#A89E94' },
  timeDoneBtn: { width: '100%', padding: 13, background: '#FF6B35', color: '#fff', border: 'none', borderRadius: 99, fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
}
