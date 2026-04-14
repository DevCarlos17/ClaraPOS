import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Ajuste {
  id: string
  empresa_id: string
  num_ajuste: string
  motivo_id: string
  fecha: string
  observaciones: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface AjusteDetalle {
  id: string
  ajuste_id: string
  producto_id: string
  deposito_id: string
  cantidad: string
  costo_unitario: string | null
  created_at: string
  created_by: string | null
}

export interface AjusteLineaInput {
  producto_id: string
  deposito_id: string
  cantidad: number
  costo_unitario?: number
}

export function useAjustes() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT a.*, m.nombre AS nombre_motivo, m.operacion_base
     FROM ajustes a
     LEFT JOIN ajuste_motivos m ON m.id = a.motivo_id
     WHERE a.empresa_id = ?
     ORDER BY a.fecha DESC, a.num_ajuste DESC`,
    [empresaId]
  )
  return {
    ajustes: (data ?? []) as (Ajuste & {
      nombre_motivo: string | null
      operacion_base: string | null
    })[],
    isLoading,
  }
}

export function useAjusteDetalle(ajusteId: string) {
  const { data, isLoading } = useQuery(
    `SELECT ad.*, p.nombre AS nombre_producto, p.codigo AS codigo_producto,
            d.nombre AS nombre_deposito
     FROM ajustes_det ad
     LEFT JOIN productos p ON p.id = ad.producto_id
     LEFT JOIN depositos d ON d.id = ad.deposito_id
     WHERE ad.ajuste_id = ?
     ORDER BY p.nombre ASC`,
    [ajusteId]
  )
  return {
    lineas: (data ?? []) as (AjusteDetalle & {
      nombre_producto: string | null
      codigo_producto: string | null
      nombre_deposito: string | null
    })[],
    isLoading,
  }
}

async function getSiguienteNumAjuste(empresaId: string): Promise<string> {
  const result = await kysely
    .selectFrom('ajustes')
    .select(kysely.fn.count('id').as('total'))
    .where('empresa_id', '=', empresaId)
    .executeTakeFirst()

  const siguiente = Number(result?.total ?? 0) + 1
  return String(siguiente).padStart(6, '0')
}

/**
 * Crea un ajuste de inventario con sus lineas de detalle de forma atomica.
 * El num_ajuste se genera como correlativo por empresa.
 */
export async function crearAjuste(data: {
  motivo_id: string
  fecha: string
  observaciones?: string
  lineas: AjusteLineaInput[]
  empresa_id: string
  created_by?: string
}): Promise<string> {
  const ajusteId = uuidv4()
  const now = localNow()
  const numAjuste = await getSiguienteNumAjuste(data.empresa_id)

  await db.writeTransaction(async (tx) => {
    // 1. Insertar cabecera del ajuste
    await tx.execute(
      `INSERT INTO ajustes (id, empresa_id, num_ajuste, motivo_id, fecha, observaciones, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'BORRADOR', ?, ?, ?)`,
      [
        ajusteId,
        data.empresa_id,
        numAjuste,
        data.motivo_id,
        data.fecha,
        data.observaciones ?? null,
        now,
        now,
        data.created_by ?? null,
      ]
    )

    // 2. Insertar lineas de detalle
    for (const linea of data.lineas) {
      const lineaId = uuidv4()
      await tx.execute(
        `INSERT INTO ajustes_det (id, ajuste_id, producto_id, deposito_id, cantidad, costo_unitario, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineaId,
          ajusteId,
          linea.producto_id,
          linea.deposito_id,
          linea.cantidad.toFixed(3),
          linea.costo_unitario !== undefined ? linea.costo_unitario.toFixed(2) : null,
          now,
          data.created_by ?? null,
        ]
      )
    }
  })

  return ajusteId
}
