import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotaCreditoPosModal } from '../nota-credito-pos-modal'
import { crearNotaCredito } from '../../hooks/use-notas-credito'
import { useFacturasSesionActiva } from '../../hooks/use-facturas-sesion-activa'
import { useDetalleFactura, usePagosFactura, useAfectacionCxc } from '@/features/cxc/hooks/use-cxc'
import { useCompany } from '@/features/configuracion/hooks/use-company'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions } from '@/core/hooks/use-permissions'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { toast } from 'sonner'
import type { FacturaParaAnular } from '../../hooks/use-notas-credito'
import type { SesionCaja } from '@/features/caja/hooks/use-sesiones-caja'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'

// PIN A (emision) y PIN B (override de deposito, Slice 5a-2b) son DOS
// autorizaciones separadas (obs #2835/#2842) — mockeamos `SupervisorPinDialog`
// mostrando su `titulo` para poder distinguir CUAL de las dos instancias
// esta abierta en cada assertion (mismo patron que `crear-ncr-modal.test.tsx`,
// extendido con el titulo porque aqui coexisten dos instancias).
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({
    isOpen,
    titulo,
    onAuthorized,
    onClose,
  }: {
    isOpen: boolean
    titulo?: string
    onAuthorized: (id: string) => void
    onClose: () => void
  }) =>
    isOpen ? (
      <div data-testid="mock-pin-dialog">
        <p>{titulo}</p>
        <button
          onClick={() => {
            // Mismo orden que el `SupervisorPinDialog` real: autoriza y
            // luego cierra el dialogo (ver `handleVerificar`).
            onAuthorized('supervisor-1')
            onClose()
          }}
        >
          Autorizar
        </button>
      </div>
    ) : null,
}))

vi.mock('@/features/ventas/hooks/use-notas-credito', () => ({ crearNotaCredito: vi.fn() }))
vi.mock('@/features/ventas/hooks/use-facturas-sesion-activa', () => ({ useFacturasSesionActiva: vi.fn() }))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useDetalleFactura: vi.fn(),
  usePagosFactura: vi.fn(),
  useAfectacionCxc: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-company', () => ({ useCompany: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', () => ({ useDepositosVentaActivos: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedCrearNotaCredito = vi.mocked(crearNotaCredito)
const mockedUseFacturasSesionActiva = vi.mocked(useFacturasSesionActiva)
const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseAfectacionCxc = vi.mocked(useAfectacionCxc)
const mockedUseCompany = vi.mocked(useCompany)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedToastSuccess = vi.mocked(toast.success)

function depositoActivo(overrides: Partial<Deposito> = {}): Deposito {
  return {
    id: 'dep-1',
    empresa_id: 'emp-1',
    nombre: 'Deposito Secundario',
    direccion: null,
    es_principal: 0,
    permite_venta: 1,
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    created_by: null,
    updated_by: null,
    ...overrides,
  }
}

const sesionActiva: SesionCaja = {
  id: 'sesion-1',
  empresa_id: 'emp-1',
  caja_id: 'caja-1',
  usuario_apertura_id: 'user-1',
  fecha_apertura: '2026-01-01T00:00:00Z',
  monto_apertura_usd: '0',
  monto_apertura_bs: '0',
  usuario_cierre_id: null,
  fecha_cierre: null,
  monto_sistema_usd: null,
  monto_fisico_usd: null,
  diferencia_usd: null,
  monto_sistema_bs: null,
  monto_fisico_bs: null,
  diferencia_bs: null,
  observaciones_cierre: null,
  status: 'ABIERTA',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function facturaSesion(overrides: Partial<FacturaParaAnular> = {}): FacturaParaAnular {
  return {
    id: 'venta-1',
    nro_factura: 'C01-000001',
    cliente_id: 'cli-1',
    cliente_nombre: 'Maria Perez',
    cliente_identificacion: 'V-12345678',
    tasa: '40',
    total_usd: '30.00',
    total_bs: '1200.00',
    saldo_pend_usd: '0.00',
    tipo: 'CONTADO',
    fecha: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function setup(opts: { hasPermission: boolean }) {
  mockedUseFacturasSesionActiva.mockReturnValue({ facturas: [facturaSesion()], isLoading: false })
  mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
  mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
  mockedUseAfectacionCxc.mockReturnValue({ cantidadMovimientos: 0, isLoading: false })
  mockedUseCompany.mockReturnValue({
    company: { id: 'emp-1', nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: null } as never,
    isLoading: false,
  })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Cajero', level: 3, rol_id: 'rol-1', rol_nombre: 'Cajero', empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => opts.hasPermission,
    hasAnyPermission: () => opts.hasPermission,
    hasAllPermissions: () => opts.hasPermission,
    isOwner: false,
    rolId: 'rol-1',
    rolNombre: 'Cajero',
    loading: false,
  })
  mockedCrearNotaCredito.mockResolvedValue({ ncrId: 'ncr-1', nroNcr: 'NCR-000001' })
  mockedUseDepositosVentaActivos.mockReturnValue({ depositos: [depositoActivo()], isLoading: false })
}

async function seleccionarPrimeraFactura() {
  const user = userEvent.setup()
  await user.click(screen.getByText(/C01-000001/i))
  return user
}

describe('NotaCreditoPosModal — Slice 5a-2a (entrada POS, PIN A, TOTAL only, sin coupling con cobro)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista SOLO las facturas de la sesion activa (via useFacturasSesionActiva, query-enforced)', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText(/C01-000001/i)).toBeInTheDocument()
    expect(mockedUseFacturasSesionActiva).toHaveBeenCalled()
  })

  it('con permiso ventas.nota_credito: confirmar emite directo, SIN pedir PIN', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'POS',
      sesionCajaActivaId: 'sesion-1',
      modalidad: 'EFECTIVO_REAL',
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('sin permiso ventas.nota_credito: exige PIN de supervisor antes de emitir', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
  })

  it('EFECTIVO_REAL reachable via caller POS real: entryPoint POS + sesion activa + modalidad EFECTIVO_REAL (dispara la Regla de Oro dentro de crearNotaCredito)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      modalidad: 'EFECTIVO_REAL',
    })
    expect(mockedCrearNotaCredito.mock.calls[0][0].tipo).toBeUndefined()
  })

  it('REGRESION obs #2814 reachable via caller POS real: SALDO_FAVOR (no-efectivo) se pasa correctamente a crearNotaCredito (la Regla de Oro no dispara dentro de la funcion)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.selectOptions(screen.getByRole('combobox'), 'SALDO_FAVOR')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      modalidad: 'SALDO_FAVOR',
    })
  })

  it('por defecto (sin autorizar PIN B) NO pasa depositoReingresoId — usa el riel automatico', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBeUndefined()
  })
})

describe('NotaCreditoPosModal — Slice 5a-2b (PIN B, override de deposito, SEPARADO de PIN A)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el selector de deposito permanece bloqueado por defecto: solo muestra el texto "riel automatico" y un boton "Cambiar deposito"', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getByText(/Automatico/i)).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '' })).toBeInTheDocument() // solo el combobox de modalidad
    expect(screen.queryByText('Deposito Secundario')).not.toBeInTheDocument()
  })

  it('click en "Cambiar deposito" abre un PIN de supervisor SEPARADO del PIN de emision (PIN A), incluso con permiso de emision', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Cambiar deposito de reingreso/i)).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('tras autorizar PIN B: aparece el selector de deposito y la eleccion del usuario se envia como depositoReingresoId', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))

    const selects = screen.getAllByRole('combobox')
    const depositoSelect = selects[selects.length - 1]
    await user.selectOptions(depositoSelect, 'dep-1')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBe('dep-1')
  })

  it('PIN B autorizado pero sin deposito elegido todavia: sigue sin enviar depositoReingresoId (riel automatico hasta que el usuario elija)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBeUndefined()
  })

  it('PIN A y PIN B son independientes: sin permiso de emision, autorizar PIN B para el deposito NO exime del PIN A al confirmar', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()

    // Autoriza PIN B (deposito) primero.
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    expect(screen.getByText(/Cambiar deposito de reingreso/i)).toBeInTheDocument()
    await user.click(screen.getByText('Autorizar'))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[selects.length - 1], 'dep-1')

    // Confirmar todavia exige PIN A (emision) — es una autorizacion separada.
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
    expect(screen.getByText(/Emision de Nota de Credito/i)).toBeInTheDocument()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBe('dep-1')
  })
})

describe('NotaCreditoPosModal — Slice 2 (lista rediseñada: badges de estado/reverso, buscador, gating de reverso total)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('factura con saldo_pend_usd == total_usd (sin pagos) muestra el badge "Crédito"', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_usd: '30.00', saldo_pend_usd: '30.00' })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Crédito')).toBeInTheDocument()
  })

  it('factura Abonada + tiene_reverso_parcial=1 muestra AMBOS badges en la misma fila', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_usd: '30.00', saldo_pend_usd: '10.00', tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Abonada')).toBeInTheDocument()
    expect(screen.getByText('Reverso Parcial')).toBeInTheDocument()
  })

  it('WARNING #2 resuelto: factura con tiene_reverso_total=1 (status ANULADA) permanece visible con su badge pero la fila queda deshabilitada — clickearla NO navega al flujo de confirmacion', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ status: 'ANULADA', tiene_reverso_total: 1 })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Reverso Total')).toBeInTheDocument()
    expect(screen.getByText(/C01-000001/i)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))

    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
  })

  it('factura con tiene_reverso_parcial=1 pero status activo sigue siendo clickable (puede recibir otra NC parcial)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })

  it('el buscador filtra client-side por numero de factura', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001', cliente_nombre: 'Maria Perez' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002', cliente_nombre: 'Juan Gomez' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/Buscar por numero, cliente o estado/i), '000002')

    expect(screen.queryByText(/C01-000001/i)).not.toBeInTheDocument()
    expect(screen.getByText(/C01-000002/i)).toBeInTheDocument()
  })

  it('el buscador filtra client-side por nombre de cliente (case-insensitive)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001', cliente_nombre: 'Maria Perez' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002', cliente_nombre: 'Juan Gomez' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/Buscar por numero, cliente o estado/i), 'gomez')

    expect(screen.queryByText(/Maria Perez/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Juan Gomez/i)).toBeInTheDocument()
  })

  it('el buscador filtra client-side por estado de pago (ej. "credito")', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001', total_usd: '30.00', saldo_pend_usd: '30.00' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002', total_usd: '30.00', saldo_pend_usd: '0.00' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText(/Buscar por numero, cliente o estado/i), 'credito')

    expect(screen.getByText(/C01-000001/i)).toBeInTheDocument()
    expect(screen.queryByText(/C01-000002/i)).not.toBeInTheDocument()
  })
})

describe('NotaCreditoPosModal — Slice 3a (panel de detalle montado, Design §Decision 5/6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sin seleccion: el panel derecho no muestra datos de factura alguna', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText(/Selecciona una factura del listado/i)).toBeInTheDocument()
  })

  it('al seleccionar una factura: el panel muestra su detalle fiscal via buildReciboData (linea gravada, linea exenta e IGTF de la factura real)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_igtf_usd: '0.60' })],
      isLoading: false,
    })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '2',
          precio_unitario_usd: '10.00', subtotal_usd: '20.00', subtotal_bs: '800.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
        {
          id: 'vd-2', venta_id: 'venta-1', producto_id: 'p2', cantidad: '1',
          precio_unitario_usd: '5.00', subtotal_usd: '5.00', subtotal_bs: '200.00',
          producto_nombre: 'Consulta', producto_codigo: 'P002',
          tipo_impuesto: 'Exento', impuesto_pct: '0', es_decimal: 0, precio_unitario_bs: '200.00',
        },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getByText('Botox 50U')).toBeInTheDocument()
    expect(screen.getByText('Consulta')).toBeInTheDocument()
    expect(screen.getByText('Monto Exento')).toBeInTheDocument()
    expect(screen.getByText('Base Imponible')).toBeInTheDocument()
    expect(screen.getByText('IGTF')).toBeInTheDocument()
  })

  it('afectoCxc=true (cantidadMovimientos>0): el panel indica que la factura afecto cuentas por cobrar', async () => {
    setup({ hasPermission: true })
    mockedUseAfectacionCxc.mockReturnValue({ cantidadMovimientos: 1, isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getByText(/Afect(o|ó) cuentas por cobrar/i)).toBeInTheDocument()
  })

  it('afectoCxc=false (0 movimientos): el panel indica que NO afecto cuentas por cobrar', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getByText(/No afect(o|ó) cuentas por cobrar/i)).toBeInTheDocument()
  })

  it('el listado sigue visible en la columna izquierda incluso con una factura seleccionada (layout de dos columnas, no drill-down)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getAllByText(/C01-000001/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })
})
