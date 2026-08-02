import { Outlet } from 'react-router-dom'
import { useHeaderConfig } from '../lib/HeaderConfigContext'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

// 헤더 config가 바뀔 때 이 조각만 리렌더되도록 분리 — TabLayout이 직접 useHeaderConfig를
// 부르면 config가 바뀔 때마다 레이아웃 전체(Outlet 포함)가 리렌더되고, 그 안에서 페이지가
// usePageHeader 이펙트를 다시 실행해 setConfig를 또 부르는 무한 루프(React #185)가 생긴다.
function HeaderSlot() {
  const config = useHeaderConfig()
  return <AppHeader {...config} />
}

// 일정/모먼트/친구/내 계정 공용 레이아웃 — 이 4개 페이지는 헤더가 항상 고정 노출이고
// 본문 영역이 자체적으로 스크롤되는 모델(overflow:hidden + 내부 overflowY:auto)이라
// TodayLayout(문서 스크롤 + 헤더 숨김)과 분리했다. 게스트는 guestSafe()가 라우트 단에서
// 이미 걸러내므로 BottomNav는 항상 보여준다.
export default function TabLayout() {
  return (
    <div style={styles.wrap}>
      <HeaderSlot />
      <Outlet />
      <BottomNav />
    </div>
  )
}

const styles = {
  // #root는 min-height:100dvh(최솟값만)라 콘텐츠가 한 화면보다 길어지면 그대로 늘어난다.
  // flex:1로만 두면 이 래퍼도 같이 늘어나 overflow:hidden이 아무것도 못 자르고, 안의
  // "고정 헤더 + 내부 스크롤" 모델이 무너져 문서 전체가 스크롤되며 헤더까지 밀려 올라간다.
  // height를 뷰포트 높이로 못박아야 overflow:hidden이 실제로 걸리고, 본문(body/list 등의
  // overflowY:auto)만 내부적으로 스크롤된다.
  wrap: { height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
}
