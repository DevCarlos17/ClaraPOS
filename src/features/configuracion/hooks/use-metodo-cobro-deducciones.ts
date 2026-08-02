import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'

// PR-3 (metodo-cobro-deducciones): N conceptos de deduccion por metodo de
// cobro bancario (comision de pasarela, retencion ISLR, otros). Config
// editable, no ledger — soft-deactivate via is_active, sin DELETE fisico
// (SC-11). Todas las filas filtran por empresa_id (SC-12).

export interface MetodoCobroDeduccion {
  id: string
  empresa_id: string
  metodo_cobro_id: string
  cuenta_gasto_id: string
  concepto: string
  tipo: string // 'COMISION' | 'ISLR' | 'OTRO'
  porcentaje: string // NUMERIC(5,2) stored as string
  orden: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export type TipoDeduccion = 'COMISION' | 'ISLR' | 'OTRO'

/** Deducciones (activas e inactivas) de un metodo de pago, ordenadas por orden. */
export function useDeduccionesDeMetodo(metodoCobroId: string | undefined) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM metodo_cobro_deducciones
     WHERE metodo_cobro_id = ? AND empresa_id = ?
     ORDER BY orden ASC`,
    [metodoCobroId ?? '', empresaId]
  )

  return { deducciones: (data ?? []) as MetodoCobroDeduccion[], isLoading }
}

/**
 * Deducciones de VARIOS metodos de pago en una sola query reactiva
 * (`WHERE metodo_cobro_id IN (...)`), agrupadas por `metodo_cobro_id`.
 * Usado por `banco-form.tsx` (PR-3c.2) para traer las deducciones de todos
 * los metodos existentes de un banco de una sola vez.
 *
 * Memoizacion obligatoria (decision resuelta, obs Engram #792): el caller
 * tipico arma `metodoCobroIds` con un `.map()` sobre `existingMetodos` — una
 * referencia de array NUEVA en cada render. Si esa referencia inestable se
 * pasara directo a los params de `useQuery`, la suscripcion reactiva a
 * SQLite se re-registraria en cada render (no es un simple recalculo en
 * memoria). Se deriva una CLAVE STRING ESTABLE ordenada
 * (`metodoCobroIds.slice().sort().join(',')`) y solo cuando esa clave
 * cambia se recalculan `ids`/`params` via `useMemo`.
 */
export function useDeduccionesPorMetodos(metodoCobroIds: string[]) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const idsKey = metodoCobroIds.slice().sort().join(',')
  const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey])

  const { placeholders, params } = useMemo(() => {
    const idsForQuery = ids.length > 0 ? ids : ['']
    return {
      placeholders: idsForQuery.map(() => '?').join(','),
      params: [...idsForQuery, empresaId],
    }
  }, [ids, empresaId])

  const { data, isLoading } = useQuery(
    `SELECT * FROM metodo_cobro_deducciones
     WHERE metodo_cobro_id IN (${placeholders}) AND empresa_id = ?
     ORDER BY orden ASC`,
    params
  )

  const deduccionesPorMetodo = useMemo(() => {
    const map = new Map<string, MetodoCobroDeduccion[]>()
    for (const row of (data ?? []) as MetodoCobroDeduccion[]) {
      const arr = map.get(row.metodo_cobro_id)
      if (arr) arr.push(row)
      else map.set(row.metodo_cobro_id, [row])
    }
    return map
  }, [data])

  return { deduccionesPorMetodo, isLoading }
}

/**
 * Agrega un concepto de deduccion a un metodo de pago YA EXISTENTE.
 * Fila suelta (INSERT independiente), no dentro de una writeTransaction —
 * el default-seeding transaccional al CREAR el metodo vive en
 * createPaymentMethod (use-payment-methods.ts).
 */
export async function createDeduccion(params: {
  metodo_cobro_id: string
  empresa_id: string
  cuenta_gasto_id: string
  concepto: string
  tipo: TipoDeduccion
  porcentaje: string
  orden: number
  usuario_id: string
}) {
  const id = uuidv4()
  const now = localNow()
  const porcentajeStorage = new Decimal(params.porcentaje || '0').toFixed(2)

  await db.execute(
    `INSERT INTO metodo_cobro_deducciones
       (id, empresa_id, metodo_cobro_id, cuenta_gasto_id, concepto, tipo, porcentaje, orden,
        is_active, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.empresa_id,
      params.metodo_cobro_id,
      params.cuenta_gasto_id,
      params.concepto,
      params.tipo,
      porcentajeStorage,
      params.orden,
      1,
      now,
      now,
      params.usuario_id,
    ]
  )

  return id
}

/**
 * Actualiza un concepto de deduccion existente. Soporta soft-deactivate via
 * `is_active: false` — el sistema MUST NOT ofrecer DELETE fisico (SC-11).
 */
export async function updateDeduccion(
  id: string,
  data: {
    concepto?: string
    tipo?: TipoDeduccion
    porcentaje?: string
    cuenta_gasto_id?: string
    orden?: number
    is_active?: boolean
  }
) {
  const sets: string[] = []
  const values: unknown[] = []

  if (data.concepto !== undefined) {
    sets.push('concepto = ?')
    values.push(data.concepto)
  }
  if (data.tipo !== undefined) {
    sets.push('tipo = ?')
    values.push(data.tipo)
  }
  if (data.porcentaje !== undefined) {
    sets.push('porcentaje = ?')
    values.push(new Decimal(data.porcentaje || '0').toFixed(2))
  }
  if (data.cuenta_gasto_id !== undefined) {
    sets.push('cuenta_gasto_id = ?')
    values.push(data.cuenta_gasto_id)
  }
  if (data.orden !== undefined) {
    sets.push('orden = ?')
    values.push(data.orden)
  }
  if (data.is_active !== undefined) {
    sets.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)

  await db.execute(`UPDATE metodo_cobro_deducciones SET ${sets.join(', ')} WHERE id = ?`, values)
}

/**
 * Reemplaza la fila suelta `createDeduccion`/`updateDeduccion` con un unico
 * punto de guardado TRANSACCIONAL por metodo (PR-3c.1) — todo o nada: si
 * falla una fila, ninguna se persiste. Usado por `banco-form.tsx` y
 * `payment-method-form.tsx` (PR-3c.2) para guardar el array local completo
 * de `DeduccionesEditor` de un metodo YA EXISTENTE en un solo `handleSubmit`.
 *
 * - `UPDATE` si `row.id` existe, `INSERT` si no.
 * - Cualquier fila que YA EXISTIA en la DB para este metodo pero no viene en
 *   `rows` (removida por completo del array local, no solo desactivada) se
 *   soft-desactiva (`is_active = 0`) — nunca DELETE fisico (SC-11).
 */
export async function persistDeduccionesDeMetodo(params: {
  metodoCobroId: string
  empresaId: string
  usuarioId: string
  rows: {
    id?: string
    concepto: string
    tipo: TipoDeduccion
    porcentaje: string
    cuenta_gasto_id: string
    is_active: boolean
  }[]
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const now = localNow()

    const existingResult = await tx.execute(
      `SELECT id FROM metodo_cobro_deducciones WHERE metodo_cobro_id = ? AND empresa_id = ?`,
      [params.metodoCobroId, params.empresaId]
    )
    const existingIds = new Set<string>()
    if (existingResult.rows) {
      for (let i = 0; i < existingResult.rows.length; i++) {
        existingIds.add((existingResult.rows.item(i) as { id: string }).id)
      }
    }

    const keptIds = new Set<string>()

    for (const [i, row] of params.rows.entries()) {
      const porcentajeStorage = new Decimal(row.porcentaje || '0').toFixed(2)

      if (row.id) {
        keptIds.add(row.id)
        await tx.execute(
          `UPDATE metodo_cobro_deducciones
           SET concepto = ?, tipo = ?, porcentaje = ?, cuenta_gasto_id = ?, orden = ?, is_active = ?, updated_at = ?
           WHERE id = ?`,
          [
            row.concepto,
            row.tipo,
            porcentajeStorage,
            row.cuenta_gasto_id,
            i,
            row.is_active ? 1 : 0,
            now,
            row.id,
          ]
        )
      } else {
        const id = uuidv4()
        await tx.execute(
          `INSERT INTO metodo_cobro_deducciones
             (id, empresa_id, metodo_cobro_id, cuenta_gasto_id, concepto, tipo, porcentaje, orden,
              is_active, created_at, updated_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            params.empresaId,
            params.metodoCobroId,
            row.cuenta_gasto_id,
            row.concepto,
            row.tipo,
            porcentajeStorage,
            i,
            row.is_active ? 1 : 0,
            now,
            now,
            params.usuarioId,
          ]
        )
      }
    }

    for (const existingId of existingIds) {
      if (!keptIds.has(existingId)) {
        await tx.execute(
          `UPDATE metodo_cobro_deducciones SET is_active = 0, updated_at = ? WHERE id = ?`,
          [now, existingId]
        )
      }
    }
  })
}
