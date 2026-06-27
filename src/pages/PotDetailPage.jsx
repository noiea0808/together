import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getPot, joinPot, leavePot, upsertStatus, updatePot } from '../lib/db'

function toDateStr(date) {
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }).replace(/\. /g, '-').replace('.', '')
}

export default function PotDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useUser()

  const [pot, setPot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})

  const loadPot = async () => {
    try {
      const data = await getPot(id)
      setPot(data)
      setEditForm({
        meal_time: data.meal_time?.slice(0, 5) ?? '',
        title: data.title ?? '',
        max_people: data.max_people ?? 4,
        is_public: data.is_public ?? false,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadPot() }, [id])

  const participants = pot?.pot_members?.map(pm => ({ id: pm.user_id, nickname: pm.users?.nickname ?? '?' })) ?? []
  const isJoined = participants.some(m => m.id === user?.id)
  const isFull = participants.length >= (pot?.max_people ?? 0)
  const isCreator = !pot?.is_default && pot?.created_by === user?.id

  const handleJoinToggle = async () => {
    if (!pot || actionLoading) return
    setActionLoading(true)
    try {
      const dateStr = toDateStr(new Date())
      if (isJoined) {
        await leavePot(pot.id, user.id)
        if (pot.group_id) {
          await upsertStatus({ userId: user.id, groupId: pot.group_id, date: dateStr, slot: pot.slot, status: 'open' })
        }
      } else {
        await joinPot(pot.id, user.id)
        if (pot.group_id) {
          await upsertStatus({ userId: user.id, groupId: pot.group_id, date: dateStr, slot: pot.slot, status: '참여중', meal_time: pot.meal_time })
        }
      }
      await loadPot()
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!pot || actionLoading) return
    setActionLoading(true)
    try {
      await updatePot(pot.id, editForm)
      await loadPot()
      setEditMode(false)
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(false)
    }
  }

  const handleShare = () => {
    if (!pot) return
    const text = `🍚 ${pot.meal_time?.slice(0, 5)} ${pot.title} · ${participants.length}/${pot.max_people}명 · 같이먹자`
    navigator.clipboard?.writeText(text)
    alert('복사됐습니다!\n' + text)
  }

  if (loading) return <div style={styles.loadingPage}>🍚</div>
  if (!pot) return <div style={styles.loadingPage}>밥팟을 찾을 수 없어요.</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 {editMode ? '수정' : '상세'}</span>
        {isCreator && !editMode && (
          <button style={styles.editBtn} onClick={() => setEditMode(true)}>수정</button>
        )}
        {editMode && (
          <button style={styles.editBtn} onClick={() => setEditMode(false)}>취소</button>
        )}
        {!isCreator && <span />}
      </div>

      <div style={styles.body}>
        {editMode ? (
          /* ── 수정 모드 ── */
          <div style={styles.editForm}>
            <div style={styles.field}>
              <label style={styles.label}>시간</label>
              <input
                type="time"
                style={styles.input}
                value={editForm.meal_time}
                onChange={e => setEditForm(f => ({ ...f, meal_time: e.target.value }))}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>메뉴 / 이름</label>
              <input
                style={styles.input}
                value={editForm.title}
                onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                maxLength={20}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>최대 인원</label>
              <div style={styles.stepper}>
                <button style={styles.step} onClick={() => setEditForm(f => ({ ...f, max_people: Math.max(participants.length, 2, f.max_people - 1) }))}>−</button>
                <span style={styles.stepVal}>{editForm.max_people}명</span>
                <button style={styles.step} onClick={() => setEditForm(f => ({ ...f, max_people: Math.min(10, f.max_people + 1) }))}>+</button>
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>공개 범위</label>
              <div style={styles.toggleRow}>
                <button style={{ ...styles.toggleBtn, ...(!editForm.is_public ? styles.toggleActive : {}) }} onClick={() => setEditForm(f => ({ ...f, is_public: false }))}>그룹만</button>
                <button style={{ ...styles.toggleBtn, ...(editForm.is_public ? styles.toggleActive : {}) }} onClick={() => setEditForm(f => ({ ...f, is_public: true }))}>전체 공개</button>
              </div>
            </div>
            <button
              style={{ ...styles.btn, opacity: actionLoading ? 0.4 : 1, marginTop: 8 }}
              onClick={handleSaveEdit}
              disabled={actionLoading}
            >
              {actionLoading ? '저장 중...' : '저장하기'}
            </button>
          </div>
        ) : (
          /* ── 상세 보기 ── */
          <>
            <div style={styles.timeRow}>
              <span style={{ ...styles.time, color: pot.is_default ? '#4CAF50' : 'var(--color-primary)' }}>
                {pot.meal_time?.slice(0, 5)}
              </span>
              {pot.is_default && <span style={styles.defaultTag}>기본팟</span>}
              {pot.is_public && <span style={styles.publicTag}>공개</span>}
              <span style={styles.slotTag}>{pot.slot}</span>
            </div>
            <h2 style={styles.title}>{pot.title}</h2>
            {!pot.is_default && pot.users && (
              <p style={styles.creatorLine}>{pot.users.nickname} 개설</p>
            )}

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

            {isJoined ? (
              <button style={{ ...styles.btn, background: 'var(--color-surface-2)', color: 'var(--color-text)' }} onClick={handleJoinToggle} disabled={actionLoading}>
                {actionLoading ? '처리 중...' : '참여 취소'}
              </button>
            ) : (
              <button style={{ ...styles.btn, opacity: isFull ? 0.4 : 1 }} onClick={handleJoinToggle} disabled={isFull || actionLoading}>
                {actionLoading ? '처리 중...' : isFull ? '마감됐어요' : '참여하기 🙋'}
              </button>
            )}

            <button style={styles.shareBtn} onClick={handleShare}>🔗 링크 복사</button>

            <div style={styles.kakaoPreview}>
              <div style={styles.kakaoTitle}>카톡 공유 미리보기</div>
              <div style={styles.kakaoText}>
                🍚 {pot.meal_time?.slice(0, 5)} {pot.title} · {participants.length}/{pot.max_people}명 · 같이먹자 → 링크
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)' },
  back: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  editBtn: { background: 'none', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-full)', color: 'var(--color-primary)', fontSize: 13, fontWeight: 700, padding: '5px 14px', cursor: 'pointer' },
  body: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', overflowY: 'auto' },

  editForm: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' },
  label: { fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  input: { padding: '13px var(--spacing-md)', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  stepper: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' },
  step: { width: 40, height: 40, border: '1.5px solid var(--color-border)', borderRadius: '50%', background: 'none', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 'var(--font-size-lg)', fontWeight: 700, minWidth: 40, textAlign: 'center' },
  toggleRow: { display: 'flex', gap: 'var(--spacing-sm)' },
  toggleBtn: { flex: 1, padding: 12, border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-muted)' },
  toggleActive: { borderColor: 'var(--color-primary)', background: 'var(--color-primary)18', color: 'var(--color-primary)' },

  timeRow: { display: 'flex', alignItems: 'center', gap: 8 },
  time: { fontSize: 'var(--font-size-2xl)', fontWeight: 900 },
  defaultTag: { fontSize: 12, background: '#E8F5E9', borderRadius: 4, padding: '2px 8px', color: '#4CAF50', fontWeight: 600 },
  publicTag: { fontSize: 12, background: '#eee', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  slotTag: { fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 800, marginTop: -4 },
  creatorLine: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },
  dotsSection: { padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  dotsLabel: { fontWeight: 700, marginBottom: 'var(--spacing-sm)' },
  dots: { display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' },
  dotWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-sm)' },
  dotName: { fontSize: 10, color: 'var(--color-text-muted)' },
  btn: { width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  shareBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer' },
  kakaoPreview: { background: '#FEE500', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)' },
  kakaoTitle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, marginBottom: 4, color: '#3C1E1E' },
  kakaoText: { fontSize: 'var(--font-size-sm)', color: '#3C1E1E' },
}
