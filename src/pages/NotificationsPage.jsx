import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyNotifications, markAllNotificationsRead } from '../lib/db'
import RiceBowlIcon from '../components/RiceBowlIcon'

function timeAgo(iso) {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}시간 전`
  return `${Math.floor(diffHour / 24)}일 전`
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}.${Number(d)}`
}

const EVENT_META = {
  join: { label: '참여', color: '#2E9E4F', bg: '#E8F5E9', border: '#A5D6A7' },
  leave: { label: '나가기', color: '#f44336', bg: '#FFEBEE', border: '#FFCDD2' },
  update: { label: '수정', color: '#1E88E5', bg: '#E3F2FD', border: '#BBDEFB' },
  comment: { label: '코멘트', color: '#857B72', bg: '#F5F0EB', border: '#EDE8E3' },
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [newIds, setNewIds] = useState(new Set())

  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMyNotifications(user.id)
      .then(data => {
        if (cancelled) return
        setNotifications(data)
        // 읽음 처리 전에 "새 알림" 스냅샷을 먼저 떠둔다 — 안 그러면 markAllNotificationsRead가
        // 거의 동시에 끝나버려서 화면에 뜬 시점엔 이미 전부 읽음 처리된 것처럼 보일 수 있다.
        setNewIds(new Set(data.filter(n => !n.is_read).map(n => n.id)))
        markAllNotificationsRead(user.id).catch(() => {})
      })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)}>‹</button>
        <span style={S.headerTitle}>알림</span>
        <div style={{ width: 34 }} />
      </div>

      <div style={S.list}>
        {loading ? (
          <div style={S.empty}><RiceBowlIcon size={40} /></div>
        ) : notifications.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔔</div>
            <p style={S.emptyText}>아직 받은 알림이 없어요.</p>
          </div>
        ) : (
          notifications.map(n => {
            const meta = EVENT_META[n.event_type]
            const pot = n.meal_pots
            const dateLabel = formatDate(pot?.date)
            const metaLine = [pot?.groups?.name, dateLabel, pot?.title].filter(Boolean).join(' · ')
            const isNew = newIds.has(n.id)
            return (
              <div
                key={n.id}
                style={{ ...S.item, ...(isNew ? S.itemUnread : {}) }}
                onClick={() => n.url && navigate(n.url)}
              >
                <div style={S.itemBody}>
                  <div style={S.itemTopRow}>
                    <div style={S.itemTitleRow}>
                      {isNew && <span style={S.newBadge}>✓ NEW</span>}
                      {meta && (
                        <span style={{ ...S.eventBadge, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}>
                          {meta.label}
                        </span>
                      )}
                      <span style={S.itemTitle}>{pot?.title || n.title}</span>
                    </div>
                    <span style={S.itemTime}>{timeAgo(n.created_at)}</span>
                  </div>
                  {metaLine && <div style={S.itemMeta}>{metaLine}</div>}
                  {n.body && <div style={S.itemText}>{n.body}</div>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const S = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
    position: 'sticky', top: 0, background: 'rgba(250,248,245,0.95)', zIndex: 10,
    borderBottom: '1px solid var(--color-border)', backdropFilter: 'blur(8px)', flexShrink: 0,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--color-border)',
    color: 'var(--color-text-muted)', fontSize: 20, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', flexShrink: 0, lineHeight: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

  list: { flex: 1, overflowY: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 40 },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, padding: 40 },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--color-text-muted)' },
  emptyText: { fontSize: 'var(--font-size-sm)', margin: 0 },

  item: {
    display: 'flex', gap: 8, padding: '12px 14px', background: 'var(--color-surface)',
    border: '1.5px solid var(--color-border)', borderRadius: 14, cursor: 'pointer',
  },
  itemUnread: { background: '#FFF4EF', border: '1.5px solid #FFD6C0' },
  itemBody: { flex: 1, minWidth: 0 },
  itemTopRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  itemTitleRow: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  newBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 800, color: '#fff', background: '#FF6B35', borderRadius: 99, padding: '1px 7px', flexShrink: 0, whiteSpace: 'nowrap' },
  eventBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 99, padding: '1px 8px', flexShrink: 0, whiteSpace: 'nowrap' },
  itemTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTime: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', flexShrink: 0, whiteSpace: 'nowrap' },
  itemMeta: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', marginTop: 3, fontWeight: 600 },
  itemText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 3, wordBreak: 'break-word', lineHeight: 1.5 },
}
