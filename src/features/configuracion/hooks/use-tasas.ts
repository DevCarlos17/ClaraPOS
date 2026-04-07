import { useEffect, useState } from 'react'
import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

interface TasaRow {
  id: string
  fecha: string
  valor: string
  moneda_destino: string
  created_at: string
}

interface TasaCache extends TasaRow {
  empresa_id: string
}

const TASA_CACHE_KEY = 'clarapos:last-tasa'

function readTasaCache(empresaId: string): TasaRow | undefined {
  if (!empresaId) return undefined
  try {
    const raw = localStorage.getItem(TASA_CACHE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as TasaCache
    if (parsed.empresa_id !== empresaId) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function writeTasaCache(tasa: TasaRow, empresaId: string) {
  try {
    const payload: TasaCache = { ...tasa, empresa_id: empresaId }
    localStorage.setItem(TASA_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota or serialization errors
  }
}

export function useTasaActual() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const [cachedTasa, setCachedTasa] = useState<TasaRow | undefined>(() => readTasaCache(empresaId))

  useEffect(() => {
    setCachedTasa(readTasaCache(empresaId))
  }, [empresaId])

  const { data, isLoading } = useQuery(
    'SELECT * FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 1',
    [empresaId]
  )

  const liveTasa = data?.[0] as TasaRow | undefined

  useEffect(() => {
    if (liveTasa && empresaId) {
      writeTasaCache(liveTasa, empresaId)
      setCachedTasa(liveTasa)
    }
  }, [liveTasa, empresaId])

  const tasa = liveTasa ?? cachedTasa
  const isFromCache = !liveTasa && !!cachedTasa

  return {
    tasa,
    tasaValor: tasa ? parseFloat(tasa.valor) : 0,
    isLoading: isLoading && !cachedTasa,
    isFromCache,
  }
}

export function useTasasHistorial() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 10',
    [empresaId]
  )

  return {
    tasas: (data ?? []) as { id: string; fecha: string; valor: string; moneda_destino: string; created_at: string }[],
    isLoading,
  }
}

export async function crearTasa(valor: number, empresaId: string) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('tasas_cambio')
    .values({
      id,
      fecha: now,
      valor: valor.toFixed(4),
      moneda_destino: 'USD',
      empresa_id: empresaId,
      created_at: now,
    })
    .execute()

  return id
}

// Alternative using raw PowerSync for transaction safety
export async function crearTasaRaw(valor: number, empresaId: string) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await db.execute(
    'INSERT INTO tasas_cambio (id, fecha, valor, moneda_destino, empresa_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, now, valor.toFixed(4), 'USD', empresaId, now]
  )

  return id
}
