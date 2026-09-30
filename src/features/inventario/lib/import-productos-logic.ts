/**
 * Nucleo puro (sin DOM, sin PowerSync) del import de productos con 3 modos
 * (import-productos-modos-deposito, PR3a). `import-productos-modal.tsx`
 * queda como wiring delgado sobre estas funciones.
 *
 * Ver openspec/changes/import-productos-modos-deposito/spec-pr3.md — R2,
 * R3, R7, R8.
 */

export type ModoImportacion = 'crear' | 'actualizar' | 'upsert'

export type AccionFila = 'CREAR' | 'ACTUALIZAR' | 'OMITIR'

/** Set de nombres de columna presentes en el header del archivo (R3). */
export type ColumnasPresentes = Set<string>

/**
 * Tabla de verdad de spec-pr3 R2: decide la accion de una fila segun si su
 * `codigo` ya existe en `productos` (empresa actual) y el modo activo.
 */
export function clasificarAccionFila(codigoExiste: boolean, modo: ModoImportacion): AccionFila {
  if (modo === 'crear') return codigoExiste ? 'OMITIR' : 'CREAR'
  if (modo === 'actualizar') return codigoExiste ? 'ACTUALIZAR' : 'OMITIR'
  return codigoExiste ? 'ACTUALIZAR' : 'CREAR'
}

/**
 * Construye el Set de columnas presentes a partir de la fila de header
 * (`sheet_to_json(sheet, {header:1})[0]`) — se llama UNA vez por archivo
 * (R3), nunca por fila. Celdas vacias/undefined del header se ignoran.
 */
export function detectarColumnasPresentes(headerRow: unknown[]): ColumnasPresentes {
  const columnas = new Set<string>()
  for (const cell of headerRow) {
    const nombre = String(cell ?? '').trim()
    if (nombre !== '') columnas.add(nombre)
  }
  return columnas
}

export interface RowPreciosInput {
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string
}

export interface ProductoExistentePrecios {
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string | null
}

export interface MergedPrecios {
  costo: number
  venta: number
  mayor: number | null
}

/**
 * spec-pr3 R7: para cada uno de los 3 campos de precio, resuelve el valor
 * final de una fila `ACTUALIZAR`: si la columna esta presente en el archivo
 * Y la celda de esta fila no esta vacia -> valor parseado de la fila; en
 * cualquier otro caso (columna ausente O celda vacia) -> valor existente del
 * producto en BD. "Ausente" y "vacio" son EQUIVALENTES (SC5/SC6).
 */
export function mergearProductoParaUpdate(
  row: RowPreciosInput,
  columnasPresentes: ColumnasPresentes,
  productoExistente: ProductoExistentePrecios
): MergedPrecios {
  const costo = columnasPresentes.has('costo_usd') && row.costo_usd.trim() !== ''
    ? parseFloat(row.costo_usd)
    : parseFloat(productoExistente.costo_usd)

  const venta = columnasPresentes.has('precio_venta_usd') && row.precio_venta_usd.trim() !== ''
    ? parseFloat(row.precio_venta_usd)
    : parseFloat(productoExistente.precio_venta_usd)

  const mayor = columnasPresentes.has('precio_mayor_usd') && row.precio_mayor_usd.trim() !== ''
    ? parseFloat(row.precio_mayor_usd)
    : productoExistente.precio_mayor_usd !== null
      ? parseFloat(productoExistente.precio_mayor_usd)
      : null

  return { costo, venta, mayor }
}

function mensajeVentaMenorQueCosto(merged: MergedPrecios, columnasPresentes: ColumnasPresentes): string {
  const costoTocado = columnasPresentes.has('costo_usd')
  const ventaTocada = columnasPresentes.has('precio_venta_usd')
  const base = `el costo ${merged.costo} supera el precio de venta actual ${merged.venta}`

  if (costoTocado && !ventaTocada) {
    return `${base} — incluí también precio_venta_usd`
  }
  if (!costoTocado && ventaTocada) {
    return `el precio de venta ${merged.venta} es menor al costo actual ${merged.costo} — incluí también costo_usd`
  }
  return `${base} — ajustá costo_usd y/o precio_venta_usd para que el precio de venta sea mayor o igual al costo`
}

function mensajeMayorMayorQueVenta(merged: MergedPrecios, columnasPresentes: ColumnasPresentes): string {
  const mayorTocado = columnasPresentes.has('precio_mayor_usd')
  const ventaTocada = columnasPresentes.has('precio_venta_usd')
  const base = `el precio mayor ${merged.mayor} supera el precio de venta ${merged.venta}`

  if (mayorTocado && !ventaTocada) {
    return `${base} — incluí también precio_venta_usd o corregí precio_mayor_usd`
  }
  if (!mayorTocado && ventaTocada) {
    return `${base} — incluí también precio_mayor_usd para bajarlo, o corregí precio_venta_usd`
  }
  return `${base} — ajustá precio_venta_usd y/o precio_mayor_usd para que el precio mayor sea menor o igual al de venta`
}

/**
 * spec-pr3 R8 (LOCKED, decision financiera): aplica la regla de negocio #7
 * (`venta >= costo`, y si `mayor != null`, `mayor <= venta`) sobre los
 * valores YA FUSIONADOS (`mergearProductoParaUpdate`). Cuando el estado
 * fusionado queda invalido, el mensaje nombra el campo tocado por el
 * archivo y sugiere incluir el campo no tocado que resolveria la violacion
 * — nunca ajusta valores automaticamente.
 */
export function validarPreciosMergeados(merged: MergedPrecios, columnasPresentes: ColumnasPresentes): string[] {
  const errores: string[] = []

  if (merged.venta < merged.costo) {
    errores.push(mensajeVentaMenorQueCosto(merged, columnasPresentes))
  }

  if (merged.mayor !== null && merged.mayor > merged.venta) {
    errores.push(mensajeMayorMayorQueVenta(merged, columnasPresentes))
  }

  return errores
}
