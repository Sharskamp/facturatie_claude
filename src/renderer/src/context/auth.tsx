import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  naam: string
  email: string
  bedrijfsnaam?: string | null
}

interface AuthContextType {
  user: User | null
  laden: boolean
  login: (user: User) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    const opgeslagen = localStorage.getItem('adminpro_user')
    if (opgeslagen) {
      try {
        setUser(JSON.parse(opgeslagen))
      } catch {}
    }
    setLaden(false)
  }, [])

  function login(user: User) {
    setUser(user)
    localStorage.setItem('adminpro_user', JSON.stringify(user))
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('adminpro_user')
  }

  return (
    <AuthContext.Provider value={{ user, laden, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth buiten AuthProvider')
  return ctx
}
