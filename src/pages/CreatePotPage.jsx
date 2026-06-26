import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function CreatePotPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    meal_time: '12:00',
    title: '',
    max_people: 4,
    is_public: false,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleCreate = () => {
    if (!form.title.trim()) return
    navigate('/today')
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 만들기</span>
        <span />
      </div>

      <div style={styles.form}>
        <div style={styles.field}>
          <label style={styles.label}>시간</label>
          <input
            type="time"
            style={styles.input}
            value={form.meal_time}
            onChange={e => set('meal_time', e.target.value)}
          />
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
            <button
              style={{ ...styles.toggleBtn, ...(form.is_public ? {} : styles.toggleActive) }}
              onClick={() => set('is_public', false)}
            >
              그룹만
            </button>
            <button
              style={{ ...styles.toggleBtn, ...(form.is_public ? styles.toggleActive : {}) }}
              onClick={() => set('is_public', true)}
            >
              전체 공개
            </button>
          </div>
          {form.is_public && (
            <p style={styles.publicNote}>링크로 누구든 참여할 수 있어요.</p>
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <button
          style={{ ...styles.createBtn, opacity: form.title.trim() ? 1 : 0.4 }}
          onClick={handleCreate}
        >
          밥팟 열기 🍚
        </button>
      </div>
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)',
  },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  form: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' },
  label: { fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  input: {
    padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none',
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },
  stepper: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' },
  step: {
    width: 40, height: 40, border: '1.5px solid var(--color-border)',
    borderRadius: '50%', background: 'none', fontSize: 20, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  stepVal: { fontSize: 'var(--font-size-lg)', fontWeight: 700, minWidth: 40, textAlign: 'center' },
  toggleRow: { display: 'flex', gap: 'var(--spacing-sm)' },
  toggleBtn: {
    flex: 1, padding: 12, border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)',
  },
  toggleActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary)18',
    color: 'var(--color-primary)',
  },
  publicNote: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 },
  footer: { padding: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' },
  createBtn: {
    width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
  },
}
