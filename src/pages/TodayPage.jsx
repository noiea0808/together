import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ME, GROUPS, MEMBERS, STATUSES, POTS } from '../mock/data'
import StatusBadge from '../components/StatusBadge'
import PotCard from '../components/PotCard'

const STATUS_OPTIONS = [
  { key: '점심', emoji: '🍱', color: 'var(--color-status-lunch)' },
  { key: '저녁', emoji: '🍽️', color: 'var(--color-status-dinner)' },
  { key: '커피', emoji: '☕', color: 'var(--color-status-coffee)' },
  { key: '패스', emoji: '🙅', color: 'var(--color-status-pass)' },
]

export default function TodayPage() {
  const navigate = useNavigate()
  const [myStatus, setMyStatus] = useState(null)

  const getStatus = (groupId, userId) => {
    if (userId === ME.id) return myStatus
    return STATUSES[groupId]?.find(s => s.user_id === userId)?.status ?? null
  }

  return (
    <div style={styles.page}>
      {/* 날짜 헤더 */}
      <div style={styles.header}>
        <div style={styles.date}>
          {new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
        </div>
        <button style={styles.settingBtn} onClick={() => navigate('/group')}>⚙️</button>
      </div>

      {/* 내 상태 — 전역 고정 */}
      <div style={styles.myStatusCard}>
        <div style={styles.myStatusTitle}>
          오늘 나는
          {myStatus && <StatusBadge status={myStatus} />}
        </div>
        <div style={styles.statusGrid}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.key}
              style={{
                ...styles.statusBtn,
                borderColor: myStatus === opt.key ? opt.color : 'var(--color-border)',
                background: myStatus === opt.key ? opt.color + '18' : 'transparent',
                color: myStatus === opt.key ? opt.color : 'var(--color-text)',
              }}
              onClick={() => setMyStatus(myStatus === opt.key ? null : opt.key)}
            >
              <span style={styles.statusEmoji}>{opt.emoji}</span>
              <span style={styles.statusLabel}>{opt.key}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 그룹 카드 목록 */}
      {GROUPS.map(group => (
        <GroupCard
          key={group.id}
          group={group}
          members={MEMBERS[group.id] ?? []}
          pots={POTS[group.id] ?? []}
          getStatus={(uid) => getStatus(group.id, uid)}
          onNavigate={navigate}
        />
      ))}

      {/* 그룹 추가 */}
      <button style={styles.addGroupBtn}>
        + 그룹 만들기 / 참여하기
      </button>
    </div>
  )
}

function GroupCard({ group, members, pots, getStatus, onNavigate }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={styles.groupCard}>
      <div style={styles.groupHeader} onClick={() => setCollapsed(c => !c)}>
        <span style={styles.groupName}>{group.emoji} {group.name}</span>
        <div style={styles.groupHeaderRight}>
          <span style={styles.memberCount}>{members.length}명</span>
          <span style={styles.collapseIcon}>{collapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* 멤버 상태 */}
          <div style={styles.memberList}>
            {members.map(member => (
              <div key={member.id} style={styles.memberRow}>
                <div style={styles.avatar}>{member.nickname[0]}</div>
                <span style={styles.memberName}>
                  {member.nickname}{member.id === ME.id ? ' (나)' : ''}
                </span>
                <StatusBadge status={getStatus(member.id)} />
              </div>
            ))}
          </div>

          {/* 밥팟 */}
          {pots.length > 0 && (
            <div style={styles.potsSection}>
              <div style={styles.potsSectionTitle}>열린 밥팟</div>
              <div style={styles.potList}>
                {pots.map(pot => <PotCard key={pot.id} pot={pot} />)}
              </div>
            </div>
          )}

          <button
            style={styles.createPotBtn}
            onClick={() => onNavigate('/create')}
          >
            + 밥팟 만들기
          </button>
        </>
      )}
    </div>
  )
}

const styles = {
  page: {
    flex: 1, padding: 'var(--spacing-md)',
    paddingBottom: 32, overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  date: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', fontWeight: 600 },
  settingBtn: { background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4 },

  myStatusCard: {
    background: 'var(--color-surface)',
    border: '2px solid var(--color-primary)33',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-md)',
  },
  myStatusTitle: {
    fontWeight: 800, fontSize: 'var(--font-size-lg)',
    marginBottom: 'var(--spacing-sm)',
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
  },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  statusBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '10px 4px', border: '2px solid', borderRadius: 'var(--radius-md)',
    cursor: 'pointer', transition: 'all 0.15s', gap: 4,
    WebkitTapHighlightColor: 'transparent',
  },
  statusEmoji: { fontSize: 22 },
  statusLabel: { fontSize: 'var(--font-size-xs)', fontWeight: 700 },

  groupCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 'var(--spacing-md)',
    cursor: 'pointer',
    background: 'var(--color-surface-2)',
  },
  groupName: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  groupHeaderRight: { display: 'flex', alignItems: 'center', gap: 8 },
  memberCount: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },
  collapseIcon: { fontSize: 12, color: 'var(--color-text-muted)' },

  memberList: {
    display: 'flex', flexDirection: 'column', gap: 6,
    padding: '12px var(--spacing-md)',
    borderBottom: '1px solid var(--color-border)',
  },
  memberRow: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%',
    background: 'var(--color-primary)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 13, flexShrink: 0,
  },
  memberName: { flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600 },

  potsSection: { padding: '12px var(--spacing-md)' },
  potsSectionTitle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8 },
  potList: { display: 'flex', flexDirection: 'column', gap: 8 },

  createPotBtn: {
    width: '100%', padding: 12,
    background: 'none', border: 'none',
    borderTop: '1px solid var(--color-border)',
    color: 'var(--color-primary)', fontWeight: 700,
    fontSize: 'var(--font-size-sm)', cursor: 'pointer',
  },

  addGroupBtn: {
    width: '100%', padding: 14,
    background: 'var(--color-surface-2)',
    border: '1.5px dashed var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--color-text-muted)', fontWeight: 600,
    fontSize: 'var(--font-size-sm)', cursor: 'pointer',
  },
}
