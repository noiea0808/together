import { createContext, useContext, useState, useEffect } from 'react'
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

  useEffect(() => {
    // 초기 세션 확인 — 재시도까지 다 실패하면 그제서야 비로그인으로 확정한다.
    withRetry(getSessionUser).then(setUser).catch(() => setUser(null))

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
          .then(setUser)
          .catch((e) => {
            // 로그인 자체는 성공했는데 프로필 조회가 계속 실패하는 경우 — 여기서 null로
            // 덮어쓰면 애써 로그인한 사용자를 다시 로그인 화면으로 튕겨내게 되니, 기존 상태를
            // 건드리지 않고 넘어간다(다음 SIGNED_IN이나 재조회 시점에 다시 시도된다).
            console.error(e)
          })
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = (userData) => setUser(userData)

  const logout = async () => {
    const { signOut } = await import('./db')
    await signOut()
    setUser(null)
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
