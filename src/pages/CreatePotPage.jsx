import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, createPot, joinPot } from '../lib/db'

const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function CreatePotPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useUser()

  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({
    group_id: searchParams.get('group_id') ?? '',
    slot: searchParams.get('slot') ?? '점심',
    meal_time: '12:00',
    end_time: '13:00',
    duration_minutes: 60, // 0 = 직접입력
    title: '',
    menu: '',
    memo: '',
    max_people: 4,
    is_public: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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
      const dateStr = toDateStr(new Date())
      const pot = await createPot({
        groupId: form.group_id,
        date: dateStr,
        slot: form.slot,
        meal_time: form.meal_time,
        end_time: form.end_time,
        title: form.title.trim() || `${form.slot} ${form.meal_time}`,
        menu: form.menu.trim(),
        memo: form.memo.trim(),
        max_people: form.max_people,
        is_public: form.is_public,
        is_default: false,
        createdBy: user.id,
      })
      await joinPot(pot.id, user.id)
      navigate('/today')
    } catch (e) {
      setError('밥팟 생성에 실패했어요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if ((!form.title.trim() && !form.meal_time) || !form.group_id || loading) return
    await doCreate()
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 만들기</span>
        <span />
      </div>

      <div style={styles.form}>
        {/* 그룹 선택 */}
        {groups.length > 1 && (
          <div style={styles.field}>
            <label style={styles.label}>그룹</label>
            <select style={styles.input} value={form.group_id} onChange={e => set('group_id', e.target.value)}>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        {/* 슬롯 */}
        <div style={styles.field}>
          <label style={styles.label}>식사 슬롯</label>
          <div style={styles.slotRow}>
            {SLOT_KEYS.map(s => (
              <button
                key={s}
                style={{ ...styles.slotBtn, ...(form.slot === s ? styles.slotBtnActive : {}) }}
                onClick={() => set('slot', s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>시간</label>
          <div style={styles.timeRange}>
            <input type="time" style={styles.timeInput} value={form.meal_time} onChange={e => setStartTime(e.target.value)} />
            <span style={styles.timeSep}>~</span>
            <input type="time" style={{ ...styles.timeInput, color: form.duration_minutes > 0 ? 'var(--color-primary)' : 'var(--color-text)' }}
              value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value, duration_minutes: 0 }))} />
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

        <div style={styles.field}>
          <label style={styles.label}>밥팟 이름</label>
          <input
            style={styles.input}
            placeholder="예: 점심팟, 저녁 한판"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            maxLength={20}
          />
          <div style={styles.hint}>{form.title.length}/20</div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>메뉴 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span></label>
          <input
            style={styles.input}
            placeholder="예: 김치찌개, 삼겹살, 편의점 — 미입력 시 미정"
            value={form.menu}
            onChange={e => set('menu', e.target.value)}
            maxLength={20}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>메모 <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(선택)</span></label>
          <input
            style={styles.input}
            placeholder="예: 1층 로비 집합, 더치페이"
            value={form.memo}
            onChange={e => set('memo', e.target.value)}
            maxLength={50}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>최대 인원</label>
          <div style={styles.stepper}>
            <button style={styles.step} onClick={() => set('max_people', Math.max(2, form.max_people - 1))}>−</button>
            <span style={styles.stepVal}>{form.max_people}명</span>
            <button style={styles.step} onClick={() => set('max_people', Math.min(10, form.max_people + 1))}>+</button>
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>공개 범위</label>
          <div style={styles.toggleRow}>
            <button style={{ ...styles.toggleBtn, ...(!form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
            <button style={{ ...styles.toggleBtn, ...(form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
          </div>
          {form.is_public && <p style={styles.publicNote}>링크로 누구든 참여할 수 있어요.</p>}
        </div>

        {error && <p style={{ color: '#f44336', fontSize: 13 }}>{error}</p>}
      </div>

      <div style={styles.footer}>
        <button
          style={{ ...styles.createBtn, opacity: (form.title.trim() || form.meal_time) && !loading ? 1 : 0.4 }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '생성 중...' : '밥팟 열기 🍚'}
        </button>
      </div>

    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  form: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', overflowY: 'auto' },
  defaultCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', border: '1.5px solid', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s' },
  defaultCardLeft: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  defaultCardTitle: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  defaultCardDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 },
  defaultTag: { fontSize: 10, background: '#E8F5E9', color: '#4CAF50', borderRadius: 4, padding: '1px 6px', fontWeight: 700 },
  checkbox: { width: 22, height: 22, borderRadius: 6, border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: 700 },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' },
  label: { fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  input: { padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },
  timeRange: { display: 'flex', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  timeSep: { fontSize: 16, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 },
  durationRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  durationBtn: { padding: '5px 12px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-muted)', fontWeight: 500 },
  durationBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },
  slotRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  slotBtn: { padding: '7px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-muted)' },
  slotBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },
  stepper: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' },
  step: { width: 40, height: 40, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 'var(--font-size-lg)', fontWeight: 700, minWidth: 40, textAlign: 'center' },
  toggleRow: { display: 'flex', gap: 'var(--spacing-sm)' },
  toggleBtn: { flex: 1, padding: 12, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  toggleActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },
  publicNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 },
  footer: { padding: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' },
  createBtn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 340, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
