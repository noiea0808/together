import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { updateNickname, deleteAccount } from '../lib/db'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import BottomNav from '../components/BottomNav'

export default function MyAccountPage() {
  const navigate = useNavigate()
  const { user, logout, login } = useUser()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const { installPrompt, triggerInstall, isInstalled, isIOS, isAndroid, isPC } = useInstallPrompt()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [showAndroidGuide, setShowAndroidGuide] = useState(false)
  const [showPCGuide, setShowPCGuide] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawConfirm, setWithdrawConfirm] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState(null)

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

  const closeWithdraw = () => {
    if (withdrawing) return
    setShowWithdraw(false)
    setWithdrawConfirm('')
    setWithdrawError(null)
  }

  const handleWithdraw = async () => {
    if (withdrawConfirm !== '탈퇴' || withdrawing) return
    setWithdrawing(true)
    setWithdrawError(null)
    try {
      await deleteAccount()
      await logout()
      navigate('/onboarding')
    } catch (e) {
      console.error(e)
      setWithdrawError('탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.')
      setWithdrawing(false)
    }
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
                if (isPC) setShowPCGuide(true)
                else if (isIOS) setShowIOSGuide(true)
                else if (installPrompt) triggerInstall()
                else setShowAndroidGuide(true)
              }}
            >
              <span>{isPC ? '🔖' : '📲'}</span>
              <span>{isPC ? '즐겨찾기에 추가' : '홈 화면에 앱 추가'}</span>
            </button>
            <p style={styles.installDesc}>{isPC ? '즐겨찾기에서 빠르게 접속할 수 있어요.' : '아이콘을 탭하면 앱처럼 바로 열려요.'}</p>
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
          {/* 회원 탈퇴 — 실수 방지를 위해 작고 눈에 띄지 않게 */}
          <div style={styles.withdrawWrap}>
            <button style={styles.withdrawLink} onClick={() => setShowWithdraw(true)}>
              회원 탈퇴
            </button>
          </div>
        </div>

        {/* 회원 탈퇴 경고 모달 */}
        {showWithdraw && (
          <div style={styles.modalOverlay} onClick={closeWithdraw}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.withdrawIcon}>⚠️</div>
              <div style={styles.withdrawTitle}>정말 탈퇴하시겠어요?</div>
              <div style={styles.withdrawDesc}>
                탈퇴하면 <strong>되돌릴 수 없습니다.</strong><br />
                아래 데이터가 <strong style={{ color: '#f44336' }}>영구적으로 삭제</strong>돼요.
              </div>
              <ul style={styles.withdrawList}>
                <li>프로필 · 닉네임 정보</li>
                <li>참여 중인 모든 밥팟 기록</li>
                <li>그룹 멤버십 및 상태 기록</li>
              </ul>
              <div style={styles.withdrawConfirmLabel}>
                계속하려면 아래에 <strong>탈퇴</strong> 를 입력하세요.
              </div>
              <div style={styles.withdrawInputRow}>
                <input
                  style={styles.withdrawInput}
                  value={withdrawConfirm}
                  onChange={e => setWithdrawConfirm(e.target.value)}
                  placeholder="탈퇴"
                  disabled={withdrawing}
                  autoFocus
                />
                <button
                  style={{ ...styles.withdrawBtn, opacity: withdrawConfirm === '탈퇴' && !withdrawing ? 1 : 0.4 }}
                  onClick={handleWithdraw}
                  disabled={withdrawConfirm !== '탈퇴' || withdrawing}
                >
                  {withdrawing ? '처리 중...' : '탈퇴하기'}
                </button>
              </div>
              {withdrawError && <p style={styles.withdrawErrorMsg}>{withdrawError}</p>}
              <button style={styles.withdrawCancel} onClick={closeWithdraw} disabled={withdrawing}>
                취소
              </button>
            </div>
          </div>
        )}

        {/* PC 즐겨찾기 안내 모달 */}
        {showPCGuide && (
          <div style={styles.modalOverlay} onClick={() => setShowPCGuide(false)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>즐겨찾기에 추가하기</div>
              <div style={styles.guideSteps}>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>1</span>
                  <span>주소창 오른쪽 <strong>별표(☆)</strong> 아이콘을 클릭하세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>또는</span>
                  <span>키보드에서 <strong>Ctrl+D</strong> (Mac: ⌘+D) 를 누르세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>2</span>
                  <span><strong>완료</strong>를 클릭하면 즐겨찾기에 저장돼요.</span>
                </div>
              </div>
              <button style={styles.modalClose} onClick={() => setShowPCGuide(false)}>
                확인
              </button>
            </div>
          </div>
        )}

        {/* Android 수동 안내 모달 */}
        {showAndroidGuide && (
          <div style={styles.modalOverlay} onClick={() => setShowAndroidGuide(false)}>
            <div style={styles.modal} onClick={e => e.stopPropagation()}>
              <div style={styles.modalTitle}>홈 화면에 추가하기</div>
              <div style={styles.guideSteps}>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>1</span>
                  <span>Chrome 주소창 오른쪽 <strong>⋮ 메뉴</strong>를 탭하세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>2</span>
                  <span><strong>홈 화면에 추가</strong>를 선택하세요.</span>
                </div>
                <div style={styles.guideStep}>
                  <span style={styles.guideNum}>3</span>
                  <span><strong>추가</strong>를 탭하면 완료!</span>
                </div>
              </div>
              <button style={styles.modalClose} onClick={() => setShowAndroidGuide(false)}>
                확인
              </button>
            </div>
          </div>
        )}

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
  headerTitle: { fontWeight: 900, fontSize: 'var(--font-size-base)', letterSpacing: '-0.6px' },
  body: { flex: 1, overflowY: 'auto', padding: 'var(--spacing-md)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)', paddingBottom: 80 },

  profileCard: { display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', padding: 'var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' },
  avatar: { width: 48, height: 48, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 'var(--font-size-lg)', flexShrink: 0 },
  profileInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  profileName: { fontWeight: 800, fontSize: 'var(--font-size-base)' },
  profileEmail: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' },

  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  sectionTitle: { fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-text-muted)' },
  infoRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px var(--spacing-md)', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)' },
  infoValue: { fontSize: 'var(--font-size-sm)', fontWeight: 600 },
  editBtn: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-primary)', background: 'none', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-full)', padding: '4px 12px', cursor: 'pointer' },
  editRow: { display: 'flex', gap: 8, alignItems: 'center' },
  input: { flex: 1, padding: '10px var(--spacing-md)', border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', outline: 'none' },
  saveBtn: { padding: '10px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
  cancelBtn: { padding: '10px 12px', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 'var(--font-size-xs)', cursor: 'pointer' },
  savedMsg: { fontSize: 'var(--font-size-2xs)', color: '#4CAF50', fontWeight: 600 },



  logoutBtn: { width: '100%', padding: 13, background: 'none', border: '1.5px solid #f44336', borderRadius: 'var(--radius-full)', color: '#f44336', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  installBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },
  installDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' },
  installedBadge: { textAlign: 'center', fontSize: 'var(--font-size-xs)', color: '#4CAF50', fontWeight: 700, padding: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  modal: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32 },
  modalTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-lg)', textAlign: 'center' },
  guideSteps: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' },
  guideStep: { display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 },
  guideNum: { width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontSize: 'var(--font-size-2xs)' },
  modalClose: { width: '100%', padding: 13, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 700, cursor: 'pointer' },

  withdrawWrap: { textAlign: 'center', marginTop: 14 },
  withdrawLink: { background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-2xs)', textDecoration: 'underline', cursor: 'pointer', padding: 4, opacity: 0.6 },
  withdrawIcon: { fontSize: 40, textAlign: 'center', marginBottom: 8 },
  withdrawTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', textAlign: 'center', marginBottom: 'var(--spacing-md)' },
  withdrawDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text)', textAlign: 'center', lineHeight: 1.6, marginBottom: 'var(--spacing-md)' },
  withdrawList: { margin: '0 0 var(--spacing-lg)', padding: '12px 16px 12px 32px', background: '#FFF0F0', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: '#c62828', lineHeight: 1.8 },
  withdrawConfirmLabel: { fontSize: 'var(--font-size-sm)', textAlign: 'center', marginBottom: 8, color: 'var(--color-text)' },
  withdrawInputRow: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--spacing-md)' },
  withdrawInput: { flex: 1, padding: '12px var(--spacing-md)', border: '1.5px solid #f44336', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-base)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' },
  withdrawErrorMsg: { fontSize: 'var(--font-size-xs)', color: '#f44336', textAlign: 'center', margin: '0 0 var(--spacing-sm)' },
  withdrawBtn: { flexShrink: 0, padding: '12px 16px', background: '#f44336', color: '#fff', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', fontWeight: 800, cursor: 'pointer' },
  withdrawCancel: { width: '100%', padding: 12, background: 'none', color: 'var(--color-text-muted)', border: 'none', fontSize: 'var(--font-size-sm)', fontWeight: 600, cursor: 'pointer' },
}
