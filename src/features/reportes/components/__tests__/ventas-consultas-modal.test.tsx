import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VentasConsultasModal } from '../ventas-consultas-modal'
import { useFacturasEmpresa, type FiltroFacturasEmpresaHook } from '@/features/ventas/hooks/use-facturas-empresa'
import { useBuscarClientes, type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useBuscarProductosVenta } from '@/features/ventas/hooks/use-ventas'
import { useVentasPorProducto } from '../../hooks/use-ventas-reportes'
import type { FacturaParaAnular } from '@/features/ventas/hooks/use-notas-credito'

// Slice A (replicar-consulta-factura-ventas-caja): swap del listado bespoke
// (useBuscarFacturas/useFacturasPorCliente/FacturasList/FacturaDetalle) por
// el par compartido useFacturasEmpresa + FacturasEmpresaTable +
// ConsultaFacturaModal, mismo wiring que cliente-detalle.tsx (mismo patron
// de mocks con sentinels). "Por Producto" no cambia — se mockean sus hooks
// solo para poder montar el componente completo (Tabs usa forceMount, las
// 3 pestañas se montan simultaneamente).
vi.mock('@/features/ventas/hooks/use-facturas-empresa', () => ({ useFacturasEmpresa: vi.fn() }))
vi.mock('@/features/ventas/components/facturas-empresa-tab', () => ({
  FacturasEmpresaTable: ({
    facturas,
    mostrarAcciones,
    onRowClick,
  }: {
    facturas: FacturaParaAnular[]
    mostrarAcciones?: boolean
    onRowClick?: (f: FacturaParaAnular) => void
  }) => (
    <div data-testid="facturas-empresa-table" data-mostrar-acciones={String(mostrarAcciones)}>
      {facturas.map((f) => (
        <button key={f.id} onClick={() => onRowClick?.(f)}>
          Fila {f.nro_factura}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/features/ventas/components/consulta-factura-modal', () => ({
  ConsultaFacturaModal: ({
    venta,
    isOpen,
    onClose,
  }: {
    venta: FacturaParaAnular | null
    isOpen: boolean
    onClose: () => void
  }) =>
    isOpen ? (
      <div data-testid="consulta-factura-modal" data-nro-factura={venta?.nro_factura}>
        <button onClick={onClose}>Cerrar consulta</button>
      </div>
    ) : null,
}))
vi.mock('@/features/clientes/hooks/use-clientes', () => ({ useBuscarClientes: vi.fn() }))
vi.mock('@/features/ventas/hooks/use-ventas', () => ({ useBuscarProductosVenta: vi.fn() }))
vi.mock('../../hooks/use-ventas-reportes', () => ({ useVentasPorProducto: vi.fn() }))

const mockedUseFacturasEmpresa = vi.mocked(useFacturasEmpresa)
const mockedUseBuscarClientes = vi.mocked(useBuscarClientes)
const mockedUseBuscarProductosVenta = vi.mocked(useBuscarProductosVenta)
const mockedUseVentasPorProducto = vi.mocked(useVentasPorProducto)

function factura(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'C01-000001',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '36.50',
    total_usd: '100.00',
    total_bs: '3650.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2025-01-10T10:00:00-04:00',
    tiene_reverso_total: 0,
    tiene_reverso_parcial: 0,
    ...overrides,
  }
}

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cli-1',
    identificacion: 'V-12345678',
    nombre: 'Maria Perez',
    direccion: null,
    telefono: null,
    limite_credito_usd: '500.00',
    saldo_actual: '0.00',
    is_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }
}

/** Solo las llamadas de useFacturasEmpresa que traen `busqueda` (pestaña Por Factura). */
function llamadasPorFactura() {
  return mockedUseFacturasEmpresa.mock.calls.filter(([f]) => f?.busqueda !== undefined)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })
  mockedUseBuscarClientes.mockReturnValue({ clientes: [], isLoading: false })
  mockedUseBuscarProductosVenta.mockReturnValue({ productos: [], isLoading: false })
  mockedUseVentasPorProducto.mockReturnValue({ ventas: [], isLoading: false })
})

describe('VentasConsultasModal — Por Factura', () => {
  it('con busqueda vacia, pasa enabled:false a useFacturasEmpresa (preserva "type-to-search")', () => {
    render(<VentasConsultasModal open onOpenChange={vi.fn()} />)

    const llamadas = llamadasPorFactura()
    expect(llamadas.length).toBeGreaterThan(0)
    expect(llamadas[0][0]).toMatchObject({ enabled: false })
  })

  it('al escribir un numero de factura: enabled:true y fechaDesde muy anterior al mes actual (busqueda historica completa, no acotada al mes actual)', async () => {
    const user = userEvent.setup()
    render(<VentasConsultasModal open onOpenChange={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/numero de factura/i), 'C01')

    await waitFor(() => {
      const ultima = llamadasPorFactura().at(-1)
      expect(ultima?.[0]).toMatchObject({ busqueda: 'C01', enabled: true })
    })
    const ultima = llamadasPorFactura().at(-1) as [FiltroFacturasEmpresaHook]
    expect(ultima[0].fechaDesde).toBe('2000-01-01')
  })

  it('usa FacturasEmpresaTable (no el listado bespoke) con mostrarAcciones=false', async () => {
    const user = userEvent.setup()
    const f = factura()
    mockedUseFacturasEmpresa.mockImplementation((filtros?: FiltroFacturasEmpresaHook) =>
      filtros?.busqueda ? { facturas: [f], isLoading: false } : { facturas: [], isLoading: false }
    )

    render(<VentasConsultasModal open onOpenChange={vi.fn()} />)
    await user.type(screen.getByPlaceholderText(/numero de factura/i), 'C01')

    const tabla = await screen.findByTestId('facturas-empresa-table')
    expect(tabla).toHaveAttribute('data-mostrar-acciones', 'false')
    expect(screen.queryByRole('button', { name: /reimprimir pdf/i })).not.toBeInTheDocument()
  })

  it('click en una fila abre ConsultaFacturaModal con esa factura; cerrarlo lo desmonta', async () => {
    const user = userEvent.setup()
    const f = factura({ nro_factura: 'C01-000099' })
    mockedUseFacturasEmpresa.mockImplementation((filtros?: FiltroFacturasEmpresaHook) =>
      filtros?.busqueda ? { facturas: [f], isLoading: false } : { facturas: [], isLoading: false }
    )

    render(<VentasConsultasModal open onOpenChange={vi.fn()} />)
    await user.type(screen.getByPlaceholderText(/numero de factura/i), 'C01')
    await screen.findByText(`Fila ${f.nro_factura}`)
    expect(screen.queryByTestId('consulta-factura-modal')).not.toBeInTheDocument()

    await user.click(screen.getByText(`Fila ${f.nro_factura}`))

    expect(screen.getByTestId('consulta-factura-modal')).toHaveAttribute(
      'data-nro-factura',
      f.nro_factura
    )

    // `fireEvent` (no `user.click`): el Dialog externo real de Radix aplica
    // `pointer-events: none` al `body` mientras esta abierto, y el mock de
    // `ConsultaFacturaModal` vive fuera de su boundary — el chequeo de
    // puntero real de `user-event` lo bloquearia aunque el click es valido
    // (solo estamos probando el wiring de `onClose`, no interaccion de mouse).
    fireEvent.click(screen.getByText('Cerrar consulta'))

    expect(screen.queryByTestId('consulta-factura-modal')).not.toBeInTheDocument()
  })
})

describe('VentasConsultasModal — Por Cliente (smoke test, cobertura completa en Slice B)', () => {
  it('seleccionar un cliente muestra FacturasEmpresaTable y el click de fila abre ConsultaFacturaModal con esa factura', async () => {
    const user = userEvent.setup()
    const c = cliente()
    const f = factura({ cliente_id: c.id })
    mockedUseBuscarClientes.mockReturnValue({ clientes: [c], isLoading: false })
    mockedUseFacturasEmpresa.mockImplementation((filtros?: FiltroFacturasEmpresaHook) =>
      filtros?.clienteId ? { facturas: [f], isLoading: false } : { facturas: [], isLoading: false }
    )

    render(<VentasConsultasModal open onOpenChange={vi.fn()} />)

    await user.click(screen.getByRole('tab', { name: /por cliente/i }))
    await user.type(screen.getByPlaceholderText(/buscar cliente/i), 'Maria')
    await user.click(screen.getByText(c.nombre))

    const tabla = await screen.findByTestId('facturas-empresa-table')
    expect(tabla).toHaveAttribute('data-mostrar-acciones', 'false')

    await user.click(screen.getByText(`Fila ${f.nro_factura}`))

    expect(screen.getByTestId('consulta-factura-modal')).toHaveAttribute(
      'data-nro-factura',
      f.nro_factura
    )
  })
})
