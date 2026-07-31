import { Outlet } from 'react-router-dom'
import { useUser } from '../lib/UserContext'
import { useHeaderConfig } from '../lib/HeaderConfigContext'
import AppHeader from './AppHeader'
import BottomNav from './BottomNav'

// 헤더 config가 바뀔 때 이 조각만 리렌더되도록 분리 — TodayLayout이 직접 useHeaderConfig를
// 부르면 config가 바뀔 때마다 레이아웃 전체(Outlet 포함)가 리렌더되고, 그 안에서 페이지가
// usePageHeader 이펙트를 다시 실행해 setConfig를 또 부르는 무한 루프(React #185)가 생긴다.
function HeaderSlot() {
  const config = useHeaderConfig()
  return <AppHeader {...config} />
}

// /today 전용 레이아웃 — TodayPage/GuestHomePage는 헤더가 스크롤에 반응해 접히므로
// (useHideOnScroll) 문서(window) 스크롤 모델을 그대로 쓴다. 게스트는 BottomNav를 안 보여준다.
export default function TodayLayout() {
  const { user } = useUser()
  return (
    <div style={styles.wrap}>
      <HeaderSlot />
      <Outlet />
      {!user?.is_guest && <BottomNav />}
    </div>
  )
}

const styles = {
  wrap: { flex: 1, display: 'flex', flexDirection: 'column' },
}
