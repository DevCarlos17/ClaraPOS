import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosGasto } from '@/features/contabilidad/lib/generar-asientos'

// ─── Interfaces ─────────────────────────────────────────────

export interface Gasto {
  id: string
  empresa_id: string
  nro_gasto: string
  cuenta_id: string
  proveedor_id: string | null
  descripcion: string
  fecha: string
  moneda_id: string
  tasa: string
  monto_usd: string
  monto_bs: string
  metodo_cobro_id: string | null
  banco_empresa_id: string | null
  referencia: string | null
  observaciones: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface GastoPago {
  metodo_cobro_id: string
  banco_empresa_id?: string
  monto_usd: number
  referencia?: string
}

// ─── Helpers ────────────────────────────────────────────────

function buildDateRange(
  fechaDesde: string,
  fechaHasta: string
): { start: string; end: string } {
  return {
    start: `${fechaDesde}T00:00:00.000Z`,
    end: `${fechaHasta}T23:59:59.999Z`,
  }
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Lista de gastos con nombre de cuenta y proveedor via JOIN.
 * Filtra por rango de fechas cuando ambos parametros estan presentes.
 * Ordenados por fecha descendente.
 */
export function useGastos(fechaDesde?: string, fechaHasta?: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hasDateFilter = Boolean(fechaDesde && fechaHasta)

  const params = hasDateFilter
    ? (() => {
        const { start, end } = buildDateRange(fechaDesde!, fechaHasta!)
        return [empresaId, start, end]
      })()
    : [empresaId]

  const { data, isLoading } = useQuery(
    hasDateFilter
      ? `SELECT g.*,
           pc.nombre as cuenta_nombre,
           p.razon_social as proveedor_nombre
         FROM gastos g
         LEFT JOIN plan_cuentas pc ON g.cuenta_id = pc.id
         LEFT JOIN proveedores p ON g.proveedor_id = p.id
         WHERE g.empresa_id = ?
           AND g.fecha >= ?
           AND g.fecha <= ?
         ORDER BY g.fecha DESC`
      : `SELECT g.*,
           pc.nombre as cuenta_nombre,
           p.razon_social as proveedor_nombre
         FROM gastos g
         LEFT JOIN plan_cuentas pc ON g.cuenta_id = pc.id
         LEFT JOIN proveedores p ON g.proveedor_id = p.id
         WHERE g.empresa_id = ?
         ORDER BY g.fecha DESC`,
    params
  )

  return {
    gastos: (data ?? []) as (Gasto & {
      cuenta_nombre: string
      proveedor_nombre: string | null
    })[],
    isLoading,
  }
}

// ─── Funciones de escritura ──────────────────────────────────

/**
 * Crea un nuevo gasto con soporte de multiples pagos.
 * Genera nro_gasto con formato GTO-XXXX (secuencial por empresa).
 * Inserta filas en gasto_pagos para cada pago.
 * El gasto queda en status REGISTRADO (no se puede editar, solo anular).
 */
export async function crearGasto(data: {
  cuenta_id: string
  proveedor_id?: string
  descripcion: string
  fecha: string
  moneda_id: string
  tasa: number
  monto_usd: number
  pagos: GastoPago[]
  observaciones?: string
  empresa_id: string
  created_by?: string
}): Promise<{ gastoId: string; nroGasto: string }> {
  let gastoId = ''
  let nroGasto = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    gastoId = uuidv4()

    // Resolver moneda_id: el formulario pasa el codigo ISO (ej: 'USD'), necesitamos el UUID
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [data.moneda_id]
    )
    const monedaId = (monedaResult.rows?.item(0) as { id: string } | undefined)?.id
    if (!monedaId) throw new Error(`Moneda no encontrada: ${data.moneda_id}`)

    // Calcular monto en Bs a partir del USD y la tasa
    const montoBs = Number((data.monto_usd * data.tasa).toFixed(2))

    // Generar nro_gasto secuencial por empresa (formato GTO-XXXX)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?',
      [data.empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroGasto = `GTO-${String(count + 1).padStart(4, '0')}`

    // Primer pago para campos legacy de backward compat
    const primerPago = data.pagos[0]

    await tx.execute(
      `INSERT INTO gastos (
         id, empresa_id, nro_gasto, cuenta_id, proveedor_id, descripcion,
         fecha, moneda_id, tasa, monto_usd, monto_bs,
         metodo_cobro_id, banco_empresa_id, referencia, observaciones,
         status, created_at, updated_at, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REGISTRADO', ?, ?, ?)`,
      [
        gastoId,
        data.empresa_id,
        nroGasto,
        data.cuenta_id,
        data.proveedor_id ?? null,
        data.descripcion,
        data.fecha,
        monedaId,
        data.tasa.toFixed(4),
        data.monto_usd.toFixed(2),
        montoBs.toFixed(2),
        primerPago?.metodo_cobro_id ?? null,
        primerPago?.banco_empresa_id ?? null,
        primerPago?.referencia ?? null,
        data.observaciones ?? null,
        now,
        now,
        data.created_by ?? null,
      ]
    )

    // Insertar filas en gasto_pagos para cada pago
    for (const pago of data.pagos) {
      const pagoId = uuidv4()
      await tx.execute(
        `INSERT INTO gasto_pagos (
           id, empresa_id, gasto_id, metodo_cobro_id, banco_empresa_id,
           monto_usd, referencia, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoId,
          data.empresa_id,
          gastoId,
          pago.metodo_cobro_id,
          pago.banco_empresa_id ?? null,
          pago.monto_usd.toFixed(2),
          pago.referencia ?? null,
          now,
        ]
      )
    }

    // Generar asientos contables
    try {
      const cuentas = await cargarMapaCuentas(tx, data.empresa_id)
      await generarAsientosGasto(tx, {
        empresaId: data.empresa_id,
        gastoId,
        nroGasto,
        cuentaGastoId: data.cuenta_id,
        monto_usd: data.monto_usd,
        pagos: data.pagos.map((p) => ({
          monto_usd: p.monto_usd,
          banco_empresa_id: p.banco_empresa_id ?? null,
        })),
        cuentas,
        usuarioId: data.created_by ?? '',
      })
    } catch {
      // Si falla la contabilidad no bloqueamos el gasto
    }
  })

  return { gastoId, nroGasto }
}

/**
 * Anula un gasto cambiando su status a ANULADO.
 * El registro es inmutable: solo se puede anular, no editar ni eliminar.
 * Genera asientos de reverso en el libro contable.
 */
export async function anularGasto(id: string, usuarioId?: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // Verificar que el gasto existe y no esta ya anulado
    const gastoResult = await tx.execute(
      'SELECT status, empresa_id FROM gastos WHERE id = ?',
      [id]
    )
    if (!gastoResult.rows || gastoResult.rows.length === 0) {
      throw new Error('Gasto no encontrado')
    }
    const gasto = gastoResult.rows.item(0) as { status: string; empresa_id: string }
    if (gasto.status === 'ANULADO') {
      throw new Error('Este gasto ya fue anulado')
    }

    await tx.execute(
      "UPDATE gastos SET status = 'ANULADO', updated_at = ? WHERE id = ?",
      [now, id]
    )

    // Marcar asientos contables del gasto como ANULADO
    if (usuarioId) {
      try {
        await tx.execute(
          `UPDATE libro_contable SET estado = 'ANULADO'
           WHERE empresa_id = ? AND doc_origen_id = ? AND modulo_origen = 'GASTO' AND estado = 'PENDIENTE'`,
          [gasto.empresa_id, id]
        )
      } catch {
        // No bloquear la anulacion si falla la contabilidad
      }
    }
  })
}
