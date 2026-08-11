import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { openInChromeAndroid } from '../lib/inAppBrowser'
import { useEscKey } from '../lib/useEscKey'
import { PRIMARY_ACTION_BUTTON } from '../styles/buttons'
import RiceBowlIcon from './RiceBowlIcon'

// 탭 아이콘 — currentColor를 써서 탭 활성/비활성 색을 그대로 물려받는 얇은 라인 아이콘.
// 안드로이드는 하단 홈 인디케이터, 아이폰은 상단 노치로 구분한다(로고 대신 형태로 구분).
function PhoneIcon({ notch }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="7" y="2" width="10" height="20" rx="2.5" />
      {notch
        ? <line x1="10.5" y1="4.2" x2="13.5" y2="4.2" strokeWidth="2.2" />
        : <line x1="10.5" y1="18.3" x2="13.5" y2="18.3" />}
    </svg>
  )
}
function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </svg>
  )
}

const GUIDE_TABS = [
  { key: 'android', label: 'Android', icon: <PhoneIcon /> },
  { key: 'iphone', label: 'iPhone', icon: <PhoneIcon notch /> },
  { key: 'pc', label: 'PC', icon: <MonitorIcon /> },
]

// OS별 설치 안내 — 소개 문구 + 번호가 매겨진 단계. iOS/Android는 홈 화면 추가, PC는 즐겨찾기 추가.
const GUIDE_CONTENT = {
  android: {
    intro: 'Chrome 등 브라우저에서 홈 화면에 추가하면 앱처럼 바로 열 수 있어요.',
    steps: [
      <>Chrome 주소창 오른쪽 <strong>⋮ 메뉴</strong>를 탭해주세요.</>,
      <>메뉴에서 <strong>홈 화면에 추가</strong>를 선택해주세요.</>,
      <><strong>추가</strong>를 누르면 완료! 홈 화면의 밥그릇 아이콘으로 실행할 수 있어요.</>,
    ],
  },
  iphone: {
    intro: 'Safari·Chrome 등 브라우저에서 홈 화면에 추가하면 앱처럼 바로 열 수 있어요.',
    steps: [
      <>브라우저 <strong>하단 또는 상단의 공유 버튼</strong>(⇧)을 눌러주세요.</>,
      <>메뉴에서 <strong>홈 화면에 추가</strong>를 선택해주세요.</>,
      <>오른쪽 상단 <strong>추가</strong>를 누르면 완료! 홈 화면의 밥그릇 아이콘으로 실행할 수 있어요.</>,
    ],
  },
  pc: {
    intro: '브라우저 즐겨찾기에 추가하면 다음에 더 빠르게 열 수 있어요.',
    steps: [
      <>주소창 오른쪽 <strong>별표(☆)</strong> 아이콘을 클릭하거나 <strong>Ctrl+D</strong>(Mac: ⌘+D)를 눌러주세요.</>,
      <><strong>완료</strong>를 클릭하면 즐겨찾기에 저장돼요.</>,
    ],
  },
}

// 홈 화면 추가 / 즐겨찾기 추가 CTA — MyAccountPage와 OnboardingPage에서 공용으로 사용
// variant: 'default'(주 버튼 스타일) | 'subtle'(로그인 버튼들 옆에서 튀지 않는 보조 스타일)
export default function InstallAppPrompt({ style, variant = 'default', hideDesc = false, buttonLabel = '방법보기' }) {
  const { isInstalled, isIOS, isAndroid, isPC, isInAppBrowser } = useInstallPrompt()
  const [showGuide, setShowGuide] = useState(false)
  const [guideTab, setGuideTab] = useState(() => (isIOS ? 'iphone' : isAndroid ? 'android' : 'pc'))
  const [showInAppGuide, setShowInAppGuide] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const iconColor = variant === 'subtle' ? 'currentColor' : '#fff'

  useEscKey(useCallback(() => {
    if (showInAppGuide) { setShowInAppGuide(false); return }
    if (showGuide) setShowGuide(false)
  }, [showInAppGuide, showGuide]))

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
              else {
                setGuideTab(isIOS ? 'iphone' : isAndroid ? 'android' : 'pc')
                setShowGuide(true)
              }
            }}
          >
            {isPC ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill={iconColor}><path d="M6 3a1 1 0 0 0-1 1v17l7-4.5 7 4.5V4a1 1 0 0 0-1-1H6Z" /></svg>
            ) : (
              <span>📲</span>
            )}
            <span>{buttonLabel}</span>
          </button>
          {!isPC && !hideDesc && <p style={styles.installDesc}>아이콘을 탭하면 앱처럼 바로 열려요.</p>}
        </>
      )}
      {isInstalled && (
        <div style={styles.installedBadge}>✓ 홈 화면에 설치됨</div>
      )}

      {/* 카톡 등 인앱 브라우저 안내 모달 — 여기선 설치 자체가 불가능해서 외부 브라우저로 나가라고 안내
          body에 포탈로 렌더링 — 애니메이션 중인 조상(transform/filter)이 fixed 자식의 containing block이
          되어버리는 문제를 피하기 위해 이 모달은 항상 document.body 바로 아래에서 렌더링한다. */}
      {showInAppGuide && createPortal(
        <div style={styles.modalOverlay} onClick={() => setShowInAppGuide(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {isAndroid ? '브라우저에서 열어야 설치할 수 있어요' : <>사파리 브라우저에서 열어야{'\n'}앱추가를 할 수 있어요</>}
            </div>
            <p style={styles.modalDesc}>
              {isAndroid
                ? '카톡 안에서는 설치를 진행할 수 없어요. 아래 버튼을 누르면 크롬으로 바로 열려요.'
                : <>아래 버튼으로 링크를 복사한 뒤{'\n'}사파리에 붙여넣어 열어주세요</>}
            </p>

            {isAndroid && (
              <button style={{ ...styles.modalClose, marginBottom: 12 }} onClick={openInChromeAndroid}>
                Chrome에서 열기
              </button>
            )}
            {!isAndroid && (
              <button style={{ ...styles.modalClose, marginBottom: 'var(--spacing-lg)' }} onClick={copyCurrentLink}>
                {linkCopied ? '복사했어요 ✓' : '링크 복사하기'}
              </button>
            )}

            {isAndroid ? (
              <>
                <div style={styles.guideDivider}>버튼이 안 될 때</div>
                <div style={styles.guideSteps}>
                  <div style={styles.guideStep}>
                    <span style={styles.guideNum}>1</span>
                    <span>화면 우측 상단의 <strong>⋮ 메뉴</strong> 또는 <strong>공유 아이콘</strong>을 찾아 탭하세요.</span>
                  </div>
                  <div style={styles.guideStep}>
                    <span style={styles.guideNum}>2</span>
                    <span><strong>다른 브라우저로 열기</strong>가 있으면 선택하세요.</span>
                  </div>
                  <div style={styles.guideStep}>
                    <span style={styles.guideNum}>3</span>
                    <span>새로 열린 브라우저에서 다시 <strong>홈 화면에 추가</strong>를 눌러주세요.</span>
                  </div>
                </div>
              </>
            ) : (
              <p style={styles.guideSingleLine}>
                새로 열린 브라우저에서{'\n'}다시 <strong>홈 화면에 추가</strong>를 눌러주세요.
              </p>
            )}
            <button style={styles.modalCancel} onClick={() => setShowInAppGuide(false)}>
              닫기
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* OS별 설치 · 바로가기 안내 모달 — 기기에 맞는 탭이 기본 선택된 채로 열린다. 마찬가지로 포탈 사용. */}
      {showGuide && createPortal(
        <div style={styles.modalOverlay} onClick={() => setShowGuide(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.guideHeader}>
              <div style={styles.guideHeaderIcon}>
                <RiceBowlIcon size={28} />
              </div>
              <div>
                <div style={styles.guideHeaderTitle}>설치 · 바로가기 안내</div>
                <div style={styles.guideHeaderSub}>기기에 맞는 방법을 확인해 보세요.</div>
              </div>
            </div>

            <div style={styles.tabBar}>
              {GUIDE_TABS.map(t => (
                <button
                  key={t.key}
                  style={{ ...styles.tabBtn, ...(guideTab === t.key ? styles.tabBtnActive : {}) }}
                  onClick={() => setGuideTab(t.key)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <p style={styles.guideIntro}>{GUIDE_CONTENT[guideTab].intro}</p>
            <div style={styles.guideSteps}>
              {GUIDE_CONTENT[guideTab].steps.map((step, i) => (
                <div key={i} style={styles.guideStep}>
                  <span style={styles.guideNum}>{i + 1}</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>

            <button style={styles.modalClose} onClick={() => setShowGuide(false)}>
              확인
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  installBtn: { ...PRIMARY_ACTION_BUTTON, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  installBtnSubtle: { padding: '7.5px 12.5px', background: 'var(--color-surface)', border: '1.5px solid var(--color-selected-a20)', color: 'var(--color-chip-text)', fontSize: 'var(--font-size-xs)', fontWeight: 600, boxShadow: 'none' },
  installDesc: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' },
  installedBadge: { textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', fontWeight: 600, padding: 8 },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 },
  modal: { width: '100%', maxWidth: 'var(--max-width)', background: 'var(--color-surface)', borderRadius: '20px 20px 0 0', padding: 'var(--spacing-lg)', paddingBottom: 'calc(32px + var(--safe-area-inset-bottom))' },
  modalTitle: { fontWeight: 700, fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-lg)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.4 },
  modalDesc: { fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6, margin: '0 0 var(--spacing-lg)', whiteSpace: 'pre-line' },
  guideHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--spacing-lg)' },
  guideHeaderIcon: {
    width: 48, height: 48, borderRadius: 'var(--radius-full)',
    background: 'var(--color-chip-bg)',
    border: '1px solid var(--color-selected-a20)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  guideHeaderTitle: { fontWeight: 700, fontSize: 'var(--font-size-lg)', letterSpacing: '-0.3px' },
  guideHeaderSub: { fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 2 },
  tabBar: { display: 'flex', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-full)', padding: 4, gap: 4, marginBottom: 'var(--spacing-lg)' },
  tabBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    padding: '10px 0', border: 'none', borderRadius: 'var(--radius-full)', background: 'transparent',
    color: 'var(--color-text-muted)', fontWeight: 600, fontSize: 'var(--font-size-xs)',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
  },
  tabBtnActive: { background: 'var(--color-surface)', color: 'var(--color-selected)', boxShadow: 'var(--shadow-sm)' },
  guideIntro: {
    fontSize: 'var(--font-size-xs)', color: 'var(--color-chip-text)', fontWeight: 600, lineHeight: 1.5,
    background: 'var(--color-chip-bg)', border: '1px solid var(--color-selected-a20)',
    borderRadius: 'var(--radius-md)', padding: '10px var(--spacing-md)', margin: '0 0 var(--spacing-lg)',
  },
  guideDivider: { fontSize: 'var(--font-size-2xs)', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center', margin: '0 0 var(--spacing-md)' },
  guideSteps: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-xl)' },
  guideSingleLine: { fontSize: 'var(--font-size-sm)', lineHeight: 1.6, textAlign: 'center', margin: '0 0 var(--spacing-xl)', whiteSpace: 'pre-line' },
  guideStep: {
    display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', fontSize: 'var(--font-size-xs)', lineHeight: 1.5,
    background: 'var(--color-surface-2)', borderRadius: 'var(--radius-md)', padding: '12px var(--spacing-md)',
  },
  guideNum: {
    width: 24, height: 24, borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-text)',
    border: '1.5px solid var(--color-border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0,
    fontSize: 'var(--font-size-2xs)',
  },
  modalClose: { ...PRIMARY_ACTION_BUTTON },
  modalCancel: { width: '100%', padding: 13, background: 'none', color: 'var(--color-text-muted)', border: 'none', borderRadius: 'var(--radius-full)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' },
}
