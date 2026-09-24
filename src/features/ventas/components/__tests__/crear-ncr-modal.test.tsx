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
 *
 * UX rework (nc-refund-tesoreria): jerarquia de "Origen del reverso" a UN
 * solo nivel (ya NO hay una segunda fila fija de botones
 * Tesoreria/Sesion — eso vive DENTRO de `RefundTesoreriaForm`, ya probado
 * end-to-end en refund-tesoreria-form.test.tsx) y CERO preseleccion
 * (Total/Parcial y Devolver dinero/Credito a favor arrancan sin elegir).
 * Estos tests reflejan ese comportamiento — cada uno que antes confiaba en
 * un default ahora elige explicitamente tipo Y origen antes de confirmar.
 */
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({ isOpen, titulo }: { isOpen: boolean; titulo?: string }) =>
    isOpen ? <div data-testid="mock-pin-dialog">{titulo ?? 'PIN de supervisor'}</div> : null,
}))
// Slice 6 (nc-refund-tesoreria, wiring): mockeamos el mini-formulario aislado
// (ya probado end-to-end en refund-tesoreria-form.test.tsx) para verificar
// SOLO el wiring del modal — mismo criterio que el mock de SupervisorPinDialog.
// El mock tambien renderiza `motivoSlot` (si se provee) para probar que el
// modal intercala el campo Motivo DENTRO del formulario cuando corresponde.
vi.mock('../refund-tesoreria-form', () => ({
  RefundTesoreriaForm: ({
    onConfirm,
    motivoSlot,
    montoDisponibleUsd,
    disabledExterno,
  }: {
    onConfirm: (lineas: { destino: string; cuentaId: string; montoEnMonedaCuenta: string; referencia?: string }[]) => void
    motivoSlot?: React.ReactNode
    // PR3 (nc-parcial-devolver-dinero): expuestos como data-attributes,
    // MISMO criterio ya usado en `nota-credito-pos-modal.test.tsx` (PR2) —
    // asertar que el monto disponible se recalcula para PARCIAL (suma de
    // lineas seleccionadas, nunca `factura.total_usd`) y que `disabledExterno`
    // bloquea "Confirmar" mientras `SeleccionLineasNc` no tiene lineas validas.
    montoDisponibleUsd?: number
    disabledExterno?: boolean
  }) => (
    <div
      data-testid="mock-refund-tesoreria-form"
      data-monto-disponible-usd={montoDisponibleUsd}
      data-disabled-externo={String(disabledExterno)}
    >
      {motivoSlot}
      <button
        type="button"
        disabled={disabledExterno}
        onClick={() =>
          onConfirm([
            { destino: 'BANCO', cuentaId: 'banco-1', montoEnMonedaCuenta: '30.00', referencia: 'TRF-999' },
          ])
        }
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

/** Helper: llega al estado "TOTAL + Credito a favor" (unico camino que revela el footer "Confirmar Anulacion"). */
async function elegirTotalCreditoAFavor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Total' }))
  await user.click(screen.getByRole('button', { name: /Credito a favor/i }))
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

    await elegirTotalCreditoAFavor(user)
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
  })

  it('confirmar TOTAL emite directo con entryPoint TRADICIONAL, modalidad SALDO_FAVOR y tipo TOTAL', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await elegirTotalCreditoAFavor(user)
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

  it('elegir Parcial + un origen reemplaza el footer TOTAL por SeleccionLineasNc y NO llama crearNotaCredito todavia', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))

    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('confirmar PARCIAL invoca crearNotaCredito con tipo PARCIAL y las lineas seleccionadas', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))
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
    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeDisabled()
  })

  it('reversa una factura fuera de cualquier sesion de caja (no exige sesion, a diferencia del flujo POS)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await elegirTotalCreditoAFavor(user)
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).not.toHaveProperty('sesionCajaActivaId')
  })

  it('Scenario "Jerarquia a un solo nivel": elegir "Devolver dinero" (con TOTAL) revela `RefundTesoreriaForm` DIRECTAMENTE — ya no hay una fila fija de botones Tesoreria/Sesion en el modal', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    expect(screen.queryByTestId('mock-refund-tesoreria-form')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toBeInTheDocument()
    // La antigua fila fija "Tesoreria"/"Sesion de caja activa" a nivel de
    // modal ya no existe — esa eleccion vive DENTRO del formulario mockeado.
    expect(screen.queryByRole('button', { name: /^Tesoreria$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sesion de caja activa/i })).not.toBeInTheDocument()
  })

  it('Scenario "Emisión vía Tesorería invoca REFUND_TESORERIA": confirmar el mini-formulario invoca crearNotaCredito con modalidad REFUND_TESORERIA y egresoParams como array (incluida la referencia opcional threadeada sin cambios)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'REFUND_TESORERIA',
      egresoParams: [
        { destino: 'BANCO', cuentaId: 'banco-1', montoEnMonedaCuenta: '30.00', referencia: 'TRF-999' },
      ],
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('Scenario "Motivo intercalado dentro del formulario de reembolso": con Devolver dinero, el campo Motivo se renderiza DENTRO de `RefundTesoreriaForm` (via motivoSlot), no aparte', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    const form = screen.getByTestId('mock-refund-tesoreria-form')
    const motivoInput = screen.getByPlaceholderText(/Motivo de la anulacion/i)
    expect(form).toContainElement(motivoInput)
  })

  it('el motivo es obligatorio: "Confirmar Anulacion" esta deshabilitado hasta escribir un motivo (una vez tipo y origen elegidos)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()

    await elegirTotalCreditoAFavor(user)

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeEnabled()
  })

  it('nc-factura-credito-ux: factura 100% credito (saldo_pend_usd === total_usd) — confirmar TOTAL SIN elegir origen invoca crearNotaCredito con modalidad SALDO_FAVOR (soloCancelaDeuda)', async () => {
    const user = userEvent.setup()
    render(
      <CrearNcrModal
        isOpen
        onClose={() => {}}
        factura={baseFactura({ total_usd: '80.00', saldo_pend_usd: '80.00' })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Total' }))

    // Sin remanente: el selector NO ofrece "Devolver dinero"/"Credito a favor".
    expect(screen.queryByRole('button', { name: /Devolver dinero/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Credito a favor/i })).not.toBeInTheDocument()
    expect(
      screen.getByText('Esta nota de crédito cancela $80.00 de la deuda pendiente de la factura.')
    ).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      modalidad: 'SALDO_FAVOR',
      tipo: 'TOTAL',
    })
  })

  it('nc-factura-credito-ux: factura mixta (con remanente) — "Confirmar Anulacion" NO aparece hasta elegir origen (regresion)', async () => {
    const user = userEvent.setup()
    render(
      <CrearNcrModal
        isOpen
        onClose={() => {}}
        factura={baseFactura({ total_usd: '100.00', saldo_pend_usd: '40.00' })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Total' }))

    expect(
      screen.getByText('De $100.00: $40.00 cancela deuda pendiente, $60.00 disponible')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeEnabled()
  })

  describe('Scenario "Sin preseleccion" (UX rework, nc-refund-tesoreria)', () => {
    it('Total/Parcial: ningun boton arranca presionado', () => {
      render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

      expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: 'Parcial' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('Devolver dinero/Credito a favor: ningun boton arranca presionado', () => {
      render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

      expect(screen.getByRole('button', { name: /Devolver dinero/i })).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByRole('button', { name: /Credito a favor/i })).toHaveAttribute('aria-pressed', 'false')
    })

    it('sin elegir tipo ni origen, no existe ningun boton de confirmacion final visible (ni Anulacion ni Parcial ni el mini-formulario de reembolso)', () => {
      render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

      expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()
      expect(screen.queryByTestId('mock-refund-tesoreria-form')).not.toBeInTheDocument()
    })

    it('QA fix (unificacion-modal-nc): eligiendo solo "Parcial" sin tocar "Origen del reverso", SeleccionLineasNc SI se muestra (Total/Parcial es decision de inventario, independiente del vuelto) pero el boton Confirmar permanece deshabilitado hasta elegir el origen (origenPendiente)', async () => {
      const user = userEvent.setup()
      mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
      render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

      await user.click(screen.getByRole('button', { name: 'Parcial' }))

      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeDisabled()
      expect(screen.getByText(/Debes elegir el origen del reverso antes de confirmar/i)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Credito a favor/i }))

      expect(screen.queryByText(/Debes elegir el origen del reverso antes de confirmar/i)).not.toBeInTheDocument()
    })
  })

  it('emision con "Credito a favor" explicitamente elegido resulta en modalidad SALDO_FAVOR', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await elegirTotalCreditoAFavor(user)
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
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
  })

  it('el selector de deposito esta desbloqueado desde el inicio, sin boton "Cambiar deposito", y su eleccion se threadea a depositoReingresoId', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    expect(screen.queryByRole('button', { name: /Cambiar deposito/i })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'dep-2')
    await elegirTotalCreditoAFavor(user)
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({ depositoReingresoId: 'dep-2' })
  })

  it('sin elegir deposito: depositoReingresoId es undefined (cae al riel automatico)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await elegirTotalCreditoAFavor(user)
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBeUndefined()
  })

  it('Scenario "Reorden del layout": el bloque "Deposito de reingreso de stock" aparece ANTES que "Tipo de nota de credito" en el DOM', () => {
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    const deposito = screen.getByText(/Deposito de reingreso de stock/i)
    const tipoNc = screen.getByText(/Tipo de nota de credito/i)
    expect(
      deposito.compareDocumentPosition(tipoNc) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('Scenario "Articulos a devolver" (Slice 2, D4 de unificacion-modal-nc): con Parcial + un origen elegidos, SeleccionLineasNc se renderiza ANTES que "Origen del reverso" en el DOM', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: /Credito a favor/i }))

    const seleccionLineas = screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })
    const origen = screen.getByText(/Origen del reverso/i)
    expect(
      seleccionLineas.compareDocumentPosition(origen) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('al confirmar exitosamente, cierra el modal (onClose)', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CrearNcrModal isOpen onClose={onClose} factura={baseFactura()} />)

    await elegirTotalCreditoAFavor(user)
    await user.type(screen.getByPlaceholderText(/Motivo de la anulacion/i), 'Motivo de prueba')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})

/**
 * PR3 (nc-parcial-devolver-dinero, apply-progress obs #4019): MISMO fix que
 * PR2 (`nota-credito-pos-modal.tsx`), wireado en el modal administrativo —
 * `debeUsarRefundTesoreria(origenReverso)` (PR1, capa pura) pasa a ser el
 * UNICO criterio para renderizar `RefundTesoreriaForm`, sin importar
 * `tipoNc`. Antes de este fix (obs #4013/#4007), PARCIAL + "Devolver dinero"
 * caia en el boton interno de `SeleccionLineasNc` ("Confirmar Nota de
 * Credito Parcial") con `modalidad:'AJUSTE_CXC'` (fallback de
 * `resolverModalidadDesdeOrigen`), perdiendo el egreso real de tesoreria —
 * a diferencia de POS, el admin NO tiene sesion de caja ni PIN: `emitirNc`/
 * `emitirNcRefund` usan `entryPoint:'TRADICIONAL'` sin `sesionCajaActivaId`.
 */
describe('CrearNcrModal — PR3 (nc-parcial-devolver-dinero): PARCIAL + Devolver dinero enruta a RefundTesoreriaForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setup()
  })

  it('PARCIAL + "Devolver dinero" renderiza RefundTesoreriaForm en vez del boton "Confirmar Nota de Credito Parcial"', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('el monto disponible pasado a RefundTesoreriaForm refleja la SUMA de las lineas seleccionadas, no el total completo de la factura', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(
      <CrearNcrModal
        isOpen
        onClose={() => {}}
        factura={baseFactura({ total_usd: '100.00', saldo_pend_usd: '0.00' })}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    // 2 unidades x $10.00 = $20.00 base + 16% IVA ($3.20) = $23.20 — MISMA
    // formula pura que `previewMontoBsNc` ya usa (cero calculo paralelo).
    // `total_usd` (100.00) NUNCA debe filtrarse aqui — regresion al bug de
    // sobre-estimar el disponible.
    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-monto-disponible-usd', '23.2')
  })

  it('sin lineas validas todavia (cantidad 0), "Confirmar reembolso" queda deshabilitado (disabledExterno); tras ingresar una cantidad valida se habilita', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'true')
    expect(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i })).toBeDisabled()

    await user.type(screen.getByRole('spinbutton'), '2')

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'false')
    expect(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i })).not.toBeDisabled()
  })

  it('TOTAL + "Devolver dinero" sigue sin disabledExterno (caracterizacion, comportamiento preexistente sin cambios)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'false')
  })

  it('confirmar el reembolso invoca crearNotaCredito con entryPoint TRADICIONAL, modalidad REFUND_TESORERIA, tipo PARCIAL y las lineas seleccionadas (FIX obs #4013/#4007)', async () => {
    const user = userEvent.setup()
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'TRADICIONAL',
      modalidad: 'REFUND_TESORERIA',
      tipo: 'PARCIAL',
      lineas: [{ venta_det_id: 'vd-1', cantidadDevolver: '2.000' }],
      egresoParams: [
        { destino: 'BANCO', cuentaId: 'banco-1', montoEnMonedaCuenta: '30.00', referencia: 'TRF-999' },
      ],
    })
    expect(mockedCrearNotaCredito.mock.calls[0][0]).not.toHaveProperty('sesionCajaActivaId')
  })

  it('TOTAL + "Devolver dinero" sigue emitiendo tipo TOTAL sin lineas (caracterizacion, comportamiento preexistente sin cambios)', async () => {
    const user = userEvent.setup()
    render(<CrearNcrModal isOpen onClose={() => {}} factura={baseFactura()} />)

    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: /Devolver dinero/i }))
    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'TRADICIONAL',
      modalidad: 'REFUND_TESORERIA',
      tipo: 'TOTAL',
    })
    expect(mockedCrearNotaCredito.mock.calls[0][0]).not.toHaveProperty('lineas')
  })
})
