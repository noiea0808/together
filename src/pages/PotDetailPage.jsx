import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getPot, joinPot, leavePotWithCleanup, updatePot, updatePotCreator, deletePot, getMyPotsForSlotAllGroups, generatePotInviteCode, setGroupShareSetting, joinPotAsGuest } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import { SLOT_TIME_PRESETS, DURATION_OPTIONS } from '../lib/potConstants'

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addMinutes(timeStr, minutes) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function avBg(name) {
  const colors = ['#7C3AED', '#0891B2', '#059669', '#D97706', '#DC2626', '#4F46E5', '#DB2777']
  let h = 0
  for (const x of name) h = (h * 31 + x.charCodeAt(0)) & 0xfffff
  return colors[h % colors.length]
}

function durationOf(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function GuestGate({ potId, onJoined, navigate }) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGuestJoin = async () => {
    if (!nickname.trim() || loading) return
    setLoading(true); setError(null)
    try {
      const profile = await joinPotAsGuest(potId, nickname.trim())
      onJoined(profile)
    } catch (e) {
      console.error(e)
      setError('참여에 실패했어요. 잠시 후 다시 시도해주세요.')
      setLoading(false)
    }
  }

  const handleLogin = () => {
    sessionStorage.setItem('returnTo', `/pot/${potId}`)
    navigate('/onboarding')
  }

  return (
    <div style={gateStyles.page}>
      <div style={gateStyles.logo}>🍚</div>
      <h1 style={gateStyles.title}>밥팟에 초대받으셨어요!</h1>
      <p style={gateStyles.sub}>닉네임만 입력하면 바로 참여할 수 있어요.</p>
      <div style={gateStyles.card}>
        <input
          style={gateStyles.input}
          placeholder="사용할 닉네임 (예: 김철수)"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGuestJoin()}
          maxLength={8}
          autoFocus
          disabled={loading}
        />
        {error && <p style={gateStyles.error}>{error}</p>}
        <button
          style={{ ...gateStyles.guestBtn, opacity: nickname.trim() && !loading ? 1 : 0.4 }}
          onClick={handleGuestJoin}
          disabled={!nickname.trim() || loading}
        >
          {loading ? '참여 중...' : '게스트로 참여하기 🙋'}
        </button>
        <button style={gateStyles.loginLink} onClick={handleLogin} disabled={loading}>
          이미 계정이 있어요 · 로그인
        </button>
      </div>
    </div>
  )
}

const gateStyles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8, textAlign: 'center' },
  logo: { fontSize: 52, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 900, margin: 0 },
  sub: { color: '#857B72', fontSize: 'var(--font-size-base)', margin: '4px 0 16px' },
  card: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12, background: '#fff', border: '1.5px solid #EDE8E3', borderRadius: 20, padding: 24 },
  input: { width: '100%', padding: '13px 16px', border: '1.5px solid #EDE8E3', borderRadius: 12, fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' },
  error: { fontSize: 'var(--font-size-sm)', color: '#f44336', margin: 0 },
  guestBtn: { ...PRIMARY_ACTION_BUTTON },
  loginLink: { background: 'none', border: 'none', color: '#857B72', fontSize: 'var(--font-size-base)', textDecoration: 'underline', cursor: 'pointer', padding: 4 },
}

export default function PotDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user, login } = useUser()

  const [pot, setPot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmKick, setConfirmKick] = useState(null)
  const [draft, setDraft] = useState(null)
  const [timePicker, setTimePicker] = useState(null)
  const [pickerSnapshot, setPickerSnapshot] = useState(null)

  useScrollLock(!!(confirmDelete || conflict || confirmKick || timePicker))
  useEscKey(useCallback(() => {
    if (timePicker) { cancelDetailTimePicker(); return }
    if (confirmKick) { setConfirmKick(null); return }
    if (confirmDelete) { setConfirmDelete(false); return }
    if (conflict) { setConflict(null); return }
    if (showShare) { setShowShare(false); return }
  }, [timePicker, confirmKick, confirmDelete, conflict, showShare]))

  const invalidateBoard = () => {
    if (user) invalidateCache(`board:${user.id}:`, { prefix: true })
  }

  const loadPot = async () => {
    try {
      const data = await getPot(id)
      setPot(data)
      setDraft(null)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPot() }, [id])

  useEffect(() => {
    const onPop = () => loadPot()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [id])

  const participants = pot?.pot_members?.map(pm => {
    const groupNickname = pm.users?.group_members?.find(gm => gm.group_id === pot.group_id)?.nickname
    return { id: pm.user_id, nickname: groupNickname || (pm.users?.nickname ?? '?'), is_guest: pm.users?.is_guest }
  }) ?? []
  const isJoined = participants.some(m => m.id === user?.id)
  const isFull = participants.length >= (pot?.max_people ?? 0)
  const isMaster = !pot?.is_default && pot?.created_by === user?.id
  const defaultPotAdmin = pot?.is_default
    ? (pot?.pot_members ?? [])
        .sort((a, b) => new Date(a.joined_at ?? 0) - new Date(b.joined_at ?? 0))
        .find(pm => !pm.users?.is_guest)?.user_id ?? null
    : null
  const isDefaultPotAdmin = pot?.is_default && defaultPotAdmin === user?.id
  const canEdit = isMaster || pot?.is_default
  const canKick = isMaster || isDefaultPotAdmin

  const isPotExpired = (() => {
    if (!pot?.end_time || !pot?.date) return false
    const [h, m] = pot.end_time.slice(0, 5).split(':').map(Number)
    const expiry = new Date(`${pot.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
    return new Date() > expiry
  })()

  const buildDraft = (overrides = {}) => {
    const mt = pot.meal_time?.slice(0, 5) ?? ''
    const et = pot.end_time?.slice(0, 5) ?? ''
    const fallbackStart = mt || SLOT_TIME_PRESETS[pot.slot]?.[0] || '12:00'
    return {
      time_enabled: !!mt,
      meal_time: fallbackStart,
      end_time: et || addMinutes(fallbackStart, 60),
      duration_minutes: durationOf(mt, et) || 60,
      title: pot.title ?? '',
      menu: pot.menu ?? '',
      memo: pot.memo ?? '',
      max_people: pot.max_people ?? 4,
      is_public: pot.is_public ?? false,
      ...overrides,
    }
  }

  const initDraft = () => {
    if (draft) return
    setDraft(buildDraft())
  }

  const openDetailTimePicker = (which) => {
    setPickerSnapshot({ meal_time: draft.meal_time, end_time: draft.end_time, duration_minutes: draft.duration_minutes })
    setTimePicker(which)
  }
  const cancelDetailTimePicker = () => {
    if (pickerSnapshot) setDraft(d => ({ ...d, ...pickerSnapshot }))
    setTimePicker(null); setPickerSnapshot(null)
  }
  const confirmDetailTimePicker = () => { setTimePicker(null); setPickerSnapshot(null) }

  const applyDetailPickerTime = (which, timeStr) => {
    if (which === 'start') {
      setDraft(d => ({
        ...d,
        meal_time: timeStr,
        end_time: d.duration_minutes > 0 ? addMinutes(timeStr, d.duration_minutes) : d.end_time,
      }))
    } else {
      setDraft(d => ({ ...d, end_time: timeStr, duration_minutes: 0 }))
    }
  }

  const setDetailDuration = (min) => {
    setDraft(d => ({
      ...d,
      duration_minutes: min,
      end_time: min > 0 ? addMinutes(d.meal_time, min) : d.end_time,
    }))
  }
  const setD = (key, val) => setDraft(d => ({ ...d, [key]: val }))
  const cancelDraft = () => setDraft(null)

  const saveDraft = async () => {
    if (!draft || actionLoading) return
    setActionLoading(true)
    try {
      await updatePot(pot.id, {
        meal_time: draft.time_enabled ? draft.meal_time : null,
        end_time: draft.time_enabled ? (draft.end_time || null) : null,
        title: draft.title || pot.title,
        menu: draft.menu.trim() || null,
        memo: draft.memo.trim() || null,
        max_people: draft.max_people,
        is_public: draft.is_public,
      }, pot.is_default ? user.id : null)
      invalidateBoard()
      await loadPot()
    } catch (e) { console.error(e) }
    finally { setActionLoading(false) }
  }

  const togglePublic = () => {
    if (!canEdit) return
    if (draft) { setDraft(d => ({ ...d, is_public: !d.is_public })); return }
    setDraft(buildDraft({ is_public: !pot.is_public }))
  }

  const doJoin = async () => {
    await joinPot(pot.id, user.id)
    await setGroupShareSetting(user.id, pot.group_id, pot.date, pot.slot, true).catch(e => console.warn('share setting:', e))
    invalidateBoard()
    await loadPot()
    setActionLoading(false)
  }

  const handleConflictLeaveAndJoin = async () => {
    if (!conflict) return
    setActionLoading(true); setConflict(null)
    await leavePotWithCleanup(conflict.otherPot.id, user.id)
    await doJoin()
  }

  const handleConflictJoinBoth = async () => {
    setActionLoading(true); setConflict(null)
    await doJoin()
  }

  const handleKickMember = async () => {
    if (!confirmKick || actionLoading) return
    setActionLoading(true)
    try {
      await leavePotWithCleanup(pot.id, confirmKick.id)
      invalidateBoard()
      setConfirmKick(null)
      await loadPot()
    } catch (e) { console.error(e) }
    finally { setActionLoading(false) }
  }

  const handleDeletePot = async () => {
    setActionLoading(true)
    try {
      await deletePot(pot.id)
      invalidateBoard()
      navigate(-1)
    } catch (e) { console.error(e) }
    finally { setActionLoading(false) }
  }

  const handleJoinToggle = async () => {
    if (!pot || actionLoading) return
    setActionLoading(true)
    try {
      const dateStr = toDateStr(new Date())
      if (isJoined) {
        if (isMaster) {
          const others = participants.filter(m => m.id !== user.id)
          if (others.length === 0) {
            await deletePot(pot.id)
            invalidateBoard()
            navigate(-1); return
          } else {
            const next = pot.pot_members.filter(pm => pm.user_id !== user.id).sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0]
            await updatePotCreator(pot.id, next.user_id)
          }
        }
        await leavePotWithCleanup(pot.id, user.id)
        invalidateBoard()
        if (!pot.is_default && participants.length <= 1) {
          navigate(-1); return
        }
      } else {
        const myPots = await getMyPotsForSlotAllGroups(user.id, dateStr, pot.slot)
        const otherPot = myPots.find(p => p.pot_id !== pot.id)
        if (otherPot) { setConflict({ otherPot: otherPot.meal_pots }); setActionLoading(false); return }
        await doJoin(); return
      }
      await loadPot()
    } catch (e) { console.error(e) }
    finally { setActionLoading(false) }
  }

  const potLink = `${window.location.origin}/pot/${pot?.id}`
  const copyText = (text, type) => { navigator.clipboard?.writeText(text); setCopied(type); setTimeout(() => setCopied(null), 2000) }

  if (!user) return <GuestGate potId={id} onJoined={login} navigate={navigate} />
  if (loading) return <div style={S.loadingPage}>🍚</div>
  if (!pot) return <div style={S.loadingPage}>밥팟을 찾을 수 없어요.</div>

  const timeStr = pot.meal_time ? `${pot.meal_time.slice(0,5)}${pot.end_time ? ` ~ ${pot.end_time.slice(0,5)}` : ''}` : '미정'

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <div style={S.header}>
        {draft
          ? <button style={S.headerTextBtn} onClick={cancelDraft}>취소</button>
          : <button style={S.backBtn} onClick={() => navigate(-1)}>‹</button>
        }
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={S.headerTitle}>밥팟 상세</div>
          <div style={S.headerSub}>{pot.is_default ? pot.slot : `${pot.date} · ${pot.slot}`}</div>
        </div>
        {draft
          ? <button style={{ ...S.headerTextBtn, color: '#FF6B35', fontWeight: 800 }} onClick={saveDraft} disabled={actionLoading}>
              {actionLoading ? '...' : '완료'}
            </button>
          : pot.is_default
            ? <button style={S.headerEditPill} onClick={() => navigate(`/group/${pot.group_id}/settings?${pot.config_id ? `config=${pot.config_id}` : `slot=${pot.slot}`}`)}>향후 수정</button>
            : canEdit
            ? <button style={S.headerEditPill} onClick={initDraft}>수정</button>
            : <div style={{ width: 60 }} />
        }
      </div>

      {/* ── Body ── */}
      <div style={S.body}>

        {/* VIEW MODE: hero gradient card */}
        {!draft && (
          <div style={S.heroCard}>
            {/* Tags */}
            <div style={S.heroTagRow}>
              {pot.is_default && <span style={S.defaultTag}>기본팟</span>}
              <span style={S.slotTag}>{pot.slot}</span>
              {isMaster ? (
                <button
                  style={{ ...S.publicToggle, background: pot.is_public ? '#E3F2FD' : '#F5F0EB', color: pot.is_public ? '#2563EB' : '#857B72', borderColor: pot.is_public ? '#2563EB' : '#EDE8E3' }}
                  onClick={togglePublic}
                >
                  {pot.is_public ? '🌐 전체 공개' : '🔒 그룹만'}
                </button>
              ) : (
                pot.is_public && <span style={S.publicTag}>공개</span>
              )}
            </div>
            {/* Icon + title */}
            <div style={S.heroHeader}>
              <div style={S.heroIcon}>🍚</div>
              <div>
                <div style={S.heroTitle}>{pot.title}</div>
                <div style={S.heroSlot}>{pot.slot}</div>
              </div>
            </div>
            {/* 2x2 info grid */}
            <div style={S.infoGrid}>
              {[
                { label: '시간', value: timeStr },
                { label: '메뉴', value: pot.menu || '미정' },
                { label: '최대 인원', value: `${pot.max_people}명` },
                { label: '메모', value: pot.memo || '없음' },
              ].map(({ label, value }) => (
                <div key={label} style={S.infoPanel}>
                  <div style={S.infoPanelLabel}>{label}</div>
                  <div style={S.infoPanelValue}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EDIT MODE: section cards, matching '밥팟 열기' style */}
        {draft && (() => {
          const presets = SLOT_TIME_PRESETS[pot.slot] ?? []
          const isCustomTime = draft.time_enabled && !presets.includes(draft.meal_time)
          return (
            <div style={S.editSections}>
              {/* 시간 */}
              <div style={S.editSection}>
                <div style={S.editSectionLabel}>🕒 언제 먹을까요?</div>
                <div style={S.editChipRow}>
                  {presets.map(t => {
                    const active = draft.time_enabled && draft.meal_time === t
                    return (
                      <button
                        key={t}
                        style={{ ...S.editChip, ...(active ? S.editChipActive : {}) }}
                        onClick={() => { setD('time_enabled', true); applyDetailPickerTime('start', t) }}
                      >
                        {t}
                      </button>
                    )
                  })}
                  <button
                    style={{ ...S.editChip, ...(isCustomTime ? S.editChipActive : {}) }}
                    onClick={() => { setD('time_enabled', true); openDetailTimePicker('start') }}
                  >
                    {isCustomTime ? draft.meal_time : '직접 설정'}
                  </button>
                  <button
                    style={{ ...S.editChip, ...(!draft.time_enabled ? S.editChipActive : {}) }}
                    onClick={() => setD('time_enabled', false)}
                  >
                    미정
                  </button>
                </div>
                {draft.time_enabled && (
                  <div style={{ marginTop: 8 }}>
                    <div style={S.editSectionLabel}>~ 종료 {draft.end_time || ''}</div>
                    <div style={S.editChipRow}>
                      {DURATION_OPTIONS.map(o => (
                        <button
                          key={o.min}
                          style={{ ...S.editChip, ...(draft.duration_minutes === o.min ? S.editChipActive : {}) }}
                          onClick={() => setDetailDuration(o.min)}
                        >
                          {o.label}
                        </button>
                      ))}
                      <button
                        style={{ ...S.editChip, ...(draft.duration_minutes === 0 ? S.editChipActive : {}) }}
                        onClick={() => { setDetailDuration(0); openDetailTimePicker('end') }}
                      >
                        {draft.duration_minutes === 0 && draft.end_time ? draft.end_time : '직접 설정'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 최대 인원 */}
              <div style={{ ...S.editSection, ...S.editSectionRow }}>
                <div style={S.editSectionLabel}>👥 몇 명까지?</div>
                <div style={S.editStepper}>
                  <button style={S.editStepperBtn} onClick={() => setD('max_people', Math.max(participants.length, 2, draft.max_people - 1))}>−</button>
                  <span style={S.editStepperNum}>{draft.max_people}명</span>
                  <button style={S.editStepperBtn} onClick={() => setD('max_people', Math.min(10, draft.max_people + 1))}>+</button>
                </div>
              </div>

              {/* 세부 정보 */}
              <div style={S.editSection}>
                <div style={S.editDetailsRow}>
                  <input
                    style={S.editSectionInput}
                    placeholder="밥팟 이름"
                    value={draft.title}
                    onChange={e => setD('title', e.target.value)}
                    maxLength={20}
                  />
                  <input
                    style={S.editSectionInput}
                    placeholder="메뉴 (선택)"
                    value={draft.menu}
                    onChange={e => setD('menu', e.target.value)}
                    maxLength={20}
                  />
                </div>
                <input
                  style={{ ...S.editSectionInput, marginTop: 6 }}
                  placeholder="한마디 (선택, 예: 빠르게 먹고 와요!)"
                  value={draft.memo}
                  onChange={e => setD('memo', e.target.value)}
                  maxLength={50}
                />
              </div>

              {/* 공개 범위 */}
              <div style={S.editSection}>
                <div style={S.editSectionLabel}>🔓 공개 범위</div>
                <div style={S.editGroupRow}>
                  <button style={{ ...S.editGroupBtn, ...(!draft.is_public ? S.editGroupOnlyActive : {}) }} onClick={() => setD('is_public', false)}>그룹만</button>
                  <button style={{ ...S.editGroupBtn, ...(draft.is_public ? S.editPublicActive : {}) }} onClick={() => setD('is_public', true)}>전체 공개</button>
                </div>
                {draft.is_public && <p style={{ fontSize: 'var(--font-size-2xs)', color: '#2563EB', margin: '6px 0 0' }}>링크로 누구든 참여할 수 있어요.</p>}
              </div>
            </div>
          )
        })()}

        {/* Creator / modifier line */}
        {!pot.is_default && pot.users && (
          <p style={S.creatorLine}>👑 {pot.users.nickname} 방장</p>
        )}
        {pot.is_default && pot.modifier?.nickname && (
          <p style={S.creatorLine}>✎ {pot.modifier.nickname} 마지막 수정</p>
        )}

        {/* Members card */}
        <div style={S.membersCard}>
          <div style={S.membersHeader}>
            <span style={S.membersTitle}>참여 멤버</span>
            <span style={S.membersCount}>{participants.length} / {pot.max_people}명</span>
          </div>
          <div style={S.membersList}>
            {Array.from({ length: pot.max_people }).map((_, i) => {
              const member = participants[i]
              const isMe = member?.id === user?.id
              const kickable = canKick && member && !isMe
              return (
                <div key={i} style={S.memberItem}>
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      ...S.memberCircle,
                      background: member ? (isMe ? '#FF6B35' : avBg(member.nickname)) : '#F5F0EB',
                      border: member ? 'none' : '2px dashed #C7BFB6',
                    }}>
                      {member ? member.nickname[0] : ''}
                      {member?.is_guest && <span style={S.guestBadge}>G</span>}
                    </div>
                    {kickable && (
                      <button
                        style={S.kickBtn}
                        onClick={e => { e.stopPropagation(); setConfirmKick({ id: member.id, nickname: member.nickname }) }}
                      >✕</button>
                    )}
                  </div>
                  <div style={S.memberName}>{member?.nickname ?? ''}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        {isPotExpired ? (
          <div style={S.expiredCard}>종료된 밥팟이에요</div>
        ) : isJoined ? (
          <button style={S.leaveBtn} onClick={handleJoinToggle} disabled={actionLoading}>
            {actionLoading ? '처리 중...' : '참여 취소'}
          </button>
        ) : (
          <button style={{ ...S.joinBtn, opacity: isFull ? 0.4 : 1 }} onClick={handleJoinToggle} disabled={isFull || actionLoading}>
            {actionLoading ? '처리 중...' : isFull ? '마감됐어요' : '참여하기 🙋'}
          </button>
        )}

        {!isPotExpired && !user?.is_guest && (
          <button style={S.shareBtn} onClick={() => setShowShare(v => !v)}>
            📣 {showShare ? '닫기' : '모집하기'}
          </button>
        )}

        {isMaster && !draft && (
          <button style={S.deleteBtn} onClick={() => setConfirmDelete(true)}>
            🗑️ 밥팟 삭제
          </button>
        )}

        {showShare && (
          <div style={S.sharePanel}>
            <div style={S.shareLabel}>초대 코드</div>
            {pot.invite_code ? (
              <div style={S.shareRow}>
                <span style={{ ...S.shareText, fontSize: 22, fontWeight: 800, letterSpacing: 4 }}>{pot.invite_code}</span>
                <button style={{ ...S.shareCopyBtn, background: copied === 'code' ? '#4CAF50' : '#FF6B35' }} onClick={() => copyText(pot.invite_code, 'code')}>
                  {copied === 'code' ? '✓' : '복사'}
                </button>
              </div>
            ) : (
              <button
                style={{ ...S.shareCopyBtn, background: '#FF6B35', padding: '8px 16px', fontSize: 13 }}
                onClick={async () => {
                  const code = await generatePotInviteCode(pot.id)
                  setPot(prev => ({ ...prev, invite_code: code }))
                }}
              >
                코드 생성하기
              </button>
            )}
            <div style={{ ...S.shareLabel, marginTop: 6 }}>밥팟 링크</div>
            <div style={S.shareRow}>
              <span style={S.shareText}>{potLink}</span>
              <button style={{ ...S.shareCopyBtn, background: copied === 'link' ? '#4CAF50' : '#FF6B35' }} onClick={() => copyText(potLink, 'link')}>
                {copied === 'link' ? '✓' : '복사'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 시간 캐러셀 팝업 */}
      {timePicker && draft && (() => {
        const ct = getCarouselTime(timePicker === 'start' ? draft.meal_time : draft.end_time)
        const update = (patch) => applyDetailPickerTime(timePicker, carouselTimeToStr({ ...ct, ...patch }))
        return (
          <div style={S.overlay} onClick={cancelDetailTimePicker}>
            <div style={S.timeDialog} onClick={e => e.stopPropagation()}>
              <div style={S.timeDialogTitle}>{timePicker === 'start' ? '시작 시간' : '종료 시간'}</div>
              <div style={S.timeCarouselRow}>
                <CarouselPicker items={CAROUSEL_AMPM} value={ct.ampm} onChange={ampm => update({ ampm })} width={56} />
                <div style={{ width: 4 }} />
                <CarouselPicker items={CAROUSEL_HOURS} value={ct.hour} onChange={hour => update({ hour })} width={56} />
                <span style={S.timeColon}>:</span>
                <CarouselPicker items={CAROUSEL_MINUTES} value={ct.minute} onChange={minute => update({ minute })} width={56} />
              </div>
              <button style={S.timeDoneBtn} onClick={confirmDetailTimePicker}>확인</button>
            </div>
          </div>
        )
      })()}

      {/* 멤버 퇴장 확인 */}
      {confirmKick && (
        <div style={S.overlay}>
          <div style={S.dialog}>
            <div style={{ fontSize: 36 }}>👋</div>
            <div style={S.dialogTitle}>{confirmKick.nickname}님을{'\n'}퇴장시킬까요?</div>
            <p style={S.dialogDesc}>퇴장하면 밥팟에서 제외돼요.</p>
            <div style={S.dialogBtns}>
              <button style={{ ...S.dialogBtnPrimary, background: '#f44336' }} onClick={handleKickMember} disabled={actionLoading}>
                {actionLoading ? '처리 중...' : '퇴장시키기'}
              </button>
              <button style={S.dialogBtnCancel} onClick={() => setConfirmKick(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 밥팟 삭제 확인 */}
      {confirmDelete && (
        <div style={S.overlay}>
          <div style={S.dialog}>
            <div style={{ fontSize: 36 }}>🗑️</div>
            <div style={S.dialogTitle}>밥팟을 삭제할까요?</div>
            <p style={S.dialogDesc}>
              {pot.is_default
                ? '오늘 기본 밥팟만 삭제돼요.\n기본 밥팟 설정은 유지되어 내일부터 계속 열려요.'
                : '팟과 참여 기록이 모두 삭제돼요.'}
            </p>
            <div style={S.dialogBtns}>
              <button style={{ ...S.dialogBtnPrimary, background: '#f44336' }} onClick={handleDeletePot} disabled={actionLoading}>
                {actionLoading ? '삭제 중...' : '삭제하기'}
              </button>
              <button style={S.dialogBtnCancel} onClick={() => setConfirmDelete(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 중복 참여 충돌 */}
      {conflict && (
        <div style={S.overlay}>
          <div style={S.dialog}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <div style={S.dialogTitle}>이미 참여 중인 밥팟이 있어요</div>
            <p style={S.dialogDesc}>
              <strong>{pot.slot}</strong> 슬롯에{'\n'}
              <strong>{conflict.otherPot.meal_time?.slice(0, 5)} {conflict.otherPot.title}</strong>{'\n'}에 이미 참여하고 있어요.
            </p>
            <div style={S.dialogBtns}>
              <button style={S.dialogBtnPrimary} onClick={handleConflictLeaveAndJoin} disabled={actionLoading}>기존 밥팟 나가고 여기 참여</button>
              <button style={S.dialogBtnSecondary} onClick={handleConflictJoinBoth} disabled={actionLoading}>중복 참여하기</button>
              <button style={S.dialogBtnCancel} onClick={() => setConflict(null)}>참여 취소</button>
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
    position: 'sticky', top: 0, background: 'rgba(250,248,245,0.95)', zIndex: 10,
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
  headerTextBtn: { fontSize: 'var(--font-size-base)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', whiteSpace: 'nowrap' },
  headerEditPill: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', background: '#FFF4EF', border: '1px solid #FFD6C0', borderRadius: 'var(--radius-full)', padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, whiteSpace: 'nowrap' },

  body: { flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingBottom: 80 },

  /* Hero card (view mode) */
  heroCard: { background: 'linear-gradient(135deg, #FFF4EF 0%, #FFE8DC 100%)', border: '1.5px solid #FFD6C0', borderRadius: 20, padding: 18 },
  heroTagRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, flexWrap: 'wrap' },
  defaultTag: { fontSize: 'var(--font-size-xs)', background: '#E8F5E9', borderRadius: 6, padding: '2px 8px', color: '#4CAF50', fontWeight: 700 },
  slotTag: { fontSize: 'var(--font-size-xs)', background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '2px 8px', color: '#857B72' },
  publicTag: { fontSize: 'var(--font-size-xs)', background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: '2px 8px', color: '#857B72' },
  publicToggle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, border: '1px solid', borderRadius: 99, padding: '3px 10px', cursor: 'pointer' },
  heroHeader: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 },
  heroIcon: { width: 48, height: 48, background: 'var(--color-primary)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 },
  heroTitle: { fontSize: 'var(--font-size-lg)', fontWeight: 900, color: 'var(--color-text)', letterSpacing: '-0.5px' },
  heroSlot: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 700, marginTop: 2 },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  infoPanel: { background: 'rgba(255,255,255,0.7)', borderRadius: 'var(--radius-md)', padding: '10px 12px' },
  infoPanelLabel: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 3, fontWeight: 600 },
  infoPanelValue: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  /* Edit sections (matches '밥팟 열기' style) */
  editSections: { display: 'flex', flexDirection: 'column', gap: 6 },
  editSection: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10 },
  editSectionRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  editSectionLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 7 },

  editChipRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  editChip: {
    padding: '5px 10px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
  },
  editChipActive: { background: '#FFF4EF', border: '1.5px solid var(--color-primary)', fontWeight: 700, color: 'var(--color-primary)' },

  editStepper: { display: 'flex', alignItems: 'center', gap: 10 },
  editStepperBtn: { width: 26, height: 26, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'var(--color-bg)', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)', lineHeight: 1 },
  editStepperNum: { fontWeight: 700, fontSize: 'var(--font-size-sm)', minWidth: 30, textAlign: 'center' },

  editDetailsRow: { display: 'flex', gap: 6 },
  editSectionInput: {
    width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--font-size-xs)', outline: 'none', fontFamily: 'inherit', background: 'var(--color-bg)',
    color: 'var(--color-text)', boxSizing: 'border-box',
  },

  editGroupRow: { display: 'flex', gap: 6 },
  editGroupBtn: {
    flex: 1, padding: '6px 6px', background: 'var(--color-bg)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: '-0.2px',
  },
  editGroupOnlyActive: { background: 'var(--color-surface-2)', border: '1.5px solid var(--color-text-muted)', fontWeight: 700, color: 'var(--color-text)' },
  editPublicActive: { background: '#E3F2FD', border: '1.5px solid #2563EB', fontWeight: 700, color: '#2563EB' },

  creatorLine: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: '-6px 0 0' },

  /* Members card */
  membersCard: { background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: 18, padding: 16 },
  membersHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  membersTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },
  membersCount: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  membersList: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  memberItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  memberCircle: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-base)', position: 'relative' },
  guestBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#FF9800', color: '#fff', fontSize: 'var(--font-size-xs)', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' },
  kickBtn: { position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#f44336', color: '#fff', fontSize: 'var(--font-size-xs)', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  memberName: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },

  /* Action buttons */
  joinBtn: { ...PRIMARY_ACTION_BUTTON },
  leaveBtn: { width: '100%', padding: 16, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  expiredCard: { background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: 15, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', fontWeight: 700, letterSpacing: '-0.2px' },
  shareBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { width: '100%', padding: 14, background: 'none', color: '#f44336', border: '1px solid #f4433640', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },

  /* Share panel */
  sharePanel: { display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  shareLabel: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' },
  shareText: { flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--color-text)', wordBreak: 'break-all', lineHeight: 1.4 },
  shareCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-2xs)', fontWeight: 700, cursor: 'pointer' },

  /* Carousel popup */
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  timeDialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-sm)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },

  /* Dialogs */
  dialog: { width: '100%', maxWidth: 360, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', whiteSpace: 'pre-line' },
  dialogDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
