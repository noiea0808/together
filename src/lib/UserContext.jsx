import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'
import { getSessionUser } from './db'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 로딩중

  useEffect(() => {
    // 초기 세션 확인
    getSessionUser().then(setUser).catch(() => setUser(null))

    // 로그인/로그아웃 상태 변경 구독
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        const profile = await getSessionUser()
        setUser(profile)
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
