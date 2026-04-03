import React, { useEffect, useState } from 'react'
import { PowerSyncContext } from '@powersync/react'
import { db } from './db'
import { connector } from './connector'

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    let cleanup: (() => void) | undefined

    const initializePowerSync = async () => {
      try {
        if (navigator.storage && navigator.storage.persist) {
          const isPersisted = await navigator.storage.persist()
          if (isPersisted) {
            console.log('Storage persistente activado')
          }
        }

        await db.init()

        cleanup = connector.registerListener({
          initialized: () => {},
          sessionStarted: (session) => {
            console.log('Sesion iniciada, conectando PowerSync...', session.user?.email)
            db.connect(connector)
          },
        })

        try {
          await connector.init()

          if (connector.currentSession) {
            db.connect(connector)
          }
        } catch (initError: unknown) {
          const err = initError as { message?: string }
          const isNetworkError =
            err?.message?.includes('fetch') ||
            err?.message?.includes('NetworkError') ||
            err?.message?.includes('Failed to fetch') ||
            !navigator.onLine

          if (isNetworkError) {
            console.warn('Sin conexion - trabajando offline')
          } else {
            console.error('Error al inicializar connector:', initError)
          }
        }

        setIsInitialized(true)
      } catch (error) {
        console.error('Error al inicializar PowerSync:', error)
        setIsInitialized(true)
      }
    }

    initializePowerSync()

    return () => {
      cleanup?.()
    }
  }, [])

  if (!isInitialized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-linear-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl animate-pulse" />
            <div className="relative flex h-24 w-24 items-center justify-center animate-pulse">
              <span className="text-4xl font-bold text-primary">N21</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-base font-semibold text-foreground">Nexo21</p>
            <p className="text-xs text-muted-foreground">Cargando aplicacion...</p>
          </div>
        </div>
      </div>
    )
  }

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
