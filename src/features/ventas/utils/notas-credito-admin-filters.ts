import { VE_OFFSET, startOfMonth, todayStr } from '@/lib/dates'

/**
 * Query-builders PUROS (sin I/O, sin `db`/`useQuery`) para la ruta
 * administrativa de "Facturas emitidas" (openspec/changes/notas-credito-ruta-administrativa,
 * Slice A — Design §Decision 3/4). Consumidos por `useFacturasEmpresa`
 * (Slice B, `use-facturas-empresa.ts`) y por `useNotasCredito(filtros?)`
 * (Slice B, `use-notas-credito.ts`).
 *
 * Ambos builders SIEMPRE incluyen `empresa_id` en el `WHERE` — aislamiento
 * multi-tenant no negociable (Spec: "Aislamiento multi-tenant en consultas
 * nuevas") — y SIEMPRE parametrizan cada valor via `params`, nunca
 * interpolacion de string en el SQL.
 *
 * El rango de fecha usa el mismo patron que `kardex-sql.ts`
 * (`datetime(col) >= datetime(? || 'T00:00:00' || VE_OFFSET)`): compara
 * contra la columna `fecha` (timestamp ISO con offset VE) via `datetime()`
 * de SQLite, en vez de comparacion de string directa, para que el bound
 * sea correcto sin importar el offset literal guardado en cada fila.
 */

export interface RangoFecha {
  fechaDesde: string
  fechaHasta: string
}

/**
 * Rango de fecha por defecto para la carga inicial de ambas pestañas
 * (Spec: "Carga por defecto limitada al mes en curso"). Compone
 * `startOfMonth()`/`todayStr()` de `@/lib/dates` — sin formula paralela.
 */
export function rangoMesActual(): RangoFecha {
  return { fechaDesde: startOfMonth(), fechaHasta: todayStr() }
}

export interface SqlFiltroResult {
  sql: string
  params: unknown[]
}

export interface FiltroFacturasEmpresa {
  empresaId: string
  /** 'YYYY-MM-DD'. El llamador aplica el default (`rangoMesActual()`) — este builder no asume ninguno. */
  fechaDesde: string
  /** 'YYYY-MM-DD'. Ver `fechaDesde`. */
  fechaHasta: string
  nroFactura?: string
  clienteNombre?: string
  clienteIdentificacion?: string
}

/**
 * SQL + params para el listado empresa-wide de facturas (Spec: "Pestaña
 * Facturas — listado empresa-wide"). Mismo shape de fila que
 * `FacturaParaAnular` (`use-notas-credito.ts`) y mismo patron de
 * `tiene_reverso_total`/`tiene_reverso_parcial` via `EXISTS` que
 * `useFacturasSesionActiva` — pero SIN filtrar por `sesion_caja_id`
 * (Design §Decision 3: "NO reutiliza `useFacturasSesionActiva`").
 */
export function buildFacturasEmpresaFiltro(f: FiltroFacturasEmpresa): SqlFiltroResult {
  const params: unknown[] = [f.empresaId, f.fechaDesde, f.fechaHasta]

  let sql = `SELECT
       v.id, v.nro_factura, v.cliente_id, v.tasa, v.total_usd, v.total_bs,
       v.saldo_pend_usd, v.tipo, v.status, v.fecha, v.total_igtf_usd,
       c.nombre as cliente_nombre,
       c.identificacion as cliente_identificacion,
       EXISTS(SELECT 1 FROM notas_credito nc WHERE nc.venta_id = v.id AND nc.tipo = 'TOTAL')   as tiene_reverso_total,
       EXISTS(SELECT 1 FROM notas_credito nc WHERE nc.venta_id = v.id AND nc.tipo = 'PARCIAL') as tiene_reverso_parcial
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE v.empresa_id = ?
       AND datetime(v.fecha) >= datetime(? || 'T00:00:00${VE_OFFSET}')
       AND datetime(v.fecha) <= datetime(? || 'T23:59:59${VE_OFFSET}')`

  const nroFactura = f.nroFactura?.trim()
  if (nroFactura) {
    sql += `\n       AND v.nro_factura LIKE ?`
    params.push(`%${nroFactura}%`)
  }

  const clienteNombre = f.clienteNombre?.trim()
  if (clienteNombre) {
    sql += `\n       AND c.nombre LIKE ?`
    params.push(`%${clienteNombre}%`)
  }

  const clienteIdentificacion = f.clienteIdentificacion?.trim()
  if (clienteIdentificacion) {
    sql += `\n       AND c.identificacion LIKE ?`
    params.push(`%${clienteIdentificacion}%`)
  }

  sql += `\n     ORDER BY v.fecha DESC`

  return { sql, params }
}

export interface FiltroNotasCredito {
  empresaId: string
  /** 'YYYY-MM-DD'. El llamador aplica el default (`rangoMesActual()`) — este builder no asume ninguno. */
  fechaDesde: string
  /** 'YYYY-MM-DD'. Ver `fechaDesde`. */
  fechaHasta: string
  nroNcr?: string
  tipo?: 'TOTAL' | 'PARCIAL'
  clienteNombre?: string
  clienteIdentificacion?: string
}

/**
 * SQL + params para el listado de NC con filtros ampliados (Spec: "Pestaña
 * Notas de crédito — filtros ampliados"). Mismo JOIN/columnas base que el
 * `useNotasCredito()` sin filtros (comportamiento preservado byte-a-byte
 * para consumidores no migrados — Design §Decision 4).
 */
export function buildNotasCreditoFiltro(f: FiltroNotasCredito): SqlFiltroResult {
  const params: unknown[] = [f.empresaId, f.fechaDesde, f.fechaHasta]

  let sql = `SELECT
       nc.id, nc.nro_ncr, nc.venta_id, nc.cliente_id, nc.tipo, nc.motivo,
       nc.tasa_historica, nc.total_usd, nc.total_bs, nc.fecha,
       v.nro_factura,
       c.nombre as cliente_nombre
     FROM notas_credito nc
     JOIN ventas v ON nc.venta_id = v.id
     JOIN clientes c ON nc.cliente_id = c.id
     WHERE nc.empresa_id = ?
       AND datetime(nc.fecha) >= datetime(? || 'T00:00:00${VE_OFFSET}')
       AND datetime(nc.fecha) <= datetime(? || 'T23:59:59${VE_OFFSET}')`

  const nroNcr = f.nroNcr?.trim()
  if (nroNcr) {
    sql += `\n       AND nc.nro_ncr LIKE ?`
    params.push(`%${nroNcr}%`)
  }

  if (f.tipo) {
    sql += `\n       AND nc.tipo = ?`
    params.push(f.tipo)
  }

  const clienteNombre = f.clienteNombre?.trim()
  if (clienteNombre) {
    sql += `\n       AND c.nombre LIKE ?`
    params.push(`%${clienteNombre}%`)
  }

  const clienteIdentificacion = f.clienteIdentificacion?.trim()
  if (clienteIdentificacion) {
    sql += `\n       AND c.identificacion LIKE ?`
    params.push(`%${clienteIdentificacion}%`)
  }

  sql += `\n     ORDER BY nc.fecha DESC`

  return { sql, params }
}
