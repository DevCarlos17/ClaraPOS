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
  lote_id: string | null
  lote_nro: string | null
  lote_fecha_fab: string | null
  lote_fecha_venc: string | null
  created_at: string
  created_by: string | null
}

export interface AjusteLineaInput {
  producto_id: string
  deposito_id: string
  cantidad: number
  costo_unitario?: number
  /** Para operacion RESTA: lote existente a descontar */
  lote_id?: string
  /** Para operacion SUMA: datos del nuevo lote a crear al aplicar */
  lote_nro?: string
  lote_fecha_fab?: string
  lote_fecha_venc?: string
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
        `INSERT INTO ajustes_det (id, ajuste_id, producto_id, deposito_id, cantidad, costo_unitario,
          lote_id, lote_nro, lote_fecha_fab, lote_fecha_venc, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lineaId,
          ajusteId,
          linea.producto_id,
          linea.deposito_id,
          linea.cantidad.toFixed(3),
          linea.costo_unitario !== undefined ? linea.costo_unitario.toFixed(2) : null,
          linea.lote_id ?? null,
          linea.lote_nro ? linea.lote_nro.trim().toUpperCase() : null,
          linea.lote_fecha_fab ?? null,
          linea.lote_fecha_venc ?? null,
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

        // Si la linea tiene datos de lote, crear el registro en lotes
        let loteIdCreado: string | null = null
        if (linea.lote_nro) {
          loteIdCreado = uuidv4()
          await tx.execute(
            `INSERT INTO lotes (id, empresa_id, producto_id, deposito_id, nro_lote, fecha_fabricacion,
               fecha_vencimiento, cantidad_inicial, cantidad_actual, costo_unitario, factura_compra_id,
               status, created_at, updated_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVO', ?, ?, ?)`,
            [
              loteIdCreado, empresaId, linea.producto_id, linea.deposito_id,
              linea.lote_nro.toUpperCase(),
              linea.lote_fecha_fab ?? null,
              linea.lote_fecha_venc ?? null,
              cantidad.toFixed(3), cantidad.toFixed(3),
              linea.costo_unitario ?? null,
              now, now, userId,
            ]
          )
        }

        await tx.execute(
          `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
           VALUES (?, ?, ?, ?, 'E', 'AJU', ?, ?, ?, ?, ?, ?, ?, 'Ajuste de inventario', ?, ?, ?)`,
          [
            uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
            linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
            linea.costo_unitario ?? null, loteIdCreado,
            ajusteId, ajuste.num_ajuste,
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

        let loteIdMovimiento: string | null = linea.lote_id ?? null

        // Si la linea tiene lote_id explicito, descontar del lote especifico
        if (linea.lote_id) {
          const loteResult = await tx.execute(
            'SELECT cantidad_actual FROM lotes WHERE id = ?',
            [linea.lote_id]
          )
          if (loteResult.rows && loteResult.rows.length > 0) {
            const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
            if (cantLote < cantidad) {
              throw new Error(`Stock insuficiente en lote. Disponible: ${cantLote.toFixed(3)}, Solicitado: ${cantidad.toFixed(3)}`)
            }
            const nuevaCant = cantLote - cantidad
            await tx.execute(
              'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
              [nuevaCant.toFixed(3), nuevaCant <= 0 ? 'AGOTADO' : 'ACTIVO', now, linea.lote_id]
            )
          }
        } else {
          // Sin lote explicito: si el producto maneja lotes, descontar FEFO automaticamente
          const prodResult = await tx.execute(
            'SELECT maneja_lotes FROM productos WHERE id = ?',
            [linea.producto_id]
          )
          const manejaLotes = (prodResult.rows?.item(0) as { maneja_lotes: number } | undefined)?.maneja_lotes ?? 0

          if (manejaLotes === 1) {
            const lotesResult = await tx.execute(
              `SELECT id, cantidad_actual FROM lotes
               WHERE producto_id = ? AND deposito_id = ? AND empresa_id = ? AND status = 'ACTIVO'
               ORDER BY CASE WHEN fecha_vencimiento IS NULL THEN 1 ELSE 0 END ASC,
                        fecha_vencimiento ASC, created_at ASC`,
              [linea.producto_id, linea.deposito_id, empresaId]
            )

            let pendiente = cantidad
            for (let i = 0; i < (lotesResult.rows?.length ?? 0); i++) {
              if (pendiente <= 0.0001) break
              const row = lotesResult.rows!.item(i) as { id: string; cantidad_actual: string }
              const disponible = parseFloat(row.cantidad_actual)
              if (disponible <= 0) continue

              const aDescontar = Math.min(disponible, pendiente)
              const nuevaCant = disponible - aDescontar

              await tx.execute(
                'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
                [nuevaCant.toFixed(3), nuevaCant <= 0.0001 ? 'AGOTADO' : 'ACTIVO', now, row.id]
              )

              if (loteIdMovimiento === null) loteIdMovimiento = row.id
              pendiente -= aDescontar
            }
            // best-effort: si los lotes no cubren todo, el stock global se ajusta igual
          }
        }

        await tx.execute(
          `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
           VALUES (?, ?, ?, ?, 'S', 'AJU', ?, ?, ?, ?, ?, ?, ?, 'Ajuste de inventario', ?, ?, ?)`,
          [
            uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
            linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
            linea.costo_unitario ?? null, loteIdMovimiento,
            ajusteId, ajuste.num_ajuste,
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

      // Buscar el lote afectado en los movimientos de este ajuste
      const movResult = await tx.execute(
        `SELECT lote_id FROM movimientos_inventario
         WHERE doc_origen_id = ? AND producto_id = ? AND deposito_id = ? AND origen = 'AJU'
         AND tipo = ? LIMIT 1`,
        [ajusteId, linea.producto_id, linea.deposito_id, operacion === 'SUMA' ? 'E' : 'S']
      )
      const loteId = movResult.rows?.item(0)
        ? (movResult.rows.item(0) as { lote_id: string | null }).lote_id
        : null

      // Revertir lote si aplica
      if (loteId) {
        if (operacion === 'SUMA') {
          // La SUMA cre un lote: al anular, descontamos del lote creado
          const loteResult = await tx.execute(
            'SELECT cantidad_actual FROM lotes WHERE id = ?',
            [loteId]
          )
          if (loteResult.rows && loteResult.rows.length > 0) {
            const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
            const nuevaCant = Math.max(0, cantLote - cantidad)
            await tx.execute(
              'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
              [nuevaCant.toFixed(3), nuevaCant <= 0 ? 'AGOTADO' : 'ACTIVO', now, loteId]
            )
          }
        } else if (operacion === 'RESTA') {
          // La RESTA descontó un lote: al anular, restaurar
          const loteResult = await tx.execute(
            'SELECT cantidad_actual FROM lotes WHERE id = ?',
            [loteId]
          )
          if (loteResult.rows && loteResult.rows.length > 0) {
            const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
            await tx.execute(
              'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
              [(cantLote + cantidad).toFixed(3), 'ACTIVO', now, loteId]
            )
          }
        }
      }

      await tx.execute(
        `INSERT INTO movimientos_inventario
         (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
          costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, 'AJU', ?, ?, ?, ?, ?, ?, ?, 'Anulacion de ajuste', ?, ?, ?)`,
        [
          uuidv4(), empresaId, linea.producto_id, linea.deposito_id,
          tipoInverso, linea.cantidad, stockAnterior.toFixed(3), stockNuevo.toFixed(3),
          linea.costo_unitario ?? null, loteId,
          ajusteId, ajuste.num_ajuste,
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
