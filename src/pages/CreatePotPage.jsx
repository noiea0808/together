import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { createPot, joinPot, setGroupShareSetting, getMyGroups } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import { SLOT_TIME_PRESETS, DURATION_OPTIONS } from '../lib/potConstants'
import RiceBowlIcon from '../components/RiceBowlIcon'
import PotIcon from '../components/PotIcon'
import AutoTextarea from '../components/AutoTextarea'
import PotIconPicker from '../components/PotIconPicker'

const MIN_PEOPLE = 2
const MAX_PEOPLE = 8
const DEFAULT_PEOPLE = 6

// 슬롯별 유머러스한 기본 제목 프리셋 — 그룹에서 밥팟을 열 때 빈칸 대신 미리 채워두고, 아이콘과 함께 자유롭게 수정할 수 있다.
const TITLE_PRESETS = {
  '아침': [
    { title: '아침 든든하게 갑시다', icon: 'ready' },
    { title: '굶고 오면 반칙이에요', icon: 'together' },
    { title: '해 뜨자마자 집합', icon: 'party' },
  ],
  '오전간식': [
    { title: '당 떨어지기 전에 모여요', icon: 'tray' },
    { title: '커피 말고 뭐 없나', icon: 'chat' },
    { title: '잠깐 당 충전 타임', icon: 'salad' },
  ],
  '점심': [
    { title: '오늘 뭐 먹지 고민 끝', icon: 'together' },
    { title: '약속없는 사람 모여라', icon: 'party' },
    { title: '밥은 먹고 다니냐', icon: 'care' },
    { title: '점심 메뉴 뽑기 대회', icon: 'random' },
  ],
  '오후간식': [
    { title: '3시의 위기 탈출조', icon: 'salad' },
    { title: '당 떨어지면 다 무너져요', icon: 'tray' },
    { title: '오후 당충전 부대', icon: 'party' },
  ],
  '저녁': [
    { title: '칼퇴 기념 저녁', icon: 'party' },
    { title: '야근 전에 든든하게', icon: 'ready' },
    { title: '저녁 같이 드실 분', icon: 'together' },
  ],
  '야식': [
    { title: '야근 동지 야식 모임', icon: 'delivery' },
    { title: '출출한 사람 모여라', icon: 'chat' },
    { title: '새벽 배 채우기 원정대', icon: 'map' },
  ],
}

function randomTitlePreset(slot) {
  const list = TITLE_PRESETS[slot] ?? TITLE_PRESETS['점심']
  return list[Math.floor(Math.random() * list.length)]
}

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

function addMins(timeStr, minutes) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

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

  const initialSlot = searchParams.get('slot') ?? '점심'
  const initialDate = searchParams.get('date') ?? toDateStr(new Date())
  const initialTime = defaultTimeForSlot(initialSlot)

  const [groups, setGroups] = useState([])
  const [groupId, setGroupId] = useState(searchParams.get('group_id') ?? '')
  const [showGroupPicker, setShowGroupPicker] = useState(false)

  useEffect(() => {
    getMyGroups(user.id).then(list => {
      setGroups(list)
      setGroupId(prev => prev || list[0]?.id || '')
    })
  }, [user.id])

  const [form, setForm] = useState(() => {
    const preset = randomTitlePreset(initialSlot)
    return {
      slot: initialSlot,
      meal_time: initialTime,
      end_time: addMins(initialTime, 60),
      duration_minutes: 60,
      title: preset.title,
      icon: preset.icon,
      menu: '',
      memo: '',
      max_people: DEFAULT_PEOPLE,
    }
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [timeEnabled, setTimeEnabled] = useState(true)
  const [editField, setEditField] = useState(null)
  const [timePicker, setTimePicker] = useState(null)
  const [pickerSnapshot, setPickerSnapshot] = useState(null)

  useScrollLock(!!timePicker || !!editField)
  useEscKey(useCallback(() => {
    if (timePicker) { cancelTimePicker(); return }
    if (editField) { setEditField(null); return }
    if (showGroupPicker) setShowGroupPicker(false)
  }, [timePicker, editField, showGroupPicker]))

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

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

  const setStartTime = (val) => {
    setForm(f => ({
      ...f,
      meal_time: val,
      end_time: f.duration_minutes > 0 ? addMins(val, f.duration_minutes) : f.end_time,
    }))
  }

  const applyPickerTime = (which, timeStr) => {
    if (which === 'start') setStartTime(timeStr)
    else setForm(f => ({ ...f, end_time: timeStr, duration_minutes: 0 }))
  }

  const setDuration = (min) => setForm(f => ({
    ...f,
    duration_minutes: min,
    end_time: min > 0 ? addMins(f.meal_time, min) : f.end_time,
  }))

  const stepPeople = (delta) => set('max_people', Math.max(MIN_PEOPLE, Math.min(MAX_PEOPLE, form.max_people + delta)))

  const doCreate = async () => {
    setLoading(true)
    setError(null)
    try {
      const pot = await createPot({
        groupId,
        date: initialDate,
        slot: form.slot,
        meal_time: timeEnabled ? form.meal_time : null,
        end_time: timeEnabled ? form.end_time : null,
        title: form.title.trim() || `${form.slot} ${form.meal_time}`,
        menu: form.menu.trim(),
        memo: form.memo.trim(),
        max_people: form.max_people,
        is_public: false,
        is_default: false,
        createdBy: user.id,
        icon: form.icon,
      })
      await joinPot(pot.id, user.id)
      await setGroupShareSetting(user.id, groupId, initialDate, true).catch(() => {})
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
    if (!groupId || loading) return
    await doCreate()
  }

  const presets = SLOT_TIME_PRESETS[form.slot] ?? []
  const isCustomTime = timeEnabled && !presets.includes(form.meal_time)
  const timeValue = timeEnabled ? `${form.meal_time} ~ ${(form.end_time || '').slice(0, 5)}` : '미정'
  const selectedGroup = groups.find(g => g.id === groupId)

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)} aria-label="뒤로가기">‹</button>
        <div style={S.headerTitle}>밥팟 만들기</div>
        <div style={{ width: 34 }} />
      </div>

      <div style={S.body}>
        <div style={S.hero}>오늘 같이 밥 먹어요 <RiceBowlIcon size={18} /></div>

        <div style={S.heroCard}>
          <div style={S.heroTagRow}>
            <span style={S.slotTag}>{form.slot}</span>
            <div style={S.groupPickerWrap}>
              <button type="button" style={S.groupTagBtn} onClick={() => setShowGroupPicker(v => !v)}>
                {selectedGroup?.name ?? '그룹 선택'}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showGroupPicker && (
                <>
                  <div style={S.groupPickerOverlay} onClick={() => setShowGroupPicker(false)} />
                  <div style={S.groupPickerDropdown}>
                    {groups.map(g => (
                      <button
                        key={g.id}
                        type="button"
                        style={{ ...S.groupPickerItem, ...(g.id === groupId ? S.groupPickerItemActive : {}) }}
                        onClick={() => { setGroupId(g.id); setShowGroupPicker(false) }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={S.heroHeader}>
            <div style={S.heroIcon}>{form.icon ? <PotIcon icon={form.icon} size={56} /> : <RiceBowlIcon size={56} />}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.heroTitle}>{form.title}</div>
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
              { key: 'menu', label: '메뉴', value: form.menu || '미정', full: true },
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

        <button
          style={{ ...S.submitBtn, ...S.submitBtnInline, opacity: loading ? 0.4 : 1 }}
          onClick={handleCreate}
          disabled={loading}
        >
          {loading ? '생성 중...' : <>밥팟 열기 <RiceBowlIcon size={18} /></>}
        </button>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', margin: '10px 16px 0' }}>{error}</p>}
      </div>

      {/* 개별 수정 팝업 — 아이콘·이름 / 시간 / 최대 인원 / 메뉴 / 메모 */}
      {editField && (
        <div style={S.overlay} onClick={() => setEditField(null)}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={S.dialogTitle}>
              {{ title: '🖼️ 아이콘 · 이름 수정', time: '🕒 시간 수정', menu: '🍽️ 메뉴 수정', max_people: '👥 최대 인원 수정', memo: '📝 메모 수정' }[editField]}
            </div>

            {editField === 'title' && (
              <div style={{ width: '100%' }}>
                <PotIconPicker value={form.icon} onChange={v => set('icon', v)} />
                <input
                  style={{ ...S.editSectionInput, width: '100%', marginTop: 10 }}
                  placeholder="밥팟 이름"
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
                    const active = timeEnabled && form.meal_time === t
                    return (
                      <button
                        key={t}
                        style={{ ...S.editChip, ...(active ? S.editChipActive : {}) }}
                        onClick={() => { setTimeEnabled(true); setStartTime(t) }}
                      >
                        {t}
                      </button>
                    )
                  })}
                  <button
                    style={{ ...S.editChip, ...(isCustomTime ? S.editChipActive : {}) }}
                    onClick={() => { setTimeEnabled(true); openTimePicker('start') }}
                  >
                    {isCustomTime ? form.meal_time : '직접 설정'}
                  </button>
                  <button
                    style={{ ...S.editChip, ...(!timeEnabled ? S.editChipActive : {}) }}
                    onClick={() => setTimeEnabled(false)}
                  >
                    미정
                  </button>
                </div>
                {timeEnabled && (
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
                )}
              </div>
            )}

            {editField === 'menu' && (
              <input
                style={S.editSectionInput}
                placeholder="메뉴 (선택)"
                value={form.menu}
                onChange={e => set('menu', e.target.value)}
                maxLength={20}
                autoFocus
              />
            )}

            {editField === 'max_people' && (
              <div style={S.editStepper}>
                <button style={S.editStepperBtn} onClick={() => stepPeople(-1)} disabled={form.max_people <= MIN_PEOPLE} aria-label="인원 줄이기">−</button>
                <span style={S.editStepperNum}>{form.max_people}명</span>
                <button style={S.editStepperBtn} onClick={() => stepPeople(1)} disabled={form.max_people >= MAX_PEOPLE} aria-label="인원 늘리기">+</button>
              </div>
            )}

            {editField === 'memo' && (
              <AutoTextarea
                style={{ ...S.editSectionInput, width: '100%' }}
                placeholder="한마디 (선택, 예: 빠르게 먹고 와요!)"
                value={form.memo}
                onChange={e => set('memo', e.target.value)}
                maxLength={200}
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
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  header: {
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
    position: 'sticky', top: 0, background: 'rgba(250,248,245,0.95)', zIndex: 10,
    borderBottom: '1px solid var(--color-border)', backdropFilter: 'blur(8px)',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-border)',
    color: 'var(--color-text-muted)', fontSize: 20, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0,
    lineHeight: 1,
  },
  headerTitle: { fontFamily: 'var(--font-title)', flex: 1, textAlign: 'center', fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  body: { flex: 1, overflowY: 'auto', paddingBottom: 20 },
  hero: { padding: '10px 16px 6px', fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  /* Hero card — 밥팟 상세 화면과 동일한 스타일 */
  heroCard: { margin: '0 16px', background: 'linear-gradient(135deg, #FFF4EF 0%, #FFE8DC 100%)', border: '1.5px solid #FFD6C0', borderRadius: 20, padding: 18 },
  heroTagRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  slotTag: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, background: 'rgba(255,255,255,0.85)', borderRadius: 6,
    padding: '3px 9px', color: 'var(--color-primary-dark)', border: '1px solid rgba(255,107,53,0.3)',
  },
  groupPickerWrap: { position: 'relative', display: 'inline-flex' },
  groupTagBtn: {
    fontSize: 'var(--font-size-xs)', fontWeight: 700, background: 'rgba(255,255,255,0.85)', borderRadius: 6,
    padding: '3px 9px', color: 'var(--color-primary-dark)', border: '1px solid rgba(255,107,53,0.3)',
    cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3,
  },
  groupPickerOverlay: { position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' },
  groupPickerDropdown: {
    position: 'absolute', top: 26, left: 0, zIndex: 91, minWidth: 140,
    background: '#fff', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.12)', padding: 4,
  },
  groupPickerItem: {
    display: 'flex', alignItems: 'center', width: '100%', boxSizing: 'border-box',
    padding: '9px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none',
    border: 'none', color: 'var(--color-text)', fontSize: 'var(--font-size-xs)', fontWeight: 600,
    fontFamily: 'inherit', whiteSpace: 'nowrap', textAlign: 'left',
  },
  groupPickerItemActive: { color: 'var(--color-primary)', fontWeight: 800, background: '#FFF4EF' },
  heroHeader: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 },
  heroIcon: {
    width: 60, height: 60, borderRadius: '50%', border: '1.5px solid var(--color-border)',
    background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  heroTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 900, color: 'var(--color-text)', letterSpacing: '-0.5px' },
  heroSlot: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 700, marginTop: 2 },
  heroEditBadge: {
    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, alignSelf: 'flex-start',
    background: 'rgba(255,255,255,0.9)', color: 'var(--color-primary)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  infoPanel: { position: 'relative', background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-md)', padding: '10px 12px' },
  infoPanelFull: { gridColumn: '1 / -1' },
  infoPanelEditable: { cursor: 'pointer', paddingRight: 26 },
  infoPanelEditBadge: {
    position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
    background: 'rgba(255,255,255,0.9)', color: 'var(--color-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  infoPanelRow: { display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap', overflow: 'hidden' },
  infoPanelLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 600, flexShrink: 0 },
  infoPanelValue: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis' },

  editSectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 7 },
  editChipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  editChip: {
    padding: '5px 10px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  editChipActive: { background: 'var(--color-bg)', border: '2px solid var(--color-primary)', fontWeight: 700, color: 'var(--color-primary)' },

  editStepper: { display: 'flex', alignItems: 'center', gap: 10 },
  editStepperBtn: { width: 26, height: 26, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'var(--color-bg)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', lineHeight: 1 },
  editStepperNum: {
    fontWeight: 800, fontSize: 'var(--font-size-xs)', minWidth: 44, textAlign: 'center',
    padding: '3px 0', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--color-primary)', color: 'var(--color-primary)',
  },
  editSectionInput: {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)',
    color: 'var(--color-text)', boxSizing: 'border-box',
  },

  submitBtn: { ...PRIMARY_ACTION_BUTTON },
  submitBtnInline: { margin: '20px 16px 0', width: 'calc(100% - 32px)' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 360, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },

  timeDialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { ...PRIMARY_ACTION_BUTTON },
}
