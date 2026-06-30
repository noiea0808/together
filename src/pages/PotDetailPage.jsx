import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getPot, joinPot, leavePotWithCleanup, updatePot, updatePotCreator, deletePot, getMyPotsForSlotAllGroups, generatePotInviteCode, setGroupShareSetting, joinPotAsGuest } from '../lib/db'
import { invalidateCache } from '../lib/cache'
import { useScrollLock } from '../lib/useScrollLock'
import { useEscKey } from '../lib/useEscKey'
import CarouselPicker, { CAROUSEL_AMPM, CAROUSEL_HOURS, CAROUSEL_MINUTES, getCarouselTime, carouselTimeToStr } from '../components/CarouselPicker'

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

const DURATION_OPTIONS = [
  { min: 30, label: '30분' },
  { min: 60, label: '1시간' },
  { min: 90, label: '1.5시간' },
  { min: 120, label: '2시간' },
]

function durationOf(start, end) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

// 인라인 편집 가능한 필드 컴포넌트
const iStyles = {
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--color-border)' },
  label: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', width: 52, flexShrink: 0 },
  valueWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 'var(--font-size-base)', fontWeight: 600 },
  editBtn: { fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 },
}

// 비로그인 방문자용 게이트: 계정 로그인 또는 임시 닉네임 게스트 참여
function GuestGate({ potId, onJoined, navigate }) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGuestJoin = async () => {
    if (!nickname.trim() || loading) return
    setLoading(true); setError(null)
    try {
      const profile = await joinPotAsGuest(potId, nickname.trim())
      onJoined(profile) // UserContext.login → 게스트로 재렌더
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
  page: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-lg)', gap: 8, textAlign: 'center' },
  logo: { fontSize: 52, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 900, margin: 0 },
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', margin: '4px 0 16px' },
  card: { width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)' },
  input: { width: '100%', padding: '13px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' },
  error: { fontSize: 'var(--font-size-xs)', color: '#f44336', margin: 0 },
  guestBtn: { width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  loginLink: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', textDecoration: 'underline', cursor: 'pointer', padding: 4 },
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
  const [confirmKick, setConfirmKick] = useState(null) // { id, nickname }
  const [draft, setDraft] = useState(null) // 편집 중인 값
  const [timePicker, setTimePicker] = useState(null) // null | 'start' | 'end'
  const [pickerSnapshot, setPickerSnapshot] = useState(null)

  // 팝업 열려 있는 동안 배경 스크롤 잠금
  useScrollLock(!!(confirmDelete || conflict || confirmKick || timePicker))
  useEscKey(useCallback(() => {
    if (timePicker) { cancelDetailTimePicker(); return }
    if (confirmKick) { setConfirmKick(null); return }
    if (confirmDelete) { setConfirmDelete(false); return }
    if (conflict) { setConflict(null); return }
    if (showShare) { setShowShare(false); return }
  }, [timePicker, confirmKick, confirmDelete, conflict, showShare]))

  // 내 행동을 오늘 화면에 즉시 반영하기 위해 board 캐시 무효화
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

  // 향후 수정 후 뒤로가기로 돌아왔을 때 최신 데이터 반영
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
  // 기본팟: 첫 번째 비게스트 멤버가 관리자 역할
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

  // draft 초기화 (수정 시작)
  const initDraft = () => {
    if (draft) return
    const mt = pot.meal_time?.slice(0, 5) ?? ''
    const et = pot.end_time?.slice(0, 5) ?? ''
    setDraft({
      meal_time: mt,
      end_time: et,
      duration_minutes: durationOf(mt, et) || 60,
      title: pot.title ?? '',
      menu: pot.menu ?? '',
      memo: pot.memo ?? '',
      max_people: pot.max_people ?? 4,
      is_public: pot.is_public ?? false,
    })
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
        meal_time: draft.meal_time,
        end_time: draft.end_time || null,
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
    const base = draft ?? { meal_time: pot.meal_time?.slice(0,5) ?? '', end_time: pot.end_time?.slice(0,5) ?? '', title: pot.title ?? '', menu: pot.menu ?? '', memo: pot.memo ?? '', max_people: pot.max_people ?? 4, is_public: pot.is_public ?? false }
    setDraft({ ...base, is_public: !(draft?.is_public ?? pot.is_public) })
  }

  // 참여 관련 — 참여 사실은 pot_members로만 기록 (status는 사용자 의향 전용)
  const doJoin = async () => {
    await joinPot(pot.id, user.id)
    // 비공유 상태였다면 해당 일자/슬롯만 공유로 전환
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
        // 비기본팟이고 내가 마지막 멤버였으면 팟이 삭제됨 → 뒤로 이동
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

  // 비로그인 방문자: 게스트 게이트 표시 (계정 로그인 / 게스트 참여 선택)
  if (!user) return <GuestGate potId={id} onJoined={login} navigate={navigate} />

  if (loading) return <div style={styles.loadingPage}>🍚</div>
  if (!pot) return <div style={styles.loadingPage}>밥팟을 찾을 수 없어요.</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        {draft
          ? <button style={styles.headerBtn} onClick={cancelDraft}>취소</button>
          : <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        }
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={styles.headerTitle}>밥팟 상세</span>
          <span style={styles.headerSub}>
            {pot.is_default ? pot.slot : `${pot.date} · ${pot.slot}`}
          </span>
        </div>
        {draft
          ? <button style={{ ...styles.headerBtn, color: 'var(--color-primary)', fontWeight: 800 }} onClick={saveDraft} disabled={actionLoading}>{actionLoading ? '...' : '완료'}</button>
          : pot.is_default
            ? <button style={styles.futureEditBtn} onClick={() => navigate(`/group/${pot.group_id}/settings?${pot.config_id ? `config=${pot.config_id}` : `slot=${pot.slot}`}`)}>향후 수정</button>
            : <span />
        }
      </div>

      <div style={styles.body}>
        {/* 태그 행 */}
        <div style={styles.tagRow}>
          {pot.is_default && <span style={styles.defaultTag}>기본팟</span>}
          <span style={styles.slotTag}>{pot.slot}</span>
          {/* 공개 범위 — 방장만 토글 */}
          {isMaster ? (
            <button
              style={{ ...styles.publicToggle, background: pot.is_public ? '#E3F2FD' : 'var(--color-surface-2)', color: pot.is_public ? '#2196F3' : 'var(--color-text-muted)', borderColor: pot.is_public ? '#2196F3' : 'var(--color-border)' }}
              onClick={togglePublic}
            >
              {pot.is_public ? '🌐 전체 공개' : '🔒 그룹만'}
            </button>
          ) : (
            pot.is_public && <span style={styles.publicTag}>공개</span>
          )}
        </div>

        {/* 필드 */}
        <div style={styles.fields}>
          {[
            { label: '시간', content: canEdit && draft ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" style={styles.inlineTimeBtn} onClick={() => openDetailTimePicker('start')}>
                    {draft.meal_time || '--:--'}
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>~</span>
                  <button type="button" style={{ ...styles.inlineTimeBtn, color: draft.duration_minutes > 0 ? 'var(--color-primary)' : 'var(--color-text)' }} onClick={() => openDetailTimePicker('end')}>
                    {draft.end_time || '--:--'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                  {DURATION_OPTIONS.map(o => {
                    const active = draft.duration_minutes === o.min
                    return (
                      <button key={o.min}
                        style={{ ...styles.durBtn, ...(active ? styles.durBtnActive : {}) }}
                        onClick={() => setDetailDuration(o.min)}>
                        {o.label}
                      </button>
                    )
                  })}
                  <button
                    style={{ ...styles.durBtn, ...(draft.duration_minutes === 0 ? styles.durBtnActive : {}) }}
                    onClick={() => setDetailDuration(0)}>
                    직접입력
                  </button>
                </div>
              </div>
            ) : (
              <span style={iStyles.value} onClick={canEdit ? initDraft : undefined}>
                {pot.meal_time ? `${pot.meal_time.slice(0,5)}${pot.end_time ? ` ~ ${pot.end_time.slice(0,5)}` : ''}` : '미정'}
              </span>
            )},
            { label: '이름', content: canEdit && draft ? (
              <input style={styles.inlineInput} value={draft.title} onChange={e => setD('title', e.target.value)} maxLength={20} />
            ) : (
              <span style={iStyles.value} onClick={canEdit ? initDraft : undefined}>{pot.title}</span>
            )},
            { label: '메뉴', content: canEdit && draft ? (
              <input style={styles.inlineInput} value={draft.menu} onChange={e => setD('menu', e.target.value)} maxLength={20} placeholder="미입력 시 미정" />
            ) : (
              <span style={{ ...iStyles.value, color: pot.menu ? 'var(--color-text)' : 'var(--color-text-muted)' }} onClick={canEdit ? initDraft : undefined}>{pot.menu || '미정'}</span>
            )},
            { label: '최대', content: canEdit && draft ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button style={styles.stepperBtn} onClick={() => setD('max_people', Math.max(participants.length, 2, draft.max_people - 1))}>−</button>
                <span style={{ fontWeight: 700, fontSize: 16, minWidth: 32, textAlign: 'center' }}>{draft.max_people}명</span>
                <button style={styles.stepperBtn} onClick={() => setD('max_people', Math.min(10, draft.max_people + 1))}>+</button>
              </div>
            ) : (
              <span style={iStyles.value} onClick={canEdit ? initDraft : undefined}>{pot.max_people}명</span>
            )},
            { label: '메모', content: canEdit && draft ? (
              <input style={styles.inlineInput} value={draft.memo} onChange={e => setD('memo', e.target.value)} maxLength={50} placeholder="메모 입력" />
            ) : (
              <span style={{ ...iStyles.value, color: pot.memo ? 'var(--color-text)' : 'var(--color-text-muted)' }} onClick={canEdit ? initDraft : undefined}>{pot.memo || '없음'}</span>
            )},
          ].map(({ label, content }) => (
            <div key={label} style={iStyles.row}>
              <span style={iStyles.label}>{label}</span>
              <div style={iStyles.valueWrap}>{content}</div>
              {canEdit && !draft && <button style={iStyles.editBtn} onClick={initDraft}>수정</button>}
            </div>
          ))}
        </div>

        {!pot.is_default && pot.users && (
          <p style={styles.creatorLine}>👑 {pot.users.nickname} 방장</p>
        )}
        {pot.is_default && pot.modifier?.nickname && (
          <p style={styles.creatorLine}>✎ {pot.modifier.nickname} 마지막 수정</p>
        )}

        {/* 인원 점 UI */}
        <div style={styles.dotsSection}>
          <div style={styles.dotsLabel}>{participants.length}/{pot.max_people}명</div>
          <div style={styles.dots}>
            {Array.from({ length: pot.max_people }).map((_, i) => {
              const member = participants[i]
              const isMe = member?.id === user?.id
              const kickable = canKick && member && !isMe
              return (
                <div key={i} style={styles.dotWrapper}>
                  <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ ...styles.dot, background: member ? (isMe ? 'var(--color-primary)' : '#555') : 'var(--color-border)' }}>
                      {member ? member.nickname[0] : ''}
                      {member?.is_guest && <span style={styles.guestBadge}>G</span>}
                    </div>
                    {kickable && (
                      <button
                        style={styles.kickBtn}
                        onClick={e => { e.stopPropagation(); setConfirmKick({ id: member.id, nickname: member.nickname }) }}
                      >✕</button>
                    )}
                  </div>
                  <div style={styles.dotName}>{member?.nickname ?? '　'}</div>
                </div>
              )
            })}
          </div>
        </div>

        {isPotExpired ? (
          <button style={{ ...styles.btn, background: '#E0E0E0', color: '#9E9E9E' }} disabled>
            종료된 밥팟이에요
          </button>
        ) : isJoined ? (
          <button style={{ ...styles.btn, background: 'var(--color-surface-2)', color: 'var(--color-text)' }} onClick={handleJoinToggle} disabled={actionLoading}>
            {actionLoading ? '처리 중...' : '참여 취소'}
          </button>
        ) : (
          <button style={{ ...styles.btn, opacity: isFull ? 0.4 : 1 }} onClick={handleJoinToggle} disabled={isFull || actionLoading}>
            {actionLoading ? '처리 중...' : isFull ? '마감됐어요' : '참여하기 🙋'}
          </button>
        )}

        {!isPotExpired && !user?.is_guest && (
          <button style={styles.shareBtn} onClick={() => setShowShare(v => !v)}>
            📣 {showShare ? '닫기' : '모집하기'}
          </button>
        )}

        {isMaster && !draft && (
          <button style={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            🗑️ 밥팟 삭제
          </button>
        )}

        {showShare && (
          <div style={styles.sharePanel}>
            <div style={styles.shareLabel}>초대 코드</div>
            {pot.invite_code ? (
              <div style={styles.shareRow}>
                <span style={{ ...styles.shareText, fontSize: 22, fontWeight: 800, letterSpacing: 4 }}>{pot.invite_code}</span>
                <button style={{ ...styles.shareCopyBtn, background: copied === 'code' ? '#4CAF50' : 'var(--color-primary)' }} onClick={() => copyText(pot.invite_code, 'code')}>
                  {copied === 'code' ? '✓' : '복사'}
                </button>
              </div>
            ) : (
              <button
                style={{ ...styles.shareCopyBtn, background: 'var(--color-primary)', padding: '8px 16px', fontSize: 13 }}
                onClick={async () => {
                  const code = await generatePotInviteCode(pot.id)
                  setPot(prev => ({ ...prev, invite_code: code }))
                }}
              >
                코드 생성하기
              </button>
            )}
            <div style={{ ...styles.shareLabel, marginTop: 6 }}>밥팟 링크</div>
            <div style={styles.shareRow}>
              <span style={styles.shareText}>{potLink}</span>
              <button style={{ ...styles.shareCopyBtn, background: copied === 'link' ? '#4CAF50' : 'var(--color-primary)' }} onClick={() => copyText(potLink, 'link')}>
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
          <div style={styles.overlay} onClick={cancelDetailTimePicker}>
            <div style={styles.timeDialog} onClick={e => e.stopPropagation()}>
              <div style={styles.timeDialogTitle}>{timePicker === 'start' ? '시작 시간' : '종료 시간'}</div>
              <div style={styles.timeCarouselRow}>
                <CarouselPicker items={CAROUSEL_AMPM} value={ct.ampm} onChange={ampm => update({ ampm })} width={56} />
                <div style={{ width: 4 }} />
                <CarouselPicker items={CAROUSEL_HOURS} value={ct.hour} onChange={hour => update({ hour })} width={56} />
                <span style={styles.timeColon}>:</span>
                <CarouselPicker items={CAROUSEL_MINUTES} value={ct.minute} onChange={minute => update({ minute })} width={56} />
              </div>
              <button style={styles.timeDoneBtn} onClick={confirmDetailTimePicker}>확인</button>
            </div>
          </div>
        )
      })()}

      {/* 멤버 퇴장 확인 */}
      {confirmKick && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <div style={{ fontSize: 36 }}>👋</div>
            <div style={styles.dialogTitle}>{confirmKick.nickname}님을{'\n'}퇴장시킬까요?</div>
            <p style={styles.dialogDesc}>퇴장하면 밥팟에서 제외돼요.</p>
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, background: '#f44336' }} onClick={handleKickMember} disabled={actionLoading}>
                {actionLoading ? '처리 중...' : '퇴장시키기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmKick(null)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 밥팟 삭제 확인 */}
      {confirmDelete && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <div style={{ fontSize: 36 }}>🗑️</div>
            <div style={styles.dialogTitle}>밥팟을 삭제할까요?</div>
            <p style={styles.dialogDesc}>
              {pot.is_default
                ? '오늘 기본 밥팟만 삭제돼요.\n기본 밥팟 설정은 유지되어 내일부터 계속 열려요.'
                : '팟과 참여 기록이 모두 삭제돼요.'}
            </p>
            <div style={styles.dialogBtns}>
              <button style={{ ...styles.dialogBtnPrimary, background: '#f44336' }} onClick={handleDeletePot} disabled={actionLoading}>
                {actionLoading ? '삭제 중...' : '삭제하기'}
              </button>
              <button style={styles.dialogBtnCancel} onClick={() => setConfirmDelete(false)}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 중복 참여 충돌 */}
      {conflict && (
        <div style={styles.overlay}>
          <div style={styles.dialog}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <div style={styles.dialogTitle}>이미 참여 중인 밥팟이 있어요</div>
            <p style={styles.dialogDesc}>
              <strong>{pot.slot}</strong> 슬롯에{'\n'}
              <strong>{conflict.otherPot.meal_time?.slice(0, 5)} {conflict.otherPot.title}</strong>{'\n'}에 이미 참여하고 있어요.
            </p>
            <div style={styles.dialogBtns}>
              <button style={styles.dialogBtnPrimary} onClick={handleConflictLeaveAndJoin} disabled={actionLoading}>기존 밥팟 나가고 여기 참여</button>
              <button style={styles.dialogBtnSecondary} onClick={handleConflictJoinBoth} disabled={actionLoading}>중복 참여하기</button>
              <button style={styles.dialogBtnCancel} onClick={() => setConflict(null)}>참여 취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: { position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerSub: { fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  futureEditBtn: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '5px 12px', cursor: 'pointer' },
  headerBtn: { fontSize: 14, fontWeight: 600, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' },
  body: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', overflowY: 'auto' },

  tagRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  defaultTag: { fontSize: 12, background: '#E8F5E9', borderRadius: 4, padding: '2px 8px', color: '#4CAF50', fontWeight: 600 },
  publicTag: { fontSize: 12, background: '#eee', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  slotTag: { fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  publicToggle: { fontSize: 12, fontWeight: 600, border: '1px solid', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer' },

  fields: { display: 'flex', flexDirection: 'column' },
  inlineInput: { flex: 1, padding: '6px 10px', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' },
  inlineTimeBtn: { flex: 1, padding: '6px 10px', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 600, background: 'var(--color-surface)', color: 'var(--color-text)', cursor: 'pointer', textAlign: 'center' },
  timeDialog: { width: '100%', maxWidth: 320, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  timeDialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  timeCarouselRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 },
  timeColon: { fontSize: 20, fontWeight: 800, color: 'var(--color-text-muted)' },
  timeDoneBtn: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  stepperBtn: { width: 32, height: 32, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  durBtn: { flex: 1, padding: '4px 4px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-full)', background: 'transparent', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-muted)', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' },
  durBtnActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)', fontWeight: 700 },

  creatorLine: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: -4 },
  dotsSection: { padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  dotsLabel: { fontWeight: 700, marginBottom: 'var(--spacing-sm)' },
  dots: { display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' },
  dotWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: { position: 'relative', width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  guestBadge: { position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: '#FF9800', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--color-surface)' },
  kickBtn: { marginTop: 4, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#f44336', color: '#fff', fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  dotName: { fontSize: 10, color: 'var(--color-text-muted)' },
  btn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  shareBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { width: '100%', padding: 14, background: 'none', color: '#f44336', border: '1px solid #f4433640', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  sharePanel: { display: 'flex', flexDirection: 'column', gap: 8, padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  shareLabel: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' },
  shareText: { flex: 1, fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-all', lineHeight: 1.4 },
  shareCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700, cursor: 'pointer' },

  confirmBar: { display: 'flex', gap: 8, padding: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 },
  confirmCancelBtn: { flex: 1, padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  confirmSaveBtn: { flex: 2, padding: 14, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 360, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
