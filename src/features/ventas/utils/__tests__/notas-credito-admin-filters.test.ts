import { vi } from 'vitest'
import {
  rangoMesActual,
  buildFacturasEmpresaFiltro,
  buildNotasCreditoFiltro,
} from '../notas-credito-admin-filters'

// ─── rangoMesActual (Slice A.1/A.2, Design §Decision 3/4) ────────

describe('rangoMesActual (compone startOfMonth()/todayStr() de @/lib/dates)', () => {
  it('retorna el 1ro del mes actual como fechaDesde y hoy como fechaHasta', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    expect(rangoMesActual()).toEqual({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' })
    vi.useRealTimers()
  })

  it('boundary: primer dia del mes -> fechaDesde y fechaHasta son el mismo dia', () => {
    vi.setSystemTime(new Date('2026-01-01T15:00:00-04:00'))
    expect(rangoMesActual()).toEqual({ fechaDesde: '2026-01-01', fechaHasta: '2026-01-01' })
    vi.useRealTimers()
  })
})

// ─── buildFacturasEmpresaFiltro (Slice A.3/A.4 + Slice E.2/E.3) ────────

describe('buildFacturasEmpresaFiltro (empresa_id + rango de fecha siempre presentes)', () => {
  const base = { empresaId: 'emp-1', fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' }

  it('sin filtros opcionales: WHERE incluye empresa_id y rango de fecha, params = [empresaId, fechaDesde, fechaHasta]', () => {
    const { sql, params } = buildFacturasEmpresaFiltro(base)
    expect(sql).toContain('v.empresa_id = ?')
    expect(sql).toContain("T00:00:00-04:00")
    expect(sql).toContain("T23:59:59-04:00")
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('incluye el shape de FacturaParaAnular: status, tiene_reverso_total/parcial via EXISTS, total_igtf_usd', () => {
    const { sql } = buildFacturasEmpresaFiltro(base)
    expect(sql).toContain('v.status')
    expect(sql).toContain('v.total_igtf_usd')
    expect(sql).toContain("tiene_reverso_total")
    expect(sql).toContain("tiene_reverso_parcial")
    expect(sql).toContain('EXISTS(SELECT 1 FROM notas_credito nc WHERE nc.venta_id = v.id')
  })

  it('NUNCA filtra por sesion_caja_id (a diferencia de useFacturasSesionActiva)', () => {
    const { sql } = buildFacturasEmpresaFiltro(base)
    expect(sql).not.toContain('sesion_caja_id')
  })

  // ─── Slice E.2 — busqueda unificada (patron POS: un solo input) ────────

  it('busqueda: agrega OR sobre nro_factura/cliente_nombre/cliente_identificacion, con el termino repetido 3 veces en params', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: 'C01-0042' })
    expect(sql).toContain('AND (v.nro_factura LIKE ? OR c.nombre LIKE ? OR c.identificacion LIKE ?)')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%C01-0042%', '%C01-0042%', '%C01-0042%'])
  })

  it('busqueda matchea por nombre de cliente (mismo termino, misma clausula OR)', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: 'Maria' })
    expect(sql).toContain('OR c.nombre LIKE ?')
    expect(params).toContain('%Maria%')
  })

  it('busqueda matchea por RIF (mismo termino, misma clausula OR)', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: 'V-123' })
    expect(sql).toContain('OR c.identificacion LIKE ?')
    expect(params).toContain('%V-123%')
  })

  it('busqueda vacia o solo whitespace: NO agrega la clausula OR ni parametros', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: '   ' })
    expect(sql).not.toContain('LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('busqueda omitida: comportamiento identico a busqueda vacia', () => {
    const { sql, params } = buildFacturasEmpresaFiltro(base)
    expect(sql).not.toContain('LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('params SIEMPRE parametrizados: ningun valor de busqueda se interpola directo en el SQL', () => {
    const { sql } = buildFacturasEmpresaFiltro({ ...base, busqueda: "'; DROP TABLE ventas; --" })
    expect(sql).not.toContain('DROP TABLE')
  })

  // ─── Slice E.3 — filtro de estado (Contado/Credito/Reverso Parcial/Reverso Total) ────────

  it('estado CONTADO: filtra CAST(v.saldo_pend_usd AS REAL) <= 0.005 (mismo epsilon que derivarEstadoPago)', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, estado: 'CONTADO' })
    expect(sql).toContain('AND CAST(v.saldo_pend_usd AS REAL) <= 0.005')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('estado CREDITO: filtra CAST(v.saldo_pend_usd AS REAL) >= (CAST(v.total_usd AS REAL) - 0.005)', () => {
    const { sql } = buildFacturasEmpresaFiltro({ ...base, estado: 'CREDITO' })
    expect(sql).toContain('AND CAST(v.saldo_pend_usd AS REAL) >= (CAST(v.total_usd AS REAL) - 0.005)')
  })

  it('estado REVERSO_PARCIAL: filtra EXISTS notas_credito con tipo PARCIAL para la venta', () => {
    const { sql } = buildFacturasEmpresaFiltro({ ...base, estado: 'REVERSO_PARCIAL' })
    expect(sql).toContain("AND EXISTS(SELECT 1 FROM notas_credito")
    expect(sql).toMatch(/AND EXISTS\(SELECT 1 FROM notas_credito \w+ WHERE \w+\.venta_id = v\.id AND \w+\.tipo = 'PARCIAL'\)/)
  })

  it('estado REVERSO_TOTAL: filtra EXISTS notas_credito con tipo TOTAL para la venta', () => {
    const { sql } = buildFacturasEmpresaFiltro({ ...base, estado: 'REVERSO_TOTAL' })
    expect(sql).toMatch(/AND EXISTS\(SELECT 1 FROM notas_credito \w+ WHERE \w+\.venta_id = v\.id AND \w+\.tipo = 'TOTAL'\)/)
  })

  it('estado omitido: no agrega ninguna clausula de estado', () => {
    const { sql, params } = buildFacturasEmpresaFiltro(base)
    expect(sql).not.toContain('saldo_pend_usd AS REAL')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('busqueda + estado combinados: ambas clausulas aparecen, busqueda antes de estado', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: 'Maria', estado: 'CONTADO' })
    const idxBusqueda = sql.indexOf('v.nro_factura LIKE')
    const idxEstado = sql.indexOf('saldo_pend_usd AS REAL')
    expect(idxBusqueda).toBeGreaterThan(-1)
    expect(idxEstado).toBeGreaterThan(idxBusqueda)
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%Maria%', '%Maria%', '%Maria%'])
  })

  it('empresa_id SIEMPRE presente incluso con busqueda y estado combinados', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, busqueda: 'x', estado: 'REVERSO_TOTAL' })
    expect(sql).toContain('v.empresa_id = ?')
    expect(params[0]).toBe('emp-1')
  })
})

// ─── buildNotasCreditoFiltro (Slice A.5/A.6 + Slice E.2/E.3) ────────

describe('buildNotasCreditoFiltro (mismos casos + filtro de estado reverso TOTAL/PARCIAL)', () => {
  const base = { empresaId: 'emp-1', fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' }

  it('sin filtros opcionales: WHERE incluye empresa_id y rango de fecha, params = [empresaId, fechaDesde, fechaHasta]', () => {
    const { sql, params } = buildNotasCreditoFiltro(base)
    expect(sql).toContain('nc.empresa_id = ?')
    expect(sql).toContain("T00:00:00-04:00")
    expect(sql).toContain("T23:59:59-04:00")
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('preserva el buscador/JOIN existente: nc.venta_id -> ventas v, nc.cliente_id -> clientes c', () => {
    const { sql } = buildNotasCreditoFiltro(base)
    expect(sql).toContain('FROM notas_credito nc')
    expect(sql).toContain('JOIN ventas v ON nc.venta_id = v.id')
    expect(sql).toContain('JOIN clientes c ON nc.cliente_id = c.id')
  })

  // ─── Slice E.2 — busqueda unificada (patron POS: un solo input) ────────

  it('busqueda: agrega OR sobre nro_ncr/cliente_nombre/cliente_identificacion, con el termino repetido 3 veces en params', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: 'NCR-000012' })
    expect(sql).toContain('AND (nc.nro_ncr LIKE ? OR c.nombre LIKE ? OR c.identificacion LIKE ?)')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%NCR-000012%', '%NCR-000012%', '%NCR-000012%'])
  })

  it('busqueda matchea por nombre de cliente', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: 'Maria' })
    expect(sql).toContain('OR c.nombre LIKE ?')
    expect(params).toContain('%Maria%')
  })

  it('busqueda matchea por RIF', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: 'V-123' })
    expect(sql).toContain('OR c.identificacion LIKE ?')
    expect(params).toContain('%V-123%')
  })

  it('busqueda vacia o solo whitespace: NO agrega la clausula OR ni parametros', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: '\t' })
    expect(sql).not.toContain('LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('params SIEMPRE parametrizados: ningun valor de busqueda se interpola directo en el SQL', () => {
    const { sql } = buildNotasCreditoFiltro({ ...base, busqueda: "'; DROP TABLE notas_credito; --" })
    expect(sql).not.toContain('DROP TABLE')
  })

  // ─── Slice E.3 — filtro de estado (Reverso Total / Reverso Parcial, NC no tiene Contado/Credito) ────────

  it('estado REVERSO_TOTAL: filtra AND nc.tipo = ? con el valor TOTAL parametrizado', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, estado: 'REVERSO_TOTAL' })
    expect(sql).toContain('AND nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', 'TOTAL'])
  })

  it('estado REVERSO_PARCIAL: filtra AND nc.tipo = ? con el valor PARCIAL parametrizado', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, estado: 'REVERSO_PARCIAL' })
    expect(sql).toContain('AND nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', 'PARCIAL'])
  })

  it('estado omitido: no agrega clausula de tipo/estado', () => {
    const { sql, params } = buildNotasCreditoFiltro(base)
    expect(sql).not.toContain('nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('busqueda + estado combinados: ambas clausulas se aplican simultaneamente', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: 'Maria', estado: 'REVERSO_TOTAL' })
    expect(sql).toContain('AND (nc.nro_ncr LIKE ? OR c.nombre LIKE ? OR c.identificacion LIKE ?)')
    expect(sql).toContain('AND nc.tipo = ?')
    expect(params).toEqual([
      'emp-1',
      '2026-05-01',
      '2026-05-21',
      '%Maria%',
      '%Maria%',
      '%Maria%',
      'TOTAL',
    ])
  })

  it('empresa_id SIEMPRE presente incluso con busqueda y estado combinados', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, busqueda: 'x', estado: 'REVERSO_PARCIAL' })
    expect(sql).toContain('nc.empresa_id = ?')
    expect(params[0]).toBe('emp-1')
  })
})
