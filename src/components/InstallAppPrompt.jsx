import { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'

// 카톡 등 인앱 브라우저는 "다른 브라우저로 열기" 메뉴가 아예 없거나 위치가 제각각이라
// 안내 문구만으로는 못 찾는 경우가 많다. 안드로이드는 intent:// 스킴으로 크롬을 직접
// 띄울 수 있어 그 방법을 우선 쓴다 — 이건 앱(카톡)의 메뉴 유무와 무관하게 안드로이드
// OS 레벨에서 처리되는 링크라 인앱 브라우저에 그런 버튼이 없어도 동작한다.
// iOS는 인앱 웹뷰에서 사파리를 강제로 띄우는 공식적인 방법이 없어서, 대신 링크를
// 클립보드에 복사해주고 사용자가 직접 사파리를 열어 붙여넣도록 안내한다.
function openInChromeAndroid() {
  const { protocol, host, pathname, search, hash } = window.location
  const rest = `${host}${pathname}${search}${hash}`
  window.location.href = `intent://${rest}#Intent;scheme=${protocol.replace(':', '')};package=com.android.chrome;end`
}

// 홈 화면 추가 / 즐겨찾기 추가 CTA — MyAccountPage와 OnboardingPage에서 공용으로 사용
// variant: 'default'(주 버튼 스타일) | 'subtle'(로그인 버튼들 옆에서 튀지 않는 보조 스타일)
export default function InstallAppPrompt({ style, variant = 'default', hideDesc = false }) {
  const { installPrompt, triggerInstall, isInstalled, isIOS, isAndroid, isPC, isInAppBrowser } = useInstallPrompt()
  const [showIOSGuide, setShowIOSGuide] = useState(false)
  const [showAndroidGuide, setShowAndroidGuide] = useState(false)
  const [showPCGuide, setShowPCGuide] = useState(false)
  const [showInAppGuide, setShowInAppGuide] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const iconColor = variant === 'subtle' ? 'currentColor' : '#fff'

  const copyCurrentLink = () => {
    navigator.clipboard?.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div style={{ ...styles.wrap, ...style }}>
      {!isInstalled && (
        <>
          <button
            style={{ ...styles.installBtn, ...(variant === 'subtle' ? styles.installBtnSubtle : {}) }}
            onClick={() => {
              // 카톡 등 인앱 브라우저는 beforeinstallprompt도, 크롬의 ⋮ 메뉴도 없어서
              // 다른 안내 분기보다 먼저 걸러야 한다.
              if (isInAppBrowser) setShowInAppGuide(true)
              else if (isPC) setShowPCGuide(true)
              else if (isIOS) setShowIOSGuide(true)
              else if (installPrompt) triggerInstall()
              else setShowAndroidGuide(true)
            }}
          >
            {isPC ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill={iconColor}><path d="M6 3a1 1 0 0 0-1 1v17l7-4.5 7 4.5V4a1 1 0 0 0-1-1H6Z" /></svg>
            ) : (
              <span>📲</span>
            )}
            <span>{isPC ? '즐겨찾기에 추가' : '홈 화면에 앱 추가'}</span>
          </button>
          {!isPC && !hideDesc && <p style={styles.installDesc}>아이콘을 탭하면 앱처럼 바로 열려요.</p>}
        </>
      )}
      {isInstalled && (
        <div style={styles.installedBadge}>✓ 홈 화면에 설치됨</div>
      )}

      {/* 카톡 등 인앱 브라우저 안내 모달 — 여기선 설치 자체가 불가능해서 외부 브라우저로 나가라고 안내 */}
      {showInAppGuide && (
        <div style={styles.modalOverlay} onClick={() => setShowInAppGuide(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>브라우저에서 열어야 설치할 수 있어요</div>
            <p style={styles.modalDesc}>
              {isAndroid
                ? '카톡 안에서는 설치를 진행할 수 없어요. 아래 버튼을 누르면 크롬으로 바로 열려요.'
                : '카톡 안에서는 설치를 진행할 수 없어요. 아래 버튼으로 링크를 복사한 뒤 사파리에 붙여넣어 열어주세요.'}
            </p>

            {isAndroid && (
              <button style={{ ...styles.modalClose, marginBottom: 12 }} onClick={openInChromeAndroid}>
                Chrome에서 열기
              </button>
            )}
            {!isAndroid && (
              <button style={{ ...styles.modalClose, marginBottom: 12 }} onClick={copyCurrentLink}>
                {linkCopied ? '복사했어요 ✓' : '링크 복사하기'}
              </button>
            )}

            <div style={styles.guideDivider}>버튼이 안 될 때</div>
            <div style={styles.guideSteps}>
              <div style={styles.guideStep}>
                <span style={styles.guideNum}>1</span>
                <span>
                  {isIOS
                    ? <>화면 하단(또는 우측 상단)의 <strong>··· 더보기</strong> 또는 <strong>공유</strong> 버튼을 찾아 탭하세요.</>
                    : <>화면 우측 상단의 <strong>⋮ 메뉴</strong> 또는 <strong>공유 아이콘</strong>을 찾아 탭하세요.</>
                  }
                </span>
              </div>
              <div style={styles.guideStep}>
                <span style={styles.guideNum}>2</span>
                <span>
                  {isIOS
                    ? <><strong>Safari로 열기</strong>가 있으면 선택하세요.</>
                    : <><strong>다른 브라우저로 열기</strong>가 있으면 선택하세요.</>
                  }
                </span>
              </div>
              <div style={styles.guideStep}>
                <span style={styles.guideNum}>3</span>
                <span>새로 열린 브라우저에서 다시 <strong>홈 화면에 추가</strong>를 눌러주세요.</span>
              </div>
            </div>
            <button style={styles.modalCancel} onClick={() => setShowInAppGuide(false)}>
              닫기
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
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  installBtn: { ...PRIMARY_ACTION_BUTTON, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  installBtnSubtle: { padding: '9px 14px', background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 600, boxShadow: 'none' },
  installDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' },
  installedBadge: { textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', fontWeight: 700, padding: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  modal: { width: '100%', maxWidth: 'var(--max-width)', background: '#fff', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 32 },
  modalTitle: { fontWeight: 800, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-lg)', textAlign: 'center' },
  modalDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--spacing-lg)' },
  guideDivider: { fontSize: 'var(--font-size-2xs)', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center', margin: '0 0 var(--spacing-md)' },
  guideSteps: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)' },
  guideStep: { display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 },
  guideNum: { width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontSize: 'var(--font-size-2xs)' },
  modalClose: { ...PRIMARY_ACTION_BUTTON },
  modalCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
