/**
 * Fallback puro para la card mobile generica de DataTable. Sin React, sin DOM:
 * retorna datos derivados (pares label/valor), no nodos JSX. El render de la
 * `Card` vive en data-table.tsx, que mapea las celdas visibles a
 * `MobileCardColumn` antes de llamar a `derivarCamposMobile`.
 */

export type MobileCardColumn = {
  /** Header de la columna tal como llega de `columnDef.header` (string, render fn, o undefined). */
  header: unknown
  value: unknown
}

export type MobileCardField = {
  label: string
  value: unknown
}

function tieneHeaderTextoValido(
  columna: MobileCardColumn
): columna is MobileCardColumn & { header: string } {
  return typeof columna.header === 'string' && columna.header.trim().length > 0
}

/**
 * `undefined`/`null`/string-vacio se consideran "sin valor" (ej. columnas
 * `id:` sin `accessorKey`, donde `cell.getValue()` no resuelve nada). `0` y
 * `false` SI son valores validos — no se omiten pese a ser falsy.
 */
function tieneValorNoVacio(columna: MobileCardColumn): boolean {
  if (columna.value === undefined || columna.value === null) return false
  if (typeof columna.value === 'string' && columna.value.trim().length === 0) return false
  return true
}

/**
 * Deriva pares label/valor de las columnas visibles de una fila, para usarlos
 * como fallback de la card mobile cuando el consumidor no pasa `renderMobileCard`.
 * Omite columnas cuyo header no sea un string plano o sea un string vacio
 * (ej. columnas de acciones con header render-function o sin header), y
 * columnas cuyo valor sea undefined/null/string-vacio (ej. columnas `id:`
 * sin `accessorKey` — `cell.getValue()` no tiene de donde derivar el dato).
 */
export function derivarCamposMobile(columnas: MobileCardColumn[]): MobileCardField[] {
  return columnas
    .filter(tieneHeaderTextoValido)
    .filter(tieneValorNoVacio)
    .map((columna) => ({
      label: columna.header,
      value: columna.value,
    }))
}
