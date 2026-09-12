import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CxpPage } from '../cxp-page'
import {
  useProveedoresConDeuda,
  useBuscarProveedoresDeuda,
  useFacturasCompraPendientes,
  type ProveedorConDeuda,
} from '../../hooks/use-cxp'
import { useGastosPendientesProveedor } from '@/features/contabilidad/hooks/use-gastos'

vi.mock('../../hooks/use-cxp', () => ({
  useProveedoresConDeuda: vi.fn(),
  useBuscarProveedoresDeuda: vi.fn(),
  useFacturasCompraPendientes: vi.fn(),
}))
vi.mock('@/features/contabilidad/hooks/use-gastos', () => ({
  useGastosPendientesProveedor: vi.fn(),
}))

// Aislamos el test del recorte top-N del panel izquierdo del contenido real
// de los modales/detalle de facturas — irrelevante para esta cobertura
// (Requirement: cxp-lista-deudores-corta), mismo enfoque que cxc-list.test.tsx.
vi.mock('../pago-cxp-modal', () => ({ PagoCxPModal: () => null }))
vi.mock('../pago-gasto-cxp-modal', () => ({ PagoGastoCxpModal: () => null }))
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

beforeEach(() => {
  mockedUseBuscarProveedoresDeuda.mockReturnValue({ proveedores: [], isLoading: false })
  mockedUseFacturasCompraPendientes.mockReturnValue({ facturas: [], isLoading: false })
  mockedUseGastosPendientesProveedor.mockReturnValue({ gastosPendientes: [], isLoading: false })
})

describe('CxpPage - lista corta de deudores (top-5 client-side) + busqueda', () => {
  it('con busqueda vacia muestra solo los primeros 5 proveedores (de 8)', () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)

    // Proveedor 1 (mayor deuda) tambien aparece en el sub-label de la KPI
    // "Mayor Deuda" — usar getAllByText para esa fila puntual.
    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
    for (let i = 2; i <= 5; i++) {
      expect(screen.getByText(`Proveedor ${i}`)).toBeInTheDocument()
    }
    for (let i = 6; i <= 8; i++) {
      expect(screen.queryByText(`Proveedor ${i}`)).not.toBeInTheDocument()
    }
  })

  it('con busqueda de 2+ caracteres muestra los resultados de useBuscarProveedoresDeuda sin recorte a 5', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })
    const resultados = Array.from({ length: 12 }, (_, i) =>
      proveedor({ id: `res-${i + 1}`, rif: `J-r${i + 1}`, razon_social: `Resultado ${i + 1}`, saldo_actual: '50' })
    )
    mockedUseBuscarProveedoresDeuda.mockReturnValue({ proveedores: resultados, isLoading: false })

    render(<CxpPage />)
    await userEvent.type(screen.getByPlaceholderText('Buscar por nombre o rif/cedula...'), 'mar')

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Resultado ${i}`)).toBeInTheDocument()
    }
  })

  it('los KPIs (Deuda Total, Proveedores con Deuda, Mayor Deuda) y el pie siguen calculados sobre los 8 proveedores completos, no sobre los 5 visibles', () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)

    // Deuda total real = suma de los 8 (800+700+...+100) = 3600, no la suma de los 5 visibles (800+700+600+500+400=3000)
    expect(screen.getAllByText('$3,600.00').length).toBeGreaterThan(0)
    // Proveedores con Deuda debe reflejar los 8, no los 5 visibles
    expect(screen.getByText('8 proveedores pendientes')).toBeInTheDocument()
    // Mayor Deuda debe ser el proveedor #1 ($800), que sigue siendo el top real
    // aunque no cambie el recorte (aparece tanto en la KPI como en la lista).
    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
  })

  it('seleccionar un proveedor de la lista corta (posicion 3 de 5) sigue mostrando el panel de detalle', async () => {
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: ochoProveedores(), isLoading: false })

    render(<CxpPage />)
    await userEvent.click(screen.getByText('Proveedor 3'))

    expect(screen.getByText('No hay facturas de compra pendientes')).toBeInTheDocument()
  })

  it('con menos de 5 deudores no hay cambio visual (muestra los 3 completos)', () => {
    const tres = Array.from({ length: 3 }, (_, i) =>
      proveedor({ id: `prov-${i + 1}`, rif: `J-${i + 1}`, razon_social: `Proveedor ${i + 1}`, saldo_actual: String(300 - i * 100) })
    )
    mockedUseProveedoresConDeuda.mockReturnValue({ proveedores: tres, isLoading: false })

    render(<CxpPage />)

    // Proveedor 1 (mayor deuda) tambien aparece en el sub-label de la KPI
    // "Mayor Deuda" — usar getAllByText para esa fila puntual.
    expect(screen.getAllByText('Proveedor 1').length).toBeGreaterThan(0)
    for (let i = 2; i <= 3; i++) {
      expect(screen.getByText(`Proveedor ${i}`)).toBeInTheDocument()
    }
  })
})
