import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export function useTasaActual() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 1',
    [empresaId]
  )

  const tasa = data?.[0] as { id: string; fecha: string; valor: string; moneda_destino: string; created_at: string } | undefined

  return {
    tasa,
    tasaValor: tasa ? parseFloat(tasa.valor) : 0,
    isLoading,
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
