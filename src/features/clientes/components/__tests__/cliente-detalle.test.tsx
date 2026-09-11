import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClienteDetalle } from '../cliente-detalle'
import { type Cliente } from '@/features/clientes/hooks/use-clientes'
import { useFacturasEmpresa } from '@/features/ventas/hooks/use-facturas-empresa'

// `ClienteDetalle` ahora solo muestra el header del cliente, el filtro de
// fechas (conectado a las facturas) y la seccion Facturas. El estado de cuenta,
// el saldo y el reverso de abono se retiraron de esta pantalla (el reverso se
// maneja desde CxC — factura-detalle-cxc.tsx). Se mockea la unica dependencia
// de datos: useFacturasEmpresa. FacturasEmpresaTable se mockea con un sentinel.
vi.mock('@/features/ventas/hooks/use-facturas-empresa', () => ({ useFacturasEmpresa: vi.fn() }))
// PR3a (reimpresion-factura-fiscal): el mock expone `onRowClick` con un
// boton sentinel que simula el click de fila de `DataTable`, para probar
// el wiring de `facturaSeleccionada` en `ClienteDetalle` sin depender del
// `DataTable` real (ya cubierto por `facturas-empresa-tab.test.tsx`).
vi.mock('@/features/ventas/components/facturas-empresa-tab', () => ({
  FacturasEmpresaTable: ({
    mostrarAcciones,
    onRowClick,
  }: {
    mostrarAcciones?: boolean
    onRowClick?: (f: { id: string; nro_factura: string }) => void
  }) => (
    <div data-testid="facturas-table" data-mostrar-acciones={String(mostrarAcciones)}>
      <button onClick={() => onRowClick?.({ id: 'venta-1', nro_factura: 'C01-000001' } as never)}>
        Simular click de fila
      </button>
    </div>
  ),
}))

const mockedUseFacturasEmpresa = vi.mocked(useFacturasEmpresa)

const CLIENTE: Cliente = {
  id: 'cli-1',
  identificacion: 'V-12345678',
  nombre: 'MARIA PEREZ',
  direccion: null,
  telefono: null,
  limite_credito_usd: '500.00',
  saldo_actual: '120.50',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const FACTURA = {
  id: 'venta-1',
  nro_factura: 'C01-000001',
  cliente_id: 'cli-1',
  cliente_nombre: 'MARIA PEREZ',
  cliente_identificacion: 'V-12345678',
  tasa: '36.50',
  total_usd: '100.00',
  total_bs: '3650.00',
  saldo_pend_usd: '0.00',
  tipo: 'CONTADO',
  fecha: '2026-05-10T10:00:00-04:00',
  tiene_reverso_total: 0,
  tiene_reverso_parcial: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-05-21T12:00:00-04:00'))
  mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ClienteDetalle — header y navegacion', () => {
  it('muestra identificacion, nombre y badge Activo del cliente', () => {
    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText('V-12345678')).toBeInTheDocument()
    expect(screen.getByText('MARIA PEREZ')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('el boton "Volver" invoca onVolver', () => {
    const onVolver = vi.fn()
    render(<ClienteDetalle cliente={CLIENTE} onVolver={onVolver} />)

    fireEvent.click(screen.getByRole('button', { name: /volver/i }))

    expect(onVolver).toHaveBeenCalledTimes(1)
  })

  it('NO muestra la card de Saldo Actual ni la seccion Estado de Cuenta (retiradas)', () => {
    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByText('Saldo Actual')).not.toBeInTheDocument()
    expect(screen.queryByText('Estado de Cuenta')).not.toBeInTheDocument()
    expect(screen.queryByText(/generar reporte/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/limite/i)).not.toBeInTheDocument()
  })
})

describe('ClienteDetalle — filtro de fechas conectado a facturas', () => {
  it('al montar, pasa el rango del mes actual + clienteId a useFacturasEmpresa', () => {
    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(mockedUseFacturasEmpresa).toHaveBeenCalledWith({
      clienteId: 'cli-1',
      fechaDesde: '2026-05-01',
      fechaHasta: '2026-05-21',
    })
  })

  it('cambiar la fecha "Desde" re-consulta las facturas con el nuevo rango', () => {
    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    const inputDesde = screen.getByLabelText('Desde')
    fireEvent.change(inputDesde, { target: { value: '2026-01-01' } })

    expect(mockedUseFacturasEmpresa).toHaveBeenLastCalledWith({
      clienteId: 'cli-1',
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-05-21',
    })
  })
})

describe('ClienteDetalle — seccion Facturas', () => {
  it('con facturas, renderiza la tabla con mostrarAcciones=false', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [FACTURA], isLoading: false } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/facturas/i)).toBeInTheDocument()
    const tabla = screen.getByTestId('facturas-table')
    expect(tabla).toBeInTheDocument()
    expect(tabla).toHaveAttribute('data-mostrar-acciones', 'false')
  })

  it('sin facturas, muestra estado vacio ("Sin facturas")', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.getByText(/sin facturas/i)).toBeInTheDocument()
    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
  })

  it('mientras isLoading, muestra estado de carga en vez de la tabla', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: true })

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByTestId('facturas-table')).not.toBeInTheDocument()
    expect(screen.queryByText(/sin facturas/i)).not.toBeInTheDocument()
  })

  it('la seccion nunca expone la accion "Aplicar nota de credito" (mostrarAcciones=false)', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [FACTURA], isLoading: false } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /aplicar nota de credito/i })).not.toBeInTheDocument()
  })

  it('PR3a: click de fila (onRowClick) actualiza facturaSeleccionada — observable via placeholder', async () => {
    const user = userEvent.setup()
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [FACTURA], isLoading: false } as never)

    render(<ClienteDetalle cliente={CLIENTE} onVolver={vi.fn()} />)
    expect(screen.queryByTestId('factura-seleccionada-placeholder')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /simular click de fila/i }))

    expect(screen.getByTestId('factura-seleccionada-placeholder')).toHaveAttribute(
      'data-nro-factura',
      'C01-000001'
    )
  })
})
