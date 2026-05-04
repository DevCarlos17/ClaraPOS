import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow, todayStr } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface CajaFuerte {
  id: string
  empresa_id: string
  nombre: string
  moneda_id: string
  saldo_actual: string
  descripcion: string | null
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

// ─── Hooks de lectura ────────────────────────────────────────

export function useCajasFuerte() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM caja_fuerte WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { cajas: (data ?? []) as CajaFuerte[], isLoading }
}

export function useCajasFuerteActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM caja_fuerte WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { cajas: (data ?? []) as CajaFuerte[], isLoading }
}

// ─── Mutaciones ──────────────────────────────────────────────

export async function createCajaFuerte(params: {
  nombre: string
  moneda_id: string
  saldo_inicial?: number
  descripcion?: string
  empresa_id: string
  usuario_id: string
}): Promise<string> {
  const id = uuidv4()
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO caja_fuerte (id, empresa_id, nombre, moneda_id, saldo_actual, descripcion, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        params.empresa_id,
        params.nombre.toUpperCase(),
        params.moneda_id,
        '0.0000',
        params.descripcion ?? null,
        1,
        now,
        now,
        params.usuario_id,
      ]
    )

    // Si hay saldo inicial, crear movimiento de apertura
    if (params.saldo_inicial && params.saldo_inicial > 0) {
      const movId = uuidv4()
      const monto = params.saldo_inicial
      await tx.execute(
        `INSERT INTO mov_caja_fuerte (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo, descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movId,
          params.empresa_id,
          id,
          'INGRESO',
          'MANUAL',
          monto.toFixed(4),
          '0.0000',
          monto.toFixed(4),
          'Saldo inicial',
          0,
          0,
          todayStr(),
          now,
          params.usuario_id,
        ]
      )
      // Actualizar saldo en caja_fuerte
      await tx.execute(
        'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [monto.toFixed(4), now, id]
      )
    }
  })

  return id
}

export async function updateCajaFuerte(
  id: string,
  data: {
    nombre?: string
    descripcion?: string | null
    is_active?: boolean
    usuario_id?: string
  }
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.nombre !== undefined) {
    sets.push('nombre = ?')
    values.push(data.nombre.toUpperCase())
  }
  if (data.descripcion !== undefined) {
    sets.push('descripcion = ?')
    values.push(data.descripcion)
  }
  if (data.is_active !== undefined) {
    sets.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }
  if (data.usuario_id !== undefined) {
    sets.push('updated_by = ?')
    values.push(data.usuario_id)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)

  await db.execute(`UPDATE caja_fuerte SET ${sets.join(', ')} WHERE id = ?`, values)
}
