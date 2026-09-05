// Slice C3b (notas-credito-ruta-administrativa): FacturasEmpresaTab pasa de
// placeholder visual (C3a) a listado real empresa-wide sobre
// `useFacturasEmpresa(filtros)` + filtros (fecha, nro_factura, cliente, RIF)
// + accion "Aplicar nota de credito" por fila (callback prop, Slice D wire
// el modal real). Mockeamos el hook — mismo patron que
// `nota-credito-pos-modal.test.tsx` (`useFacturasSesionActiva`).
vi.mock('../../hooks/use-facturas-empresa', () => ({ useFacturasEmpresa: vi.fn() }))

// Slice D: el contenedor monta `CrearNcrModal` real al confirmar la accion
// por fila. Se mockea aqui (aislado, unit-test de wiring) porque el modal
// real usa hooks de PowerSync/CXC que no estan disponibles en este entorno
// de test — su propio contrato ya esta cubierto por `crear-ncr-modal.test.tsx`.
vi.mock('../crear-ncr-modal', () => ({
  CrearNcrModal: ({
    isOpen,
    factura,
    onClose,
  }: {
    isOpen: boolean
    factura: FacturaParaAnular | null
    onClose: () => void
  }) =>
    isOpen ? (
      <div data-testid="mock-crear-ncr-modal">
        <span>{factura?.nro_factura}</span>
        <button onClick={onClose}>Cerrar modal</button>
      </div>
    ) : null,
}))

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFacturasEmpresa } from '../../hooks/use-facturas-empresa'
import { FacturasEmpresaTab } from '../facturas-empresa-tab'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'

const mockedUseFacturasEmpresa = vi.mocked(useFacturasEmpresa)

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
    fecha: '2026-05-10T10:00:00-04:00',
    tiene_reverso_total: 0,
    tiene_reverso_parcial: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseFacturasEmpresa.mockReturnValue({ facturas: [], isLoading: false })
})

describe('FacturasEmpresaTab (Slice C3b) — listado empresa-wide con filtros', () => {
  it('renderiza las facturas devueltas por useFacturasEmpresa (nro, cliente, totales USD/Bs)', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [factura()], isLoading: false })

    render(<FacturasEmpresaTab />)

    expect(screen.getByText('#C01-000001')).toBeInTheDocument()
    expect(screen.getByText('Maria Perez')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('Bs. 3.650,00')).toBeInTheDocument()
  })

  it('carga inicial: aplica rangoMesActual() por defecto (mes actual) al hook', () => {
    vi.setSystemTime(new Date('2026-05-21T12:00:00'))

    render(<FacturasEmpresaTab />)

    expect(mockedUseFacturasEmpresa).toHaveBeenCalledWith(
      expect.objectContaining({ fechaDesde: '2026-05-01', fechaHasta: '2026-05-21' })
    )
    vi.useRealTimers()
  })

  it('filtrar por numero de factura actualiza el argumento pasado al hook', async () => {
    const user = userEvent.setup()
    render(<FacturasEmpresaTab />)

    await user.type(screen.getByLabelText(/nro factura/i), 'C01-0042')

    await waitFor(() => {
      expect(mockedUseFacturasEmpresa).toHaveBeenLastCalledWith(
        expect.objectContaining({ nroFactura: 'C01-0042' })
      )
    })
  })

  it('filtrar por cliente y RIF actualiza el argumento pasado al hook (combinables)', async () => {
    const user = userEvent.setup()
    render(<FacturasEmpresaTab />)

    await user.type(screen.getByLabelText(/^cliente$/i), 'Maria')
    await user.type(screen.getByLabelText(/^rif$/i), 'V-123')

    await waitFor(() => {
      expect(mockedUseFacturasEmpresa).toHaveBeenLastCalledWith(
        expect.objectContaining({ clienteNombre: 'Maria', clienteIdentificacion: 'V-123' })
      )
    })
  })

  it('estado vacio: sin facturas, sin error, muestra mensaje explicito', () => {
    render(<FacturasEmpresaTab />)
    expect(screen.getByText(/no hay facturas/i)).toBeInTheDocument()
  })

  it('estado de carga: NO renderiza filas mientras isLoading', () => {
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [factura()], isLoading: true })
    render(<FacturasEmpresaTab />)
    expect(screen.queryByText('#C01-000001')).not.toBeInTheDocument()
  })

  it('boton "Aplicar nota de credito" invoca onAplicarNc con la factura de la fila', async () => {
    const user = userEvent.setup()
    const f = factura()
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [f], isLoading: false })
    const onAplicarNc = vi.fn()

    render(<FacturasEmpresaTab onAplicarNc={onAplicarNc} />)
    await user.click(screen.getByRole('button', { name: /aplicar nota de credito/i }))

    expect(onAplicarNc).toHaveBeenCalledWith(f)
  })

  it('boton "Aplicar nota de credito" NO revienta si no se pasa onAplicarNc (stub inofensivo)', async () => {
    const user = userEvent.setup()
    mockedUseFacturasEmpresa.mockReturnValue({ facturas: [factura()], isLoading: false })

    render(<FacturasEmpresaTab />)
    await user.click(screen.getByRole('button', { name: /aplicar nota de credito/i }))

    expect(screen.getByRole('button', { name: /aplicar nota de credito/i })).toBeInTheDocument()
  })

  it('boton "Aplicar nota de credito" deshabilitado cuando la factura ya tiene reverso total', () => {
    mockedUseFacturasEmpresa.mockReturnValue({
      facturas: [factura({ tiene_reverso_total: 1 })],
      isLoading: false,
    })
    render(<FacturasEmpresaTab />)
    expect(screen.getByRole('button', { name: /aplicar nota de credito/i })).toBeDisabled()
  })

  describe('Slice D — wiring del modal admin real', () => {
    it('click en "Aplicar nota de credito" abre CrearNcrModal con la factura de la fila', async () => {
      const user = userEvent.setup()
      const f = factura()
      mockedUseFacturasEmpresa.mockReturnValue({ facturas: [f], isLoading: false })

      render(<FacturasEmpresaTab />)
      expect(screen.queryByTestId('mock-crear-ncr-modal')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /aplicar nota de credito/i }))

      expect(screen.getByTestId('mock-crear-ncr-modal')).toBeInTheDocument()
      expect(screen.getByText('C01-000001')).toBeInTheDocument()
    })

    it('cerrar el modal (onClose) lo desmonta', async () => {
      const user = userEvent.setup()
      mockedUseFacturasEmpresa.mockReturnValue({ facturas: [factura()], isLoading: false })

      render(<FacturasEmpresaTab />)
      await user.click(screen.getByRole('button', { name: /aplicar nota de credito/i }))
      expect(screen.getByTestId('mock-crear-ncr-modal')).toBeInTheDocument()

      await user.click(screen.getByText('Cerrar modal'))

      expect(screen.queryByTestId('mock-crear-ncr-modal')).not.toBeInTheDocument()
    })

    it('sigue invocando el `onAplicarNc` externo (opcional) ademas de abrir el modal interno', async () => {
      const user = userEvent.setup()
      const f = factura()
      mockedUseFacturasEmpresa.mockReturnValue({ facturas: [f], isLoading: false })
      const onAplicarNc = vi.fn()

      render(<FacturasEmpresaTab onAplicarNc={onAplicarNc} />)
      await user.click(screen.getByRole('button', { name: /aplicar nota de credito/i }))

      expect(onAplicarNc).toHaveBeenCalledWith(f)
      expect(screen.getByTestId('mock-crear-ncr-modal')).toBeInTheDocument()
    })
  })
})
