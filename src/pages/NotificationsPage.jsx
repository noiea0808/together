import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getMyNotifications, markAllNotificationsRead, getMyPotsForSlotAllGroups, leavePotWithCleanup, acceptPotInvitation, declinePotInvitation } from '../lib/db'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

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
  join: { label: '참여', color: 'var(--color-success)', bg: 'var(--color-success-bg)', border: 'var(--color-success-border)' },
  leave: { label: '나가기', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)' },
  update: { label: '수정', color: 'var(--color-info)', bg: 'var(--color-info-bg)', border: 'var(--color-info-border)' },
  comment: { label: '코멘트', color: 'var(--color-text-muted)', bg: '#F5F0EB', border: '#EDE8E3' },
  invite: { label: '초대', color: 'var(--color-primary)', bg: '#FFF4EF', border: '#FFD6C0' },
  invite_new: { label: '제안', color: 'var(--color-primary)', bg: '#FFF4EF', border: '#FFD6C0' },
  invite_declined: { label: '거절', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)' },
  wish_like: { label: '하트', color: 'var(--color-primary)', bg: '#FFF4EF', border: '#FFD6C0' },
  wish_comment: { label: '댓글', color: 'var(--color-text-muted)', bg: '#F5F0EB', border: '#EDE8E3' },
}

const DECLINE_REASON_PRESETS = ['선약이 있어요', '오늘은 혼자 먹을게요', '컨디션이 안 좋아요', '다음에 같이 해요']

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [newIds, setNewIds] = useState(new Set())
  const [actingId, setActingId] = useState(null)
  const [localOverrides, setLocalOverrides] = useState({}) // invitationId -> { status, pot_id, decline_reason }
  const [conflict, setConflict] = useState(null) // { notification, otherPot }
  const [declineTarget, setDeclineTarget] = useState(null) // notification 대상
  const [declineReason, setDeclineReason] = useState('')

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

  const doAccept = async (n) => {
    const inv = n.pot_invitations
    setActingId(inv.id)
    try {
      const pot = await acceptPotInvitation(inv.id, user.id)
      setLocalOverrides(prev => ({ ...prev, [inv.id]: { status: 'accepted', pot_id: pot.id } }))
      setConflict(null)
    } catch (e) {
      console.error(e)
    } finally {
      setActingId(null)
    }
  }

  const handleAccept = async (e, n) => {
    e.stopPropagation()
    const inv = n.pot_invitations
    if (!inv || actingId) return
    setActingId(inv.id)
    try {
      const conflicts = await getMyPotsForSlotAllGroups(user.id, inv.date, inv.slot)
      if (conflicts.length > 0) {
        setConflict({ notification: n, otherPot: conflicts[0].meal_pots })
        setActingId(null)
        return
      }
      await doAccept(n)
    } catch (e2) {
      console.error(e2)
      setActingId(null)
    }
  }

  const openDecline = (e, n) => {
    e.stopPropagation()
    if (actingId) return
    setDeclineReason('')
    setDeclineTarget(n)
  }
  const closeDecline = () => setDeclineTarget(null)

  const handleDecline = async () => {
    const n = declineTarget
    const inv = n?.pot_invitations
    if (!inv || actingId) return
    setActingId(inv.id)
    try {
      const reason = declineReason.trim()
      await declinePotInvitation(inv.id, user.id, reason)
      setLocalOverrides(prev => ({ ...prev, [inv.id]: { status: 'declined', decline_reason: reason || null } }))
      setDeclineTarget(null)
    } catch (e2) {
      console.error(e2)
    } finally {
      setActingId(null)
    }
  }

  const handleConflictLeaveAndAccept = async () => {
    if (!conflict) return
    const { notification, otherPot } = conflict
    await leavePotWithCleanup(otherPot.id, user.id)
    await doAccept(notification)
  }

  const handleConflictAcceptBoth = async () => {
    if (!conflict) return
    await doAccept(conflict.notification)
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={() => navigate(-1)} aria-label="뒤로가기">‹</button>
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
            const inv = n.pot_invitations
            const invStatus = inv ? (localOverrides[inv.id]?.status ?? inv.status) : null
            const invDeclineReason = inv ? (localOverrides[inv.id]?.decline_reason ?? inv.decline_reason) : null
            const dateLabel = formatDate(pot?.date || inv?.date)
            const metaLine = [pot?.groups?.name || inv?.groups?.name, dateLabel, pot?.title || inv?.title].filter(Boolean).join(' · ')
            const isNew = newIds.has(n.id)
            const isPending = n.event_type === 'invite_new' && invStatus === 'pending'
            const isBusy = actingId === inv?.id
            const handleItemClick = () => {
              if (isPending) return
              if (invStatus === 'accepted') {
                const potId = localOverrides[inv.id]?.pot_id ?? inv.pot_id
                if (potId) navigate(`/pot/${potId}`)
                return
              }
              if (n.url) navigate(n.url)
            }
            return (
              <div
                key={n.id}
                style={{ ...S.item, ...(isNew ? S.itemUnread : {}) }}
                onClick={handleItemClick}
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
                  {isPending && (
                    <div style={S.inviteBtnRow}>
                      <button style={S.inviteAcceptBtn} onClick={e => handleAccept(e, n)} disabled={isBusy}>
                        {isBusy ? '처리 중...' : '수락'}
                      </button>
                      <button style={S.inviteDeclineBtn} onClick={e => openDecline(e, n)} disabled={isBusy}>거절</button>
                    </div>
                  )}
                  {n.event_type === 'invite_new' && invStatus === 'accepted' && (
                    <div style={S.inviteStatusDone}>✓ 수락했어요 · 밥팟으로 이동</div>
                  )}
                  {n.event_type === 'invite_new' && invStatus === 'declined' && (
                    <div style={S.inviteStatusDeclined}>
                      거절한 제안이에요{invDeclineReason ? ` · "${invDeclineReason}"` : ''}
                    </div>
                  )}
                  {n.event_type === 'invite_new' && invStatus === 'cancelled' && (
                    <div style={S.inviteStatusDeclined}>상대가 제안을 취소했어요</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {declineTarget && (
        <div style={S.overlay} onClick={closeDecline}>
          <div style={S.dialog} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 36 }}>🙏</div>
            <div style={S.dialogTitle}>거절 사유를 남길까요?</div>
            <p style={S.dialogDesc}>선택 사항이에요. 남기면 상대에게 함께 전달돼요.</p>
            <div style={S.declineChipRow}>
              {DECLINE_REASON_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  style={declineReason === preset ? S.declineChipActive : S.declineChip}
                  onClick={() => setDeclineReason(prev => (prev === preset ? '' : preset))}
                >{preset}</button>
              ))}
            </div>
            <input
              style={S.declineInput}
              placeholder="직접 입력 (선택)"
              value={declineReason}
              onChange={e => setDeclineReason(e.target.value)}
              maxLength={60}
            />
            <div style={S.dialogBtns}>
              <button style={{ ...S.dialogBtnSecondary, opacity: actingId ? 0.6 : 1 }} onClick={handleDecline} disabled={!!actingId}>
                {actingId ? '거절하는 중...' : '거절하기'}
              </button>
              <button style={S.dialogBtnCancel} onClick={closeDecline}>취소</button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div style={S.overlay}>
          <div style={S.dialog}>
            <div style={{ fontSize: 40 }}>⚠️</div>
            <div style={S.dialogTitle}>이미 참여 중인 밥팟이 있어요</div>
            <p style={S.dialogDesc}>
              <strong>{conflict.notification.pot_invitations?.slot}</strong> 슬롯에{'\n'}
              <strong>{conflict.otherPot.meal_time?.slice(0, 5)} {conflict.otherPot.title}</strong>{'\n'}에 이미 참여하고 있어요.
            </p>
            <div style={S.dialogBtns}>
              <button style={S.dialogBtnPrimary} onClick={handleConflictLeaveAndAccept} disabled={actingId !== null}>기존 밥팟 나가고 여기서 같이 먹기</button>
              <button style={S.dialogBtnSecondary} onClick={handleConflictAcceptBoth} disabled={actingId !== null}>중복으로 같이 먹기</button>
              <button style={S.dialogBtnCancel} onClick={() => setConflict(null)}>이번엔 패스</button>
            </div>
          </div>
        </div>
      )}
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
  headerTitle: { fontFamily: 'var(--font-title)', flex: 1, textAlign: 'center', fontSize: 'var(--font-size-base)', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.3px' },

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
  newBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 800, color: '#fff', background: 'var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '1px 7px', flexShrink: 0, whiteSpace: 'nowrap' },
  eventBadge: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, borderRadius: 'var(--radius-full)', padding: '1px 8px', flexShrink: 0, whiteSpace: 'nowrap' },
  itemTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 800, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemTime: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', flexShrink: 0, whiteSpace: 'nowrap' },
  itemMeta: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', marginTop: 3, fontWeight: 600 },
  itemText: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginTop: 3, wordBreak: 'break-word', lineHeight: 1.5 },

  inviteBtnRow: { display: 'flex', gap: 8, marginTop: 8 },
  inviteAcceptBtn: { ...PRIMARY_ACTION_BUTTON, flex: 1, width: undefined, padding: '9px 0', fontSize: 'var(--font-size-xs)' },
  inviteDeclineBtn: { flex: 1, padding: '9px 0', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  inviteStatusDone: { marginTop: 8, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-success)' },
  inviteStatusDeclined: { marginTop: 8, fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 'var(--spacing-lg)' },
  dialog: { width: '100%', maxWidth: 320, background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  dialogTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  dialogDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.7, margin: 0 },
  dialogBtns: { width: '100%', display: 'flex', flexDirection: 'column', gap: 8 },
  dialogBtnPrimary: { ...PRIMARY_ACTION_BUTTON },
  dialogBtnSecondary: { width: '100%', padding: 13, background: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer' },
  dialogBtnCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },

  declineChipRow: { display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  declineChip: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  declineChipActive: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'var(--color-primary-a08)', border: '1px solid var(--color-primary-a27)', borderRadius: 'var(--radius-full)', padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  declineInput: { width: '100%', padding: '11px 14px', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
}
