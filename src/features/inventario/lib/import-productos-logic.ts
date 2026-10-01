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

/**
 * spec-pr3 R7 (guard financiero, extraido de `validateRowActualizar`): valida
 * el FORMATO numerico de las celdas de precio tocadas (columna presente en el
 * header Y celda no vacia) de una fila `ACTUALIZAR`, ANTES de fusionar con
 * `mergearProductoParaUpdate`. Sin este guard, una celda no numerica produce
 * `NaN` al parsear, y las comparaciones de `validarPreciosMergeados`
 * (`NaN >= x`, `NaN > x`) son siempre `false` — la fila invalida pasaria la
 * regla de negocio #7 silenciosamente. Columna ausente o celda vacia = no
 * tocada = sin error (misma semantica de "tocado" que el resto de R7).
 */
export function validarFormatoPreciosTocados(row: RowPreciosInput, columnasPresentes: ColumnasPresentes): string[] {
  const errores: string[] = []

  if (columnasPresentes.has('costo_usd') && row.costo_usd.trim() !== '') {
    const costo = parseFloat(row.costo_usd)
    if (isNaN(costo) || costo < 0) errores.push('costo_usd invalido')
  }
  if (columnasPresentes.has('precio_venta_usd') && row.precio_venta_usd.trim() !== '') {
    const venta = parseFloat(row.precio_venta_usd)
    if (isNaN(venta) || venta < 0) errores.push('precio_venta_usd invalido')
  }
  if (columnasPresentes.has('precio_mayor_usd') && row.precio_mayor_usd.trim() !== '') {
    const mayor = parseFloat(row.precio_mayor_usd)
    if (isNaN(mayor) || mayor < 0) errores.push('precio_mayor_usd invalido')
  }

  return errores
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

/**
 * spec-pr3 R8 (aplica solo la parte de la regla de negocio #7 que sigue
 * vigente tras B1.1): `venta >= costo` sobre los valores YA FUSIONADOS
 * (`mergearProductoParaUpdate`). La restriccion `mayor <= venta` se
 * eliminó deliberadamente (B1.1, sesion 2026-09-30): nunca sabemos que
 * tiene en mente el usuario para su precio mayorista — puede ser
 * legitimamente mayor al de venta detal. Cuando el estado fusionado queda
 * invalido, el mensaje nombra el campo tocado por el archivo y sugiere
 * incluir el campo no tocado que resolveria la violacion — nunca ajusta
 * valores automaticamente.
 */
export function validarPreciosMergeados(merged: MergedPrecios, columnasPresentes: ColumnasPresentes): string[] {
  const errores: string[] = []

  if (merged.venta < merged.costo) {
    errores.push(mensajeVentaMenorQueCosto(merged, columnasPresentes))
  }

  return errores
}

/** Deposito activo minimo necesario para resolver la columna `deposito` de una fila (PR3b). */
export interface DepositoParaResolucion {
  id: string
  nombre: string
}

export interface ResolverDepositoFilaResult {
  /** Presente cuando la fila DEBE actualizar/asignar un deposito (CREAR siempre,
   * ACTUALIZAR solo si la celda vino tocada con un nombre valido). Ausente = no tocar. */
  deposito_id?: string
  error?: string
}

/**
 * spec-pr3 R9-R11 (PR3b): resuelve la columna `deposito` (opcional, ya
 * normalizada `.trim().toUpperCase()` por el llamador) de UNA fila contra la
 * lista de depositos ACTIVOS de la empresa (`depositosActivos`, ya filtrada
 * por el llamador via `useDepositosActivos()` — R17, esta funcion NO filtra
 * por `is_active` de nuevo).
 *
 * - Celda tocada (columna presente en el header Y celda no vacia) con nombre
 *   EXACTO encontrado -> `{ deposito_id }` (aplica a CREAR y a ACTUALIZAR por
 *   igual: R11 permite cambiar el deposito default de un producto existente).
 * - Celda tocada sin coincidencia -> error de fila (R9), mismo patron que el
 *   error de `departamento`.
 * - Celda NO tocada (columna ausente O celda vacia — equivalentes, mismo
 *   criterio que R7) en fila CREAR -> fallback al deposito principal
 *   (`principalId`, ya resuelto UNA vez por el llamador antes de la tx —
 *   equivalente a `resolveDepositoIngreso(null, principalId)` de
 *   `stock-deposito.ts`, reimplementado aqui para no importar ese modulo —
 *   que trae PowerSync a nivel de modulo — en este archivo puro). Si no hay
 *   principal (`null`), retorna `{}` (sin deposito_id, sin error): el
 *   llamador (`ejecutarStockInicialImport`) ya maneja el caso "empresa sin
 *   depositos activos" para el batch de stock (spec-pr1 R5).
 * - Celda NO tocada en fila ACTUALIZAR -> `{}` (NUNCA toca
 *   `producto.deposito_id` existente, R11).
 */
export function resolverDepositoFila(
  celda: string,
  accion: AccionFila,
  columnasPresentes: ColumnasPresentes,
  depositosActivos: DepositoParaResolucion[],
  principalId: string | null
): ResolverDepositoFilaResult {
  const tocado = columnasPresentes.has('deposito') && celda.trim() !== ''

  if (tocado) {
    const match = depositosActivos.find((d) => d.nombre === celda)
    if (!match) {
      return { error: `deposito "${celda}" no existe o no esta activo` }
    }
    return { deposito_id: match.id }
  }

  if (accion === 'CREAR') {
    return principalId ? { deposito_id: principalId } : {}
  }

  return {}
}

/**
 * spec-pr3 R12 (PR3b): decide si la celda `stock_inicial` de una fila
 * `ACTUALIZAR` debe IGNORARSE (no genera movimiento de kardex, la fila sigue
 * VALIDA — solo una advertencia no bloqueante en el preview). El stock de un
 * producto EXISTENTE nunca se mueve via import (regla de negocio #3,
 * Kardex-only) — el ajuste masivo de stock es responsabilidad del modulo
 * Ajustes, fuera de alcance de PR3 (`spec-pr3.md`, "Fuera de Alcance").
 *
 * `'0'`/vacio NO cuenta como intento de mover stock (nada que ignorar):
 * mismo criterio de "valor > 0" que ya usa `validateRowCrear` para
 * `stock_inicial`.
 */
export function debeIgnorarStockInicial(accion: AccionFila, stockInicialCell: string): boolean {
  if (accion !== 'ACTUALIZAR') return false
  const valor = parseFloat(stockInicialCell)
  return !isNaN(valor) && valor > 0
}
