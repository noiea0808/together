import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupDefaultPotConfigs, insertGroupDefaultPotConfig, updateGroupDefaultPotConfig, deleteGroupDefaultPotConfig } from '../lib/db'

const SLOT_KEYS = ['아침', '오전간식', '점심', '오후간식', '저녁', '야식']

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addMinutes(timeStr, minutes) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export default function GroupSettingsPage() {
  const navigate = useNavigate()
  const { id: groupId } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useUser()

  const [groupName, setGroupName] = useState('')
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const editingSlotParam = searchParams.get('slot')
  const initialSlot = editingSlotParam ?? '점심'
  const [editingConfigId, setEditingConfigId] = useState(null) // null = 신규, id = 기존 수정
  const [form, setForm] = useState({
    slot: initialSlot,
    meal_time: '12:00',
    end_time: '13:00',
    duration_minutes: 60,
    title: '',
    memo: '',
    max_people: 4,
    is_public: false,
    effective_from: toDateStr(new Date()),
  })

  useEffect(() => {
    const load = async () => {
      const [groups, cfgs] = await Promise.all([
        getMyGroups(user.id),
        getGroupDefaultPotConfigs(groupId),
      ])
      const group = groups.find(g => g.id === groupId)
      if (group) setGroupName(group.name)
      setConfigs(cfgs)

      // ?slot 파라미터로 진입 시 해당 슬롯의 첫 번째 설정을 폼에 채우기
      const targetSlot = searchParams.get('slot')
      if (targetSlot) {
        const existing = cfgs.find(c => c.slot === targetSlot)
        if (existing) {
          loadConfigToForm(existing)
          setEditingConfigId(existing.id)
        } else {
          setForm(f => ({ ...f, slot: targetSlot }))
        }
      }
      setLoading(false)
    }
    load()
  }, [groupId, user.id])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const loadConfigToForm = (cfg) => {
    const mt = cfg.meal_time?.slice(0, 5) ?? '12:00'
    const et = cfg.end_time?.slice(0, 5) ?? '13:00'
    const [sh, sm] = mt.split(':').map(Number)
    const [eh, em] = et.split(':').map(Number)
    const dur = (eh * 60 + em) - (sh * 60 + sm)
    setForm({
      slot: cfg.slot, meal_time: mt, end_time: et,
      duration_minutes: dur > 0 ? dur : 0,
      title: cfg.title ?? '', memo: cfg.memo ?? '',
      max_people: cfg.max_people ?? 4,
      is_public: cfg.is_public ?? false,
      effective_from: toDateStr(new Date()),
    })
    setEditingConfigId(cfg.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetForm = () => {
    setEditingConfigId(null)
    setForm({ slot: '점심', meal_time: '12:00', end_time: '13:00', duration_minutes: 60, title: '', memo: '', max_people: 4, is_public: false, effective_from: toDateStr(new Date()) })
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

  const handleSave = async () => {
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError(null)
    const payload = {
      slot: form.slot, meal_time: form.meal_time, end_time: form.end_time,
      title: form.title.trim(), memo: form.memo.trim(),
      max_people: form.max_people, is_public: form.is_public,
      effective_from: form.effective_from, lastModifiedBy: user.id,
    }
    try {
      if (editingConfigId) {
        await updateGroupDefaultPotConfig(editingConfigId, payload)
      } else {
        await insertGroupDefaultPotConfig({ groupId, ...payload })
      }
      const cfgs = await getGroupDefaultPotConfigs(groupId)
      setConfigs(cfgs)
      resetForm()
    } catch (e) {
      setError('저장에 실패했어요.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    setSaving(true)
    try {
      await deleteGroupDefaultPotConfig(id)
      setConfigs(c => c.filter(cfg => cfg.id !== id))
      setConfirmDelete(null)
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  if (loading) return <div style={styles.loading}>🍚</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>기본 밥팟 추가</span>
        <span />
      </div>

      <div style={styles.form}>

        {/* 모드 표시 */}
        <div style={styles.modeBar}>
          <span style={{ fontWeight: 700, fontSize: 13, color: editingConfigId ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
            {editingConfigId ? '✏️ 기존 설정 수정 중' : '＋ 새 기본 밥팟 추가'}
          </span>
          {editingConfigId && (
            <button style={styles.resetFormBtn} onClick={resetForm}>새로 추가하기</button>
          )}
        </div>

        {/* 그룹 고정 표시 */}
        <div style={styles.field}>
          <label style={styles.label}>그룹</label>
          <div style={styles.fixedGroup}>{groupName}</div>
        </div>

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

        {/* 시간 */}
        <div style={styles.field}>
          <label style={styles.label}>시간</label>
          <div style={styles.timeRange}>
            <input type="time" style={styles.timeInput} value={form.meal_time} onChange={e => setStartTime(e.target.value)} />
            <span style={styles.timeSep}>~</span>
            <input
              type="time"
              style={{ ...styles.timeInput, color: form.duration_minutes > 0 ? 'var(--color-primary)' : 'var(--color-text)' }}
              value={form.end_time}
              onChange={e => setForm(f => ({ ...f, end_time: e.target.value, duration_minutes: 0 }))}
            />
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

        {/* 밥팟 이름 */}
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

        {/* 메모 */}
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

        {/* 최대 인원 */}
        <div style={styles.field}>
          <label style={styles.label}>최대 인원</label>
          <div style={styles.stepper}>
            <button style={styles.step} onClick={() => set('max_people', Math.max(2, form.max_people - 1))}>−</button>
            <span style={styles.stepVal}>{form.max_people}명</span>
            <button style={styles.step} onClick={() => set('max_people', Math.min(10, form.max_people + 1))}>+</button>
          </div>
        </div>

        {/* 공개 범위 */}
        <div style={styles.field}>
          <label style={styles.label}>공개 범위</label>
          <div style={styles.toggleRow}>
            <button style={{ ...styles.toggleBtn, ...(!form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
            <button style={{ ...styles.toggleBtn, ...(form.is_public ? styles.toggleActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
          </div>
        </div>

        {/* 적용 시작일 */}
        <div style={styles.field}>
          <label style={styles.label}>적용 시작일</label>
          <input
            type="date"
            style={styles.input}
            value={form.effective_from}
            onChange={e => set('effective_from', e.target.value)}
            min={toDateStr(new Date())}
          />
          <div style={styles.hint}>이 날짜 이후 매일 자동으로 열려요</div>
        </div>

        {error && <p style={{ color: '#f44336', fontSize: 13 }}>{error}</p>}

        {/* 현재 설정된 기본 밥팟 목록 */}
        {configs.length > 0 && (
          <div style={styles.configSection}>
            <div style={styles.configTitle}>현재 설정된 기본 밥팟</div>
            {configs.map(cfg => (
              <div key={cfg.id} style={{ ...styles.configRow, borderColor: editingConfigId === cfg.id ? 'var(--color-primary)' : 'var(--color-border)' }}>
                <div style={styles.configInfo}>
                  <span style={styles.configSlot}>{cfg.slot}</span>
                  <span style={styles.configTime}>{cfg.meal_time?.slice(0,5)}{cfg.end_time ? ` ~ ${cfg.end_time.slice(0,5)}` : ''}</span>
                  <span style={styles.configName}>{cfg.title}</span>
                  {cfg.users?.nickname && (
                    <span style={styles.configModifier}>✎ {cfg.users.nickname}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button style={styles.editConfigBtn} onClick={() => loadConfigToForm(cfg)}>수정</button>
                  <button style={styles.deleteBtn} onClick={() => setConfirmDelete(cfg.id)}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <button
          style={{ ...styles.createBtn, opacity: form.title.trim() && !saving ? 1 : 0.4 }}
          onClick={handleSave}
          disabled={!form.title.trim() || saving}
        >
          {saving ? '저장 중...' : editingSlotParam ? '수정 완료' : '기본 밥팟 추가 🍚'}
        </button>
      </div>

      {/* 삭제 확인 */}
      {confirmDelete && (
        <div style={styles.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={styles.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🗑️</div>
            <div style={styles.dialogTitle}>{confirmDelete} 기본 밥팟 삭제</div>
            <p style={styles.dialogDesc}>설정을 삭제할게요. 이미 열린 팟에는 영향 없어요.</p>
            <div style={styles.dialogBtns}>
              <button style={styles.dialogBtnDanger} onClick={() => handleDelete(confirmDelete)} disabled={saving}>
                {saving ? '삭제 중...' : '삭제하기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmDelete(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  loading: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  form: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', overflowY: 'auto' },

  field: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' },
  label: { fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  fixedGroup: { padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', fontWeight: 600 },
  input: { padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },

  slotRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  slotBtn: { padding: '7px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--color-text-muted)' },
  slotBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },

  timeRange: { display: 'flex', alignItems: 'center', gap: 8 },
  timeInput: { flex: 1, padding: '14px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  timeSep: { fontSize: 16, fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 },
  durationRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  durationBtn: { padding: '5px 12px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-muted)', fontWeight: 500 },
  durationBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },

  stepper: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' },
  step: { width: 40, height: 40, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 'var(--font-size-lg)', fontWeight: 700, minWidth: 40, textAlign: 'center' },

  toggleRow: { display: 'flex', gap: 'var(--spacing-sm)' },
  toggleBtn: { flex: 1, padding: 12, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  toggleActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },

  modeBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  resetFormBtn: { fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer' },
  configSection: { display: 'flex', flexDirection: 'column', gap: 8, padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  configTitle: { fontWeight: 700, fontSize: 13, marginBottom: 2 },
  configRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px var(--spacing-sm)', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' },
  configInfo: { flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  configSlot: { fontSize: 12, fontWeight: 700, background: '#E8F5E9', color: '#4CAF50', borderRadius: 4, padding: '1px 6px' },
  configTime: { fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 },
  configName: { fontSize: 12, fontWeight: 600 },
  configModifier: { fontSize: 11, color: '#9E9E9E' },
  editConfigBtn: { padding: '4px 10px', background: 'none', color: 'var(--color-primary)', border: '1px solid var(--color-primary)40', borderRadius: 'var(--radius-full)', fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  deleteBtn: { padding: '4px 10px', background: 'none', color: '#f44336', border: '1px solid #f4433640', borderRadius: 'var(--radius-full)', fontSize: 12, cursor: 'pointer', flexShrink: 0 },

  footer: { padding: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' },
  createBtn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 340, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnDanger: { width: '100%', padding: 13, background: '#f44336', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
