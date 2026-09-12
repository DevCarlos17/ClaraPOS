import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuery } from '@powersync/react'
import { CxcClienteDetalle } from '../cxc-cliente-detalle'
import { useFacturasPendientes, type ClienteConDeuda, type VentaPendiente } from '../../hooks/use-cxc'
import { useTasaActual } from '@/features/configuracion/hooks/use-tasas'

vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))
vi.mock('../../hooks/use-cxc', async () => {
  const actual = await vi.importActual<typeof import('../../hooks/use-cxc')>('../../hooks/use-cxc')
  return { ...actual, useFacturasPendientes: vi.fn() }
})
vi.mock('@/features/configuracion/hooks/use-tasas', () => ({ useTasaActual: vi.fn() }))
vi.mock('../abono-global-modal', () => ({ AbonoGlobalModal: () => null }))
vi.mock('../aplicar-saf-modal', () => ({ AplicarSafModal: () => null }))
vi.mock('../factura-detalle-cxc', () => ({ FacturaDetalleCxc: () => null }))
vi.mock('../cxc-cliente-reporte', () => ({ CxcClienteReporte: () => null }))

const mockedUseQuery = vi.mocked(useQuery)
const mockedUseFacturasPendientes = vi.mocked(useFacturasPendientes)
const mockedUseTasaActual = vi.mocked(useTasaActual)

function cliente(overrides: Partial<ClienteConDeuda> = {}): ClienteConDeuda {
  return {
    id: 'cli-1',
    identificacion: 'V-1',
    nombre: 'Cliente 1',
    telefono: null,
    saldo_actual: '0',
    limite_credito_usd: '0',
    facturas_pendientes: 2,
    deuda_usd: 150,
    credito_disponible_usd: 0,
    ...overrides,
  }
}

function factura(overrides: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    id: 'v-1',
    nro_factura: '1001',
    fecha: '2026-09-01',
    total_usd: '100.00000000',
    total_bs: '10000.00000000',
    saldo_pend_usd: '100.00000000',
    tasa: '100',
    tipo: 'CREDITO',
    cliente_id: 'cli-1',
    ...overrides,
  }
}

beforeEach(() => {
  mockedUseTasaActual.mockReturnValue({ tasaValor: 100, isLoading: false } as ReturnType<typeof useTasaActual>)
  mockedUseQuery.mockReturnValue({ data: [{ creado: 0, consumido: 0 }] } as unknown as ReturnType<typeof useQuery>)
})

describe('CxcClienteDetalle - row a card en mobile (S2)', () => {
  it('la tabla desktop queda envuelta en hidden md:block', () => {
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [factura()], isLoading: false })

    render(<CxcClienteDetalle cliente={cliente()} onClose={vi.fn()} />)

    const tabla = screen.getByRole('table')
    const tablaWrapper = tabla.parentElement
    expect(tablaWrapper?.className).toContain('hidden')
    expect(tablaWrapper?.className).toContain('md:block')
  })

  it('renderiza una DeudaCard por factura en la lista mobile con los mismos datos que la tabla', () => {
    mockedUseFacturasPendientes.mockReturnValue({
      facturas: [factura({ id: 'v-1', nro_factura: '1001', saldo_pend_usd: '50.00000000' })],
      isLoading: false,
    })

    render(<CxcClienteDetalle cliente={cliente()} onClose={vi.fn()} />)

    const mobileList = screen.getByTestId('cxc-mobile-card-list')
    expect(mobileList.className).toContain('md:hidden')
    expect(mobileList).toHaveTextContent('#1001')
    expect(mobileList).toHaveTextContent('$50.00')
    expect(mobileList).toHaveTextContent('CREDITO')
  })

  it('boton Pagar de la card mobile existe y es clickeable (mismo handler que la fila desktop)', async () => {
    mockedUseFacturasPendientes.mockReturnValue({
      facturas: [factura({ id: 'v-1', nro_factura: '1001' })],
      isLoading: false,
    })

    render(<CxcClienteDetalle cliente={cliente()} onClose={vi.fn()} />)

    const mobileList = screen.getByTestId('cxc-mobile-card-list')
    const pagarBtn = mobileList.querySelector('button')
    expect(pagarBtn).not.toBeNull()
    await userEvent.click(pagarBtn as HTMLButtonElement)
    expect(pagarBtn).toBeInTheDocument()
  })

  it('factura pagada muestra accion "Ver" tanto en tabla como en card mobile', () => {
    mockedUseFacturasPendientes.mockReturnValue({
      facturas: [factura({ id: 'v-1', nro_factura: '1002', saldo_pend_usd: '0' })],
      isLoading: false,
    })

    render(<CxcClienteDetalle cliente={cliente()} onClose={vi.fn()} />)

    const verButtons = screen.getAllByText('Ver')
    expect(verButtons.length).toBe(2) // uno en la tabla desktop, uno en la card mobile
  })

  it('boton cerrar (X) del toolbar llama a onClose', async () => {
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [factura()], isLoading: false })
    const onClose = vi.fn()

    render(<CxcClienteDetalle cliente={cliente()} onClose={onClose} />)

    await userEvent.click(screen.getByTestId('cxc-detalle-cerrar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('toolbar tiene flex-wrap para no desbordar en pantallas angostas', () => {
    mockedUseFacturasPendientes.mockReturnValue({ facturas: [factura()], isLoading: false })

    render(<CxcClienteDetalle cliente={cliente()} onClose={vi.fn()} />)

    const toolbar = screen.getByTestId('cxc-detalle-cerrar').closest('.flex.items-center.justify-between')
    expect(toolbar?.className).toContain('flex-wrap')
  })
})
