import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupDefaultPotConfigs, insertGroupDefaultPotConfig, updateGroupDefaultPotConfig, deleteGroupDefaultPotConfig } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import { SLOT_KEYS, SLOT_TIME_PRESETS, DURATION_OPTIONS, MIN_POT_PEOPLE, MAX_POT_PEOPLE } from '../lib/potConstants'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON, DESTRUCTIVE_ACTION_BUTTON } from '../styles/buttons'
import RiceBowlIcon from '../components/RiceBowlIcon'
import PotIcon from '../components/PotIcon'
import PotIconPicker from '../components/PotIconPicker'

const MIN_PEOPLE = MIN_POT_PEOPLE
const MAX_PEOPLE = MAX_POT_PEOPLE

const SLOT_DEFAULT_TIME = {
  '아침': '07:00',
  '오전간식': '10:00',
  '점심': '12:00',
  '오후간식': '15:00',
  '저녁': '19:00',
  '야식': '22:00',
}

function defaultTimeForSlot(slot) {
  return SLOT_DEFAULT_TIME[slot] ?? '12:00'
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: '일' },
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
]
const DEFAULT_REPEAT_DAYS = [1, 2, 3, 4, 5]

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
  const [showSlotPicker, setShowSlotPicker] = useState(false)
  const [editField, setEditField] = useState(null)

  useScrollLock(!!confirmDelete || !!timePicker || !!editField)
  useEscKey(useCallback(() => {
    if (timePicker) { cancelTimePicker(); return }
    if (editField) { setEditField(null); return }
    if (showSlotPicker) { setShowSlotPicker(false); return }
    if (confirmDelete) setConfirmDelete(null)
  }, [timePicker, editField, showSlotPicker, confirmDelete]))

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
    repeat_days: DEFAULT_REPEAT_DAYS,
    icon: null,
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

  const toggleRepeatDay = (day) => {
    setForm(f => {
      const has = f.repeat_days.includes(day)
      if (has && f.repeat_days.length === 1) return f // 최소 1개는 선택돼 있어야 함
      const next = has ? f.repeat_days.filter(d => d !== day) : [...f.repeat_days, day].sort()
      return { ...f, repeat_days: next }
    })
  }

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
      repeat_days: cfg.repeat_days ?? DEFAULT_REPEAT_DAYS,
      icon: cfg.icon ?? null,
    })
    setEditingConfigId(cfg.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const changeSlot = (newSlot) => {
    setShowSlotPicker(false)
    if (newSlot === form.slot) return
    // 기존 설정을 수정하는 중이면 이미 저장된 시간을 건드리지 않고 슬롯만 바꾼다.
    if (editingConfigId) { set('slot', newSlot); return }
    const t = defaultTimeForSlot(newSlot)
    setForm(f => ({ ...f, slot: newSlot, meal_time: t, end_time: f.duration_minutes > 0 ? addMinutes(t, f.duration_minutes) : f.end_time }))
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

  const stepPeople = (delta) => set('max_people', Math.max(MIN_PEOPLE, Math.min(MAX_PEOPLE, form.max_people + delta)))

  const handleSave = async () => {
    if (!form.title.trim() || saving) return
    setSaving(true)
    setError(null)
    const payload = {
      slot: form.slot, meal_time: form.meal_time, end_time: form.end_time,
      title: form.title.trim(), memo: form.memo.trim(),
      max_people: form.max_people, is_public: form.is_public,
      effective_from: form.effective_from, repeat_days: form.repeat_days,
      lastModifiedBy: user.id,
      icon: form.icon,
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

  if (loading) return <div style={S.loadingPage}><RiceBowlIcon size={72} /></div>

  const presets = SLOT_TIME_PRESETS[form.slot] ?? []
  const isCustomTime = !presets.includes(form.meal_time)
  const timeValue = `${form.meal_time} ~ ${(form.end_time || '').slice(0, 5)}`

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)} aria-label="뒤로가기">‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={S.headerTitle}>{isFutureEdit ? '기본 밥팟 수정' : '기본 밥팟 추가'}</div>
          <div style={S.headerSub}>{form.slot}</div>
        </div>
        <div style={{ width: 34 }} />
      </div>

      <div style={S.body}>
        <div style={S.hero}>매일 자동으로 열리는 밥팟이에요 <RiceBowlIcon size={18} /></div>

        {/* 일반 밥팟과 동일한 구성 — 슬롯/그룹 칩, 아이콘·이름, 시간·인원·메모 */}
        <div style={S.heroCard}>
          <div style={S.heroTagRow}>
            <div style={S.chipWrap}>
              <button type="button" style={S.chipBtn} onClick={() => setShowSlotPicker(v => !v)}>
                {form.slot}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showSlotPicker && (
                <>
                  <div style={S.pickerOverlay} onClick={() => setShowSlotPicker(false)} />
                  <div style={S.pickerDropdown}>
                    {SLOT_KEYS.map(slot => (
                      <button
                        key={slot}
                        type="button"
                        style={{ ...S.pickerItem, ...(slot === form.slot ? S.pickerItemActive : {}) }}
                        onClick={() => changeSlot(slot)}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* 그룹은 이미 URL로 정해져 있어 선택할 수 없다 — 칩 모양만 맞춰 표시 */}
            <div style={S.chipBtnStatic}>{groupName}</div>
          </div>

          <div style={S.heroHeader}>
            <div style={S.heroIcon}>{form.icon ? <PotIcon icon={form.icon} size={56} /> : <RiceBowlIcon size={56} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.heroTitle}>{form.title || '밥팟 이름을 정해주세요'}</div>
              <div style={S.heroSlot}>{form.slot}</div>
            </div>
            <button style={S.heroEditBadge} onClick={() => setEditField('title')} aria-label="아이콘·이름 수정">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>

          <div style={S.infoGrid}>
            {[
              { key: 'time', label: '시간', value: timeValue, full: false },
              { key: 'max_people', label: '최대 인원', value: `${form.max_people}명`, full: false },
              { key: 'memo', label: '메모', value: form.memo || '없음', full: true },
            ].map(({ key, label, value, full }) => (
              <div
                key={key}
                style={{ ...S.infoPanel, ...(full ? S.infoPanelFull : {}), ...S.infoPanelEditable }}
                onClick={() => setEditField(key)}
              >
                <span style={S.infoPanelEditBadge}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </span>
                <div style={S.infoPanelRow}>
                  <span style={S.infoPanelLabel}>{label}</span>
                  <span style={S.infoPanelValue}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 일반 밥팟보다 더 입력해야 하는 정보 — 적용 시작일 / 반복 요일 / 공개 범위 */}
        <div style={S.sections}>
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

            <div style={{ marginTop: 10 }}>
              <div style={S.sectionLabel}>🗓 어떤 요일에 반복할까요?</div>
              <div style={S.chipRow}>
                {WEEKDAY_OPTIONS.map(({ value, label }) => {
                  const active = form.repeat_days.includes(value)
                  return (
                    <button
                      key={value}
                      style={{ ...S.chip, ...(active ? S.chipActive : {}) }}
                      onClick={() => toggleRepeatDay(value)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={S.section}>
            <div style={{ ...S.sectionLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
              <span>🔓 공개 범위</span>
              <span style={S.hint}>기본: 그룹만</span>
            </div>
            <div style={S.groupRow}>
              <button style={{ ...S.groupBtn, ...(!form.is_public ? S.groupOnlyActive : {}) }} onClick={() => set('is_public', false)}>그룹만</button>
              <button style={{ ...S.groupBtn, ...(form.is_public ? S.publicActive : {}) }} onClick={() => set('is_public', true)}>전체 공개</button>
            </div>
            {form.is_public && <p style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-info)', margin: '6px 0 0' }}>링크로 누구든 참여할 수 있어요.</p>}
          </div>

          {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', margin: 0 }}>{error}</p>}
        </div>
      </div>

      <div style={S.footer}>
        <button
          style={{ ...S.submitBtn, opacity: form.title.trim() && !saving ? 1 : 0.4 }}
          onClick={handleSave}
          disabled={!form.title.trim() || saving}
        >
          {saving ? '저장 중...' : isFutureEdit ? '수정 완료' : <>기본 밥팟 추가 <RiceBowlIcon size={18} /></>}
        </button>

        {editingConfigId && (
          <button style={S.deleteBtn} onClick={() => setConfirmDelete(editingConfigId)} disabled={saving}>
            🗑️ 기본 밥팟 삭제
          </button>
        )}
      </div>

      {/* 개별 수정 팝업 — 아이콘·이름 / 시간 / 최대 인원 / 메모 (일반 밥팟과 동일한 구성, 메뉴·미정 옵션은 없음) */}
      {editField && (
        <div style={S.overlay} onClick={() => setEditField(null)}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={S.dialogTitle}>
              {{ title: '🖼️ 아이콘 · 이름 수정', time: '🕒 시간 수정', max_people: '👥 최대 인원 수정', memo: '📝 메모 수정' }[editField]}
            </div>

            {editField === 'title' && (
              <div style={{ width: '100%' }}>
                <PotIconPicker value={form.icon} onChange={v => set('icon', v)} />
                <input
                  style={{ ...S.editSectionInput, width: '100%', marginTop: 10 }}
                  placeholder="밥팟 이름 (예: 점심팟, 저녁 한판)"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}

            {editField === 'time' && (
              <div style={{ width: '100%' }}>
                <div style={S.editChipRow}>
                  {presets.map(t => {
                    const active = form.meal_time === t
                    return (
                      <button
                        key={t}
                        style={{ ...S.editChip, ...(active ? S.editChipActive : {}) }}
                        onClick={() => setStartTime(t)}
                      >
                        {t}
                      </button>
                    )
                  })}
                  <button
                    style={{ ...S.editChip, ...(isCustomTime ? S.editChipActive : {}) }}
                    onClick={() => openTimePicker('start')}
                  >
                    {isCustomTime ? form.meal_time : '직접 설정'}
                  </button>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={S.editSectionLabel}>~ 종료 {form.end_time ? form.end_time.slice(0, 5) : ''}</div>
                  <div style={S.editChipRow}>
                    {DURATION_OPTIONS.map(o => (
                      <button
                        key={o.min}
                        style={{ ...S.editChip, ...(form.duration_minutes === o.min ? S.editChipActive : {}) }}
                        onClick={() => setDuration(o.min)}
                      >
                        {o.label}
                      </button>
                    ))}
                    <button
                      style={{ ...S.editChip, ...(form.duration_minutes === 0 ? S.editChipActive : {}) }}
                      onClick={() => { setDuration(0); openTimePicker('end') }}
                    >
                      {form.duration_minutes === 0 && form.end_time ? form.end_time.slice(0, 5) : '직접 설정'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {editField === 'max_people' && (
              <div style={S.editStepper}>
                <button style={S.editStepperBtn} onClick={() => stepPeople(-1)} disabled={form.max_people <= MIN_PEOPLE} aria-label="인원 줄이기">−</button>
                <span style={S.editStepperNum}>{form.max_people}명</span>
                <button style={S.editStepperBtn} onClick={() => stepPeople(1)} disabled={form.max_people >= MAX_PEOPLE} aria-label="인원 늘리기">+</button>
              </div>
            )}

            {editField === 'memo' && (
              <input
                style={S.editSectionInput}
                placeholder="메모 (선택, 예: 1층 로비 집합, 더치페이)"
                value={form.memo}
                onChange={e => set('memo', e.target.value)}
                maxLength={50}
                autoFocus
              />
            )}

            <div style={S.dialogBtns}>
              <button style={S.dialogBtnPrimary} onClick={() => setEditField(null)}>완료</button>
            </div>
          </div>
        </div>
      )}

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
              <button style={{ ...S.dialogBtnPrimary, background: 'var(--color-danger)', boxShadow: '0 4px 14px rgba(244,67,54,0.32)' }} onClick={() => handleDelete(confirmDelete)} disabled={saving}>
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
  // TabLayout으로 감싸이지 않는 최상위 라우트라 #root의 min-height:100dvh(플로어일 뿐,
  // 상한이 없음)에 기대면 콘텐츠가 길어질 때 이 div까지 같이 늘어나 footer가 뷰포트
  // 하단이 아니라 "늘어난 페이지의 끝"에 걸린다. height를 뷰포트로 못박고 overflow:hidden을
  // 줘야 body의 overflowY:auto만 내부 스크롤되고 header/footer가 실제로 고정된다.
  page: { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },

  header: {
    padding: '10px 16px', paddingTop: 'calc(10px + var(--safe-area-inset-top))', display: 'flex', alignItems: 'center', gap: 10,
    position: 'sticky', top: 0, zIndex: 10, background: 'rgba(250,248,245,0.95)',
    borderBottom: '1px solid var(--color-border)', backdropFilter: 'blur(8px)',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-border)',
    color: 'var(--color-text-muted)', fontSize: 20, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0,
    lineHeight: 1,
  },
  headerTitle: { fontFamily: 'var(--font-title)', fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },
  headerSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },

  body: { flex: 1, overflowY: 'auto', paddingBottom: 20 },
  hero: { padding: '10px 16px 6px', fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  /* Hero card — 일반 밥팟 만들기/상세 화면과 동일한 스타일 */
  heroCard: { margin: '0 16px', background: 'linear-gradient(135deg, #FFF4EF 0%, #FFE8DC 100%)', border: '1.5px solid #FFD6C0', borderRadius: 20, padding: 18 },

  heroTagRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  chipWrap: { position: 'relative', display: 'inline-flex' },
  chipBtn: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 400, background: '#0D9488', borderRadius: 999,
    padding: '6px 14px', color: '#fff', border: 'none',
    cursor: 'pointer', fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  // 그룹은 URL로 이미 고정돼 있어 선택할 수 없다 — 칩 모양은 맞추되 대비를 낮춰 비활성 느낌만 준다.
  chipBtnStatic: {
    fontSize: 'var(--font-size-2xs)', fontWeight: 400, background: 'rgba(13,148,136,0.5)', borderRadius: 999,
    padding: '6px 14px', color: '#fff',
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
    display: 'inline-flex', alignItems: 'center', gap: 5,
  },
  pickerOverlay: { position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' },
  pickerDropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 91, minWidth: 140, maxWidth: 220,
    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)', padding: 4,
  },
  pickerItem: {
    display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box',
    padding: '9px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none',
    border: 'none', color: 'var(--color-text)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
    fontFamily: 'inherit', whiteSpace: 'nowrap', textAlign: 'left',
  },
  pickerItemActive: { color: 'var(--color-selected)', fontWeight: 800, background: 'var(--color-chip-bg)' },
  heroHeader: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 },
  heroIcon: {
    width: 60, height: 60, borderRadius: '50%', border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 900, color: 'var(--color-text)', letterSpacing: '-0.5px' },
  heroSlot: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: 2 },
  heroEditBadge: {
    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, alignSelf: 'flex-start',
    background: 'rgba(255,255,255,0.9)', color: 'var(--color-primary-text)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  infoPanel: { position: 'relative', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-md)', padding: '10px 12px' },
  infoPanelFull: { gridColumn: '1 / -1' },
  infoPanelEditable: { cursor: 'pointer', paddingRight: 26 },
  infoPanelEditBadge: {
    position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
    background: 'rgba(255,255,255,0.9)', color: 'var(--color-primary-text)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoPanelRow: { display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap', overflow: 'hidden' },
  infoPanelLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 },
  infoPanelValue: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis' },

  editSectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 7 },
  editChipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  editChip: {
    padding: '5px 10px', background: 'var(--color-chip-bg)', border: 'none',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  editChipActive: { background: 'var(--color-selected)', fontWeight: 700, color: 'var(--color-on-selected)' },

  editStepper: { display: 'flex', alignItems: 'center', gap: 10 },
  editStepperBtn: { width: 26, height: 26, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'var(--color-bg)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', lineHeight: 1 },
  editStepperNum: {
    fontWeight: 800, fontSize: 'var(--font-size-xs)', minWidth: 44, textAlign: 'center',
    padding: '3px 0', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--color-selected)', color: 'var(--color-selected)',
  },
  editSectionInput: {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)',
    color: 'var(--color-text)', boxSizing: 'border-box',
  },

  /* 그룹 기본 밥팟 전용 — 일반 밥팟에는 없는 추가 입력(공개 범위/적용 시작일/반복 요일) */
  sections: { padding: '12px 16px 0', display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 12 },
  section: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10 },
  sectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 7 },

  chipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  chip: {
    padding: '5px 10px', background: 'var(--color-chip-bg)', border: 'none',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  chipActive: { background: 'var(--color-selected)', fontWeight: 700, color: 'var(--color-on-selected)' },

  sectionInput: {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)',
    color: 'var(--color-text)', boxSizing: 'border-box',
  },

  groupRow: { display: 'flex', gap: 6 },
  groupBtn: {
    flex: 1, padding: '6px 6px', background: 'var(--color-surface)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.2px',
  },
  groupOnlyActive: { background: 'var(--color-surface-2)', border: '1.5px solid var(--color-text-muted)', fontWeight: 700, color: 'var(--color-text)' },
  publicActive: { background: 'var(--color-info-bg)', border: '1.5px solid var(--color-info)', fontWeight: 700, color: 'var(--color-info)' },
  hint: { fontSize: 'var(--font-size-2xs)', fontWeight: 500, color: 'var(--color-text-muted)', opacity: 0.8 },

  submitBtn: { ...PRIMARY_ACTION_BUTTON },
  footer: { flexShrink: 0, padding: '10px 16px calc(10px + var(--safe-area-inset-bottom))', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column', gap: 8 },
  deleteBtn: { ...DESTRUCTIVE_ACTION_BUTTON, padding: 14 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  timeDialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { ...PRIMARY_ACTION_BUTTON },

  dialog: { width: '100%', maxWidth: 360, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
