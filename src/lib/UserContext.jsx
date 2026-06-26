import { createContext, useContext, useState, useEffect } from 'react'
import { getUser } from './db'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 로딩중

  useEffect(() => {
    const savedId = localStorage.getItem('userId')
    if (savedId) {
      getUser(savedId)
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('userId')
          setUser(null)
        })
    } else {
      setUser(null)
    }
  }, [])

  const login = (userData) => {
    localStorage.setItem('userId', userData.id)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('userId')
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
