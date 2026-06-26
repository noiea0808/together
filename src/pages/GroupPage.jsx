import { useNavigate } from 'react-router-dom'
import { GROUPS, MEMBERS } from '../mock/data'

export default function GroupPage() {
  const navigate = useNavigate()

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>그룹 설정</span>
        <span />
      </div>

      <div style={styles.body}>
        {GROUPS.map(group => (
          <GroupSection key={group.id} group={group} members={MEMBERS[group.id] ?? []} />
        ))}
      </div>
    </div>
  )
}

function GroupSection({ group, members }) {
  const inviteLink = `gachi-meokja.vercel.app/join/${group.id}`

  const handleCopy = () => {
    navigator.clipboard?.writeText('https://' + inviteLink)
    alert('초대 링크가 복사됐습니다!\nhttps://' + inviteLink)
  }

  return (
    <div style={styles.groupSection}>
      <div style={styles.groupCard}>
        <span style={styles.groupEmoji}>{group.emoji}</span>
        <div>
          <div style={styles.groupName}>{group.name}</div>
          <div style={styles.memberCount}>{members.length}명</div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>초대 링크</div>
        <div style={styles.inviteBox}>
          <span style={styles.inviteCode}>{inviteLink}</span>
        </div>
        <button style={styles.copyBtn} onClick={handleCopy}>
          🔗 초대 링크 복사
        </button>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>멤버 {members.length}명</div>
        <div style={styles.memberList}>
          {members.map(member => (
            <div key={member.id} style={styles.memberRow}>
              <div style={styles.avatar}>{member.nickname[0]}</div>
              <span style={styles.memberName}>{member.nickname}</span>
              {member.id === 'user-1' && <span style={styles.meTag}>나</span>}
            </div>
          ))}
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
  body: {
    flex: 1, padding: 'var(--spacing-md)', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)',
  },
  groupSection: {
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
    paddingBottom: 'var(--spacing-xl)',
    borderBottom: '1px solid var(--color-border)',
  },
  groupCard: {
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
    padding: 'var(--spacing-md)',
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)',
  },
  groupEmoji: { fontSize: 36 },
  groupName: { fontSize: 'var(--font-size-lg)', fontWeight: 800 },
  memberCount: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 2 },
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)' },
  inviteBox: {
    padding: 'var(--spacing-sm) var(--spacing-md)',
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  inviteCode: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', wordBreak: 'break-all' },
  copyBtn: {
    width: '100%', padding: 12, background: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-full)',
    fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer',
  },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8 },
  memberRow: {
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
    padding: '8px var(--spacing-md)',
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)',
  },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'var(--color-primary)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 13,
  },
  memberName: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  meTag: {
    fontSize: 'var(--font-size-xs)', background: 'var(--color-primary)22',
    color: 'var(--color-primary)', borderRadius: 'var(--radius-full)',
    padding: '2px 10px', fontWeight: 700,
  },
}
