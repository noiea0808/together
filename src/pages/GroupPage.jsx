import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getMyGroups, getGroupMembers } from '../lib/db'
import BottomNav from '../components/BottomNav'

export default function GroupPage() {
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

  // 나를 제외한 모든 친구 + 각자 속한 그룹 정보
  const friendMap = {}
  groups.forEach(g => {
    (membersMap[g.id] ?? []).forEach(member => {
      if (member.id === user.id) return
      if (!friendMap[member.id]) {
        friendMap[member.id] = { ...member, groups: [] }
      }
      friendMap[member.id].groups.push(g)
    })
  })
  const friends = Object.values(friendMap).sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'))

  const totalMembers = new Set(
    Object.values(membersMap).flat().map(m => m.id).filter(id => id !== user.id)
  ).size

  if (loading) return <div style={styles.loadingPage}>🍚</div>

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>친구 관리</span>
      </div>

      <div style={styles.body}>
        {/* 요약 */}
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryNum}>{totalMembers}</div>
            <div style={styles.summaryLabel}>함께하는 친구</div>
          </div>
          <div style={styles.summaryDivider} />
          <div style={styles.summaryItem}>
            <div style={styles.summaryNum}>{groups.length}</div>
            <div style={styles.summaryLabel}>참여 그룹</div>
          </div>
        </div>

        {/* 친구 목록 */}
        {friends.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 40 }}>👥</div>
            <div style={{ fontWeight: 700 }}>아직 친구가 없어요</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              그룹에 초대하면 친구들이 여기 표시됩니다.
            </p>
          </div>
        ) : (
          <div style={styles.friendList}>
            {friends.map(friend => (
              <div key={friend.id} style={styles.friendRow}>
                <div style={styles.avatar}>{friend.nickname[0]}</div>
                <div style={styles.friendInfo}>
                  <div style={styles.friendName}>{friend.nickname}</div>
                  <div style={styles.friendGroups}>
                    {friend.groups.map(g => (
                      <span key={g.id} style={styles.groupTag}>{g.name}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingPage: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 },
  header: { padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  headerTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  summary: { display: 'flex', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-md)' },
  summaryItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  summaryNum: { fontSize: 'var(--font-size-xl)', fontWeight: 900, color: 'var(--color-primary)' },
  summaryLabel: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', fontWeight: 600 },
  summaryDivider: { width: 1, background: 'var(--color-border)', margin: '8px 0' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', padding: 'var(--spacing-xl)' },

  friendList: { display: 'flex', flexDirection: 'column', gap: 8 },
  friendRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  avatar: { width: 36, height: 36, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 'var(--font-size-sm)', flexShrink: 0 },
  friendInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  friendName: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  friendGroups: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  groupTag: { fontSize: 'var(--font-size-2xs)', background: 'var(--color-primary)18', color: 'var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '2px 8px', fontWeight: 600 },
}
