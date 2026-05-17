import { useState, useEffect, useCallback } from 'react'
import { connector } from '@/core/db/powersync/connector'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

function authHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  }
}

function getAccessToken(): string | null {
  return connector.currentSession?.access_token ?? null
}

// ── Hook: estado de conexión del usuario actual ──────────────────────────────

export function useGoogleCalendarStatus() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const checkStatus = useCallback(async () => {
    setLoading(true)
    const token = getAccessToken()
    if (!token) { setConnected(false); setLoading(false); return }

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=status`,
        { headers: authHeaders(token) }
      )
      const data = await res.json()
      setConnected(data.connected ?? false)
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void checkStatus() }, [checkStatus])

  return { connected, loading, recheck: checkStatus }
}

// ── Iniciar flujo OAuth (abre popup) ─────────────────────────────────────────

export async function iniciarConexionGoogleCalendar(): Promise<void> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin sesión activa')

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=url`,
    { headers: authHeaders(token) }
  )
  const { url, error } = await res.json()
  if (error || !url) throw new Error(error ?? 'No se pudo obtener la URL de autorización')

  return new Promise((resolve) => {
    const popup = window.open(url, 'google-calendar-oauth', 'width=520,height=620,scrollbars=yes,resizable=yes')

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
        window.removeEventListener('message', handleMessage)
        clearInterval(checkClosed)
        popup?.close()
        resolve()
      }
    }

    window.addEventListener('message', handleMessage)

    // Fallback: si el popup se cierra manualmente
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed)
        window.removeEventListener('message', handleMessage)
        resolve()
      }
    }, 600)
  })
}

// ── Desconectar Google Calendar ──────────────────────────────────────────────

export async function desconectarGoogleCalendar(): Promise<void> {
  const token = getAccessToken()
  if (!token) throw new Error('Sin sesión activa')

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/google-calendar-auth?action=disconnect`,
    { method: 'POST', headers: authHeaders(token) }
  )
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error ?? 'Error al desconectar')
  }
}

// ── Sincronizar cita (best-effort, no lanza si falla) ───────────────────────

export interface CitaSyncData {
  fecha_inicio: string
  fecha_fin: string
  cliente_nombre?: string
  servicios?: string[]
  notas?: string | null
  status?: string
  google_event_id?: string | null
}

export async function sincronizarCitaGoogle(params: {
  action: 'create' | 'update' | 'delete'
  profesional_id: string
  cita: CitaSyncData
}): Promise<{ google_event_id?: string } | null> {
  const token = getAccessToken()
  if (!token) return null

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(params),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    // Sync es best-effort: no bloquear la operación principal si falla
    return null
  }
}

// ── Obtener horarios ocupados en Google Calendar ─────────────────────────────

export async function obtenerBusyTimesGoogle(
  profesionalId: string,
  timeMin: string,
  timeMax: string
): Promise<{ start: string; end: string }[]> {
  const token = getAccessToken()
  if (!token) return []

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ action: 'freebusy', profesional_id: profesionalId, timeMin, timeMax }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.busy ?? []
  } catch {
    return []
  }
}
