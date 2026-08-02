import RiceBowlIcon from '../components/RiceBowlIcon'

// 로그인 여부와 무관하게 접근 가능한 공개 페이지. 구글 플레이의 "아동 안전 표준(Child Safety
// Standards)" 정책상 CSAE(아동 성적 학대 및 착취) 방지 표준을 앱 밖에 게시한 링크로 제출해야 한다.
// /privacy와 달리 이 내용은 어드민에서 편집하는 항목이 아니라 정책 문서라 컴포넌트에 직접 담는다.
export default function ChildSafetyPage() {
  return (
    <div style={styles.page}>
      <div style={styles.top}>
        <div style={styles.logo}><RiceBowlIcon size={40} /></div>
        <h1 style={styles.title}>아동·청소년 보호 정책</h1>
      </div>
      <div style={styles.card}>
        <div style={styles.body}>{CONTENT}</div>
      </div>
    </div>
  )
}

const CONTENT = `같이 먹자는 아동 성적 학대 및 착취(Child Sexual Abuse and Exploitation, CSAE)에 대해 무관용 원칙을 적용합니다. 이 정책은 서비스 내 모든 콘텐츠와 이용자 간 상호작용(그룹, 밥팟, 댓글, 모먼트, 가고 싶은 곳, 프로필 등)에 적용됩니다.

1. 금지 행위

다음 행위는 예외 없이 금지되며, 발견 시 콘텐츠 삭제와 계정 제재, 관계 법령에 따른 수사기관 신고로 이어집니다.

- 아동에 대한 성적 학대·착취를 묘사, 조장, 미화하는 콘텐츠의 제작·업로드·공유·요청
- 미성년자를 성적 대상화하거나 부적절하게 접촉하려는 시도
- 아동 성적 학대 자료(CSAM)의 유포, 링크 공유, 배포 시도
- 미성년자로 추정되는 이용자를 대상으로 한 그루밍(신뢰를 이용한 접근) 행위

만 14세 미만 아동은 법정대리인의 동의 없이 서비스에 가입할 수 없으며, 확인되는 즉시 계정을 삭제합니다.

2. 신고 방법

이용자는 앱 내 모먼트, 댓글, 가고 싶은 곳, 사용자 프로필 등에서 신고 기능을 통해 부적절한 콘텐츠나 이용자를 즉시 신고할 수 있습니다. 신고 시 사유(부적절한 콘텐츠, 괴롭힘/혐오 발언, 사칭/사기, 기타)와 상세 내용을 남길 수 있습니다.

앱 내 신고가 어려운 경우, 아래 이메일로 직접 문의할 수 있습니다.

담당자: 이한욱
이메일: noiea@naver.com

3. 처리 절차

접수된 신고는 운영팀이 검토하며, 위반이 확인되면 다음과 같은 조치를 취합니다.

- 위반 콘텐츠의 즉시 삭제
- 계정 이용 제한 또는 영구 정지
- 아동 성적 학대·착취와 관련된 사안은 대한민국 관계 법령(아동·청소년의 성보호에 관한 법률 등)에 따라 수사기관에 신고

4. 법적 근거

이 정책은 대한민국 「아동·청소년의 성보호에 관한 법률」, 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」 및 Google Play 아동 안전 표준 정책을 준수하기 위해 마련되었습니다.

공고일자: 2026년 8월 2일`

const styles = {
  page: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: 'var(--spacing-lg)', gap: 'var(--spacing-lg)', minHeight: '100dvh',
    maxWidth: 720, margin: '0 auto', boxSizing: 'border-box',
  },
  top: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' },
  logo: { marginBottom: 4 },
  title: { fontFamily: 'var(--font-title)', fontSize: 'var(--font-size-xl)', fontWeight: 900, margin: 0 },
  card: {
    width: '100%', background: 'var(--color-surface)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)', boxShadow: 'var(--shadow-md)', boxSizing: 'border-box',
  },
  body: {
    fontSize: 'var(--font-size-sm)', color: 'var(--color-text)',
    lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
}
