import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers } from '../lib/db'

export default function GroupPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [groups, setGroups] = useState([])
  const [membersMap, setMembersMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMyGroups(user.id).then(async gs => {
      setGroups(gs)
      const entries = await Promise.all(gs.map(g => getGroupMembers(g.id).then(m => [g.id, m])))
      setMembersMap(Object.fromEntries(entries))
      setLoading(false)
    })
  }, [user.id])

  if (loading) return <div style={styles.loadingPage}>🍚</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate(-1)}>←</button>
        <span style={styles.headerTitle}>그룹 설정</span>
        <span />
      </div>

      <div style={styles.body}>
        {groups.map(group => (
          <GroupSection
            key={group.id}
            group={group}
            members={membersMap[group.id] ?? []}
            myUserId={user.id}
          />
        ))}

        <button style={styles.addBtn} onClick={() => navigate('/group-setup')}>
          + 그룹 만들기 / 참여하기
        </button>
      </div>
    </div>
  )
}

function GroupSection({ group, members, myUserId }) {
  const [copied, setCopied] = useState(false)
  const inviteLink = `${window.location.origin}/join/${group.invite_code}`

  const handleCopy = () => {
    navigator.clipboard?.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={styles.groupSection}>
      <div style={styles.groupCard}>
        <span style={styles.groupEmoji}>👥</span>
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
          {copied ? '✓ 복사됐습니다!' : '🔗 초대 링크 복사'}
        </button>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>멤버 {members.length}명</div>
        <div style={styles.memberList}>
          {members.map(member => (
            <div key={member.id} style={styles.memberRow}>
              <div style={styles.avatar}>{member.nickname[0]}</div>
              <span style={styles.memberName}>{member.nickname}</span>
              {member.id === myUserId && <span style={styles.meTag}>나</span>}
              {member.id === group.created_by && <span style={styles.ownerTag}>개설자</span>}
            </div>
          ))}
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
  body: { flex: 1, padding: 'var(--spacing-md)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)' },
  groupSection: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', paddingBottom: 'var(--spacing-xl)', borderBottom: '1px solid var(--color-border)' },
  groupCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' },
  groupEmoji: { fontSize: 36 },
  groupName: { fontSize: 'var(--font-size-lg)', fontWeight: 800 },
  memberCount: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 2 },
  section: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)' },
  inviteBox: { padding: 'var(--spacing-sm) var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  inviteCode: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', wordBreak: 'break-all' },
  copyBtn: { width: '100%', padding: 12, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  memberList: { display: 'flex', flexDirection: 'column', gap: 8 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '8px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 },
  memberName: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  meTag: { fontSize: 'var(--font-size-xs)', background: 'var(--color-primary)22', color: 'var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '2px 10px', fontWeight: 700 },
  ownerTag: { fontSize: 'var(--font-size-xs)', background: '#FFF3E0', color: '#FF9800', borderRadius: 'var(--radius-full)', padding: '2px 10px', fontWeight: 700 },
  addBtn: { width: '100%', padding: 14, background: 'var(--color-surface-2)', border: '1.5px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
