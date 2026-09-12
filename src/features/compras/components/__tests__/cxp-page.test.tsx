import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CxpPage } from '../cxp-page'
import {
  useProveedoresConDeuda,
  useBuscarProveedoresDeuda,
  useFacturasCompraPendientes,
  type ProveedorConDeuda,
  type FacturaCompraPendiente,
} from '../../hooks/use-cxp'
import { useGastosPendientesProveedor, type GastoPendiente } from '@/features/contabilidad/hooks/use-gastos'

vi.mock('../../hooks/use-cxp', () => ({
  useProveedoresConDeuda: vi.fn(),
  useBuscarProveedoresDeuda: vi.fn(),
  useFacturasCompraPendientes: vi.fn(),
}))
vi.mock('@/features/contabilidad/hooks/use-gastos', () => ({
  useGastosPendientesProveedor: vi.fn(),
}))

vi.mock('../pago-cxp-modal', () => ({
  PagoCxPModal: ({ open, factura }: { open: boolean; factura: FacturaCompraPendiente | null }) =>
    open ? <div data-testid="pago-cxp-modal-abierto">{factura?.nro_factura}</div> : null,
}))
vi.mock('../pago-gasto-cxp-modal', () => ({
  PagoGastoCxpModal: ({ open, gasto }: { open: boolean; gasto: GastoPendiente | null }) =>
    open ? <div data-testid="pago-gasto-cxp-modal-abierto">{gasto?.nro_gasto}</div> : null,
}))
vi.mock('../factura-proveedor-modal', () => ({ FacturaProveedorModal: () => null }))

const mockedUseProveedoresConDeuda = vi.mocked(useProveedoresConDeuda)
const mockedUseBuscarProveedoresDeuda = vi.mocked(useBuscarProveedoresDeuda)
const mockedUseFacturasCompraPendientes = vi.mocked(useFacturasCompraPendientes)
const mockedUseGastosPendientesProveedor = vi.mocked(useGastosPendientesProveedor)

function proveedor(overrides: Partial<ProveedorConDeuda> = {}): ProveedorConDeuda {
  return {
    id: 'prov-1',
    rif: 'J-1',
    razon_social: 'Proveedor 1',
    saldo_actual: '0',
    facturas_pendientes: 1,
    ...overrides,
  }
}

/** 8 proveedores ordenados DESC por saldo_actual, tal como los devuelve la query real. */
function ochoProveedores(): ProveedorConDeuda[] {
  return Array.from({ length: 8 }, (_, i) =>
    proveedor({
      id: `prov-${i + 1}`,
      rif: `J-${i + 1}`,
      razon_social: `Proveedor ${i + 1}`,
      saldo_actual: String(800 - i * 100),
      facturas_pendientes: 1,
    })
  )
}

/** N proveedores ordenados DESC por saldo_actual, para probar paginado (pageSize=12). */
function nProveedores(n: number): ProveedorConDeuda[] {
  return Array.from({ length: n }, (_, i) =>
    proveedor({
      id: `prov-${i + 1}`,
      rif: `J-${i + 1}`,
      razon_social: `Proveedor ${i + 1}`,
      saldo_actual: String((n - i) * 10),
      facturas_pendientes: 1,
    })
  )
}

function factura(overrides: Partial<FacturaCompraPendiente> = {}): FacturaCompraPendiente {
  return {
    id: 'fc-1',
    nro_factura: '2001',
    fecha_factura: '2026-09-01',
    total_usd: '100.00000000',
    saldo_pend_usd: '80.00000000',
    tipo: 'CREDITO',
    tasa: '100',
    tasa_costo: null,
    ...overrides,
  }
}

function gasto(overrides: Partial<GastoPendiente> = {}): GastoPendiente {
  return {
    id: 'g-1',
    nro_gasto: 'G-001',
    nro_factura: null,
    fecha: '2026-09-02',
    monto_usd: '40.00000000',
    monto_factura: '40.00000000',
    moneda_factura: 'USD',
    saldo_pendiente_usd: '40.00000000',
    descripcion: 'Alquiler local',
    cuenta_nombre: 'Gastos Operativos',
    tasa: '100',
    tasa_proveedor: null,
    usa_tasa_paralela: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mockedUseBuscarProveedoresDeuda.mockReturnValue({ proveedores: [], isLoading: false })
  mockedUseFacturasCompraPendientes.mockReturnValue({ facturas: [], isLoading: false })
  mockedUseGastosPendientesProveedor.mockReturnValue({ gastosPendientes: [], isLoading: false })
})

describe('CxpPage - paginado client-side (reemplaza top-5)', () => {
  it('muestra los primeros 12 proveedores por defecto (pagina 1 de 2, con 20 proveedores)', () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: nProveedores(20), isLoading: false })

    render(<CxpPage />)

    // Proveedor 1 (mayor saldo) tambien aparece en el sub-label de la KPI
    // "Mayor Deuda" — usar getAllByText para esa fila puntual.
    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
    for (let i = 2; i <= 12; i++) {
      expect(screen.getByText(`Proveedor ${i}`)).toBeInTheDocument()
    }
    for (let i = 13; i <= 20; i++) {
      expect(screen.queryByText(`Proveedor ${i}`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('el boton Siguiente avanza a la pagina 2 y muestra los proveedores 13-20', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: nProveedores(20), isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }))

    for (let i = 13; i <= 20; i++) {
      expect(screen.getByText(`Proveedor ${i}`)).toBeInTheDocument()
    }
    for (let i = 2; i <= 12; i++) {
      expect(screen.queryByText(`Proveedor ${i}`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
  })

  it('el boton Anterior retrocede de la pagina 2 a la pagina 1', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: nProveedores(20), isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    await userEvent.click(screen.getByRole('button', { name: /anterior/i }))

    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('la busqueda filtra el arreglo completo y pagina el resultado filtrado', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: nProveedores(20), isLoading: false })
    const resultados = Array.from({ length: 15 }, (_, i) =>
      proveedor({ id: `res-${i + 1}`, rif: `J-r${i + 1}`, razon_social: `Resultado ${i + 1}`, saldo_actual: '50' })
    )
    mockedUseBuscarProveedoresDeuda.mockReturnValue({ proveedores: resultados, isLoading: false })

    render(<CxpPage />)
    await userEvent.type(screen.getByPlaceholderText('Buscar por nombre o rif/cedula...'), 'mar')

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Resultado ${i}`)).toBeInTheDocument()
    }
    for (let i = 13; i <= 15; i++) {
      expect(screen.queryByText(`Resultado ${i}`)).not.toBeInTheDocument()
    }
    // Proveedor 2..8 no deben aparecer en la lista (el buscador reemplazo el
    // arreglo base) — Proveedor 1 se omite porque la KPI "Mayor Deuda" sigue
    // calculada sobre el arreglo completo sin busqueda y siempre lo muestra.
    for (let i = 2; i <= 8; i++) {
      expect(screen.queryByText(`Proveedor ${i}`)).not.toBeInTheDocument()
    }
  })

  it('los KPIs (Deuda Total, Proveedores con Deuda, Mayor Deuda) siguen calculados sobre los 20 proveedores completos, no sobre los 12 visibles en pagina', () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: nProveedores(20), isLoading: false })

    render(<CxpPage />)

    // Deuda total real = suma de 10+20+...+200 = 2100, no la suma de la pagina 1 (200+190+...+90 = 1740)
    expect(screen.getAllByText('$2,100.00').length).toBeGreaterThan(0)
    expect(screen.getByText('20 proveedores pendientes')).toBeInTheDocument()
    // Mayor Deuda: proveedor con mayor saldo (Proveedor 1 = 200), no acotado a la pagina
    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
  })

  it('sin controles de paginacion cuando hay menos proveedores que el tamano de pagina', () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)

    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
    for (let i = 2; i <= 8; i++) {
      expect(screen.getByText(`Proveedor ${i}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('cxp-page-paginacion')).not.toBeInTheDocument()
  })

  it('seleccionar un proveedor de la lista paginada sigue mostrando el panel de detalle', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    expect(screen.getAllByText('No hay facturas de compra pendientes').length).toBeGreaterThan(0)
  })
})

describe('CxpPage - modal de detalle en mobile', () => {
  it('la lista de proveedores esta siempre visible, sin depender de la seleccion', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    expect(screen.getByTestId('cxp-page-panel-izquierdo').classList.contains('hidden')).toBe(false)

    await userEvent.click(screen.getByText('Proveedor 3'))

    expect(screen.getByTestId('cxp-page-panel-izquierdo').classList.contains('hidden')).toBe(false)
  })

  it('el panel derecho (detalle inline de escritorio) es siempre hidden md:block, sin depender de la seleccion', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    const derechoSinSeleccion = screen.getByTestId('cxp-page-panel-derecho')
    expect(derechoSinSeleccion.classList.contains('hidden')).toBe(true)
    expect(derechoSinSeleccion.className).toContain('md:block')

    await userEvent.click(screen.getByText('Proveedor 3'))

    const derechoConSeleccion = screen.getByTestId('cxp-page-panel-derecho')
    expect(derechoConSeleccion.classList.contains('hidden')).toBe(true)
    expect(derechoConSeleccion.className).toContain('md:block')
  })

  it('tocar un proveedor abre el modal con el detalle de ese proveedor', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Proveedor 3'))

    const modal = screen.getByRole('dialog')
    expect(within(modal).getByText('Proveedor 3')).toBeInTheDocument()
  })

  it('cerrar el modal vuelve a ocultarlo y la lista de proveedores sigue visible', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))
    const modal = screen.getByRole('dialog')

    await userEvent.click(within(modal).getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('cxp-page-panel-izquierdo').classList.contains('hidden')).toBe(false)
  })
})

describe('CxpPage - row a card en mobile (facturas y gastos)', () => {
  it('la tabla de facturas desktop queda envuelta en hidden md:block', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    mockedUseFacturasCompraPendientes.mockReturnValue({ facturas: [factura()], isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    const tablas = screen.getAllByRole('table')
    const facturasTabla = tablas.find((t) => within(t).queryByText('Factura'))
    expect(facturasTabla?.parentElement?.className).toContain('hidden')
    expect(facturasTabla?.parentElement?.className).toContain('md:block')
  })

  it('renderiza una DeudaCard por factura en la lista mobile con los mismos datos que la tabla', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    mockedUseFacturasCompraPendientes.mockReturnValue({
      facturas: [factura({ id: 'fc-1', nro_factura: '2001', saldo_pend_usd: '75.00000000' })],
      isLoading: false,
    })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    // La lista mobile se monta dos veces en el DOM (panel derecho desktop +
    // modal mobile, ambos simultaneos en jsdom, CSS decide cual se ve
    // segun breakpoint) — se valida la primera instancia.
    const mobileList = screen.getAllByTestId('cxp-mobile-card-list-facturas')[0]
    expect(mobileList.className).toContain('md:hidden')
    expect(mobileList).toHaveTextContent('2001')
    expect(mobileList).toHaveTextContent('$75.00')
    expect(mobileList).toHaveTextContent('CREDITO')
  })

  it('boton Pagar de la card mobile de factura llama al mismo handler de pago que la tabla', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    mockedUseFacturasCompraPendientes.mockReturnValue({
      facturas: [factura({ id: 'fc-1', nro_factura: '2001' })],
      isLoading: false,
    })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    // Se interactua dentro del dialog (la instancia inline queda aria-hidden
    // mientras el modal esta abierto, por el inert que aplica Radix al resto
    // de la pagina — mismo comportamiento documentado para CxC).
    const dialog = screen.getByRole('dialog')
    const mobileList = within(dialog).getByTestId('cxp-mobile-card-list-facturas')
    await userEvent.click(within(mobileList).getByRole('button', { name: 'Pagar' }))

    expect(screen.getByTestId('pago-cxp-modal-abierto')).toHaveTextContent('2001')
  })

  it('la tabla de gastos desktop queda envuelta en hidden md:block y renderiza cards en mobile', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    mockedUseGastosPendientesProveedor.mockReturnValue({
      gastosPendientes: [gasto({ id: 'g-1', nro_gasto: 'G-001', saldo_pendiente_usd: '40.00000000' })],
      isLoading: false,
    })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    const tablas = screen.getAllByRole('table')
    const gastosTabla = tablas.find((t) => within(t).queryByText('Gasto'))
    expect(gastosTabla?.parentElement?.className).toContain('hidden')
    expect(gastosTabla?.parentElement?.className).toContain('md:block')

    const mobileList = screen.getAllByTestId('cxp-mobile-card-list-gastos')[0]
    expect(mobileList.className).toContain('md:hidden')
    expect(mobileList).toHaveTextContent('G-001')
    expect(mobileList).toHaveTextContent('$40.00')
  })

  it('boton Pagar de la card mobile de gasto llama al mismo handler de pago que la tabla', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    mockedUseGastosPendientesProveedor.mockReturnValue({
      gastosPendientes: [gasto({ id: 'g-1', nro_gasto: 'G-001' })],
      isLoading: false,
    })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    const dialog = screen.getByRole('dialog')
    const mobileList = within(dialog).getByTestId('cxp-mobile-card-list-gastos')
    await userEvent.click(within(mobileList).getByRole('button', { name: 'Pagar' }))

    expect(screen.getByTestId('pago-gasto-cxp-modal-abierto')).toHaveTextContent('G-001')
  })
})
