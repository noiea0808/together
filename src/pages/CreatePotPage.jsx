import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, createPot, upsertStatus } from '../lib/db'

const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function toDateStr(date) {
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '')
}

export default function CreatePotPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useUser()

  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({
    group_id: '',
    slot: searchParams.get('slot') ?? '점심',
    meal_time: '12:00',
    title: '',
    max_people: 4,
    is_public: false,
    is_default: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getMyGroups(user.id).then(g => {
      setGroups(g)
      if (g.length > 0) setForm(f => ({ ...f, group_id: g[0].id }))
    })
  }, [user.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleCreate = async () => {
    if (!form.title.trim() || !form.group_id || loading) return
    setLoading(true)
    setError(null)
    try {
      const dateStr = toDateStr(new Date())
      await createPot({
        groupId: form.group_id,
        date: dateStr,
        slot: form.slot,
        meal_time: form.meal_time,
        title: form.title.trim(),
        max_people: form.max_people,
        is_public: form.is_public,
        is_default: form.is_default,
        createdBy: user.id,
      })
      // 기본팟이 아니면 개설자 상태를 '모집중'으로 자동 설정
      if (!form.is_default) {
        await upsertStatus({
          userId: user.id, groupId: form.group_id,
          date: dateStr, slot: form.slot,
          status: '모집중', meal_time: form.meal_time,
        })
      }
      navigate('/today')
    } catch (e) {
      setError('밥팟 생성에 실패했어요.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 만들기</span>
        <span />
      </div>

      <div style={styles.form}>
        {/* 기본 밥팟 */}
        <div
          style={{ ...styles.defaultCard, borderColor: form.is_default ? '#4CAF50' : 'var(--color-border)', background: form.is_default ? '#E8F5E918' : 'var(--color-surface-2)' }}
          onClick={() => set('is_default', !form.is_default)}
        >
          <div style={styles.defaultCardLeft}>
            <div style={styles.defaultCardTitle}>
              <span style={{ ...styles.defaultTag, opacity: form.is_default ? 1 : 0.4 }}>기본팟</span>
              기본 밥팟으로 열기
            </div>
            <div style={styles.defaultCardDesc}>
              개설자 없이 열리는 팟 · 개설자도 나중에 참여자로만 참가 가능
            </div>
          </div>
          <div style={{ ...styles.checkbox, borderColor: form.is_default ? '#4CAF50' : 'var(--color-border)', background: form.is_default ? '#4CAF50' : 'transparent' }}>
            {form.is_default && <span style={styles.checkmark}>✓</span>}
          </div>
        </div>

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
          <input type="time" style={styles.input} value={form.meal_time} onChange={e => set('meal_time', e.target.value)} />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>메뉴 / 이름</label>
          <input
            style={styles.input}
            placeholder="예: 김치찌개팟, 편의점 런치"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            maxLength={20}
          />
          <div style={styles.hint}>{form.title.length}/20</div>
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
          style={{ ...styles.createBtn, opacity: form.title.trim() && !loading ? 1 : 0.4 }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '생성 중...' : form.is_default ? '기본 밥팟 열기 🍚' : '밥팟 열기 🍚'}
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
}
