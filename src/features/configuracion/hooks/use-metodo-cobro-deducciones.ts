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
