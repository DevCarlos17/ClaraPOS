/**
 * Resolucion de deposito y fragmentos SQL puros para el flujo de VENTAS
 * (Slice 2a — solo lectura/validacion de stock por deposito en el POS).
 *
 * No toca el camino de ESCRITURA de la venta (INSERT de kardex, descuento de
 * `inventario_stock`/`productos.stock`) — eso es Slice 2b. Ver
 * openspec/changes/inventario-multideposito/design.md, seccion "Ventas
 * Stock-Validation Redesign".
 */

/**
 * Resuelve el deposito de EGRESO para una venta: prioriza el deposito de la
 * caja activa (`cajas.deposito_id`, via `sesion_caja_id`); si es NULL (caja
 * sin deposito asignado o sin sesion de caja activa), cae al deposito
 * `es_principal` de la empresa. Si ambos son NULL (empresa sin deposito
 * principal configurado — caso borde), retorna `null` y el llamador decide
 * como manejarlo (spec VSD/Egreso de Venta desde el Deposito de la Caja,
 * VSD/Venta sin sesion de caja activa).
 */
export function resolveDepositoEgresoVenta(
  cajaDepositoId: string | null,
  empresaPrincipalId: string | null
): string | null {
  return cajaDepositoId ?? empresaPrincipalId
}

export interface StockPorDepositoFragments {
  /** Fragmento `LEFT JOIN inventario_stock ...` a insertar tras los demas JOINs, o '' si no se pide scoping. */
  joinInventarioStock: string
  /** Expresion SQL a usar como `stock` en el SELECT y en el filtro `CAST(... AS REAL) > 0`. */
  stockExpr: string
  /** Parametros a anteponer (en orden) a los demas parametros del query, correspondientes a `joinInventarioStock`. */
  paramsPrefix: (string | null)[]
}

/**
 * Construye, de forma pura (sin I/O), los fragmentos SQL compartidos por los
 * 3 call-sites de lectura de stock en ventas (`useBuscarProductosVenta`,
 * `buscarProductoPorCodigoBarras`, `panel-productos.tsx` `ALL_PRODUCTS_QUERY`):
 * cuando se pide scoping por deposito, el stock pasa de leerse desde
 * `productos.stock` (total cross-deposito) a leerse desde
 * `inventario_stock.cantidad_actual` escopeado al deposito de la caja activa.
 *
 * `depositoId === undefined` preserva el comportamiento legado (sin JOIN,
 * `p.stock` directo) — usado por consumidores que no necesitan scoping por
 * deposito (ej. busqueda de productos en reportes, `ventas-consultas-modal.tsx`).
 * `depositoId === null` es el caso borde documentado: caja activa sin
 * deposito Y sin deposito principal en la empresa — el JOIN se agrega igual
 * pero el parametro es `NULL`, que nunca matchea ninguna fila de
 * `inventario_stock` (SQL: `col = NULL` es siempre falso), por lo que todos
 * los productos no-servicio quedan con stock 0 (ocultos/bloqueados) — el
 * fallback mas seguro para un estado de configuracion incompleta.
 */
export function buildStockPorDepositoFragments(
  depositoId: string | null | undefined
): StockPorDepositoFragments {
  if (depositoId === undefined) {
    return { joinInventarioStock: '', stockExpr: 'p.stock', paramsPrefix: [] }
  }
  return {
    joinInventarioStock:
      'LEFT JOIN inventario_stock s ON s.producto_id = p.id AND s.deposito_id = ? AND s.empresa_id = p.empresa_id',
    stockExpr: 'COALESCE(s.cantidad_actual, 0)',
    paramsPrefix: [depositoId],
  }
}
