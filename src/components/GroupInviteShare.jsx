import { useState } from 'react'
import { SendIcon } from './GroupIcons'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 그룹을 막 만든 직후 보여주는 초대 화면 — 혼자 그룹을 만들고 끝나는 걸 막기 위해
// 생성 완료 지점에 강제로 끼워 넣는다. 모달/전체 페이지 양쪽에서 재사용하도록
// 바깥 카드/다이얼로그 배경은 호출부가 제공하고, 이 컴포넌트는 내용만 그린다.
export default function GroupInviteShare({ group, onDone }) {
  const [copied, setCopied] = useState(null)
  const inviteLink = `${window.location.origin}/join/${group.invite_code}`

  const copyText = (text, type) => {
    navigator.clipboard?.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.iconBadge}><SendIcon size={26} /></div>
      <div style={styles.title}>{group.name} 그룹을 만들었어요!</div>
      <p style={styles.desc}>팀원을 초대하면{'\n'}오늘 상태를 서로 볼 수 있어요.</p>

      <div style={styles.panel}>
        <div style={styles.label}>초대 코드</div>
        <div style={styles.row}>
          <span style={styles.codeText}>{group.invite_code}</span>
          <button
            style={{ ...styles.copyBtn, background: copied === 'code' ? 'var(--color-success)' : 'var(--color-primary)' }}
            onClick={() => copyText(group.invite_code, 'code')}
          >
            {copied === 'code' ? '✓' : '복사'}
          </button>
        </div>
      </div>

      <div style={styles.panel}>
        <div style={styles.label}>초대 링크</div>
        <div style={styles.row}>
          <span style={styles.linkText}>{inviteLink}</span>
          <button
            style={{ ...styles.copyBtn, background: copied === 'link' ? 'var(--color-success)' : 'var(--color-primary)' }}
            onClick={() => copyText(inviteLink, 'link')}
          >
            {copied === 'link' ? '✓' : '복사'}
          </button>
        </div>
      </div>

      <button style={{ ...PRIMARY_ACTION_BUTTON, marginTop: 4 }} onClick={onDone}>
        시작하기
      </button>
      <button style={styles.skipBtn} onClick={onDone}>나중에 초대할게요</button>
    </div>
  )
}

const styles = {
  wrap: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-md)', textAlign: 'center' },
  iconBadge: {
    width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,107,53,0.14)',
    color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  title: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  desc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', whiteSpace: 'pre-line', lineHeight: 1.6, margin: 0 },
  panel: { width: '100%', textAlign: 'left' },
  label: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6 },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    padding: '10px var(--spacing-md)', border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)',
  },
  codeText: { fontSize: 20, fontWeight: 800, letterSpacing: 3, color: 'var(--color-text)' },
  linkText: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn: {
    flexShrink: 0, padding: '7px 14px', border: 'none', borderRadius: 'var(--radius-full)',
    color: '#fff', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer',
  },
  skipBtn: { background: 'none', border: 'none', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 6 },
}
