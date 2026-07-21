import { useState } from 'react'
import { useUser } from '../lib/UserContext'
import { reportContent } from '../lib/db'
import { useScrollLock } from '../lib/useScrollLock'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const REASONS = [
  { value: 'spam', label: '스팸/광고' },
  { value: 'inappropriate', label: '부적절한 콘텐츠' },
  { value: 'harassment', label: '괴롭힘/혐오 발언' },
  { value: 'impersonation', label: '사칭/사기' },
  { value: 'other', label: '기타' },
]

// 모먼트(밥팟)/밥팟댓글/위시플레이스/위시플레이스댓글/사용자 신고 공통 팝업.
// targetType + targetId만 넘기면 접수부터 완료 화면까지 자체 처리한다.
export default function ReportModal({ targetType, targetId, onClose }) {
  const { user } = useUser()
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useScrollLock(true)

  const submit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await reportContent(user.id, targetType, targetId, reason, detail.trim() || null)
      setDone(true)
    } catch {
      setError('신고 접수에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        {done ? (
          <>
            <div style={styles.emoji}>🙏</div>
            <div style={styles.title}>신고가 접수되었어요</div>
            <p style={styles.desc}>운영팀이 확인 후 조치할게요.</p>
            <button style={PRIMARY_ACTION_BUTTON} onClick={onClose}>확인</button>
          </>
        ) : (
          <>
            <div style={styles.title}>신고하기</div>
            <div style={styles.reasonList}>
              {REASONS.map(r => (
                <button
                  key={r.value}
                  type="button"
                  style={{ ...styles.reasonBtn, ...(reason === r.value ? styles.reasonBtnActive : {}) }}
                  onClick={() => setReason(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              style={styles.textarea}
              placeholder="자세한 내용을 알려주시면 검토에 도움이 돼요 (선택)"
              value={detail}
              onChange={e => setDetail(e.target.value)}
              maxLength={500}
            />
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.btnCol}>
              <button
                style={{ ...PRIMARY_ACTION_BUTTON, opacity: (!reason || submitting) ? 0.6 : 1 }}
                onClick={submit}
                disabled={!reason || submitting}
              >
                {submitting ? '접수 중...' : '신고 접수하기'}
              </button>
              <button style={styles.declineBtn} onClick={onClose} disabled={submitting}>취소</button>
            </div>
          </>
        )}
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
    width: '100%', maxWidth: 360, maxHeight: '85vh', overflowY: 'auto',
    background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)',
    display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--spacing-md)',
  },
  emoji: { fontSize: 40, textAlign: 'center' },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center' },
  desc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.6 },
  reasonList: { display: 'flex', flexDirection: 'column', gap: 8 },
  reasonBtn: {
    textAlign: 'left', padding: '11px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)',
    fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer',
  },
  reasonBtnActive: { borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  textarea: {
    width: '100%', minHeight: 72, padding: '11px 14px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--color-border)', fontSize: 'var(--font-size-sm)', resize: 'vertical',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0, textAlign: 'center' },
  btnCol: { display: 'flex', flexDirection: 'column', gap: 8 },
  declineBtn: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
}
