/**
 * Compara dos codigos de producto en orden natural (numerico cuando aplica),
 * en vez de orden lexicografico puro. Esto hace que "2" < "10" < "102" y que
 * "P-FAC-002" < "P-FAC-010" en vez de ordenar caracter por caracter.
 */
export function compararCodigos(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
