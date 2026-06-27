import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { updateNickname } from '../lib/db'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import BottomNav from '../components/BottomNav'

export default function MyAccountPage() {
  const navigate = useNavigate()
  const { user, logout, login } = useUser()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const { installPrompt, triggerInstall, isInstalled, isIOS } = useInstallPrompt()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    if (!nickname.trim() || saving) return
    setSaving(true)
    try {
      await updateNickname(user.id, nickname.trim())
      login({ ...user, nickname: nickname.trim() })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/onboarding')
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>내 계정</span>
      </div>

      <div style={styles.body}>
        {/* 프로필 */}
        <div style={styles.profileCard}>
          <div style={styles.avatar}>{(user?.nickname ?? '?')[0]}</div>
          <div style={styles.profileInfo}>
            <div style={styles.profileName}>{user?.nickname}</div>
            <div style={styles.profileEmail}>{user?.email}</div>
          </div>
        </div>

        {/* 닉네임 변경 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>닉네임</div>
          {editing ? (
            <div style={styles.editRow}>
              <input
                style={styles.input}
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                maxLength={8}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? '...' : '저장'}
              </button>
              <button style={styles.cancelBtn} onClick={() => { setEditing(false); setNickname(user?.nickname ?? '') }}>
                취소
              </button>
            </div>
          ) : (
            <div style={styles.infoRow}>
              <span style={styles.infoValue}>{user?.nickname}</span>
              <button style={styles.editBtn} onClick={() => setEditing(true)}>변경</button>
            </div>
          )}
          {saved && <p style={styles.savedMsg}>✓ 닉네임이 변경됐어요.</p>}
        </div>

        {/* 이메일 */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>이메일</div>
          <div style={styles.infoRow}>
            <span style={styles.infoValue}>{user?.email}</span>
          </div>
        </div>

        {/* 홈 화면 설치 */}
        {!isInstalled && (
          <div style={styles.section}>
            <button
              style={styles.installBtn}
              onClick={() => {
                if (isIOS) setShowIOSGuide(true)
                else triggerInstall()
              }}
            >
              <span>📲</span>
              <span>홈 화면에 앱 추가</span>
            </button>
            <p style={styles.installDesc}>아이콘을 탭하면 앱처럼 바로 열려요.</p>
          </div>
        )}
        {isInstalled && (
          <div style={styles.installedBadge}>✓ 홈 화면에 설치됨</div>
        )}

        {/* 로그아웃 */}
        <div style={{ marginTop: 'auto' }}>
          <button style={styles.logoutBtn} onClick={handleLogout}>
            로그아웃
          </button>
        </div>

        {/* iOS 안내 모달 */}
        {showIOSGuide && (
          <div style={styles.modalOverlay} onClick={() => setShowIOSGuide(false)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>홈 화면에 추가하기</div>
              <div style={styles.guideSteps}>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>1</span>
                  <span>Safari 하단의 <strong>공유 버튼(□↑)</strong>을 탭하세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>2</span>
                  <span><strong>홈 화면에 추가</strong>를 선택하세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>3</span>
                  <span>우측 상단 <strong>추가</strong>를 탭하면 완료!</span>
                </div>
              </div>
              <button style={styles.modalClose} onClick={() => setShowIOSGuide(false)}>
                확인
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

const styles = {
  page: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: 'var(--spacing-md)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  headerTitle: { fontWeight: 800, fontSize: 'var(--font-size-xl)' },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  profileCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' },
  avatar: { width: 56, height: 56, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, flexShrink: 0 },
  profileInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  profileName: { fontWeight: 800, fontSize: 'var(--font-size-lg)' },
  profileEmail: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' },

  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--color-text-muted)' },
  infoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  infoValue: { fontSize: 'var(--font-size-base)', fontWeight: 600 },
  editBtn: { fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '4px 12px', cursor: 'pointer' },
  editRow: { display: 'flex', gap: 8, alignItems: 'center' },
  input: { flex: 1, padding: '10px var(--spacing-md)', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none' },
  saveBtn: { padding: '10px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  cancelBtn: { padding: '10px 12px', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  savedMsg: { fontSize: 12, color: '#4CAF50', fontWeight: 600 },



  logoutBtn: { width: '100%', padding: 14, background: 'none', border: '1.5px solid #f44336', borderRadius: 'var(--radius-full)', color: '#f44336', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  installBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
  installDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' },
  installedBadge: { textAlign: 'center', fontSize: 'var(--font-size-sm)', color: '#4CAF50', fontWeight: 700, padding: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  modal: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32 },
  modalTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-lg)', textAlign: 'center' },
  guideSteps: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' },
  guideStep: { display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 },
  guideNum: { width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontSize: 13 },
  modalClose: { width: '100%', padding: 14, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-base)', fontWeight: 700, cursor: 'pointer' },
}
