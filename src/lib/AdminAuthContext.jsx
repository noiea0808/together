import { createContext, useContext, useState, useEffect } from 'react'
import { adminSupabase } from './adminSupabase'
import { getAdminSessionUser, adminSignOut } from './adminAuth'

const AdminAuthContext = createContext(null)

export function AdminAuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(undefined) // undefined = 로딩중

  useEffect(() => {
    getAdminSessionUser().then(setAdminUser).catch(() => setAdminUser(null))

    const { data: { subscription } } = adminSupabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN') {
        setAdminUser(await getAdminSessionUser())
      } else if (event === 'SIGNED_OUT') {
        setAdminUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = (profile) => setAdminUser(profile)
  const logout = async () => {
    await adminSignOut()
    setAdminUser(null)
  }

  return (
    <AdminAuthContext.Provider value={{ adminUser, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  return useContext(AdminAuthContext)
}
