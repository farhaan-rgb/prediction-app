'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@/lib/types'

interface UserContextType {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  logout: () => void
}

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: () => {},
})

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('prediction_user_id')
    if (!stored) {
      setLoading(false)
      return
    }
    supabase
      .from('users')
      .select('*')
      .eq('id', stored)
      .single()
      .then(({ data }) => {
        if (data) setUserState(data)
        setLoading(false)
      })
  }, [])

  const setUser = (u: User | null) => {
    setUserState(u)
    if (u) localStorage.setItem('prediction_user_id', u.id)
    else localStorage.removeItem('prediction_user_id')
  }

  const logout = () => {
    localStorage.removeItem('prediction_user_id')
    setUserState(null)
  }

  return (
    <UserContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
