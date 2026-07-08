import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupDefaultPotConfigs, insertGroupDefaultPotConfig, updateGroupDefaultPotConfig, deleteGroupDefaultPotConfig } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import { SLOT_KEYS, SLOT_EMOJI, SLOT_TIME_PRESETS, DURATION_OPTIONS } from '../lib/potConstants'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

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
  const [timePicker, setTimePicker] = useState(null)
  const [pickerSnapshot, setPickerSnapshot] = useState(null)

  useScrollLock(!!confirmDelete || !!timePicker)
  useEscKey(useCallback(() => {
    if (timePicker) { cancelTimePicker(); return }
    if (confirmDelete) setConfirmDelete(null)
  }, [timePicker, confirmDelete]))

  const editingConfigParam = searchParams.get('config')
  const editingSlotParam = searchParams.get('slot')
  const isFutureEdit = !!(editingConfigParam || editingSlotParam)
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

      // 향후 수정 진입 — config 파라미터(정확한 설정) 우선, 없으면 slot
      if (editingConfigParam) {
        const existing = cfgs.find(c => c.id === editingConfigParam)
        if (existing) loadConfigToForm(existing)
      } else if (editingSlotParam) {
        const existing = cfgs.find(c => c.slot === editingSlotParam)
        if (existing) loadConfigToForm(existing)
        else setForm(f => ({ ...f, slot: editingSlotParam }))
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

  const selectSlot = (s) => {
    if (editingConfigId) { set('slot', s); return }
    const t = defaultTimeForSlot(s)
    setForm(f => ({ ...f, slot: s, meal_time: t, end_time: f.duration_minutes > 0 ? addMinutes(t, f.duration_minutes) : f.end_time }))
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

  const openTimePicker = (which) => {
    setPickerSnapshot({ meal_time: form.meal_time, end_time: form.end_time, duration_minutes: form.duration_minutes })
    setTimePicker(which)
  }
  const cancelTimePicker = () => {
    if (pickerSnapshot) setForm(f => ({ ...f, ...pickerSnapshot }))
    setTimePicker(null)
    setPickerSnapshot(null)
  }
  const confirmTimePicker = () => { setTimePicker(null); setPickerSnapshot(null) }
  const applyPickerTime = (which, timeStr) => {
    if (which === 'start') setStartTime(timeStr)
    else setForm(f => ({ ...f, end_time: timeStr, duration_minutes: 0 }))
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
      // 추가/수정 완료 후 메인으로 복귀 (캐시 무효화로 즉시 반영)
      invalidateCache(`board:${user.id}:`, { prefix: true })
      navigate('/today', { replace: true })
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
      await deleteGroupDefaultPotConfig(id, toDateStr(new Date()))
      invalidateCache(`board:${user.id}:`, { prefix: true })
      navigate('/today', { replace: true })
    } catch (e) { console.error(e) }
    finally { setSaving(false) }
  }

  if (loading) return <div style={S.loadingPage}>🍚</div>

  const presets = SLOT_TIME_PRESETS[form.slot] ?? []
  const isCustomTime = !presets.includes(form.meal_time)

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={S.headerTitle}>{isFutureEdit ? '기본 밥팟 수정' : '기본 밥팟 추가'}</div>
          <div style={S.headerSub}>{form.slot}</div>
        </div>
        <div style={{ width: 34 }} />
      </div>

      <div style={S.body}>
        <div style={S.hero}>매일 자동으로 열리는 밥팟이에요 🍚</div>

        <div style={S.sections}>
          {/* 그룹 고정 표시 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>👪 그룹</div>
            <div style={S.fixedGroup}>{groupName}</div>
          </div>

          {/* 식사 슬롯 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>🍽 어떤 식사예요?</div>
            <div style={S.chipRow}>
              {SLOT_KEYS.map(s => {
                const active = form.slot === s
                return (
                  <button key={s} style={{ ...S.chip, ...(active ? S.chipActive : {}) }} onClick={() => selectSlot(s)}>
                    {SLOT_EMOJI[s]} {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 시간 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>🕒 언제 먹을까요?</div>
            <div style={S.chipRow}>
              {presets.map(t => {
                const active = form.meal_time === t
                return (
                  <button key={t} style={{ ...S.chip, ...(active ? S.chipActive : {}) }} onClick={() => setStartTime(t)}>
                    {t}
                  </button>
                )
              })}
              <button
                style={{ ...S.chip, ...(isCustomTime ? S.chipActive : {}) }}
                onClick={() => openTimePicker('start')}
              >
                {isCustomTime ? form.meal_time : '직접 설정'}
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={S.sectionLabel}>~ 종료 {form.end_time ? form.end_time.slice(0, 5) : ''}</div>
              <div style={S.chipRow}>
                {DURATION_OPTIONS.map(o => (
                  <button
                    key={o.min}
                    style={{ ...S.chip, ...(form.duration_minutes === o.min ? S.chipActive : {}) }}
                    onClick={() => setDuration(o.min)}
                  >
                    {o.label}
                  </button>
                ))}
                <button
                  style={{ ...S.chip, ...(form.duration_minutes === 0 ? S.chipActive : {}) }}
                  onClick={() => { setDuration(0); openTimePicker('end') }}
                >
                  {form.duration_minutes === 0 && form.end_time ? form.end_time.slice(0, 5) : '직접 설정'}
                </button>
              </div>
            </div>
          </div>

          {/* 최대 인원 */}
          <div style={{ ...S.section, ...S.sectionRow }}>
            <div style={S.sectionLabel}>👥 몇 명까지?</div>
            <div style={S.stepper}>
              <button style={S.stepperBtn} onClick={() => set('max_people', Math.max(2, form.max_people - 1))}>−</button>
              <span style={S.stepperNum}>{form.max_people}명</span>
              <button style={S.stepperBtn} onClick={() => set('max_people', Math.min(10, form.max_people + 1))}>+</button>
            </div>
          </div>

          {/* 밥팟 이름 / 메모 */}
          <div style={S.section}>
            <input
              style={S.sectionInput}
              placeholder="밥팟 이름 (예: 점심팟, 저녁 한판)"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              maxLength={20}
            />
            <input
              style={{ ...S.sectionInput, marginTop: 6 }}
              placeholder="메모 (선택, 예: 1층 로비 집합, 더치페이)"
              value={form.memo}
              onChange={e => set('memo', e.target.value)}
              maxLength={50}
            />
          </div>

          {/* 공개 범위 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>🔓 공개 범위</div>
            <div style={S.groupRow}>
              <button style={{ ...S.groupBtn, ...(!form.is_public ? S.groupOnlyActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
              <button style={{ ...S.groupBtn, ...(form.is_public ? S.publicActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
            </div>
            {form.is_public && <p style={{ fontSize: 'var(--font-size-2xs)', color: '#2563EB', margin: '6px 0 0' }}>링크로 누구든 참여할 수 있어요.</p>}
          </div>

          {/* 적용 시작일 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>📅 적용 시작일</div>
            <input
              type="date"
              style={S.sectionInput}
              value={form.effective_from}
              onChange={e => set('effective_from', e.target.value)}
              min={toDateStr(new Date())}
            />
            <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', margin: '6px 0 0' }}>이 날짜 이후 매일 자동으로 열려요</p>
          </div>

          {error && <p style={{ color: '#f44336', fontSize: 'var(--font-size-xs)', margin: 0 }}>{error}</p>}

          <button
            style={{ ...S.submitBtn, opacity: form.title.trim() && !saving ? 1 : 0.4 }}
            onClick={handleSave}
            disabled={!form.title.trim() || saving}
          >
            {saving ? '저장 중...' : isFutureEdit ? '수정 완료' : '기본 밥팟 추가 🍚'}
          </button>

          {editingConfigId && (
            <button style={S.deleteBtn} onClick={() => setConfirmDelete(editingConfigId)} disabled={saving}>
              🗑️ 기본 밥팟 삭제
            </button>
          )}
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

      {/* 삭제 확인 */}
      {confirmDelete && (
        <div style={S.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🗑️</div>
            <div style={S.dialogTitle}>기본 밥팟 설정을{'\n'}삭제할까요?</div>
            <p style={S.dialogDesc}>오늘 포함 이후 날짜의 기본 밥팟이 모두 사라져요.{'\n'}과거 기록은 유지돼요.</p>
            <div style={S.dialogBtns}>
              <button style={{ ...S.dialogBtnPrimary, background: '#f44336' }} onClick={() => handleDelete(confirmDelete)} disabled={saving}>
                {saving ? '삭제 중...' : '삭제하기'}
              </button>
              <button style={S.dialogBtnCancel} onClick={() => setConfirmDelete(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },

  header: {
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
    position: 'sticky', top: 0, zIndex: 10, background: 'rgba(250,248,245,0.95)',
    borderBottom: '1px solid var(--color-border)', backdropFilter: 'blur(8px)',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-border)',
    color: 'var(--color-text-muted)', fontSize: 20, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0,
    lineHeight: 1,
  },
  headerTitle: { fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },
  headerSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },

  body: { flex: 1, overflowY: 'auto', paddingBottom: 20 },
  hero: { padding: '10px 16px 6px', fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  sections: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 12 },
  section: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10 },
  sectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 7 },

  fixedGroup: { padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', fontWeight: 600 },

  chipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  chip: {
    padding: '5px 10px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  chipActive: { background: '#FFF4EF', border: '1.5px solid var(--color-primary)', fontWeight: 700, color: 'var(--color-primary)' },

  stepper: { display: 'flex', alignItems: 'center', gap: 10 },
  stepperBtn: { width: 26, height: 26, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'var(--color-bg)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', lineHeight: 1 },
  stepperNum: { fontWeight: 700, fontSize: 'var(--font-size-sm)', minWidth: 30, textAlign: 'center' },

  sectionInput: {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)',
    color: 'var(--color-text)', boxSizing: 'border-box',
  },

  groupRow: { display: 'flex', gap: 6 },
  groupBtn: {
    flex: 1, padding: '6px 6px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.2px',
  },
  groupOnlyActive: { background: 'var(--color-surface-2)', border: '1.5px solid var(--color-text-muted)', fontWeight: 700, color: 'var(--color-text)' },
  publicActive: { background: '#E3F2FD', border: '1.5px solid #2563EB', fontWeight: 700, color: '#2563EB' },

  submitBtn: { ...PRIMARY_ACTION_BUTTON },
  deleteBtn: { width: '100%', padding: 14, background: 'none', color: '#f44336', border: '1px solid #f4433640', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  timeDialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },

  dialog: { width: '100%', maxWidth: 360, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
