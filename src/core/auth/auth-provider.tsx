import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { connector } from '@/core/db/powersync/connector'
import { db } from '@/core/db/powersync'

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSession(connector.currentSession)
    setLoading(false)

    const cleanup = connector.registerListener({
      initialized: () => {},
      sessionStarted: (newSession) => {
        setSession(newSession)
      },
    })

    return cleanup
  }, [])

  const signOut = async () => {
    await connector.logout()
    await db.disconnect()
    setSession(null)
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
