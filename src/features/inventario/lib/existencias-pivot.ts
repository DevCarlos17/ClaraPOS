/**
 * Funciones puras (sin I/O, sin PowerSync) para el modulo de Existencias por
 * Deposito: transforman filas planas (JOIN productos + inventario_stock) en
 * una matriz producto x deposito, y ordenan las columnas de depositos.
 *
 * Mismo patron "SQL builder + pivot puro" que `kardex-sql.ts` (evita el
 * "Worker is not defined" que dispara importar `@/core/db/powersync/db` bajo
 * Vitest) y `stock-deposito.ts` (agregaciones puras testeables sin mock).
 *
 * Ver openspec/changes/existencias-por-deposito/design.md.
 */

/** Fila plana devuelta por `buildExistenciasPorDepositoSql()`. `deposito_id`
 * y `cantidad_actual` son NULL cuando el producto nunca tuvo un movimiento de
 * kardex (LEFT JOIN sin match en `inventario_stock`). */
export interface ExistenciaRawRow {
  producto_id: string
  codigo: string
  nombre: string
  deposito_id: string | null
  cantidad_actual: string | null
}

/** Fila pivotada: una por producto, con la cantidad por deposito indexada por
 * `deposito_id`. Una clave AUSENTE (no `'0.000'`) significa que ese
 * (producto,deposito) nunca tuvo un movimiento — el consumidor (componente)
 * debe leer con `row.cantidadPorDeposito[deposito.id] ?? '0.000'`. */
export interface ExistenciaRow {
  producto_id: string
  codigo: string
  nombre: string
  cantidadPorDeposito: Record<string, string>
}

/**
 * Agrupa filas planas por `producto_id` (Map, preserva orden de primera
 * aparicion). El "row base set" es `productos` (no `inventario_stock`): una
 * fila con `deposito_id: null` (producto sin ningun movimiento historico)
 * igual produce una `ExistenciaRow` con `cantidadPorDeposito: {}`, para no
 * dropear productos nunca movidos (spec EPD/Producto sin fila de stock en un
 * deposito).
 */
export function pivotExistencias(rows: ExistenciaRawRow[]): ExistenciaRow[] {
  const porProducto = new Map<string, ExistenciaRow>()

  for (const row of rows) {
    let existente = porProducto.get(row.producto_id)
    if (!existente) {
      existente = {
        producto_id: row.producto_id,
        codigo: row.codigo,
        nombre: row.nombre,
        cantidadPorDeposito: {},
      }
      porProducto.set(row.producto_id, existente)
    }

    if (row.deposito_id !== null) {
      existente.cantidadPorDeposito[row.deposito_id] = row.cantidad_actual ?? '0.000'
    }
  }

  return Array.from(porProducto.values())
}

/**
 * Ordena depositos para las columnas de la matriz: el `es_principal` primero,
 * luego el resto alfabeticamente por `nombre` (spec EPD/Columnas de
 * Depositos Activos Ordenadas). Generico para aceptar tanto `Deposito`
 * (use-depositos.ts) como fixtures de test sin arrastrar el tipo completo.
 */
export function ordenarDepositosColumnas<T extends { id: string; nombre: string; es_principal: number }>(
  depositos: T[]
): T[] {
  return [...depositos].sort((a, b) => {
    if (a.es_principal !== b.es_principal) {
      return b.es_principal - a.es_principal
    }
    return a.nombre.localeCompare(b.nombre)
  })
}

/**
 * Constructor puro del SQL de `useExistenciasPorDeposito`, extraido a un
 * archivo sin dependencias de PowerSync por el mismo motivo que
 * `buildMovimientosFiltradosSql` (kardex-sql.ts): permite asserts sobre el
 * SQL generado sin arrastrar el efecto secundario de instanciar
 * `PowerSyncDatabase` bajo Vitest.
 *
 * `LEFT JOIN` deja `s.deposito_id`/`s.cantidad_actual` en NULL para
 * productos que nunca tuvieron un movimiento de kardex (fila base = todos
 * los `tipo='P'` de la empresa, no solo los que ya tienen `inventario_stock`).
 */
export function buildExistenciasPorDepositoSql(): string {
  return `SELECT p.id AS producto_id, p.codigo, p.nombre, s.deposito_id, s.cantidad_actual
     FROM productos p
     LEFT JOIN inventario_stock s ON s.producto_id = p.id
     WHERE p.empresa_id = ? AND p.tipo = 'P' AND p.is_active = 1
     ORDER BY p.nombre ASC`
}
