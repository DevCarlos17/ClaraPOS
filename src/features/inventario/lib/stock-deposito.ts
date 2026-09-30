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
 * Decision PURA (sin I/O): determina si el stock disponible en UN deposito
 * alcanza para la cantidad solicitada. Extraida para que los distintos
 * re-chequeos locales de disponibilidad (ventas: linea de producto directo,
 * consumo de ingrediente de receta; y cualquier otro write-path futuro)
 * compartan una unica fuente de la logica de suficiencia en vez de comparar
 * `<`/`>=` de forma duplicada en cada call site (spec VSD/Re-chequeo local
 * rechaza stock insuficiente).
 */
export function evaluarStockDepositoSuficiente(
  stockDeposito: Decimal,
  cantidadSolicitada: Decimal
): boolean {
  return stockDeposito.gte(cantidadSolicitada)
}

/**
 * Lee `inventario_stock.cantidad_actual` para UN (producto, deposito) DENTRO
 * de la `writeTransaction` del llamador — usado por los re-chequeos locales
 * de disponibilidad (guard previo a cualquier INSERT de kardex). Sin fila =
 * sin stock registrado para ese par = `0` (mismo criterio de baseline que
 * `upsertStockDeposito`/`recalcularStockDesdeKardex`). Solo LEE, nunca
 * escribe — la escritura sigue siendo responsabilidad exclusiva de
 * `upsertStockDeposito`.
 */
export async function leerStockDeposito(
  tx: Transaction,
  producto_id: string,
  deposito_id: string,
  empresa_id: string
): Promise<Decimal> {
  const result = await tx.execute(
    'SELECT cantidad_actual FROM inventario_stock WHERE producto_id = ? AND deposito_id = ? AND empresa_id = ?',
    [producto_id, deposito_id, empresa_id]
  )
  return result.rows?.length
    ? new Decimal((result.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
    : new Decimal(0)
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
  let stockDepositoNuevo = computeStockDelta(currentDeposito, delta)

  if (stockRow) {
    await tx.execute(
      'UPDATE inventario_stock SET cantidad_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [stockDepositoNuevo.toFixed(3), now, usuario_id, stockRow.id]
    )
  } else {
    // INSERT guardado por WHERE NOT EXISTS — defensa en profundidad del fix real
    // (connector.ts, TABLE_NATURAL_KEYS['inventario_stock']) para el 23505 duplicate key
    // sobre `uq_stock_empresa_producto_deposito`. El SELECT de arriba vio "sin fila", pero
    // entre ese SELECT y este INSERT otra escritura (el backfill de arranque, u otra tx casi
    // simultánea) pudo haber creado la fila para esta MISMA clave natural — un INSERT ciego
    // crearía una SEGUNDA fila local con la misma (empresa,producto,deposito), cada una
    // generando su propio PUT para que el connector reconcilie en el upload.
    //
    // PowerSync no soporta declarar una UNIQUE constraint local (Table/Index no expone
    // `unique` — ver @powersync/common Table.d.ts/Index.d.ts), así que `INSERT ... ON
    // CONFLICT` no es viable aquí. `WHERE NOT EXISTS` es el equivalente alcanzable: la
    // decisión de insertar-o-no ocurre atómicamente dentro del mismo statement SQL, no en
    // un SELECT previo separado.
    //
    // `RETURNING id` (no `rowsAffected`) para detectar si el INSERT realmente insertó: la
    // capa de vistas JSON de PowerSync puede reportar `rowsAffected: 0` incluso en updates
    // exitosos (documentado en QueryResult de @powersync/common) — `rows` vía RETURNING es
    // la señal confiable.
    const insertResult = await tx.execute(
      `INSERT INTO inventario_stock
         (id, empresa_id, producto_id, deposito_id, cantidad_actual, stock_reservado, updated_at, updated_by)
       SELECT ?, ?, ?, ?, ?, '0.000', ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM inventario_stock WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ?
       )
       RETURNING id`,
      [
        uuidv4(),
        empresa_id,
        producto_id,
        deposito_id,
        stockDepositoNuevo.toFixed(3),
        now,
        usuario_id,
        empresa_id,
        producto_id,
        deposito_id,
      ]
    )

    if ((insertResult.rows?.length ?? 0) === 0) {
      // Carrera detectada: otra escritura ganó entre el SELECT inicial y este INSERT.
      // Releer el valor REAL ya presente y aplicar el delta sobre él — el baseline
      // reconstruido de kardex de la lectura inicial ya no es válido una vez que existe
      // una fila propia (evita perder el delta de esta llamada silenciosamente).
      const raceRes = await tx.execute(
        'SELECT id, cantidad_actual FROM inventario_stock WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ?',
        [empresa_id, producto_id, deposito_id]
      )
      const raceRow = raceRes.rows?.item(0) as { id: string; cantidad_actual: string } | undefined
      if (!raceRow) {
        throw new Error(
          'inventario_stock: INSERT guardado (WHERE NOT EXISTS) no insertó y la relectura tampoco encontró fila — estado inconsistente'
        )
      }
      stockDepositoNuevo = computeStockDelta(new Decimal(raceRow.cantidad_actual), delta)
      await tx.execute(
        'UPDATE inventario_stock SET cantidad_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        [stockDepositoNuevo.toFixed(3), now, usuario_id, raceRow.id]
      )
    }
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

/**
 * Resuelve el deposito ACTIVO destino para el batch de stock inicial de un
 * import: prioriza el deposito `es_principal=1` activo de la empresa; si no
 * hay ninguno marcado principal, cae al primer deposito activo encontrado.
 * Retorna `null` si la empresa no tiene ningun deposito activo — el
 * llamador (`ejecutarStockInicialImport`) decide como manejarlo (spec-pr1
 * R5, "sin deposito configurado").
 *
 * Misma logica de resolucion que `registrarMovimiento` (use-kardex.ts) para
 * el caso sin `deposito_id` explicito, pero corre FUERA de cualquier
 * `writeTransaction` — se invoca UNA sola vez antes del batch completo, no
 * una vez por entrada (spec-pr1 R4, SC5).
 */
export async function resolverDepositoPrincipalActivo(empresa_id: string): Promise<string | null> {
  const principalRes = await db.execute(
    'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
    [empresa_id]
  )
  if (principalRes.rows?.length) {
    return (principalRes.rows.item(0) as { id: string }).id
  }

  const fallbackRes = await db.execute(
    'SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1 LIMIT 1',
    [empresa_id]
  )
  if (fallbackRes.rows?.length) {
    return (fallbackRes.rows.item(0) as { id: string }).id
  }

  return null
}

export interface EntradaInicialImport {
  producto_id: string
  cantidad: number
}

export interface RegistrarEntradasInicialesBatchParams {
  entradas: EntradaInicialImport[]
  deposito_id: string
  usuario_id: string
  empresa_id: string
}

export interface RegistrarEntradasInicialesBatchResult {
  exitosos: number
}

const MOTIVO_INVENTARIO_INICIAL = 'INVENTARIO INICIAL'

/**
 * Inserta TODAS las entradas de stock inicial de un import en UNA sola
 * `db.writeTransaction` — reemplaza el loop de N llamadas a
 * `registrarMovimiento` (cada una con su propia transaccion) que hacia el
 * import antes de este cambio (spec-pr1 R1). Cada fila sigue el contrato de
 * "entrada limpia" (regla de negocio #3, Kardex-only): `tipo='E'`,
 * `origen='MAN'`, `stock_anterior='0.000'` (siempre 0: son productos recien
 * creados en el mismo import, sin stock previo posible), sin `lote_id`,
 * `tipo_salida`, `costo_unitario` ni `tasa_cambio` (spec-pr1 R2). El
 * deposito ya viene resuelto por el llamador (`ejecutarStockInicialImport`)
 * — esta funcion NUNCA resuelve deposito por si misma, y NUNCA escribe
 * `productos.stock`/`inventario_stock` directamente: delega esa escritura a
 * `upsertStockDeposito`, inmediatamente despues del INSERT de kardex de esa
 * misma entrada.
 *
 * Todo-o-nada (spec-pr1 R6): si cualquier entrada lanza, la promesa de
 * `db.writeTransaction` rechaza y ninguna fila queda persistida — no hay
 * try/catch por entrada, deliberadamente.
 */
export async function registrarEntradasInicialesBatch(
  params: RegistrarEntradasInicialesBatchParams
): Promise<RegistrarEntradasInicialesBatchResult> {
  const { entradas, deposito_id, usuario_id, empresa_id } = params
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    for (const entrada of entradas) {
      const id = uuidv4()
      const cantidadStr = new Decimal(entrada.cantidad).toFixed(3)

      await tx.execute(
        `INSERT INTO movimientos_inventario
           (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
            lote_id, motivo, usuario_id, fecha, empresa_id, created_at,
            tipo_salida, costo_unitario, tasa_cambio)
         VALUES (?, ?, ?, 'E', 'MAN', ?, '0.000', ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
        [
          id,
          entrada.producto_id,
          deposito_id,
          cantidadStr,
          cantidadStr,
          MOTIVO_INVENTARIO_INICIAL,
          usuario_id,
          now,
          empresa_id,
          now,
        ]
      )

      await upsertStockDeposito(tx, {
        empresa_id,
        producto_id: entrada.producto_id,
        deposito_id,
        delta: new Decimal(cantidadStr),
        usuario_id,
        now,
        movimientoInventarioId: id,
      })
    }
  })

  return { exitosos: entradas.length }
}

export interface EjecutarStockInicialImportParams {
  entradas: EntradaInicialImport[]
  empresa_id: string
  usuario_id: string
}

export interface EjecutarStockInicialImportResult {
  exitosos: number
  sinDeposito: boolean
}

/**
 * Orquesta el batch de stock inicial de un import: resuelve el deposito
 * destino UNA sola vez (spec-pr1 R4/SC5) y, si existe, delega TODAS las
 * entradas a `registrarEntradasInicialesBatch` (una sola `writeTransaction`
 * para el import completo). Si la empresa no tiene ningun deposito activo,
 * retorna sin abrir transaccion (spec-pr1 R5/SC6) — el modal muestra el
 * mismo mensaje de error visible antes de este cambio.
 */
export async function ejecutarStockInicialImport(
  params: EjecutarStockInicialImportParams
): Promise<EjecutarStockInicialImportResult> {
  const { entradas, empresa_id, usuario_id } = params

  const depositoId = await resolverDepositoPrincipalActivo(empresa_id)
  if (!depositoId) {
    return { exitosos: 0, sinDeposito: true }
  }

  const { exitosos } = await registrarEntradasInicialesBatch({
    entradas,
    deposito_id: depositoId,
    usuario_id,
    empresa_id,
  })

  return { exitosos, sinDeposito: false }
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
