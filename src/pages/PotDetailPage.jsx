import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getPot, joinPot, leavePot, upsertStatus } from '../lib/db'

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

  const loadPot = async () => {
    try {
      const data = await getPot(id)
      setPot(data)
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

  const handleJoinToggle = async () => {
    if (!pot || actionLoading) return
    setActionLoading(true)
    try {
      const dateStr = toDateStr(new Date())
      if (isJoined) {
        await leavePot(pot.id, user.id)
        // 참여 취소 시 상태도 되돌림
        if (pot.group_id) {
          await upsertStatus({ userId: user.id, groupId: pot.group_id, date: dateStr, slot: pot.slot, status: 'open' })
        }
      } else {
        await joinPot(pot.id, user.id)
        // 참여 시 상태를 '참여중'으로
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
        <span style={styles.headerTitle}>밥팟 상세</span>
        <span />
      </div>

      <div style={styles.body}>
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

        {/* 인원 점 UI */}
        <div style={styles.dotsSection}>
          <div style={styles.dotsLabel}>{participants.length}/{pot.max_people}명</div>
          <div style={styles.dots}>
            {Array.from({ length: pot.max_people }).map((_, i) => {
              const member = participants[i]
              const isMe = member?.id === user?.id
              return (
                <div key={i} style={styles.dotWrapper}>
                  <div style={{
                    ...styles.dot,
                    background: member ? (isMe ? 'var(--color-primary)' : '#555') : 'var(--color-border)',
                  }}>
                    {member ? member.nickname[0] : ''}
                  </div>
                  <div style={styles.dotName}>{member?.nickname ?? '　'}</div>
                </div>
              )
            })}
          </div>
        </div>

        {isJoined ? (
          <button
            style={{ ...styles.btn, background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            onClick={handleJoinToggle}
            disabled={actionLoading}
          >
            {actionLoading ? '처리 중...' : '참여 취소'}
          </button>
        ) : (
          <button
            style={{ ...styles.btn, opacity: isFull ? 0.4 : 1 }}
            onClick={handleJoinToggle}
            disabled={isFull || actionLoading}
          >
            {actionLoading ? '처리 중...' : isFull ? '마감됐어요' : '참여하기 🙋'}
          </button>
        )}

        <button style={styles.shareBtn} onClick={handleShare}>
          🔗 링크 복사
        </button>

        <div style={styles.kakaoPreview}>
          <div style={styles.kakaoTitle}>카톡 공유 미리보기</div>
          <div style={styles.kakaoText}>
            🍚 {pot.meal_time?.slice(0, 5)} {pot.title} · {participants.length}/{pot.max_people}명 · 같이먹자 → 링크
          </div>
        </div>
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
  body: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', overflowY: 'auto' },
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
