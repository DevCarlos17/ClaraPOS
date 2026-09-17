import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CrearNcrModal } from '../crear-ncr-modal'
import { crearNotaCredito, useReversosFactura, type FacturaParaAnular } from '../../hooks/use-notas-credito'
import { useDetalleFactura, usePagosFactura } from '@/features/cxc/hooks/use-cxc'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useDepositosVentaActivos, type Deposito } from '@/features/inventario/hooks/use-depositos'
import { toast } from 'sonner'

/**
 * Slice D (notas-credito-ruta-administrativa, Design §Decision 2/5/6):
 * reescritura completa de `CrearNcrModal` como wrapper delgado de la ruta
 * administrativa "Facturas emitidas" — reusa la MISMA capa pura de
 * `notas-credito-ui-pos` (FacturaDetallePanel, SeleccionLineasNc,
 * puedeEmitirNcAdicional/puedeElegirTipoTotal) que `nota-credito-pos-modal.tsx`
 * ya usa, SIN tocar ese archivo (FROZEN) ni generalizarlo con un flag
 * POS/ADMIN. Mockeamos `SupervisorPinDialog` para detectar sin ambiguedad si
 * el componente todavia intenta abrir un dialogo de PIN — no debe existir
 * ninguna referencia a el en este modal (a diferencia de POS).
 */
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({ isOpen, titulo }: { isOpen: boolean; titulo?: string }) =>
    isOpen ? <div data-testid="mock-pin-dialog">{titulo ?? 'PIN de supervisor'}</div> : null,
}))
// Slice 6 (nc-refund-tesoreria, wiring): mockeamos el mini-formulario aislado
// (ya probado end-to-end en refund-tesoreria-form.test.tsx) para verificar
// SOLO el wiring del modal — mismo criterio que el mock de SupervisorPinDialog.
vi.mock('../refund-tesoreria-form', () => ({
  RefundTesoreriaForm: ({
    onConfirm,
  }: {
    onConfirm: (lineas: { destino: string; cuentaId: string; montoEnMonedaCuenta: string }[]) => void
  }) => (
    <div data-testid="mock-refund-tesoreria-form">
      <button
        type="button"
        onClick={() => onConfirm([{ destino: 'BANCO', cuentaId: 'banco-1', montoEnMonedaCuenta: '30.00' }])}
      >
        Confirmar reembolso (mock)
      </button>
    </div>
  ),
}))

vi.mock('@/features/ventas/hooks/use-notas-credito', () => ({
  crearNotaCredito: vi.fn(),
  useReversosFactura: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useDetalleFactura: vi.fn(),
  usePagosFactura: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-company', () => ({ useCompany: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/features/inventario/hooks/use-depositos', () => ({ useDepositosVentaActivos: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedCrearNotaCredito = vi.mocked(crearNotaCredito)
const mockedUseReversosFactura = vi.mocked(useReversosFactura)
const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseCompany = vi.mocked(useCompany)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedToastSuccess = vi.mocked(toast.success)

function baseFactura(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'FAC-000123',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '36.50',
    total_usd: '10.00',
    total_bs: '365.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function baseDepositos(): Deposito[] {
  return [
    {
      id: 'dep-1', empresa_id: 'emp-1', nombre: 'Principal', direccion: null,
      es_principal: 1, permite_venta: 1, is_active: 1,
      created_at: '2026-01-01', updated_at: '2026-01-01', created_by: null, updated_by: null,
    },
    {
      id: 'dep-2', empresa_id: 'emp-1', nombre: 'Sucursal', direccion: null,
      es_principal: 0, permite_venta: 1, is_active: 1,
      created_at: '2026-01-01', updated_at: '2026-01-01', created_by: null, updated_by: null,
    },
  ]
}

function detalleUnaLinea() {
  return [
    {
      id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
      precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '1825.00',
      producto_nombre: 'Botox 50U', producto_codigo: 'P001',
      tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '365.00',
    },
  ]
}

function setup() {
  mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
  mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
  mockedUseReversosFactura.mockReturnValue({ reversos: [], isLoading: false })
  mockedUseCompany.mockReturnValue({
    company: { id: 'emp-1', nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: null } as never,
    isLoading: false,
  })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Admin', level: 1, rol_id: 'rol-1', rol_nombre: 'Propietario', empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUseDepositosVentaActivos.mockReturnValue({ depositos: baseDepositos(), isLoading: false })
  mockedCrearNotaCredito.mockResolvedValue({ ncrId: 'ncr-1', nroNcr: 'NCR-000001' })
}

describe('CrearNcrModal (ruta administrativa, Slice D) — sin PIN, reversa cualquier factura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  it('nunca monta SupervisorPinDialog, ni antes ni despues de confirmar', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
  })

  it('confirmar TOTAL emite directo con entryPoint TRADICIONAL, modalidad SALDO_FAVOR y tipo TOTAL', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'SALDO_FAVOR',
      tipo: 'TOTAL',
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('ofrece elegir TOTAL o PARCIAL tras abrir con una factura sin reversos previos', () => {
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
  })

  it('elegir Parcial reemplaza el footer TOTAL por SeleccionLineasNc y NO llama crearNotaCredito todavia', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('confirmar PARCIAL invoca crearNotaCredito con tipo PARCIAL y las lineas seleccionadas', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'SALDO_FAVOR',
      tipo: 'PARCIAL',
      lineas: [{ venta_det_id: 'vd-1', cantidadDevolver: '2.000' }],
    })
  })

  it('el boton PARCIAL queda deshabilitado con todas las lineas en 0', async () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeDisabled()
  })

  it('reversa una factura fuera de cualquier sesion de caja (no exige sesion, a diferencia del flujo POS)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).not.toHaveProperty('sesionCajaActivaId')
  })

  it('Scenario "Devolver dinero habilitada revela sub-opciones": esta habilitada y revela "Tesoreria" (activa) y "Sesion de caja activa" (deshabilitada, "Proximamente")', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    const devolverDinero = screen.getByRole('button', { name: /Devolver dinero/i })
    expect(devolverDinero).toBeEnabled()

    await user.click(devolverDinero)

    expect(screen.getByRole('button', { name: /^Tesoreria$/i })).toBeEnabled()
    const sesionCaja = screen.getByRole('button', { name: /Sesion de caja activa/i })
    expect(sesionCaja).toBeDisabled()
    expect(screen.getByText(/Proximamente/i)).toBeInTheDocument()
  })

  it('Scenario "Sesión de caja activa permanece deshabilitada": intentar seleccionarla no cambia nada, sigue sin responder', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /Sesion de caja activa/i }))

    expect(screen.queryByTestId('mock-refund-tesoreria-form')).not.toBeInTheDocument()
  })

  it('Scenario "Seleccionar Tesorería revela el mini-formulario": monta RefundTesoreriaForm', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /^Tesoreria$/i }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toBeInTheDocument()
  })

  it('Scenario "Emisión vía Tesorería invoca REFUND_TESORERIA": confirmar el mini-formulario invoca crearNotaCredito con modalidad REFUND_TESORERIA y egresoParams como array', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /^Tesoreria$/i }))
    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'REFUND_TESORERIA',
      egresoParams: [{ destino: 'BANCO', cuentaId: 'banco-1', montoEnMonedaCuenta: '30.00' }],
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('el motivo es obligatorio: "Confirmar Anulacion" esta deshabilitado hasta escribir un motivo', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeEnabled()
  })

  it('"Credito a favor" es la unica opcion seleccionable y esta activa por defecto', () => {
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    const creditoAFavor = screen.getByRole('button', { name: /Credito a favor/i })
    expect(creditoAFavor).toBeEnabled()
    expect(creditoAFavor).toHaveAttribute('aria-pressed', 'true')
  })

  it('emision con "Credito a favor" seleccionado (unico estado alcanzable) resulta en modalidad SALDO_FAVOR', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].modalidad).toBe('SALDO_FAVOR')
  })

  it('una factura ya reversada totalmente (gating via puedeEmitirNcAdicional) queda de solo lectura, sin ofrecer TOTAL/PARCIAL ni "Confirmar Anulacion"', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-1', nro_ncr: 'NCR-000000', tipo: 'TOTAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '5.000' },
      ],
      isLoading: false,
    })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Parcial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.getByText(/ya fue reversada totalmente/i)).toBeInTheDocument()
  })

  it('una factura con reverso parcial previo ya no ofrece TOTAL, solo PARCIAL sobre el remanente (puedeElegirTipoTotal)', () => {
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-0', nro_ncr: 'NCR-000000', tipo: 'PARCIAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '2.000' },
      ],
      isLoading: false,
    })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
  })

  it('el selector de deposito esta desbloqueado desde el inicio, sin boton "Cambiar deposito", y su eleccion se threadea a depositoReingresoId', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByRole('button', { name: /Cambiar deposito/i })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'dep-2')
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({ depositoReingresoId: 'dep-2' })
  })

  it('sin elegir deposito: depositoReingresoId es undefined (cae al riel automatico)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBeUndefined()
  })

  it('al confirmar exitosamente, cierra el modal (onClose)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CrearNcrModal isOpen onClose={onClose} factura={baseFactura()} />)

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
