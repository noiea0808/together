import { createContext, useContext, useLayoutEffect, useState } from 'react'

const DEFAULT_CONFIG = {}

// config(읽기)와 setConfig(쓰기)를 별도 컨텍스트로 분리한다 — 합쳐서 하나의 Provider value
// 객체로 내려주면, usePageHeader를 부르는 페이지 자신도 그 객체를 구독하게 돼서
// setConfig 호출 -> value 객체 재생성 -> 페이지 리렌더 -> 이펙트 재실행 -> 다시 setConfig
// 호출... 로 무한 루프(React #185, Maximum update depth exceeded)에 빠진다.
// useState가 반환하는 setter는 컴포넌트 생애주기 동안 항상 같은 참조이므로, setter만
// 담은 컨텍스트는 값이 절대 안 바뀌어 구독자를 불필요하게 리렌더시키지 않는다.
const HeaderConfigValueContext = createContext(DEFAULT_CONFIG)
const HeaderConfigSetterContext = createContext(() => {})

// AppHeader를 라우트 레이아웃(TodayLayout/TabLayout)에 한 번만 고정 마운트하고, 각 탭
// 페이지는 이 컨텍스트로 자기 헤더 내용(title/brand/action 등)만 등록한다. 페이지 전환 시
// 헤더 DOM 자체는 그대로 유지되고 내용만 갈아끼워진다 — 예전엔 페이지마다 AppHeader를
// 직접 렌더링해서 탭을 옮길 때마다 헤더까지 통째로 언마운트/리마운트됐다.
export function HeaderConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  return (
    <HeaderConfigSetterContext.Provider value={setConfig}>
      <HeaderConfigValueContext.Provider value={config}>
        {children}
      </HeaderConfigValueContext.Provider>
    </HeaderConfigSetterContext.Provider>
  )
}

// 탭 페이지에서 호출 — AppHeader에 전달할 props(title/brand/centerContent/action/hidden 등)를
// 그대로 넘기면 된다. 매 렌더마다 갱신하므로 onClick 등 콜백은 최신 클로저를 그대로 반영한다.
// setConfig만 구독하므로(값이 안 바뀌는 컨텍스트) 이 훅을 쓰는 페이지는 config 변경으로
// 재렌더되지 않는다.
export function usePageHeader(config) {
  const setConfig = useContext(HeaderConfigSetterContext)
  useLayoutEffect(() => {
    setConfig(config)
  })
}

export function useHeaderConfig() {
  return useContext(HeaderConfigValueContext)
}
