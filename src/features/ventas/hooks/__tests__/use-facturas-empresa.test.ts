// `useFacturasEmpresa` (Slice B, notas-credito-ruta-administrativa, Design
// §Decision 3) usa `useQuery` de `@powersync/react` directamente — mismo
// patron que `use-facturas-sesion-activa.test.ts`. A diferencia de
// `useFacturasSesionActiva` (hard-filtra por `sesion_caja_id`), este hook es
// empresa-wide: nunca filtra por sesion, trae facturas de CUALQUIER sesion/dia
// dentro del rango.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useFacturasEmpresa } from '../use-facturas-empresa'

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

function setup(rows: unknown[] = []) {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', empresa_id: 'emp-1', email: '', nombre: '', level: 1, rol_id: null, rol_nombre: null },
    loading: false,
  })
  mockedUseQuery.mockReturnValue({ data: rows, isLoading: false } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFacturasEmpresa (Slice B, Design §Decision 3) — hook empresa-wide, hermano de useFacturasSesionActiva', () => {
  it('sin filtros: aplica rangoMesActual() por defecto y SIEMPRE filtra empresa_id', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))
    setup()

    renderHook(() => useFacturasEmpresa())

    const [sql, params] = mockedUseQuery.mock.calls[0]!
    expect(sql).toContain('v.empresa_id = ?')
    expect(params).toEqual(['emp-1', '2026-05-01', '2026-05-21'])
    vi.useRealTimers()
  })

  it('NUNCA filtra por sesion_caja_id (a diferencia de useFacturasSesionActiva)', () => {
    setup()

    renderHook(() => useFacturasEmpresa())

    const [sql] = mockedUseQuery.mock.calls[0]!
    expect(sql).not.toContain('sesion_caja_id')
  })

  it('filtros explicitos de fecha sobreescriben el default de mes actual (escape hatch de rango amplio)', () => {
    setup()

    renderHook(() => useFacturasEmpresa({ fechaDesde: '2020-01-01', fechaHasta: '2026-05-21' }))

    const [, params] = mockedUseQuery.mock.calls[0]!
    expect(params).toEqual(['emp-1', '2020-01-01', '2026-05-21'])
  })

  it('filtro nroFactura se aplica via buildFacturasEmpresaFiltro', () => {
    setup()

    renderHook(() =>
      useFacturasEmpresa({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-21', nroFactura: 'C01-0042' })
    )

    const [sql, params] = mockedUseQuery.mock.calls[0]!
    expect(sql).toContain('AND v.nro_factura LIKE ?')
    expect(params).toContain('%C01-0042%')
  })

  it('filtros cliente/RIF se aplican via buildFacturasEmpresaFiltro', () => {
    setup()

    renderHook(() =>
      useFacturasEmpresa({
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-21',
        clienteNombre: 'Maria',
        clienteIdentificacion: 'V-123',
      })
    )

    const [sql, params] = mockedUseQuery.mock.calls[0]!
    expect(sql).toContain('AND c.nombre LIKE ?')
    expect(sql).toContain('AND c.identificacion LIKE ?')
    expect(params).toContain('%Maria%')
    expect(params).toContain('%V-123%')
  })

  it('retorna facturas de MULTIPLES sesiones/dias distintos dentro del rango (a diferencia de useFacturasSesionActiva)', () => {
    setup([
      { id: 'venta-1', nro_factura: 'C01-000001' },
      { id: 'venta-2', nro_factura: 'C02-000001' },
    ])

    const { result } = renderHook(() => useFacturasEmpresa())

    expect(result.current.facturas).toHaveLength(2)
  })

  it('empresa_id SIEMPRE presente en params, incluso combinando todos los filtros', () => {
    setup()

    renderHook(() =>
      useFacturasEmpresa({
        fechaDesde: '2026-05-01',
        fechaHasta: '2026-05-21',
        nroFactura: '0042',
        clienteNombre: 'Maria',
        clienteIdentificacion: 'V-123',
      })
    )

    const [, params] = mockedUseQuery.mock.calls[0]!
    expect(params![0]).toBe('emp-1')
  })
})
