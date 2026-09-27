/**
 * Deriva un label legible para el menu "Columnas" del `DataTableViewOptions`
 * (owner feedback: mostraba `column.id` crudo — "Nro_factura"/"Total_usd" —
 * en vez del `header` real de la columna). Puro, sin React: recibe
 * `columnDef.header` tal cual (string, render-function, o undefined) + el
 * `column.id`, nunca la instancia de `Column` de TanStack (evita acoplar el
 * test a la API de la tabla).
 */
export function getColumnLabel(header: unknown, id: string): string {
  if (typeof header === 'string' && header.trim().length > 0) return header
  return prettifyColumnId(id)
}

/** snake_case -> Title Case (ej. "nro_factura" -> "Nro Factura"), fallback cuando el header no es un string usable. */
function prettifyColumnId(id: string): string {
  return id
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
