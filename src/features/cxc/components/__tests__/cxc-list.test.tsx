import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CxcList } from '../cxc-list'
import {
  useClientesConDeuda,
  useBuscarClientesDeuda,
  type ClienteConDeuda,
} from '../../hooks/use-cxc'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

vi.mock('../../hooks/use-cxc', () => ({
  useClientesConDeuda: vi.fn(),
  useBuscarClientesDeuda: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))

// Aislamos el test del detalle real del cliente — irrelevante para el
// recorte top-N del panel izquierdo (Requirement: cxc-lista-deudores-corta).
vi.mock('../cxc-cliente-detalle', () => ({
  CxcClienteDetalle: ({ cliente, onClose }: { cliente: ClienteConDeuda; onClose: () => void }) => (
    <div data-testid="cxc-cliente-detalle">
      Detalle: {cliente.nombre}
      <button type="button" onClick={onClose}>
        cerrar-mock
      </button>
    </div>
  ),
}))
vi.mock('../cxc-reportes-general', () => ({ CxcReportesGeneral: () => null }))

const mockedUseClientesConDeuda = vi.mocked(useClientesConDeuda)
const mockedUseBuscarClientesDeuda = vi.mocked(useBuscarClientesDeuda)
const mockedUseTasaActual = vi.mocked(useTasaActual)

function cliente(overrides: Partial<ClienteConDeuda> = {}): ClienteConDeuda {
  return {
    id: 'cli-1',
    identificacion: 'V-1',
    nombre: 'Cliente 1',
    telefono: null,
    saldo_actual: '0',
    limite_credito_usd: '0',
    facturas_pendientes: 1,
    deuda_usd: 100,
    credito_disponible_usd: 0,
    ...overrides,
  }
}

/** 8 clientes ordenados DESC por deuda_usd, tal como los devuelve la query real. */
function ochoClientes(): ClienteConDeuda[] {
  return Array.from({ length: 8 }, (_, i) =>
    cliente({
      id: `cli-${i + 1}`,
      identificacion: `V-${i + 1}`,
      nombre: `Cliente ${i + 1}`,
      deuda_usd: 800 - i * 100,
      facturas_pendientes: 1,
    })
  )
}

/** N clientes ordenados DESC por deuda_usd, para probar paginado (pageSize=12). */
function nClientes(n: number): ClienteConDeuda[] {
  return Array.from({ length: n }, (_, i) =>
    cliente({
      id: `cli-${i + 1}`,
      identificacion: `V-${i + 1}`,
      nombre: `Cliente ${i + 1}`,
      deuda_usd: (n - i) * 10,
      facturas_pendientes: 1,
    })
  )
}

beforeEach(() => {
  mockedUseTasaActual.mockReturnValue({ tasaValor: 100, isLoading: false } as ReturnType<typeof useTasaActual>)
  mockedUseBuscarClientesDeuda.mockReturnValue({ clientes: [], isLoading: false })
})

describe('CxcList - lista completa con scroll interno (reemplaza paginado)', () => {
  it('renderiza todos los clientes filtrados sin recortar (20 clientes)', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    for (let i = 1; i <= 20; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
  })

  it('no muestra controles de paginacion (Anterior/Siguiente) sin importar la cantidad de clientes', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    expect(screen.queryByRole('button', { name: /anterior/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('cxc-list-paginacion')).not.toBeInTheDocument()
    expect(screen.queryByText(/página \d+ de \d+/i)).not.toBeInTheDocument()
  })

  it('el panel izquierdo tiene un contenedor con scroll interno para la lista de clientes', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    expect(screen.getByTestId('cxc-list-scroll-izquierdo').className).toContain('overflow-y-auto')
  })

  it('la busqueda filtra el arreglo completo y muestra TODOS los resultados filtrados', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })
    const resultados = Array.from({ length: 15 }, (_, i) =>
      cliente({ id: `res-${i + 1}`, identificacion: `V-r${i + 1}`, nombre: `Resultado ${i + 1}`, deuda_usd: 50 })
    )
    mockedUseBuscarClientesDeuda.mockReturnValue({ clientes: resultados, isLoading: false })

    render(<CxcList />)
    await userEvent.type(screen.getByPlaceholderText('Buscar por nombre o cedula...'), 'mar')

    for (let i = 1; i <= 15; i++) {
      expect(screen.getByText(`Resultado ${i}`)).toBeInTheDocument()
    }
    expect(screen.queryByText('Cliente 1')).not.toBeInTheDocument()
  })

  it('los KPIs siguen calculados sobre los 20 clientes completos', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    // Deuda total real = suma de 10+20+...+200 = 2100
    expect(screen.getAllByText('$2,100.00').length).toBeGreaterThan(0)
    expect(screen.getByText('20 pendientes')).toBeInTheDocument()
  })

  it('seleccionar un cliente de la lista completa sigue mostrando el detalle', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByText('Cliente 3'))

    expect(screen.getAllByText('Detalle: Cliente 3').length).toBeGreaterThan(0)
  })
})

describe('CxcList - modal de detalle en mobile (reemplaza master-detail)', () => {
  it('la lista de clientes esta siempre visible, sin depender de la seleccion', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    expect(screen.getByTestId('cxc-list-panel-izquierdo').classList.contains('hidden')).toBe(false)

    await userEvent.click(screen.getByText('Cliente 3'))

    expect(screen.getByTestId('cxc-list-panel-izquierdo').classList.contains('hidden')).toBe(false)
  })

  it('el panel derecho (detalle inline de escritorio) es siempre hidden md:block, sin depender de la seleccion', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    const derechoSinSeleccion = screen.getByTestId('cxc-list-panel-derecho')
    expect(derechoSinSeleccion.classList.contains('hidden')).toBe(true)
    expect(derechoSinSeleccion.className).toContain('md:block')

    await userEvent.click(screen.getByText('Cliente 3'))

    const derechoConSeleccion = screen.getByTestId('cxc-list-panel-derecho')
    expect(derechoConSeleccion.classList.contains('hidden')).toBe(true)
    expect(derechoConSeleccion.className).toContain('md:block')
  })

  it('tocar un deudor abre el modal con el detalle de ese cliente', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Cliente 3'))

    const modal = screen.getByRole('dialog')
    expect(modal).toHaveTextContent('Detalle: Cliente 3')
  })

  it('cerrar el modal vuelve a ocultarlo y la lista de clientes sigue visible', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByText('Cliente 3'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const cerrarBtn = within(screen.getByRole('dialog')).getByText('cerrar-mock')
    await userEvent.click(cerrarBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('cxc-list-panel-izquierdo').classList.contains('hidden')).toBe(false)
  })
})
