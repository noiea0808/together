import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { getActiveTerms, completeOnboarding } from '../lib/db'
import RiceBowlIcon from '../components/RiceBowlIcon'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

const LIFESTYLE_OPTIONS = ['학생', '주부', '직장인', '자영업', '프리랜서', '기타']

export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const { user, login } = useUser()

  const [nickname, setNickname] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [lifestyle, setLifestyle] = useState('')
  const [terms, setTerms] = useState([])
  const [agreed, setAgreed] = useState({}) // { [termId]: true }
  const [viewTerm, setViewTerm] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const pendingCode = localStorage.getItem('pendingInviteCode')

  useEffect(() => {
    // 구글 이름 등 기존 닉네임이 있으면 미리 채우되, 이메일 앞부분 placeholder 면 비워둔다
    if (user?.nickname && user.nickname !== user.email?.split('@')[0]) {
      setNickname(user.nickname)
    }
    getActiveTerms().then(setTerms).catch(() => setTerms([]))
  }, [user])

  const requiredTerms = terms.filter(t => t.is_required)
  const allChecked = terms.length > 0 && terms.every(t => agreed[t.id])
  const requiredAllChecked = requiredTerms.every(t => agreed[t.id])

  const toggleAll = () => {
    if (allChecked) setAgreed({})
    else setAgreed(Object.fromEntries(terms.map(t => [t.id, true])))
  }

  const toggle = (id) => setAgreed(a => ({ ...a, [id]: !a[id] }))

  const canSubmit = nickname.trim().length > 0 && requiredAllChecked && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true); setError(null)
    try {
      const agreedIds = terms.filter(t => agreed[t.id]).map(t => t.id)
      const profile = await completeOnboarding(
        user.id,
        { nickname, birthdate, lifestyle },
        agreedIds,
      )
      login(profile)
      if (pendingCode) {
        // 코드는 localStorage에 그대로 두고 메인으로 — 전역 초대 팝업(GroupInviteModal)이
        // 메인 화면 위에서 이어받아 수락 여부를 묻는다.
        navigate('/today')
      } else {
        navigate('/group-setup')
      }
    } catch (e) {
      console.error(e)
      setError('저장에 실패했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}><RiceBowlIcon size={48} /></div>
        <h1 style={styles.title}>거의 다 왔어요!</h1>
        <p style={styles.sub}>같이 먹자를 시작하기 전에{'\n'}몇 가지만 알려주세요.</p>
      </div>

      <div style={styles.card}>
        {/* 닉네임 */}
        <div style={styles.field}>
          <label style={styles.label}>닉네임 <span style={styles.req}>*</span></label>
          <input
            style={styles.input}
            placeholder="예: 김철수"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            maxLength={8}
            autoFocus
            disabled={loading}
          />
          <span style={styles.hint}>{nickname.length}/8</span>
        </div>

        {/* 생년월일 (선택) */}
        <div style={styles.field}>
          <label style={styles.label}>생년월일 <span style={styles.optional}>(선택)</span></label>
          <input
            style={styles.input}
            type="date"
            value={birthdate}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => setBirthdate(e.target.value)}
            disabled={loading}
          />
        </div>

        {/* 라이프스타일 (선택) */}
        <div style={styles.field}>
          <label style={styles.label}>라이프스타일 <span style={styles.optional}>(선택)</span></label>
          <div style={styles.chipRow}>
            {LIFESTYLE_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                style={{ ...styles.chip, ...(lifestyle === opt ? styles.chipActive : {}) }}
                onClick={() => setLifestyle(lifestyle === opt ? '' : opt)}
                disabled={loading}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* 약관 동의 */}
        {terms.length > 0 && (
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
          {loading ? '저장 중...' : '시작하기'}
        </button>
      </div>

      {/* 약관 본문 모달 */}
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
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-lg)',
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
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 'var(--font-size-sm)', fontWeight: 700 },
  req: { color: 'var(--color-primary)' },
  optional: { color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 'var(--font-size-xs)' },
  input: {
    width: '100%', padding: '13px var(--spacing-md)',
    border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box',
  },
  hint: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: {
    padding: '8px 14px', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-full)', background: 'transparent',
    fontSize: 'var(--font-size-sm)', cursor: 'pointer', color: 'var(--color-text-muted)',
  },
  chipActive: {
    borderColor: 'var(--color-primary)', background: 'var(--color-primary-a10)',
    color: 'var(--color-primary)', fontWeight: 700,
  },
  terms: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-md)' },
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
