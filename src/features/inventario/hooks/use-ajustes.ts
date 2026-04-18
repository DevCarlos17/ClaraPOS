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
    `SELECT a.*, m.nombre AS nombre_motivo, m.operacion_base,
            (SELECT COUNT(*) FROM ajustes_det ad WHERE ad.ajuste_id = a.id) AS items_count,
            (SELECT COALESCE(SUM(CAST(ad.cantidad AS REAL) * CASE WHEN ad.costo_unitario IS NOT NULL THEN CAST(ad.costo_unitario AS REAL) ELSE 0 END), 0) FROM ajustes_det ad WHERE ad.ajuste_id = a.id) AS total_usd
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
      items_count: number
      total_usd: number
    })[],
    isLoading,
  }
}

export function useAjuste(ajusteId: string) {
  const { data, isLoading } = useQuery(
    `SELECT a.*, m.nombre AS nombre_motivo, m.operacion_base, m.afecta_costo
     FROM ajustes a
     LEFT JOIN ajuste_motivos m ON m.id = a.motivo_id
     WHERE a.id = ?`,
    [ajusteId]
  )
  const ajuste = ((data ?? []) as (Ajuste & {
    nombre_motivo: string | null
    operacion_base: string | null
    afecta_costo: number | null
  })[])[0] ?? null
  return { ajuste, isLoading }
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

/**
 * Aplica un ajuste de inventario en estado BORRADOR.
 * Para cada linea: crea movimiento_inventario y actualiza stock del producto.
 * Cambia status a APLICADO. Operacion atomica.
 */
export async function aplicarAjuste(
  ajusteId: string,
  empresaId: string,
  userId: string
): Promise<void> {
  // Leer ajuste + motivo fuera de la transaccion
  const ajuste = await kysely
    .selectFrom('ajustes')
    .innerJoin('ajuste_motivos', 'ajuste_motivos.id', 'ajustes.motivo_id')
    .select([
      'ajustes.id',
      'ajustes.num_ajuste',
      'ajustes.status',
      'ajustes.fecha',
      'ajuste_motivos.operacion_base',
      'ajuste_motivos.afecta_costo',
    ])
    .where('ajustes.id', '=', ajusteId)
    .executeTakeFirst()

  if (!ajuste) throw new Error('Ajuste no encontrado')
  if (ajuste.status !== 'BORRADOR') throw new Error('Solo se pueden aplicar ajustes en estado BORRADOR')

  const lineas = await kysely
    .selectFrom('ajustes_det')
    .selectAll()
    .where('ajuste_id', '=', ajusteId)
    .execute()

  if (lineas.length === 0) throw new Error('El ajuste no tiene lineas de detalle')

  const now = localNow()
  const fechaHoy = now.split('T')[0] ?? now.substring(0, 10)
  const operacion = ajuste.operacion_base as string

  await db.writeTransaction(async (tx) => {
    for (const linea of lineas) {
      const stockResult = await tx.execute(
        'SELECT stock FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      const stockAnterior = parseFloat((stockResult.rows?.item(0) as { stock: string } | undefined)?.stock ?? '0')
      const cantidad = parseFloat(linea.cantidad)
      let stockNuevo: number

      if (operacion === 'SUMA') {
        stockNuevo = stockAnterior + cantidad
        await tx.execute(
          `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
           VALUES (?, ?, ?, ?, 'E', 'AJU', ?, ?, ?, ?, ?, ?, 'Ajuste de inventario', ?, ?, ?)`,
          [
            uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
            linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
            linea.costo_unitario ?? null, ajusteId, ajuste.num_ajuste,
            userId, fechaHoy, now,
          ]
        )
        await tx.execute(
          'UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?',
          [stockNuevo.toFixed(3), now, linea.producto_id]
        )
      } else if (operacion === 'RESTA') {
        stockNuevo = stockAnterior - cantidad
        if (stockNuevo < 0) {
          throw new Error(`Stock insuficiente para ${linea.producto_id}. Stock actual: ${stockAnterior.toFixed(3)}`)
        }
        await tx.execute(
          `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
           VALUES (?, ?, ?, ?, 'S', 'AJU', ?, ?, ?, ?, ?, ?, 'Ajuste de inventario', ?, ?, ?)`,
          [
            uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
            linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
            linea.costo_unitario ?? null, ajusteId, ajuste.num_ajuste,
            userId, fechaHoy, now,
          ]
        )
        await tx.execute(
          'UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?',
          [stockNuevo.toFixed(3), now, linea.producto_id]
        )
      } else if (operacion === 'NEUTRO' && ajuste.afecta_costo === 1 && linea.costo_unitario != null) {
        // NEUTRO: solo actualizar costo sin mover stock
        await tx.execute(
          'UPDATE productos SET costo_usd = ?, costo_ultimo = ?, updated_at = ? WHERE id = ?',
          [linea.costo_unitario, linea.costo_unitario, now, linea.producto_id]
        )
      }
    }

    // Cambiar status del ajuste
    await tx.execute(
      'UPDATE ajustes SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      ['APLICADO', now, userId, ajusteId]
    )
  })
}

/**
 * Anula un ajuste de inventario en estado APLICADO.
 * Para cada linea: crea movimiento inverso y revierte stock.
 * Cambia status a ANULADO. Operacion atomica.
 */
export async function anularAjuste(
  ajusteId: string,
  empresaId: string,
  userId: string,
  motivoAnulacion: string
): Promise<void> {
  const ajuste = await kysely
    .selectFrom('ajustes')
    .innerJoin('ajuste_motivos', 'ajuste_motivos.id', 'ajustes.motivo_id')
    .select([
      'ajustes.id',
      'ajustes.num_ajuste',
      'ajustes.status',
      'ajustes.observaciones',
      'ajuste_motivos.operacion_base',
    ])
    .where('ajustes.id', '=', ajusteId)
    .executeTakeFirst()

  if (!ajuste) throw new Error('Ajuste no encontrado')
  if (ajuste.status !== 'APLICADO') throw new Error('Solo se pueden anular ajustes en estado APLICADO')

  const lineas = await kysely
    .selectFrom('ajustes_det')
    .selectAll()
    .where('ajuste_id', '=', ajusteId)
    .execute()

  const now = localNow()
  const fechaHoy = now.split('T')[0] ?? now.substring(0, 10)
  const operacion = ajuste.operacion_base as string
  const obsAnulacion = motivoAnulacion
    ? `[ANULADO: ${motivoAnulacion}]${ajuste.observaciones ? ' | ' + ajuste.observaciones : ''}`
    : ajuste.observaciones

  await db.writeTransaction(async (tx) => {
    for (const linea of lineas) {
      if (operacion === 'NEUTRO') continue

      const stockResult = await tx.execute(
        'SELECT stock FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      const stockAnterior = parseFloat((stockResult.rows?.item(0) as { stock: string } | undefined)?.stock ?? '0')
      const cantidad = parseFloat(linea.cantidad)

      // Tipo inverso: si original fue SUMA(E), la anulacion es RESTA(S) y viceversa
      const tipoInverso = operacion === 'SUMA' ? 'S' : 'E'
      const stockNuevo = operacion === 'SUMA'
        ? stockAnterior - cantidad
        : stockAnterior + cantidad

      if (stockNuevo < 0) {
        throw new Error(`No se puede anular: stock insuficiente para producto ${linea.producto_id}`)
      }

      await tx.execute(
        `INSERT INTO movimientos_inventario
         (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
          costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, 'AJU', ?, ?, ?, ?, ?, ?, 'Anulacion de ajuste', ?, ?, ?)`,
        [
          uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
          tipoInverso, linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
          linea.costo_unitario ?? null, ajusteId, ajuste.num_ajuste,
          userId, fechaHoy, now,
        ]
      )
      await tx.execute(
        'UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?',
        [stockNuevo.toFixed(3), now, linea.producto_id]
      )
    }

    await tx.execute(
      'UPDATE ajustes SET status = ?, observaciones = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      ['ANULADO', obsAnulacion, now, userId, ajusteId]
    )
  })
}
