import { render, screen } from '@testing-library/react'
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

beforeEach(() => {
  mockedUseTasaActual.mockReturnValue({ tasaValor: 100, isLoading: false } as ReturnType<typeof useTasaActual>)
  mockedUseBuscarClientesDeuda.mockReturnValue({ clientes: [], isLoading: false })
})

describe('CxcList - lista corta de deudores (top-5 client-side)', () => {
  it('con busqueda vacia muestra solo los primeros 5 clientes (de 8)', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
    for (let i = 6; i <= 8; i++) {
      expect(screen.queryByText(`Cliente ${i}`)).not.toBeInTheDocument()
    }
  })

  it('con busqueda de 2+ caracteres muestra todos los resultados sin recorte a 5', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })
    const resultados = Array.from({ length: 12 }, (_, i) =>
      cliente({ id: `res-${i + 1}`, identificacion: `V-r${i + 1}`, nombre: `Resultado ${i + 1}`, deuda_usd: 50 })
    )
    mockedUseBuscarClientesDeuda.mockReturnValue({ clientes: resultados, isLoading: false })

    render(<CxcList />)
    await userEvent.type(screen.getByPlaceholderText('Buscar por nombre o cedula...'), 'mar')

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Resultado ${i}`)).toBeInTheDocument()
    }
  })

  it('los KPIs y el pie siguen calculados sobre los 8 clientes completos, no sobre los 5 visibles', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)

    // Deuda total real = suma de los 8 (800+700+...+100) = 3600, no la suma de los 5 visibles (800+700+600+500+400=3000)
    expect(screen.getAllByText('$3,600.00').length).toBeGreaterThan(0)
    // Clientes con Deuda debe reflejar los 8, no los 5 visibles
    expect(screen.getByText('8 pendientes')).toBeInTheDocument()
  })

  it('seleccionar un cliente de la lista corta (posicion 3 de 5) sigue mostrando el detalle', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByText('Cliente 3'))

    expect(screen.getByTestId('cxc-cliente-detalle')).toHaveTextContent('Detalle: Cliente 3')
  })

  it('con menos de 5 deudores no hay cambio visual (muestra los 3 completos)', () => {
    const tres = Array.from({ length: 3 }, (_, i) =>
      cliente({ id: `cli-${i + 1}`, identificacion: `V-${i + 1}`, nombre: `Cliente ${i + 1}`, deuda_usd: 300 - i * 100 })
    )
    mockedUseClientesConDeuda.mockReturnValue({ clientes: tres, isLoading: false })

    render(<CxcList />)

    for (let i = 1; i <= 3; i++) {
      expect(screen.getByText(`Cliente ${i}`)).toBeInTheDocument()
    }
  })
})

describe('CxcList - master-detail mobile (S2)', () => {
  it('sin cliente seleccionado: panel izquierdo visible y panel derecho oculto en mobile', () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)

    const izquierdo = screen.getByTestId('cxc-list-panel-izquierdo')
    const derecho = screen.getByTestId('cxc-list-panel-derecho')
    expect(izquierdo.classList.contains('hidden')).toBe(false)
    expect(izquierdo.className).toContain('md:block')
    expect(derecho.classList.contains('hidden')).toBe(true)
    expect(derecho.className).toContain('md:block')
  })

  it('con cliente seleccionado: panel izquierdo oculto y panel derecho visible en mobile', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByText('Cliente 3'))

    const izquierdo = screen.getByTestId('cxc-list-panel-izquierdo')
    const derecho = screen.getByTestId('cxc-list-panel-derecho')
    expect(izquierdo.classList.contains('hidden')).toBe(true)
    expect(izquierdo.className).toContain('md:block')
    expect(derecho.classList.contains('hidden')).toBe(false)
    expect(derecho.className).toContain('md:block')
  })

  it('el cierre del detalle (onClose) vuelve a mostrar el panel izquierdo en mobile', async () => {
    mockedUseClientesConDeuda.mockReturnValue({ clientes: ochoClientes(), isLoading: false })

    render(<CxcList />)
    await userEvent.click(screen.getByText('Cliente 3'))
    expect(screen.getByTestId('cxc-list-panel-izquierdo').classList.contains('hidden')).toBe(true)

    await userEvent.click(screen.getByText('cerrar-mock'))

    expect(screen.getByTestId('cxc-list-panel-izquierdo').classList.contains('hidden')).toBe(false)
    expect(screen.getByTestId('cxc-list-panel-derecho').classList.contains('hidden')).toBe(true)
  })
})
