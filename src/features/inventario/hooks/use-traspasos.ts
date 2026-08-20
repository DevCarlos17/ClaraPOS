import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import {
  upsertStockDeposito,
  leerStockDeposito,
  evaluarStockDepositoSuficiente,
} from '@/features/inventario/lib/stock-deposito'
import { computeCorrelativoUsuario, buildTraspasoKardexPair } from '@/features/inventario/lib/traspasos'

export interface TraspasoInventario {
  id: string
  empresa_id: string
  deposito_origen_id: string
  deposito_destino_id: string
  usuario_id: string
  fecha: string
  observacion: string | null
  autorizado_por: string | null
  verificado_por: string | null
  correlativo_usuario: number
  created_at: string
  created_by: string | null
}

/**
 * Listado de traspasos de la empresa actual, con nombres de deposito/usuario
 * resueltos y conteo de lineas — mismo shape que `useAjustes()`. Consumido
 * por la UI de Slice 3c (fuera del alcance de este slice).
 */
export function useTraspasos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT t.*, do.nombre AS nombre_deposito_origen, dd.nombre AS nombre_deposito_destino,
            u.nombre AS nombre_usuario,
            (SELECT COUNT(*) FROM traspasos_inventario_det td WHERE td.traspaso_id = t.id) AS items_count
     FROM traspasos_inventario t
     LEFT JOIN depositos do ON do.id = t.deposito_origen_id
     LEFT JOIN depositos dd ON dd.id = t.deposito_destino_id
     LEFT JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.empresa_id = ?
     ORDER BY t.fecha DESC`,
    [empresaId]
  )
  return {
    traspasos: (data ?? []) as (TraspasoInventario & {
      nombre_deposito_origen: string | null
      nombre_deposito_destino: string | null
      nombre_usuario: string | null
      items_count: number
    })[],
    isLoading,
  }
}

export interface LineaTraspasoInput {
  producto_id: string
  cantidad: number
}

export interface CrearTraspasoParams {
  empresa_id: string
  usuario_id: string
  deposito_origen_id: string
  deposito_destino_id: string
  observacion?: string
  /** 1 linea = traspaso individual, N lineas = traspaso por lote — mismo camino de codigo. */
  lineas: LineaTraspasoInput[]
}

export interface CrearTraspasoResult {
  traspasoId: string
  correlativo: number
}

/**
 * Crea un traspaso de inventario entre dos depositos, con 1 o N lineas, de
 * forma atomica: cabecera + detalle + par de kardex (salida/entrada) +
 * `inventario_stock` de ambos depositos, TODO dentro de una unica
 * `writeTransaction`. Si CUALQUIER linea no tiene stock suficiente en el
 * deposito de origen, la transaccion entera se revierte — no queda ningun
 * traspaso ni movimiento parcial (spec TRI/Bloqueo por Stock Insuficiente en
 * Origen). `autorizado_por`/`verificado_por` quedan NULL (sin flujo de
 * aprobacion en este cambio, spec TRI/Placeholders de Autorizacion).
 *
 * Ver openspec/changes/inventario-multideposito/design.md — seccion
 * "Traspasos Feature Design".
 */
export async function crearTraspaso(params: CrearTraspasoParams): Promise<CrearTraspasoResult> {
  const { empresa_id, usuario_id, deposito_origen_id, deposito_destino_id, observacion, lineas } = params

  // Rechazo temprano del lado del cliente — el CHECK de la DB tambien lo
  // protege (defensa en profundidad), pero fallar aqui evita abrir la tx.
  if (deposito_origen_id === deposito_destino_id) {
    throw new Error('El deposito de origen y el deposito de destino deben ser diferentes')
  }
  if (lineas.length === 0) {
    throw new Error('El traspaso debe tener al menos una linea')
  }

  const traspasoId = uuidv4()
  const now = localNow()
  let correlativo = 0

  await db.writeTransaction(async (tx) => {
    // 1. Correlativo por usuario: COUNT(*) scoped a (empresa_id, usuario_id),
    // computado DENTRO de la tx (offline-safe, mismo criterio que el
    // correlativo de facturas por caja en use-ventas.ts).
    const countRes = await tx.execute(
      'SELECT COUNT(*) AS total FROM traspasos_inventario WHERE empresa_id = ? AND usuario_id = ?',
      [empresa_id, usuario_id]
    )
    const countExistente = Number((countRes.rows?.item(0) as { total: number } | undefined)?.total ?? 0)
    correlativo = computeCorrelativoUsuario(countExistente)
    const docOrigenRef = `TRA-${correlativo}`

    // 2. Cabecera — autorizado_por/verificado_por NULL (sin flujo de aprobacion)
    await tx.execute(
      `INSERT INTO traspasos_inventario
         (id, empresa_id, deposito_origen_id, deposito_destino_id, usuario_id, fecha, observacion,
          autorizado_por, verificado_por, correlativo_usuario, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      [
        traspasoId,
        empresa_id,
        deposito_origen_id,
        deposito_destino_id,
        usuario_id,
        now,
        observacion ?? null,
        correlativo,
        now,
        usuario_id,
      ]
    )

    // 3. Por cada linea: guard de stock en origen, par de kardex, upserts de
    // inventario_stock en AMBOS depositos, y detalle — todo en la misma tx,
    // de modo que un fallo en cualquier linea revierte TODO el traspaso
    // (ninguna linea anterior queda comprometida).
    for (const linea of lineas) {
      const cantidad = new Decimal(linea.cantidad)

      const stockOrigenActual = await leerStockDeposito(tx, linea.producto_id, deposito_origen_id)
      if (!evaluarStockDepositoSuficiente(stockOrigenActual, cantidad)) {
        throw new Error(
          `Stock insuficiente en el deposito de origen para el producto ${linea.producto_id}. Disponible: ${stockOrigenActual.toFixed(3)}, Solicitado: ${cantidad.toFixed(3)}`
        )
      }
      // Stock de destino ANTES del traspaso — necesario para el snapshot
      // stock_anterior/stock_nuevo de la entrada (lectura per-deposito, no
      // productos.stock global: un traspaso no cambia el total cross-deposito).
      const stockDestinoActual = await leerStockDeposito(tx, linea.producto_id, deposito_destino_id)

      const movSalidaId = uuidv4()
      const movEntradaId = uuidv4()

      const { salida, entrada } = buildTraspasoKardexPair({
        movSalidaId,
        movEntradaId,
        empresa_id,
        producto_id: linea.producto_id,
        depositoOrigenId: deposito_origen_id,
        depositoDestinoId: deposito_destino_id,
        cantidad,
        usuario_id,
        fecha: now,
        traspasoId,
        docOrigenRef,
      })

      const stockOrigenNuevo = stockOrigenActual.minus(cantidad)
      const stockDestinoNuevo = stockDestinoActual.plus(cantidad)

      await tx.execute(
        `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            doc_origen_id, doc_origen_ref, usuario_id, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          salida.id,
          salida.empresa_id,
          salida.producto_id,
          salida.deposito_id,
          salida.tipo,
          salida.origen,
          salida.cantidad,
          stockOrigenActual.toFixed(3),
          stockOrigenNuevo.toFixed(3),
          salida.doc_origen_id,
          salida.doc_origen_ref,
          salida.usuario_id,
          salida.fecha,
          now,
        ]
      )
      // movimientoInventarioId = movSalidaId — la fila de salida recien
      // insertada, nunca el id de la entrada.
      await upsertStockDeposito(tx, {
        empresa_id,
        producto_id: linea.producto_id,
        deposito_id: deposito_origen_id,
        delta: cantidad.negated(),
        usuario_id,
        now,
        movimientoInventarioId: movSalidaId,
      })

      await tx.execute(
        `INSERT INTO movimientos_inventario
           (id, empresa_id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            doc_origen_id, doc_origen_ref, usuario_id, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entrada.id,
          entrada.empresa_id,
          entrada.producto_id,
          entrada.deposito_id,
          entrada.tipo,
          entrada.origen,
          entrada.cantidad,
          stockDestinoActual.toFixed(3),
          stockDestinoNuevo.toFixed(3),
          entrada.doc_origen_id,
          entrada.doc_origen_ref,
          entrada.usuario_id,
          entrada.fecha,
          now,
        ]
      )
      // movimientoInventarioId = movEntradaId — la fila de entrada recien
      // insertada, nunca el id de la salida.
      await upsertStockDeposito(tx, {
        empresa_id,
        producto_id: linea.producto_id,
        deposito_id: deposito_destino_id,
        delta: cantidad,
        usuario_id,
        now,
        movimientoInventarioId: movEntradaId,
      })

      const detId = uuidv4()
      await tx.execute(
        `INSERT INTO traspasos_inventario_det
           (id, empresa_id, traspaso_id, producto_id, cantidad, mov_salida_id, mov_entrada_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [detId, empresa_id, traspasoId, linea.producto_id, cantidad.toFixed(3), movSalidaId, movEntradaId, now]
      )
    }
  })

  return { traspasoId, correlativo }
}
