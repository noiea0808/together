import { useState, useEffect } from 'react'
import { getActiveTerms } from '../lib/db'
import RiceBowlIcon from '../components/RiceBowlIcon'

// 로그인 여부와 무관하게 접근 가능한 공개 페이지. 플레이스토어 등 스토어 등록 시
// 개인정보처리방침 URL로 제출한다. 내용은 어드민 "약관 관리"의 type=privacy 항목을 그대로 노출한다.
export default function PrivacyPolicyPage() {
  const [term, setTerm] = useState(undefined)

  useEffect(() => {
    getActiveTerms()
      .then(terms => setTerm(terms.find(t => t.type === 'privacy') ?? null))
      .catch(() => setTerm(null))
  }, [])

  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}><RiceBowlIcon size={40} /></div>
        <h1 style={styles.title}>{term?.title || '개인정보 처리방침'}</h1>
      </div>
      <div style={styles.card}>
        {term === undefined && <p style={styles.muted}>불러오는 중...</p>}
        {term === null && <p style={styles.muted}>등록된 개인정보 처리방침이 없습니다.</p>}
        {term && <div style={styles.body}>{term.content || '내용이 등록되지 않았습니다.'}</div>}
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-lg)', minHeight: '100dvh',
    maxWidth: 720, margin: '0 auto', boxSizing: 'border-box',
  },
  top: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
  logo: { marginBottom: 4 },
  title: { fontFamily: 'var(--font-title)', fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: 0 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)', boxSizing: 'border-box',
  },
  muted: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0 },
  body: {
    fontSize: 'var(--font-size-sm)', color: 'var(--color-text)',
    lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
}
