import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getPot, joinPot, leavePotWithCleanup, updatePot, updatePotCreator, deletePot, getMyPotsForSlotAllGroups } from '../lib/db'

function toDateStr(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 인라인 편집 가능한 필드 컴포넌트
function InlineField({ label, value, displayValue, editable, renderEditor, onEdit, editing, onSave, onCancel }) {
  return (
    <div style={iStyles.row}>
      <span style={iStyles.label}>{label}</span>
      {editing ? (
        <div style={iStyles.editorWrap}>
          {renderEditor()}
          <button style={iStyles.saveBtn} onClick={onSave}>저장</button>
          <button style={iStyles.cancelBtn} onClick={onCancel}>✕</button>
        </div>
      ) : (
        <div style={iStyles.valueWrap}>
          <span style={{ ...iStyles.value, color: value ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
            {displayValue ?? value ?? '미정'}
          </span>
          {editable && (
            <button style={iStyles.editBtn} onClick={onEdit}>수정</button>
          )}
        </div>
      )}
    </div>
  )
}

const iStyles = {
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--color-border)' },
  label: { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', width: 52, flexShrink: 0 },
  valueWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 'var(--font-size-base)', fontWeight: 600 },
  editBtn: { fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 },
  editorWrap: { flex: 1, display: 'flex', alignItems: 'center', gap: 6 },
  saveBtn: { padding: '6px 12px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  cancelBtn: { padding: '6px 8px', background: 'var(--color-surface-2)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0 },
}

export default function PotDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useUser()

  const [pot, setPot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [copied, setCopied] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // 인라인 편집 상태
  const [editingField, setEditingField] = useState(null) // 'time'|'end_time'|'title'|'menu'|'max_people'|null
  const [fieldValue, setFieldValue] = useState('')
  const [endTimeValue, setEndTimeValue] = useState('')
  const [tempMaxPeople, setTempMaxPeople] = useState(4)
  const [tempIsPublic, setTempIsPublic] = useState(false)

  const loadPot = async () => {
    try {
      const data = await getPot(id)
      setPot(data)
      setTempIsPublic(data.is_public ?? false)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadPot() }, [id])

  const participants = pot?.pot_members?.map(pm => ({ id: pm.user_id, nickname: pm.users?.nickname ?? '?' })) ?? []
  const isJoined = participants.some(m => m.id === user?.id)
  const isFull = participants.length >= (pot?.max_people ?? 0)
  const isMaster = !pot?.is_default && pot?.created_by === user?.id
  const canEdit = isMaster || pot?.is_default

  const isPotExpired = (() => {
    if (!pot?.end_time || !pot?.date) return false
    const [h, m] = pot.end_time.slice(0, 5).split(':').map(Number)
    const expiry = new Date(`${pot.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`)
    return new Date() > expiry
  })()

  const startEdit = (field, value) => {
    setEditingField(field)
    setFieldValue(value ?? '')
    if (field === 'max_people') setTempMaxPeople(pot?.max_people ?? 4)
    if (field === 'time') setEndTimeValue(pot?.end_time?.slice(0, 5) ?? '')
  }
  const cancelEdit = () => setEditingField(null)

  const saveField = async (field) => {
    let patch = {}
    if (field === 'time') patch = { meal_time: fieldValue, end_time: endTimeValue || null, title: pot.title, menu: pot.menu, memo: pot.memo, max_people: pot.max_people, is_public: pot.is_public }
    if (field === 'title') patch = { meal_time: pot.meal_time, end_time: pot.end_time, title: fieldValue || pot.title, menu: pot.menu, memo: pot.memo, max_people: pot.max_people, is_public: pot.is_public }
    if (field === 'menu') patch = { meal_time: pot.meal_time, end_time: pot.end_time, title: pot.title, menu: fieldValue.trim() || null, memo: pot.memo, max_people: pot.max_people, is_public: pot.is_public }
    if (field === 'memo') patch = { meal_time: pot.meal_time, end_time: pot.end_time, title: pot.title, menu: pot.menu, memo: fieldValue.trim() || null, max_people: pot.max_people, is_public: pot.is_public }
    if (field === 'max_people') patch = { meal_time: pot.meal_time, end_time: pot.end_time, title: pot.title, menu: pot.menu, memo: pot.memo, max_people: tempMaxPeople, is_public: pot.is_public }
    try {
      await updatePot(pot.id, patch, pot.is_default ? user.id : null)
      await loadPot()
      setEditingField(null)
    } catch (e) { console.error(e) }
  }

  const togglePublic = async () => {
    const next = !pot.is_public
    setTempIsPublic(next)
    await updatePot(pot.id, { meal_time: pot.meal_time, end_time: pot.end_time, title: pot.title, menu: pot.menu, memo: pot.memo, max_people: pot.max_people, is_public: next })
    await loadPot()
  }

  // 참여 관련 — 참여 사실은 pot_members로만 기록 (status는 사용자 의향 전용)
  const doJoin = async () => {
    await joinPot(pot.id, user.id)
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

  const handleDeletePot = async () => {
    setActionLoading(true)
    try {
      await deletePot(pot.id)
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
            navigate(-1); return
          } else {
            const next = pot.pot_members.filter(pm => pm.user_id !== user.id).sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at))[0]
            await updatePotCreator(pot.id, next.user_id)
          }
        }
        await leavePotWithCleanup(pot.id, user.id)
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
  const kakaoText = pot ? `🍚 ${pot.meal_time?.slice(0, 5)} ${pot.title} · ${participants.length}/${pot.max_people}명 · 같이먹자 → ${potLink}` : ''
  const copyText = (text, type) => { navigator.clipboard?.writeText(text); setCopied(type); setTimeout(() => setCopied(null), 2000) }

  if (loading) return <div style={styles.loadingPage}>🍚</div>
  if (!pot) return <div style={styles.loadingPage}>밥팟을 찾을 수 없어요.</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 상세</span>
        {pot.is_default
          ? <button style={styles.futureEditBtn} onClick={() => navigate(`/group/${pot.group_id}/settings?slot=${pot.slot}`)}>향후 수정</button>
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

        {/* 인라인 편집 필드들 */}
        <div style={styles.fields}>
          {/* 시간 */}
          <InlineField
            label="시간"
            value={pot.meal_time?.slice(0, 5)}
            displayValue={
              pot.meal_time
                ? `${pot.meal_time.slice(0, 5)}${pot.end_time ? ` ~ ${pot.end_time.slice(0, 5)}` : ''}`
                : '미정'
            }
            editable={canEdit}
            editing={editingField === 'time'}
            onEdit={() => startEdit('time', pot.meal_time?.slice(0, 5) ?? '')}
            onSave={() => saveField('time')}
            onCancel={cancelEdit}
            renderEditor={() => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <input type="time" style={styles.inlineInput} value={fieldValue} onChange={e => setFieldValue(e.target.value)} autoFocus />
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>~</span>
                <input type="time" style={styles.inlineInput} value={endTimeValue} onChange={e => setEndTimeValue(e.target.value)} />
              </div>
            )}
          />

          {/* 밥팟 이름 */}
          <InlineField
            label="이름"
            value={pot.title}
            editable={canEdit}
            editing={editingField === 'title'}
            onEdit={() => startEdit('title', pot.title ?? '')}
            onSave={() => saveField('title')}
            onCancel={cancelEdit}
            renderEditor={() => (
              <input style={styles.inlineInput} value={fieldValue} onChange={e => setFieldValue(e.target.value)} maxLength={20} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveField('title'); if (e.key === 'Escape') cancelEdit() }} />
            )}
          />

          {/* 메뉴 */}
          <InlineField
            label="메뉴"
            value={pot.menu}
            displayValue={pot.menu || '미정'}
            editable={canEdit}
            editing={editingField === 'menu'}
            onEdit={() => startEdit('menu', pot.menu ?? '')}
            onSave={() => saveField('menu')}
            onCancel={cancelEdit}
            renderEditor={() => (
              <input style={styles.inlineInput} value={fieldValue} onChange={e => setFieldValue(e.target.value)} maxLength={20} autoFocus placeholder="미입력 시 미정"
                onKeyDown={e => { if (e.key === 'Enter') saveField('menu'); if (e.key === 'Escape') cancelEdit() }} />
            )}
          />

          {/* 최대 인원 */}
          <InlineField
            label="최대"
            value={`${pot.max_people}명`}
            editable={canEdit}
            editing={editingField === 'max_people'}
            onEdit={() => startEdit('max_people')}
            onSave={() => saveField('max_people')}
            onCancel={cancelEdit}
            renderEditor={() => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button style={styles.stepperBtn} onClick={() => setTempMaxPeople(v => Math.max(participants.length, 2, v - 1))}>−</button>
                <span style={{ fontWeight: 700, fontSize: 16, minWidth: 32, textAlign: 'center' }}>{tempMaxPeople}명</span>
                <button style={styles.stepperBtn} onClick={() => setTempMaxPeople(v => Math.min(10, v + 1))}>+</button>
              </div>
            )}
          />

          {/* 메모 */}
          <InlineField
            label="메모"
            value={pot.memo}
            displayValue={pot.memo || '없음'}
            editable={canEdit}
            editing={editingField === 'memo'}
            onEdit={() => startEdit('memo', pot.memo ?? '')}
            onSave={() => saveField('memo')}
            onCancel={cancelEdit}
            renderEditor={() => (
              <input style={styles.inlineInput} value={fieldValue} onChange={e => setFieldValue(e.target.value)} maxLength={50} autoFocus placeholder="메모 입력"
                onKeyDown={e => { if (e.key === 'Enter') saveField('memo'); if (e.key === 'Escape') cancelEdit() }} />
            )}
          />
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
              return (
                <div key={i} style={styles.dotWrapper}>
                  <div style={{ ...styles.dot, background: member ? (isMe ? 'var(--color-primary)' : '#555') : 'var(--color-border)' }}>
                    {member ? member.nickname[0] : ''}
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

        <button style={styles.shareBtn} onClick={() => setShowShare(v => !v)}>
          🔗 {showShare ? '닫기' : '공유하기'}
        </button>

        {(isMaster || pot.is_default) && !isPotExpired && (
          <button style={styles.deleteBtn} onClick={() => setConfirmDelete(true)}>
            🗑️ 밥팟 삭제
          </button>
        )}

        {showShare && (
          <div style={styles.sharePanel}>
            <div style={styles.shareLabel}>밥팟 링크</div>
            <div style={styles.shareRow}>
              <span style={styles.shareText}>{potLink}</span>
              <button style={{ ...styles.shareCopyBtn, background: copied === 'link' ? '#4CAF50' : 'var(--color-primary)' }} onClick={() => copyText(potLink, 'link')}>
                {copied === 'link' ? '✓' : '복사'}
              </button>
            </div>
            <div style={styles.shareLabel}>카톡 공유용</div>
            <div style={styles.shareRow}>
              <span style={{ ...styles.shareText, fontSize: 12 }}>{kakaoText}</span>
              <button style={{ ...styles.shareCopyBtn, background: copied === 'kakao' ? '#4CAF50' : '#FEE500', color: copied === 'kakao' ? '#fff' : '#3C1E1E' }} onClick={() => copyText(kakaoText, 'kakao')}>
                {copied === 'kakao' ? '✓' : '복사'}
              </button>
            </div>
          </div>
        )}
      </div>

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
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  futureEditBtn: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary)12', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '5px 12px', cursor: 'pointer' },
  body: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', overflowY: 'auto' },

  tagRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  defaultTag: { fontSize: 12, background: '#E8F5E9', borderRadius: 4, padding: '2px 8px', color: '#4CAF50', fontWeight: 600 },
  publicTag: { fontSize: 12, background: '#eee', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  slotTag: { fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  publicToggle: { fontSize: 12, fontWeight: 600, border: '1px solid', borderRadius: 'var(--radius-full)', padding: '3px 10px', cursor: 'pointer' },

  fields: { display: 'flex', flexDirection: 'column' },
  inlineInput: { flex: 1, padding: '6px 10px', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 14, outline: 'none' },
  stepperBtn: { width: 32, height: 32, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  creatorLine: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: -4 },
  dotsSection: { padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  dotsLabel: { fontWeight: 700, marginBottom: 'var(--spacing-sm)' },
  dots: { display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' },
  dotWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  dotName: { fontSize: 10, color: 'var(--color-text-muted)' },
  btn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  shareBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  deleteBtn: { width: '100%', padding: 14, background: 'none', color: '#f44336', border: '1px solid #f4433640', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  sharePanel: { display: 'flex', flexDirection: 'column', gap: 8, padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  shareLabel: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' },
  shareRow: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', border: '1px solid var(--color-border)' },
  shareText: { flex: 1, fontSize: 13, color: 'var(--color-text)', wordBreak: 'break-all', lineHeight: 1.4 },
  shareCopyBtn: { flexShrink: 0, padding: '4px 10px', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 700, cursor: 'pointer' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 360, background: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  dialogDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.7 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
