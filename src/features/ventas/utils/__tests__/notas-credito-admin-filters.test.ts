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

// ─── buildFacturasEmpresaFiltro (Slice A.3/A.4, Design §Decision 3) ────────

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

  it('filtro nroFactura aislado: agrega AND v.nro_factura LIKE ? con el parametro wrapeado en %', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, nroFactura: 'C01-0042' })
    expect(sql).toContain('AND v.nro_factura LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%C01-0042%'])
  })

  it('filtro clienteNombre aislado: agrega AND c.nombre LIKE ?', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, clienteNombre: 'Maria' })
    expect(sql).toContain('AND c.nombre LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%Maria%'])
  })

  it('filtro clienteIdentificacion aislado: agrega AND c.identificacion LIKE ?', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({ ...base, clienteIdentificacion: 'V-123' })
    expect(sql).toContain('AND c.identificacion LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%V-123%'])
  })

  it('filtros combinados: nroFactura + clienteNombre + clienteIdentificacion aparecen en orden y en params', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({
      ...base,
      nroFactura: '0042',
      clienteNombre: 'Maria',
      clienteIdentificacion: 'V-123',
    })
    const idxNro = sql.indexOf('v.nro_factura LIKE')
    const idxNombre = sql.indexOf('c.nombre LIKE')
    const idxIdent = sql.indexOf('c.identificacion LIKE')
    expect(idxNro).toBeGreaterThan(-1)
    expect(idxNombre).toBeGreaterThan(idxNro)
    expect(idxIdent).toBeGreaterThan(idxNombre)
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%0042%', '%Maria%', '%V-123%'])
  })

  it('strings vacios o solo whitespace se ignoran (no agregan clausula ni parametro)', () => {
    const { sql, params } = buildFacturasEmpresaFiltro({
      ...base,
      nroFactura: '   ',
      clienteNombre: '',
      clienteIdentificacion: '\t',
    })
    expect(sql).not.toContain('LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('params SIEMPRE parametrizados: ningun valor de filtro se interpola directo en el SQL', () => {
    const { sql } = buildFacturasEmpresaFiltro({
      ...base,
      nroFactura: "'; DROP TABLE ventas; --",
    })
    expect(sql).not.toContain('DROP TABLE')
  })
})

// ─── buildNotasCreditoFiltro (Slice A.5/A.6, Design §Decision 4) ────────

describe('buildNotasCreditoFiltro (mismos casos + filtro tipo TOTAL/PARCIAL)', () => {
  const base = { empresaId: 'emp-1', fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' }

  it('sin filtros opcionales: WHERE incluye empresa_id y rango de fecha, params = [empresaId, fechaDesde, fechaHasta]', () => {
    const { sql, params } = buildNotasCreditoFiltro(base)
    expect(sql).toContain('nc.empresa_id = ?')
    expect(sql).toContain("T00:00:00-04:00")
    expect(sql).toContain("T23:59:59-04:00")
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('filtro nroNcr aislado: agrega AND nc.nro_ncr LIKE ?', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, nroNcr: 'NCR-000012' })
    expect(sql).toContain('AND nc.nro_ncr LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%NCR-000012%'])
  })

  it('filtro tipo TOTAL: agrega AND nc.tipo = ? (exacto, sin LIKE)', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, tipo: 'TOTAL' })
    expect(sql).toContain('AND nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', 'TOTAL'])
  })

  it('filtro tipo PARCIAL: agrega AND nc.tipo = ?', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, tipo: 'PARCIAL' })
    expect(sql).toContain('AND nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', 'PARCIAL'])
  })

  it('tipo omitido: no agrega clausula de tipo', () => {
    const { sql, params } = buildNotasCreditoFiltro(base)
    expect(sql).not.toContain('nc.tipo = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('filtro clienteNombre aislado: agrega AND c.nombre LIKE ?', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, clienteNombre: 'Maria' })
    expect(sql).toContain('AND c.nombre LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%Maria%'])
  })

  it('filtro clienteIdentificacion aislado: agrega AND c.identificacion LIKE ?', () => {
    const { sql, params } = buildNotasCreditoFiltro({ ...base, clienteIdentificacion: 'V-123' })
    expect(sql).toContain('AND c.identificacion LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21', '%V-123%'])
  })

  it('filtros combinados: fecha + nroNcr + tipo + cliente + RIF se aplican simultaneamente', () => {
    const { sql, params } = buildNotasCreditoFiltro({
      ...base,
      nroNcr: '000012',
      tipo: 'TOTAL',
      clienteNombre: 'Maria',
      clienteIdentificacion: 'V-123',
    })
    expect(sql).toContain('AND nc.nro_ncr LIKE ?')
    expect(sql).toContain('AND nc.tipo = ?')
    expect(sql).toContain('AND c.nombre LIKE ?')
    expect(sql).toContain('AND c.identificacion LIKE ?')
    expect(params).toEqual([
      'emp-1',
      '2026-05-01',
      '2026-05-21',
      '%000012%',
      'TOTAL',
      '%Maria%',
      '%V-123%',
    ])
  })

  it('strings vacios o solo whitespace se ignoran', () => {
    const { sql, params } = buildNotasCreditoFiltro({
      ...base,
      nroNcr: '   ',
      clienteNombre: '',
      clienteIdentificacion: '\t',
    })
    expect(sql).not.toContain('LIKE ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
  })

  it('preserva el buscador/JOIN existente: nc.venta_id -> ventas v, nc.cliente_id -> clientes c', () => {
    const { sql } = buildNotasCreditoFiltro(base)
    expect(sql).toContain('FROM notas_credito nc')
    expect(sql).toContain('JOIN ventas v ON nc.venta_id = v.id')
    expect(sql).toContain('JOIN clientes c ON nc.cliente_id = c.id')
  })
})
