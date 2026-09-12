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

describe('CxcList - paginado client-side (reemplaza top-5)', () => {
  it('muestra los primeros 12 clientes por defecto (pagina 1 de 2, con 20 clientes)', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
    for (let i = 13; i <= 20; i++) {
      expect(screen.queryByText(`Cliente ${i}`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('el boton Siguiente avanza a la pagina 2 y muestra los clientes 13-20', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }))

    for (let i = 13; i <= 20; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
    for (let i = 1; i <= 12; i++) {
      expect(screen.queryByText(`Cliente ${i}`)).not.toBeInTheDocument()
    }
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
  })

  it('el boton Anterior retrocede de la pagina 2 a la pagina 1', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    await userEvent.click(screen.getByRole('button', { name: /anterior/i }))

    expect(screen.getByText('Cliente 1')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('la busqueda filtra el arreglo completo y pagina el resultado filtrado', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })
    const resultados = Array.from({ length: 15 }, (_, i) =>
      cliente({ id: `res-${i + 1}`, identificacion: `V-r${i + 1}`, nombre: `Resultado ${i + 1}`, deuda_usd: 50 })
    )
    mockedUseBuscarClientesDeuda.mockReturnValue({ clientes: resultados, isLoading: false })

    render(<CxcList />)
    await userEvent.type(screen.getByPlaceholderText('Buscar por nombre o cedula...'), 'mar')

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Resultado ${i}`)).toBeInTheDocument()
    }
    for (let i = 13; i <= 15; i++) {
      expect(screen.queryByText(`Resultado ${i}`)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Cliente 1')).not.toBeInTheDocument()
  })

  it('los KPIs siguen calculados sobre los 20 clientes completos, no sobre los 12 visibles en pagina', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: nClientes(20), isLoading: false })

    render(<CxcList />)

    // Deuda total real = suma de 10+20+...+200 = 2100, no la suma de la pagina 1 (200+190+...+90 = 1740)
    expect(screen.getAllByText('$2,100.00').length).toBeGreaterThan(0)
    expect(screen.getByText('20 pendientes')).toBeInTheDocument()
  })

  it('sin controles de paginacion cuando hay menos clientes que el tamano de pagina', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)

    for (let i = 1; i <= 8; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
    expect(screen.queryByTestId('cxc-list-paginacion')).not.toBeInTheDocument()
  })

  it('seleccionar un cliente de la lista paginada sigue mostrando el detalle', async () => {
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
