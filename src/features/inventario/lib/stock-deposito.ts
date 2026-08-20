/**
 * Helper transaccional compartido para mantener `inventario_stock` como la
 * fuente unica de verdad de stock por (empresa, producto, deposito), y
 * `productos.stock` como el total desnormalizado cross-deposito.
 *
 * Antes de este modulo, `inventario_stock` se escribia una unica vez al crear
 * el producto (`producto-form.tsx`) y nunca se volvia a actualizar — quedaba
 * huerfano. Cada ruta de escritura de stock (ventas, compras, kardex, ajustes,
 * traspasos) debe llamar `upsertStockDeposito` DENTRO de su `writeTransaction`
 * existente, inmediatamente despues del INSERT en `movimientos_inventario`.
 *
 * Ver openspec/changes/inventario-multideposito/design.md — seccion
 * "inventario_stock Maintenance Helper (cross-cutting core)".
 */

import type { Transaction } from '@powersync/common'
import Decimal from 'decimal.js'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/core/db/powersync/db'
import { localNow } from '@/lib/dates'

/**
 * Calcula el nuevo stock aplicando un delta (positivo = entrada, negativo =
 * salida) sobre la cantidad actual. Precision decimal (3 decimales, nunca
 * float). Lanza si el resultado quedaria negativo — este guard reemplaza el
 * chequeo previo a nivel empresa-completa por uno por-deposito (spec ISA/No
 * Stock Negativo).
 */
export function computeStockDelta(current: Decimal, delta: Decimal): Decimal {
  const nuevo = current.plus(delta)
  if (nuevo.lt(0)) {
    throw new Error(
      `Stock insuficiente. Disponible: ${current.toFixed(3)}, delta solicitado: ${delta.toFixed(3)}`
    )
  }
  return new Decimal(nuevo.toFixed(3))
}

/**
 * Resuelve el deposito de INGRESO para una linea de compra o un movimiento
 * manual de kardex: prioriza el deposito default del producto
 * (`productos.deposito_id`); si es NULL (producto no migrado o nunca
 * configurado), cae al deposito `es_principal` de la empresa. Si ambos son
 * NULL (empresa sin deposito principal configurado — caso borde), retorna
 * `null` y el llamador decide como manejarlo (spec PDD/Fallback a Deposito
 * Principal, CPD/Enrutamiento de Ingreso por Linea).
 */
export function resolveDepositoIngreso(
  productoDepositoId: string | null,
  empresaPrincipalId: string | null
): string | null {
  return productoDepositoId ?? empresaPrincipalId
}

export interface UpsertStockDepositoParams {
  empresa_id: string
  producto_id: string
  deposito_id: string
  /** Positivo = entrada, negativo = salida. */
  delta: Decimal
  usuario_id: string
  now: string
  /**
   * ID de la fila `movimientos_inventario` que esta llamada esta liquidando —
   * ya insertada por el llamador, en la MISMA transaccion, inmediatamente
   * antes de esta llamada (convencion establecida en todos los write-paths:
   * ventas, compras, kardex, ajustes, producto-form).
   *
   * Se usa UNICAMENTE cuando `inventario_stock` NO tiene fila previa: el
   * baseline se reconstruye sumando el kardex historico de ese
   * (producto,deposito), y ese movimiento YA esta en la tabla en este punto
   * — si no se excluyera, su efecto se contaria dos veces (una al
   * reconstruir el baseline, otra al aplicar `delta` sobre el). Es
   * obligatorio para que ningun llamador futuro lo olvide silenciosamente.
   */
  movimientoInventarioId: string
}

export interface UpsertStockDepositoResult {
  stockDepositoNuevo: Decimal
  stockTotalNuevo: Decimal
}

/**
 * Reconstruye el baseline de `inventario_stock` para un (producto,deposito)
 * SIN fila propia, sumando su historial de `movimientos_inventario` dentro
 * de la MISMA tx — excluye `excluirMovimientoId` (el movimiento que origino
 * esta llamada, ya insertado) para no contar su efecto dos veces.
 *
 * `inventario_stock` quedo huerfano historicamente (Finding C de la
 * exploracion): se escribia una vez al crear el producto y nunca se volvia a
 * mantener. Para productos/depositos con historia previa a este cambio, una
 * fila ausente NO significa stock 0 — significa que nadie la actualizo. Usar
 * `new Decimal(0)` como baseline ahi rechazaria salidas legitimas con "Stock
 * insuficiente" (guard por-deposito contra un baseline artificialmente bajo).
 */
async function reconstruirBaselineDesdeKardex(
  tx: Transaction,
  empresa_id: string,
  producto_id: string,
  deposito_id: string,
  excluirMovimientoId: string
): Promise<Decimal> {
  const kardexRes = await tx.execute(
    `SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario
     WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ? AND id != ?`,
    [empresa_id, producto_id, deposito_id, excluirMovimientoId]
  )
  const movimientos: MovimientoParaRecalculo[] = []
  if (kardexRes.rows) {
    for (let i = 0; i < kardexRes.rows.length; i++) {
      movimientos.push(kardexRes.rows.item(i) as MovimientoParaRecalculo)
    }
  }
  return calcularStockDepositoDesdeKardex(movimientos, producto_id, deposito_id)
}

/**
 * Actualiza `inventario_stock.cantidad_actual` para (empresa, producto,
 * deposito) por `delta` (INSERT si la fila no existe, UPDATE si existe), y
 * actualiza `productos.stock` (total cross-deposito) por el mismo delta —
 * TODO dentro de la MISMA `writeTransaction` que el llamador ya tiene abierta
 * para el INSERT de `movimientos_inventario`. Nunca abre su propia transaccion.
 */
export async function upsertStockDeposito(
  tx: Transaction,
  params: UpsertStockDepositoParams
): Promise<UpsertStockDepositoResult> {
  const { empresa_id, producto_id, deposito_id, delta, usuario_id, now, movimientoInventarioId } = params

  // 1. inventario_stock por deposito
  const stockRes = await tx.execute(
    'SELECT id, cantidad_actual FROM inventario_stock WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ?',
    [empresa_id, producto_id, deposito_id]
  )
  const stockRow = stockRes.rows?.length
    ? (stockRes.rows.item(0) as { id: string; cantidad_actual: string })
    : undefined
  const currentDeposito = stockRow
    ? new Decimal(stockRow.cantidad_actual)
    : await reconstruirBaselineDesdeKardex(tx, empresa_id, producto_id, deposito_id, movimientoInventarioId)
  const stockDepositoNuevo = computeStockDelta(currentDeposito, delta)

  if (stockRow) {
    await tx.execute(
      'UPDATE inventario_stock SET cantidad_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [stockDepositoNuevo.toFixed(3), now, usuario_id, stockRow.id]
    )
  } else {
    await tx.execute(
      `INSERT INTO inventario_stock
         (id, empresa_id, producto_id, deposito_id, cantidad_actual, stock_reservado, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, '0.000', ?, ?)`,
      [uuidv4(), empresa_id, producto_id, deposito_id, stockDepositoNuevo.toFixed(3), now, usuario_id]
    )
  }

  // 2. productos.stock (total desnormalizado cross-deposito)
  const prodRes = await tx.execute('SELECT stock FROM productos WHERE id = ?', [producto_id])
  if (!prodRes.rows?.length) {
    throw new Error('Producto no encontrado')
  }
  const prodRow = prodRes.rows.item(0) as { stock: string }
  const currentTotal = new Decimal(prodRow.stock)
  const stockTotalNuevo = computeStockDelta(currentTotal, delta)

  await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
    stockTotalNuevo.toFixed(3),
    now,
    producto_id,
  ])

  return { stockDepositoNuevo, stockTotalNuevo }
}

export interface MovimientoParaRecalculo {
  producto_id: string
  deposito_id: string
  tipo: 'E' | 'S'
  cantidad: string
}

export interface StockRecalculado {
  producto_id: string
  deposito_id: string
  cantidad: Decimal
}

/**
 * Agregacion PURA (sin I/O): dado un listado de movimientos de kardex,
 * calcula SUM(entradas) - SUM(salidas) agrupado por (producto_id, deposito_id).
 * Extraida de `recalcularStockDesdeKardex` para ser testeable sin PowerSync.
 */
export function agregarMovimientosPorDeposito(
  movimientos: MovimientoParaRecalculo[]
): StockRecalculado[] {
  const acumulado = new Map<string, { producto_id: string; deposito_id: string; cantidad: Decimal }>()

  for (const mov of movimientos) {
    const key = `${mov.producto_id}::${mov.deposito_id}`
    const existing = acumulado.get(key) ?? {
      producto_id: mov.producto_id,
      deposito_id: mov.deposito_id,
      cantidad: new Decimal(0),
    }
    const cantidad = new Decimal(mov.cantidad)
    existing.cantidad = mov.tipo === 'E' ? existing.cantidad.plus(cantidad) : existing.cantidad.minus(cantidad)
    acumulado.set(key, existing)
  }

  return Array.from(acumulado.values()).map((v) => ({
    ...v,
    cantidad: new Decimal(v.cantidad.toFixed(3)),
  }))
}

/**
 * Agregacion PURA (sin I/O): SUM(entradas) - SUM(salidas) para UN
 * (producto_id, deposito_id) especifico dentro de un listado de movimientos
 * de kardex — filas de otros productos/depositos presentes en el listado se
 * ignoran. Reutiliza `agregarMovimientosPorDeposito` para no duplicar la
 * logica de signos E/S. Retorna `Decimal(0)` si no hay movimientos para ese
 * par (equivalente al comportamiento previo cuando no hay historia real).
 */
export function calcularStockDepositoDesdeKardex(
  movimientos: MovimientoParaRecalculo[],
  producto_id: string,
  deposito_id: string
): Decimal {
  const filtrados = movimientos.filter(
    (m) => m.producto_id === producto_id && m.deposito_id === deposito_id
  )
  const agregado = agregarMovimientosPorDeposito(filtrados)
  return agregado[0]?.cantidad ?? new Decimal(0)
}

export interface RecalcularStockParams {
  empresa_id: string
  /** Si se provee, limita el recalculo a este producto (todos sus depositos). */
  producto_id?: string
  /** Si se provee, limita el recalculo a este deposito. */
  deposito_id?: string
}

/**
 * Funcion de reparacion: reconstruye `inventario_stock` (y `productos.stock`)
 * desde `movimientos_inventario` (fuente historica inmutable). Uso
 * administrativo — no esta en ningun camino de escritura caliente (spec
 * ISA/Funcion de recalculo).
 */
export async function recalcularStockDesdeKardex(params: RecalcularStockParams): Promise<void> {
  const { empresa_id, producto_id, deposito_id } = params

  let sql = 'SELECT producto_id, deposito_id, tipo, cantidad FROM movimientos_inventario WHERE empresa_id = ?'
  const args: string[] = [empresa_id]
  if (producto_id) {
    sql += ' AND producto_id = ?'
    args.push(producto_id)
  }
  if (deposito_id) {
    sql += ' AND deposito_id = ?'
    args.push(deposito_id)
  }

  const { rows } = await db.execute(sql, args)
  const movimientos: MovimientoParaRecalculo[] = []
  if (rows) {
    for (let i = 0; i < rows.length; i++) {
      movimientos.push(rows.item(i) as MovimientoParaRecalculo)
    }
  }

  const resultados = agregarMovimientosPorDeposito(movimientos)

  const totalesPorProducto = new Map<string, Decimal>()
  for (const r of resultados) {
    totalesPorProducto.set(r.producto_id, (totalesPorProducto.get(r.producto_id) ?? new Decimal(0)).plus(r.cantidad))
  }

  const now = localNow()

  await db.writeTransaction(async (tx) => {
    for (const r of resultados) {
      const existing = await tx.execute(
        'SELECT id FROM inventario_stock WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ?',
        [empresa_id, r.producto_id, r.deposito_id]
      )
      const row = existing.rows?.length ? (existing.rows.item(0) as { id: string }) : undefined
      if (row) {
        await tx.execute(
          'UPDATE inventario_stock SET cantidad_actual = ?, updated_at = ? WHERE id = ?',
          [r.cantidad.toFixed(3), now, row.id]
        )
      } else {
        await tx.execute(
          `INSERT INTO inventario_stock
             (id, empresa_id, producto_id, deposito_id, cantidad_actual, stock_reservado, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, '0.000', ?, NULL)`,
          [uuidv4(), empresa_id, r.producto_id, r.deposito_id, r.cantidad.toFixed(3), now]
        )
      }
    }

    for (const [productoId, total] of totalesPorProducto) {
      await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
        total.toFixed(3),
        now,
        productoId,
      ])
    }
  })
}
