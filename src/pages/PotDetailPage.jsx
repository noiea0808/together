import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ALL_POTS, ALL_MEMBERS, ME } from '../mock/data'

export default function PotDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const pot = ALL_POTS.find(p => p.id === id) ?? ALL_POTS[0]
  const [members, setMembers] = useState(pot.members)

  const isJoined = members.includes(ME.id)
  const isFull = members.length >= pot.max_people
  const creator = ALL_MEMBERS.find(m => m.id === pot.created_by)

  const handleJoinToggle = () => {
    setMembers(prev =>
      prev.includes(ME.id) ? prev.filter(m => m !== ME.id) : [...prev, ME.id]
    )
  }

  const handleShare = () => {
    const text = `🍚 ${pot.meal_time} ${pot.title} · ${members.length}/${pot.max_people}명 · 같이먹자`
    navigator.clipboard?.writeText(text)
    alert('복사됐습니다!\n' + text)
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>밥팟 상세</span>
        <span />
      </div>

      <div style={styles.body}>
        <div style={styles.timeRow}>
          <span style={styles.time}>{pot.meal_time}</span>
          {pot.is_public && <span style={styles.publicTag}>공개</span>}
        </div>
        <h2 style={styles.title}>{pot.title}</h2>
        <p style={styles.creatorLine}>{creator?.nickname} 개설</p>

        {/* 인원 점 UI */}
        <div style={styles.dotsSection}>
          <div style={styles.dotsLabel}>{members.length}/{pot.max_people}명</div>
          <div style={styles.dots}>
            {Array.from({ length: pot.max_people }).map((_, i) => {
              const uid = members[i]
              const member = MEMBERS.find(m => m.id === uid)
              return (
                <div key={i} style={styles.dotWrapper}>
                  <div style={{
                    ...styles.dot,
                    background: uid ? (uid === ME.id ? 'var(--color-primary)' : '#555') : 'var(--color-border)',
                  }}>
                    {member ? member.nickname[0] : ''}
                  </div>
                  <div style={styles.dotName}>{member?.nickname ?? '　'}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 참여/취소 버튼 */}
        {isJoined ? (
          <button style={{ ...styles.btn, background: 'var(--color-surface-2)', color: 'var(--color-text)' }} onClick={handleJoinToggle}>
            참여 취소
          </button>
        ) : (
          <button
            style={{ ...styles.btn, opacity: isFull ? 0.4 : 1 }}
            onClick={handleJoinToggle}
            disabled={isFull}
          >
            {isFull ? '마감됐어요' : '참여하기 🙋'}
          </button>
        )}

        {/* 공유 */}
        <button style={styles.shareBtn} onClick={handleShare}>
          🔗 링크 복사
        </button>

        <div style={styles.kakaoPreview}>
          <div style={styles.kakaoTitle}>카톡 공유 미리보기</div>
          <div style={styles.kakaoText}>
            🍚 {pot.meal_time} {pot.title} · {members.length}/{pot.max_people}명 · 같이먹자 → 링크
          </div>
        </div>
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
  body: { flex: 1, padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' },
  timeRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' },
  time: { fontSize: 'var(--font-size-2xl)', fontWeight: 900, color: 'var(--color-primary)' },
  publicTag: { fontSize: 12, background: '#eee', borderRadius: 4, padding: '2px 8px', color: 'var(--color-text-muted)' },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 800, marginTop: -8 },
  creatorLine: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },
  dotsSection: { padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  dotsLabel: { fontWeight: 700, marginBottom: 'var(--spacing-sm)' },
  dots: { display: 'flex', gap: 'var(--spacing-md)' },
  dotWrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  dot: {
    width: 48, height: 48, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 'var(--font-size-sm)',
  },
  dotName: { fontSize: 10, color: 'var(--color-text-muted)' },
  btn: {
    width: '100%', padding: 16, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer',
  },
  shareBtn: {
    width: '100%', padding: 14, background: 'var(--color-surface-2)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-base)', fontWeight: 600, cursor: 'pointer',
  },
  kakaoPreview: {
    background: '#FEE500', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-md)',
    marginTop: 'var(--spacing-sm)',
  },
  kakaoTitle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, marginBottom: 4, color: '#3C1E1E' },
  kakaoText: { fontSize: 'var(--font-size-sm)', color: '#3C1E1E' },
}
