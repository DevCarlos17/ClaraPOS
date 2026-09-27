/**
 * Utilidades puras de paginacion para DataTable. Sin React, sin DOM.
 *
 * `pageIndex` es siempre 0-based (convencion de TanStack Table).
 */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[2] // 50

/**
 * Tamano de pagina "infinito" usado como guard para consumidores con
 * `showPagination=false`: evita que registrar `getPaginationRowModel`
 * trunque silenciosamente sus filas (ver design.md).
 */
export const UNPAGINATED_PAGE_SIZE = Number.MAX_SAFE_INTEGER

export function canGoPrevious(pageIndex: number): boolean {
  return pageIndex > 0
}

export function canGoNext(pageIndex: number, pageCount: number): boolean {
  return pageIndex < pageCount - 1
}

/**
 * Etiqueta compacta del pager: "N / M" (1-based). Con `pageCount === 0`
 * (tabla vacia) retorna "0 / 0" ya que no existe una pagina 1 real que mostrar.
 */
export function formatPagerLabel(pageIndex: number, pageCount: number): string {
  if (pageCount <= 0) return '0 / 0'

  const current = Math.min(pageIndex + 1, pageCount)
  return `${current} / ${pageCount}`
}
