import { useState, useEffect } from 'react'
import { useUser } from '../lib/UserContext'
import { getActiveTerms, recordTermAgreements } from '../lib/db'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 이미 onboarded된 사용자가 (1) 약관 자체에 동의한 적 없거나(레거시 사용자)
// (2) 필수 약관의 version이 올라가 재동의가 필요할 때 로그인 직후 막아서는 화면.
// ProfileSetupPage의 약관 섹션과 UI는 같지만 닉네임 등 프로필 입력은 없다.
export default function TermsConsentPage({ onDone }) {
  const { user, logout } = useUser()
  const [terms, setTerms] = useState([])
  const [agreed, setAgreed] = useState({})
  const [viewTerm, setViewTerm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    getActiveTerms().then(setTerms).catch(() => setTerms([]))
  }, [])

  const requiredTerms = terms.filter(t => t.is_required)
  const allChecked = terms.length > 0 && terms.every(t => agreed[t.id])
  const requiredAllChecked = requiredTerms.length > 0 && requiredTerms.every(t => agreed[t.id])

  const toggleAll = () => {
    if (allChecked) setAgreed({})
    else setAgreed(Object.fromEntries(terms.map(t => [t.id, true])))
  }
  const toggle = (id) => setAgreed(a => ({ ...a, [id]: !a[id] }))

  const canSubmit = requiredAllChecked && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true); setError(null)
    try {
      const agreedTerms = terms.filter(t => agreed[t.id]).map(t => ({ id: t.id, version: t.version }))
      await recordTermAgreements(user.id, agreedTerms)
      onDone()
    } catch (e) {
      console.error(e)
      setError('저장에 실패했어요. 다시 시도해주세요.')
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}><RiceBowlIcon size={48} /></div>
        <h1 style={styles.title}>약관이 업데이트됐어요</h1>
        <p style={styles.sub}>계속 이용하려면{'\n'}약관에 다시 동의해주세요.</p>
      </div>

      <div style={styles.card}>
        {terms.length === 0 ? (
          <p style={styles.empty}>불러오는 중...</p>
        ) : (
          <div style={styles.terms}>
            <button type="button" style={styles.agreeAll} onClick={toggleAll} disabled={loading}>
              <span style={{ ...styles.checkbox, ...(allChecked ? styles.checkboxOn : {}) }}>
                {allChecked ? '✓' : ''}
              </span>
              <span>약관 전체 동의</span>
            </button>
            <div style={styles.termList}>
              {terms.map(t => (
                <div key={t.id} style={styles.termRow}>
                  <button type="button" style={styles.termCheck} onClick={() => toggle(t.id)} disabled={loading}>
                    <span style={{ ...styles.checkboxSm, ...(agreed[t.id] ? styles.checkboxOn : {}) }}>
                      {agreed[t.id] ? '✓' : ''}
                    </span>
                    <span style={styles.termLabel}>
                      <span style={t.is_required ? styles.tagReq : styles.tagOpt}>
                        {t.is_required ? '[필수]' : '[선택]'}
                      </span>{' '}
                      {t.title}
                    </span>
                  </button>
                  <button type="button" style={styles.viewBtn} onClick={() => setViewTerm(t)}>보기</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...PRIMARY_ACTION_BUTTON, marginTop: 4, opacity: canSubmit ? 1 : 0.4 }}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {loading ? '저장 중...' : '동의하고 계속하기'}
        </button>
        <button style={styles.logoutBtn} onClick={logout} disabled={loading}>로그아웃</button>
      </div>

      {viewTerm && (
        <div style={styles.modalOverlay} onClick={() => setViewTerm(null)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>{viewTerm.title}</span>
              <button style={styles.modalClose} onClick={() => setViewTerm(null)} aria-label="닫기">✕</button>
            </div>
            <div style={styles.modalBody}>{viewTerm.content || '내용이 등록되지 않았습니다.'}</div>
            <button
              style={styles.modalAgree}
              onClick={() => { setAgreed(a => ({ ...a, [viewTerm.id]: true })); setViewTerm(null) }}
            >
              동의하고 닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-lg)', height: '100dvh',
  },
  top: { textAlign: 'center' },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 'var(--font-size-xl)', fontWeight: 900, marginBottom: 8 },
  sub: { color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', whiteSpace: 'pre-line', lineHeight: 1.6 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  empty: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0 },
  terms: { display: 'flex', flexDirection: 'column', gap: 8 },
  agreeAll: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-surface-2)', cursor: 'pointer',
    fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-text)',
  },
  termList: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 4px' },
  termRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  termCheck: { display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', flex: 1, textAlign: 'left' },
  termLabel: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', lineHeight: 1.4 },
  tagReq: { color: 'var(--color-primary)', fontWeight: 700, fontSize: 'var(--font-size-xs)' },
  tagOpt: { color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-xs)' },
  checkbox: {
    width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    color: '#fff', fontSize: 13, fontWeight: 800,
  },
  checkboxSm: {
    width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    color: '#fff', fontSize: 12, fontWeight: 800,
  },
  checkboxOn: { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' },
  viewBtn: {
    flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
    textDecoration: 'underline', padding: 4,
  },
  error: { fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', margin: 0 },
  logoutBtn: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: 4, textAlign: 'center' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 300, padding: 'var(--spacing-lg)',
  },
  modal: {
    width: '100%', maxWidth: 400, maxHeight: '80vh', background: '#fff',
    borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)',
    display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)',
  },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  modalClose: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-text-muted)' },
  modalBody: {
    flex: 1, overflowY: 'auto', fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text)', lineHeight: 1.7, whiteSpace: 'pre-wrap',
  },
  modalAgree: { ...PRIMARY_ACTION_BUTTON },
}
