import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getMyFeedback, submitFeedback } from '../lib/db'
import { useScrollLock } from '../lib/useScrollLock'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
}

// 내 의견함 팝업. 지금까지 보낸 의견/답변 목록을 보여주고, 같은 팝업에서 새 의견도 보낼 수 있다.
// 관리자 화면(신고/제재 옆 "사용자 의견")에서 확인 후 한 번 답변하며(1회성 답변 티켓),
// 답변이 달리면 사용자에게 알림/푸시가 간다.
export default function FeedbackModal({ onClose }) {
  const { user } = useUser()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useScrollLock(true)

  useEffect(() => {
    getMyFeedback(user.id).then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }, [user.id])

  const submit = async () => {
    if (!content.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const feedback = await submitFeedback(user.id, content.trim())
      setItems(prev => [feedback, ...prev])
      setContent('')
    } catch {
      setError('접수에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>내 의견함</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div style={styles.list}>
          {loading ? (
            <p style={styles.muted}>불러오는 중...</p>
          ) : items.length === 0 ? (
            <p style={styles.muted}>아직 보낸 의견이 없어요.</p>
          ) : (
            items.map(f => (
              <div key={f.id} style={styles.item}>
                <div style={styles.itemMineRow}>
                  <span style={styles.itemMine}>{f.content}</span>
                  <span style={styles.itemDate}>{formatDate(f.created_at)}</span>
                </div>
                {f.reply ? (
                  <div style={styles.itemReply}>🙋 운영팀: {f.reply}</div>
                ) : (
                  <div style={styles.itemPending}>답변 대기 중이에요</div>
                )}
              </div>
            ))
          )}
        </div>

        <div style={styles.composeRow}>
          <textarea
            style={styles.textarea}
            placeholder="불편했던 점이나 바라는 점을 자유롭게 남겨주세요."
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={1000}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{ ...PRIMARY_ACTION_BUTTON, opacity: (!content.trim() || submitting) ? 0.6 : 1 }}
            onClick={submit}
            disabled={!content.trim() || submitting}
          >
            {submitting ? '보내는 중...' : '새 의견 보내기'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 500, padding: 'var(--spacing-lg)',
  },
  dialog: {
    width: '100%', maxWidth: 400, maxHeight: '85vh', background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', overflow: 'hidden',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4 },

  list: { flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 },
  muted: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', margin: '12px 0' },
  item: { display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  itemMineRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  itemMine: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  itemDate: { flexShrink: 0, fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },
  itemReply: { fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 600, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  itemPending: { fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-muted)' },

  composeRow: { flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--color-border)' },
  textarea: {
    width: '100%', minHeight: 72, padding: '11px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border)', fontSize: 'var(--font-size-sm)', resize: 'vertical',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 },
}
