import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { getSessionUser, fetchProfileForAuthUser } from './db'

const UserContext = createContext(null)

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 실패하면 던지는 프로필 조회 함수를 몇 번 재시도해보고, 그래도 안 되면 그때 포기한다.
// 네트워크가 잠깐 끊긴 것뿐인데 그걸 로그아웃으로 오인하지 않기 위함.
async function withRetry(fn, retries = 2, delayMs = 800) {
  try {
    return await fn()
  } catch (e) {
    if (retries <= 0) throw e
    await wait(delayMs)
    return withRetry(fn, retries - 1, delayMs)
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 로딩중

  // check()가 항상 최신 user 값을 보게 하려고 ref로도 같이 들고 있는다 — 아래 useEffect는
  // 마운트 시 한 번만 실행되므로([] 의존성), 그 안의 클로저는 최초 state(undefined)에 갇혀
  // 있어서 이후 값을 알 수 없다.
  const userRef = useRef(undefined)
  const checkingRef = useRef(false)
  const setUserBoth = (value) => { userRef.current = value; setUser(value) }

  useEffect(() => {
    // 초기/재연결 세션 확인. 여기서 던져진 에러는 절대 로그아웃으로 해석하지 않는다 —
    // getSessionUser()가 던지는 경우는 (1) 로컬에 세션이 남아있는데 리프레시가 네트워크
    // 문제로 실패했거나 (2) 프로필 조회가 네트워크/서버 문제로 실패한 경우뿐이고, 둘 다
    // "세션이 없다"는 확정 신호가 아니다(세션이 정말 없으면 네트워크 없이 즉시 null이 온다).
    // 진짜 로그아웃(리프레시 토큰이 서버에서 거부됨 등)은 supabase가 내부적으로 세션을
    // 지우면서 SIGNED_OUT 이벤트를 반드시 같이 쏴주므로, 그건 아래 onAuthStateChange가 처리한다.
    // 그래서 여기서 실패하면 로딩 상태로 남겨두고, 재연결되는 시점(online/visibilitychange)에
    // 다시 시도한다 — 살아있는 세션을 오인해서 로그인 화면으로 튕겨내는 걸 막기 위함.
    const check = () => {
      if (userRef.current !== undefined || checkingRef.current) return
      checkingRef.current = true
      withRetry(getSessionUser)
        .then(setUserBoth)
        .catch((e) => console.error(e))
        .finally(() => { checkingRef.current = false })
    }

    check()
    window.addEventListener('online', check)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    // 로그인/로그아웃 상태 변경 구독.
    // 콜백을 async로 두고 그 안에서 supabase.auth.getSession() 등 auth 락이 필요한 호출을
    // await하면 안 된다 — 이 콜백 자체가 auth 내부 락을 쥔 채로 실행되기 때문에, 그 락을
    // 또 기다리는 순간 영원히 풀리지 않는다(소셜 로그인 직후 밥공기 아이콘에서 멈추고
    // 새로고침해야 풀리던 문제가 이것 때문이었다 — 이메일 로그인은 OnboardingPage가 login()을
    // 직접 불러 이 콜백을 거치지 않아 증상이 안 보였을 뿐). 그래서 콜백은 동기 함수로 두고,
    // 두 번째 인자로 이미 넘어오는 session을 그대로 써서 getSession()을 다시 부르지 않는다.
    // 프로필 조회(.from('users')...)는 auth 락과 무관한 일반 DB 호출이라 안전하다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        if (!session) return
        withRetry(() => fetchProfileForAuthUser(session.user))
          .then(setUserBoth)
          .catch((e) => {
            // 로그인 자체는 성공했는데 프로필 조회가 계속 실패하는 경우 — 여기서 null로
            // 덮어쓰면 애써 로그인한 사용자를 다시 로그인 화면으로 튕겨내게 되니, 기존 상태를
            // 건드리지 않고 넘어간다(다음 SIGNED_IN이나 재조회 시점에 다시 시도된다).
            console.error(e)
          })
      } else if (event === 'SIGNED_OUT') {
        setUserBoth(null)
      }
    })

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const login = (userData) => setUserBoth(userData)

  const logout = async () => {
    const { signOut } = await import('./db')
    await signOut()
    setUserBoth(null)
  }

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
