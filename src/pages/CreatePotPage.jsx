import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, createPot, joinPot, setGroupShareSetting } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'

const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 현재 시각 기준 다음 정시 (예: 14:20 → 15:00)
function nextFullHour() {
  const h = (new Date().getHours() + 1) % 24
  return `${String(h).padStart(2, '0')}:00`
}

// 슬롯별 기본 시각 — 아침 7시, 점심 12시, 저녁 19시, 간식류는 다음 정시
function defaultTimeForSlot(slot) {
  if (slot === '아침') return '07:00'
  if (slot === '점심') return '12:00'
  if (slot === '저녁') return '19:00'
  return nextFullHour()
}

function addMinutesStr(timeStr, minutes) {
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
    end_time: addMinutesStr(initialTime, 60),
    duration_minutes: 60, // 0 = 직접입력
    title: '',
    menu: '',
    memo: '',
    max_people: 4,
    is_public: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeEnabled, setTimeEnabled] = useState(true)
  const [timePicker, setTimePicker] = useState(null) // null | 'start' | 'end'
  const [pickerSnapshot, setPickerSnapshot] = useState(null) // 팝업 열릴 때 원본 시간 저장
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

  // 캐러셀에서 시간 선택 시 적용
  const applyPickerTime = (which, timeStr) => {
    if (which === 'start') setStartTime(timeStr)
    else setForm(f => ({ ...f, end_time: timeStr, duration_minutes: 0 }))
  }

  useEffect(() => {
    getMyGroups(user.id).then(g => {
      setGroups(g)
      if (g.length > 0) setForm(f => ({
        ...f,
        group_id: f.group_id || g[0].id,
      }))
    })
  }, [user.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const addMinutes = (timeStr, minutes) => {
    if (!timeStr) return ''
    const [h, m] = timeStr.split(':').map(Number)
    const total = h * 60 + m + minutes
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  const setStartTime = (val) => {
    setForm(f => ({
      ...f,
      meal_time: val,
      end_time: f.duration_minutes > 0 ? addMinutes(val, f.duration_minutes) : f.end_time,
    }))
  }

  const setDuration = (minutes) => {
    setForm(f => ({
      ...f,
      duration_minutes: minutes,
      end_time: minutes > 0 ? addMinutes(f.meal_time, minutes) : f.end_time,
    }))
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
      // 해당 그룹·슬롯·날짜의 공유 설정이 비공유였어도 공유로 전환
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
    if (!form.title.trim() && !form.meal_time && timeEnabled) return
    if (!form.group_id || loading) return
    await doCreate()
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={styles.headerTitle}>밥팟 만들기</span>
          <span style={styles.headerSub}>{initialDate !== toDateStr(new Date()) ? `${initialDate} · ` : ''}{form.slot}</span>
        </div>
        <span />
      </div>

      <div style={styles.form}>
        {/* 그룹 선택 */}
        {groups.length > 1 && (
          <div style={styles.field}>
            <label style={styles.label}>그룹</label>
            <div style={styles.fieldContent}>
              <select style={styles.input} value={form.group_id} onChange={e => set('group_id', e.target.value)}>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* 슬롯 */}
        <div style={styles.field}>
          <label style={styles.label}>식사 슬롯</label>
          <div style={styles.fieldContent}>
            <div style={styles.slotRow}>
              {SLOT_KEYS.map(s => (
                <button
                  key={s}
                  style={{ ...styles.slotBtn, ...(form.slot === s ? styles.slotBtnActive : {}) }}
                  onClick={() => {
                    const t = defaultTimeForSlot(s)
                    setForm(f => ({ ...f, slot: s, meal_time: t, end_time: f.duration_minutes > 0 ? addMinutesStr(t, f.duration_minutes) : f.end_time }))
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <div style={{ width: 68, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingTop: 12, gap: 4 }}>
            <label style={{ ...styles.label, width: 'auto', paddingTop: 0 }}>시간</label>
            <button
              style={{ fontSize: 10, fontWeight: 700, background: timeEnabled ? 'var(--color-primary)' : 'var(--color-surface-2)', color: timeEnabled ? '#fff' : 'var(--color-text-muted)', border: `1px solid ${timeEnabled ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 99, padding: '2px 8px', cursor: 'pointer', lineHeight: 1.6 }}
              onClick={() => setTimeEnabled(v => !v)}
            >{timeEnabled ? 'ON' : 'OFF'}</button>
          </div>
          <div style={{ ...styles.fieldContent, opacity: timeEnabled ? 1 : 0.3, pointerEvents: timeEnabled ? 'auto' : 'none' }}>
            <div style={styles.timeRange}>
              <button type="button" style={styles.timeBtn} onClick={() => openTimePicker('start')}>{form.meal_time}</button>
              <span style={styles.timeSep}>~</span>
              <button type="button" style={{ ...styles.timeBtn, color: form.duration_minutes > 0 ? 'var(--color-primary)' : 'var(--color-text)' }} onClick={() => openTimePicker('end')}>{form.end_time}</button>
            </div>
            <div style={styles.durationRow}>
              {[30, 60, 90, 120].map(min => (
                <button
                  key={min}
                  style={{ ...styles.durationBtn, ...(form.duration_minutes === min ? styles.durationBtnActive : {}) }}
                  onClick={() => setDuration(min)}
                >
                  {min < 60 ? `${min}분` : min === 60 ? '1시간' : min === 90 ? '1.5시간' : '2시간'}
                </button>
              ))}
              <button
                style={{ ...styles.durationBtn, ...(form.duration_minutes === 0 ? styles.durationBtnActive : {}) }}
                onClick={() => setDuration(0)}
              >
                직접입력
              </button>
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>밥팟 이름</label>
          <div style={styles.fieldContent}>
            <input
              style={styles.input}
              placeholder="예: 점심팟, 저녁 한판"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              maxLength={20}
            />
            <div style={styles.hint}>{form.title.length}/20</div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>메뉴 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span></label>
          <div style={styles.fieldContent}>
            <input
              style={styles.input}
              placeholder="예: 김치찌개, 삼겹살 — 미입력 시 미정"
              value={form.menu}
              onChange={e => set('menu', e.target.value)}
              maxLength={20}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>메모 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span></label>
          <div style={styles.fieldContent}>
            <input
              style={styles.input}
              placeholder="예: 1층 로비 집합, 더치페이"
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
              maxLength={50}
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>최대 인원</label>
          <div style={styles.fieldContent}>
            <div style={styles.stepper}>
              <button style={styles.step} onClick={() => set('max_people', Math.max(2, form.max_people - 1))}>−</button>
              <span style={styles.stepVal}>{form.max_people}명</span>
              <button style={styles.step} onClick={() => set('max_people', Math.min(10, form.max_people + 1))}>+</button>
            </div>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>공개 범위</label>
          <div style={styles.fieldContent}>
            <div style={styles.toggleRow}>
              <button style={{ ...styles.toggleBtn, ...(!form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
              <button style={{ ...styles.toggleBtn, ...(form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
            </div>
            {form.is_public && <p style={styles.publicNote}>링크로 누구든 참여할 수 있어요.</p>}
          </div>
        </div>

        {error && <p style={{ color: '#f44336', fontSize: 13 }}>{error}</p>}
      </div>

      <div style={styles.footer}>
        <button
          style={{ ...styles.createBtn, opacity: !loading ? 1 : 0.4 }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '생성 중...' : '밥팟 열기 🍚'}
        </button>
        <button style={styles.cancelBtn} onClick={() => navigate(-1)} disabled={loading}>
          취소
        </button>
      </div>

      {/* 시간 캐러셀 팝업 */}
      {timePicker && (() => {
        const ct = getCarouselTime(timePicker === 'start' ? form.meal_time : form.end_time)
        const update = (patch) => applyPickerTime(timePicker, carouselTimeToStr({ ...ct, ...patch }))
        return (
          <div style={styles.overlay} onClick={cancelTimePicker}>
            <div style={styles.timeDialog} onClick={e => e.stopPropagation()}>
              <div style={styles.timeDialogTitle}>{timePicker === 'start' ? '시작 시간' : '종료 시간'}</div>
              <div style={styles.timeCarouselRow}>
                <CarouselPicker items={CAROUSEL_AMPM} value={ct.ampm} onChange={ampm => update({ ampm })} width={56} />
                <div style={styles.timeCarouselSep} />
                <CarouselPicker items={CAROUSEL_HOURS} value={ct.hour} onChange={hour => update({ hour })} width={56} />
                <span style={styles.timeColon}>:</span>
                <CarouselPicker items={CAROUSEL_MINUTES} value={ct.minute} onChange={minute => update({ minute })} width={56} />
              </div>
              <button style={styles.timeDoneBtn} onClick={confirmTimePicker}>확인</button>
            </div>
          </div>
        )
      })()}

    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerSub: { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  form: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', overflowY: 'auto' },
  defaultCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', border: '1.5px solid', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s' },
  defaultCardLeft: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  defaultCardTitle: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  defaultCardDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 },
  defaultTag: { fontSize: 10, background: '#E8F5E9', color: '#4CAF50', borderRadius: 4, padding: '1px 6px', fontWeight: 700 },
  checkbox: { width: 22, height: 22, borderRadius: 6, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: 700 },
  field: { display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 'var(--spacing-md)' },
  fieldContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' },
  label: { width: 68, flexShrink: 0, fontWeight: 700, fontSize: 'var(--font-size-sm)', paddingTop: 12, lineHeight: 1.3 },
  input: { padding: '10px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },
  timeRange: { display: 'flex', alignItems: 'center', gap: 8 },
  timeBtn: { flex: 1, padding: '10px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', background: 'var(--color-surface)', color: 'var(--color-text)', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  timeSep: { fontSize: 16, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeCarouselSep: { width: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  durationRow: { display: 'flex', gap: 4, flexWrap: 'nowrap', marginTop: 6 },
  durationBtn: { flex: 1, padding: '5px 4px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-muted)', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' },
  durationBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },
  slotRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  slotBtn: { padding: '7px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-muted)' },
  slotBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },
  stepper: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', paddingTop: 2 },
  step: { width: 40, height: 40, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 'var(--font-size-lg)', fontWeight: 700, minWidth: 40, textAlign: 'center' },
  toggleRow: { display: 'flex', gap: 'var(--spacing-sm)' },
  toggleBtn: { flex: 1, padding: 12, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  toggleActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },
  publicNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 },
  footer: { padding: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8 },
  createBtn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer', fontWeight: 500 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 340, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
