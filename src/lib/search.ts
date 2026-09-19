/**
 * Normaliza texto para busqueda tolerante a mayusculas/acentos (ej.
 * "credito" matchea "Crédito"). Mismo criterio que
 * `notas-credito-ui.ts#normalizarBusqueda`.
 */
function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Filtro client-side generico (cliente-detalle-tablas-pestanas): coincide por
 * substring case/acento-insensitive contra cualquiera de los `campos` dados.
 * Query vacio siempre coincide (sin filtro). Valores `null`/`undefined` se
 * ignoran sin romper el match de los demas campos.
 */
export function coincideBusquedaMultiCampo(
  campos: Array<string | number | null | undefined>,
  query: string
): boolean {
  const q = normalizarTexto(query.trim())
  if (!q) return true
  return campos.some((campo) => campo != null && normalizarTexto(String(campo)).includes(q))
}
