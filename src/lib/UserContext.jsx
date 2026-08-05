import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getSessionUser } from './db'

const UserContext = createContext(null)

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// getSessionUser()는 세션이 진짜 없을 때만 null을 반환하고, DB 조회가 일시적으로 실패하면
// 던진다(db.js 참고). 네트워크가 잠깐 끊긴 것뿐인데 그걸 로그아웃으로 오인하지 않도록,
// 여기서 몇 번 재시도해보고 그래도 안 되면 그때 포기한다.
async function getSessionUserWithRetry(retries = 2, delayMs = 800) {
  try {
    return await getSessionUser()
  } catch (e) {
    if (retries <= 0) throw e
    await wait(delayMs)
    return getSessionUserWithRetry(retries - 1, delayMs)
  }
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 로딩중

  useEffect(() => {
    // 초기 세션 확인 — 재시도까지 다 실패하면 그제서야 비로그인으로 확정한다.
    getSessionUserWithRetry().then(setUser).catch(() => setUser(null))

    // 로그인/로그아웃 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        try {
          const profile = await getSessionUserWithRetry()
          setUser(profile)
        } catch (e) {
          // 로그인 자체는 성공했는데 프로필 조회가 계속 실패하는 경우 — 여기서 null로
          // 덮어쓰면 애써 로그인한 사용자를 다시 로그인 화면으로 튕겨내게 되니, 기존 상태를
          // 건드리지 않고 넘어간다(다음 SIGNED_IN이나 재조회 시점에 다시 시도된다).
          console.error(e)
        }
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
