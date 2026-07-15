import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { supabase } from '../lib/supabase'
import { acceptFriendRequest, declineFriendRequest } from '../lib/db'

const AUTO_DISMISS_MS = 5000

// 앱이 켜져 있는 동안 새 알림(notifications INSERT)이 오면 화면 상단에 토스트로 띄운다.
// 벨 아이콘 빨간 점은 Header.jsx가 별도로 처리 — 이 컴포넌트는 포그라운드 즉시 알림 전용.
//
// 친구 요청(friend_request)은 다른 알림과 달리 그 자리에서 바로 수락/거절할 수 있는
// 액션 버튼을 붙이고, 실수로 놓치지 않도록 자동으로 사라지지 않게 한다.
export default function NotificationToast() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const [actingId, setActingId] = useState(null)
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  useEffect(() => {
    if (!user || user.is_guest) return

    const channel = supabase
      .channel(`notification_toast_${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        const n = payload.new
        setToasts(prev => [...prev, n])
        if (n.event_type !== 'friend_request') {
          timers.current[n.id] = setTimeout(() => dismiss(n.id), AUTO_DISMISS_MS)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      Object.values(timers.current).forEach(clearTimeout)
      timers.current = {}
    }
  }, [user, dismiss])

  const handleClick = (t) => {
    dismiss(t.id)
    if (t.url) navigate(t.url)
  }

  const handleAccept = async (e, t) => {
    e.stopPropagation()
    if (actingId) return
    setActingId(t.id)
    try {
      await acceptFriendRequest(t.friend_request_id, user.id)
      dismiss(t.id)
    } catch (err) {
      console.error(err)
    } finally {
      setActingId(null)
    }
  }

  const handleDecline = async (e, t) => {
    e.stopPropagation()
    if (actingId) return
    setActingId(t.id)
    try {
      await declineFriendRequest(t.friend_request_id, user.id)
      dismiss(t.id)
    } catch (err) {
      console.error(err)
    } finally {
      setActingId(null)
    }
  }

  if (toasts.length === 0) return null

  return (
    <div style={styles.wrap}>
      {toasts.map(t => {
        const isFriendRequest = t.event_type === 'friend_request'
        return (
          <div key={t.id} style={styles.toast} onClick={() => handleClick(t)}>
            <span style={styles.icon}>{isFriendRequest ? '🙋' : '🍚'}</span>
            <div style={styles.body}>
              <div style={styles.title}>{t.title}</div>
              {t.body && <div style={styles.desc}>{t.body}</div>}
              {isFriendRequest && (
                <div style={styles.actionRow}>
                  <button style={styles.acceptBtn} onClick={e => handleAccept(e, t)} disabled={actingId === t.id}>
                    {actingId === t.id ? '...' : '수락'}
                  </button>
                  <button style={styles.declineBtn} onClick={e => handleDecline(e, t)} disabled={actingId === t.id}>거절</button>
                </div>
              )}
            </div>
            <button style={styles.closeBtn} onClick={(e) => { e.stopPropagation(); dismiss(t.id) }} aria-label="닫기">✕</button>
          </div>
        )
      })}
    </div>
  )
}

const styles = {
  wrap: {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '100%',
    maxWidth: 'var(--max-width)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '0 12px',
    pointerEvents: 'none',
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    boxShadow: 'var(--shadow-md)',
    cursor: 'pointer',
    animation: 'toastIn 0.22s ease',
  },
  icon: { fontSize: 20, flexShrink: 0, lineHeight: 1 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 'var(--font-size-xs)', fontWeight: 800, color: 'var(--color-text)' },
  desc: {
    fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)', marginTop: 2,
    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  closeBtn: {
    flexShrink: 0, background: 'none', border: 'none', color: 'var(--color-text-muted)',
    fontSize: 13, cursor: 'pointer', padding: 2, lineHeight: 1,
  },
  actionRow: { display: 'flex', gap: 6, marginTop: 8 },
  acceptBtn: {
    flex: 1, padding: '7px 0', background: 'var(--color-primary)', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-2xs)', fontWeight: 700, cursor: 'pointer',
  },
  declineBtn: {
    flex: 1, padding: '7px 0', background: 'none', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)',
    borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-2xs)', fontWeight: 600, cursor: 'pointer',
  },
}
