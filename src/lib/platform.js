import { Capacitor } from '@capacitor/core'

// STG 빌드(`vite build --mode stg`, capacitor.config.stg.json)는 프로덕션 앱과 같은 기기에
// 나란히 설치되는 별도 패키지(com.gachimeokja.app)라 백엔드를 프로덕션과 분리해야 한다.
export const IS_STG = import.meta.env.MODE === 'stg'

// 커패시터 네이티브 앱에서 window.location.origin은 번들 dist가 로드되는
// https://localhost 라 공유 가능한 링크로 못 쓴다. 실제 배포 도메인으로 대체한다.
const PUBLIC_ORIGIN = IS_STG
  ? 'https://together-git-staging-noieas-projects.vercel.app'
  : 'https://www.eat-together.net'

export function getPublicOrigin() {
  return Capacitor.isNativePlatform() ? PUBLIC_ORIGIN : window.location.origin
}
