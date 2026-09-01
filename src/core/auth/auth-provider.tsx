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
    // main.tsx corre connector.init() antes de montar el árbol, así que en el caso
    // normal currentSession ya refleja la sesión persistida. Igual nos suscribimos a
    // sessionStarted para cubrir el login en caliente y los refreshes de token que
    // supabase-js propaga vía onAuthStateChange → updateSession → sessionStarted.
    setSession(connector.currentSession)

    const cleanup = connector.registerListener({
      initialized: () => {},
      sessionStarted: (newSession) => {
        setSession(newSession)
      },
    })

    // Solo dejamos de "cargar" cuando el connector terminó de restaurar la sesión.
    // Evita un flash de estado no-autenticado si el effect corriera antes de init().
    if (connector.ready) {
      setLoading(false)
    } else {
      connector
        .init()
        .catch(() => {})
        .finally(() => {
          setSession(connector.currentSession)
          setLoading(false)
        })
    }

    return cleanup
  }, [])

  const signOut = async () => {
    // try/finally: si db.disconnect() falla, igual limpiamos la sesión en React.
    // Sin esto, un error en disconnect dejaría la UI en estado "autenticado fantasma"
    // aunque la sesión de Supabase ya esté cerrada.
    try {
      await connector.logout()
      await db.disconnect()
    } finally {
      setSession(null)
    }
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
