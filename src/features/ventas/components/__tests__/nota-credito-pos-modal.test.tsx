import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotaCreditoPosModal } from '../nota-credito-pos-modal'
import { crearNotaCredito, useReversosFactura } from '../../hooks/use-notas-credito'
import { useFacturasSesionActiva, useBadgesReversoSesion } from '../../hooks/use-facturas-sesion-activa'
import { useDetalleFactura, usePagosFactura } from '@/features/cxc/hooks/use-cxc'
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

// Slice D (replicar-consulta-factura-ventas-caja): "Reimprimir" abre
// `ConsultaFacturaModal` — mockeado en el boundary, mismo patron de sentinel
// que `ventas-consultas-modal.test.tsx`/`cliente-detalle.test.tsx`. Su propia
// suite (`consulta-factura-modal.test.tsx`) ya cubre el wiring interno con
// `useReciboDesdeFactura`/`useEvolucionFactura` (esReimpresion+evolucion) —
// aqui solo probamos que ESTE modal lo abre/cierra con la factura correcta,
// de forma independiente al reveal-gate de NC (Slice C).
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

// Slice 4 (unificacion-modal-nc, Design §D5): mockeamos el mini-formulario
// aislado (ya probado end-to-end en refund-tesoreria-form.test.tsx) para
// verificar SOLO el wiring del modal — mismo criterio que el mock de
// `crear-ncr-modal.test.tsx`. Expone `restringirOrigenASesionId`/
// `mostrarOrigenTesoreria` como data-attributes (en vez de renderizar los
// selects reales, que dependen de hooks de Tesoreria/Sesiones/Metodos de
// pago fuera de alcance de este mock) para poder aserir el wiring exacto
// que pasa el modal sin re-mockear esos 3 hooks aqui.
vi.mock('../refund-tesoreria-form', () => ({
  RefundTesoreriaForm: ({
    onConfirm,
    restringirOrigenASesionId,
    mostrarOrigenTesoreria,
    montoDisponibleUsd,
    disabledExterno,
  }: {
    onConfirm: (
      lineas: {
        destino: string
        sesionCajaId?: string
        metodoCobroId?: string
        moneda?: string
        montoEnMonedaCuenta: string
        referencia?: string
      }[]
    ) => void
    restringirOrigenASesionId?: string
    mostrarOrigenTesoreria?: boolean
    // PR2 (nc-parcial-devolver-dinero): expuestos como data-attributes para
    // asertar que el monto disponible se recalcula (PARCIAL: suma de lineas
    // seleccionadas, no `factura.total_usd`) y que el gate `disabledExterno`
    // bloquea "Confirmar" mientras `SeleccionLineasNc` no tiene lineas
    // validas — sin re-montar el formulario real (ya probado end-to-end en
    // `refund-tesoreria-form.test.tsx`).
    montoDisponibleUsd?: number
    disabledExterno?: boolean
  }) => (
    <div
      data-testid="mock-refund-tesoreria-form"
      data-restringir-origen-sesion-id={restringirOrigenASesionId}
      data-mostrar-origen-tesoreria={String(mostrarOrigenTesoreria)}
      data-monto-disponible-usd={montoDisponibleUsd}
      data-disabled-externo={String(disabledExterno)}
    >
      <button
        type="button"
        disabled={disabledExterno}
        onClick={() =>
          onConfirm([
            {
              destino: 'SESION_CAJA',
              sesionCajaId: restringirOrigenASesionId,
              metodoCobroId: 'metodo-efectivo-usd',
              moneda: 'USD',
              montoEnMonedaCuenta: '30.00',
            },
          ])
        }
      >
        Confirmar reembolso (mock)
      </button>
    </div>
  ),
}))

vi.mock('@/features/ventas/hooks/use-notas-credito', () => ({ crearNotaCredito: vi.fn(), useReversosFactura: vi.fn() }))
vi.mock('@/features/ventas/hooks/use-facturas-sesion-activa', () => ({
  useFacturasSesionActiva: vi.fn(),
  useBadgesReversoSesion: vi.fn(),
}))
vi.mock('@/features/cxc/hooks/use-cxc', () => ({
  useDetalleFactura: vi.fn(),
  usePagosFactura: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-company', () => ({ useCompany: vi.fn() }))
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', () => ({ useDepositosVentaActivos: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const mockedCrearNotaCredito = vi.mocked(crearNotaCredito)
const mockedUseReversosFactura = vi.mocked(useReversosFactura)
const mockedUseFacturasSesionActiva = vi.mocked(useFacturasSesionActiva)
const mockedUseBadgesReversoSesion = vi.mocked(useBadgesReversoSesion)
const mockedUseDetalleFactura = vi.mocked(useDetalleFactura)
const mockedUsePagosFactura = vi.mocked(usePagosFactura)
const mockedUseCompany = vi.mocked(useCompany)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedToastSuccess = vi.mocked(toast.success)
const mockedToastInfo = vi.mocked(toast.info)

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
  mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: {}, isLoading: false })
  mockedUseDetalleFactura.mockReturnValue({ detalle: [], isLoading: false })
  mockedUsePagosFactura.mockReturnValue({ pagos: [], isLoading: false })
  mockedUseReversosFactura.mockReturnValue({ reversos: [], isLoading: false })
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

/**
 * Reveal-gate (Slice C, Spec notas-credito-pos: "Reveal-gate de la seccion
 * de emision de NC"): la seccion NC (Tipo, modalidad, deposito, motivo,
 * alerta irreversible) y el pie de flujo de anulacion (Confirmar
 * Anulacion/Editar metodos de pago) ya NO se muestran automaticamente al
 * seleccionar una factura — hay que presionar "Emitir nota de credito"
 * primero. Helper mecanico para retrofitar los tests preexistentes de la
 * seccion NC sin alterar ninguna de sus aserciones originales.
 */
async function revelarSeccionNc(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Emitir nota de credito/i }))
}

/**
 * Ajustes QA (ajustes-qa-nota-credito-pos-modal, Item 5): tras revelar la
 * seccion NC, `tipoNc` arranca en `null` — ningun tipo esta preseleccionado
 * (ni siquiera TOTAL, ni PARCIAL para facturas con reverso parcial previo).
 * Helper mecanico para retrofitar los tests preexistentes que dependian de
 * TOTAL como default: ahora deben elegirlo explicitamente antes de esperar
 * la UI de confirmacion de TOTAL (que Item 6 ademas reubico DENTRO de la
 * seccion, ya no en el pie del modal).
 *
 * Slice 3 (unificacion-modal-nc, Design §D2): tras elegir Total, el bloque
 * de confirmacion (aviso irreversible + "Confirmar Anulacion") queda
 * gateado ADEMAS a `origenReverso === 'CREDITO_A_FAVOR'` — el select
 * "Modalidad de liquidacion" desaparecio (reemplazado por
 * `OrigenReversoSelector`) y "Devolver dinero" queda transicional hasta
 * Slice 4. Este helper elige tambien "Credito a favor" para llegar al
 * mismo estado "listo para confirmar" que antes daba TOTAL por si solo
 * (equivalente mas cercano al viejo default EFECTIVO_REAL, ahora
 * SALDO_FAVOR) — los tests que necesiten el estado intermedio
 * "Total sin origen" lo arman a mano sin usar este helper.
 */
async function elegirTotal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Total' }))
  await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
}

describe('NotaCreditoPosModal — Ajustes QA (ajustes-qa-nota-credito-pos-modal, Items 1/2/3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Item 1: el titulo del modal es "Facturas Emitidas - Sesion Actual"', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByRole('heading', { name: 'Facturas Emitidas - Sesion Actual' })).toBeInTheDocument()
  })

  it('Item 2: al seleccionar una factura, el panel derecho NO muestra el header local Cliente/Tasa (arranca directo en Articulos)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    // El header local (Cliente: <nombre> / Tasa: <valor>) se elimino — la
    // etiqueta "Cliente:" solo existia ahi (la tarjeta del listado nunca la
    // usa, muestra el nombre sin prefijo). "Tasa:" YA NO es una aserción
    // valida de ausencia aqui porque el Item 3 (tasa en cada tarjeta del
    // listado) reutiliza ese mismo prefijo en la columna izquierda.
    expect(screen.queryByText(/^Cliente:/)).not.toBeInTheDocument()
    expect(screen.getByText('Articulo')).toBeInTheDocument()
  })

  it('Item 3: cada tarjeta del listado (seleccionada o no) muestra su propia tasa historica (4 decimales) debajo del monto en Bs', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001', tasa: '40' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002', tasa: '52.5' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Tasa: 40,0000')).toBeInTheDocument()
    expect(screen.getByText('Tasa: 52,5000')).toBeInTheDocument()
  })
})

describe('NotaCreditoPosModal — Slice C (reveal-gate de la seccion NC, Spec notas-credito-pos)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('C.1 al seleccionar una factura, la seccion NC permanece oculta y el pie muestra solo Volver/Reimprimir/Emitir nota de credito', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.queryByText('Tipo de nota de credito')).not.toBeInTheDocument()
    expect(screen.queryByText('Origen del reverso')).not.toBeInTheDocument()
    expect(screen.queryByText('Deposito de reingreso de stock')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Motivo de la anulacion/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Esta accion es irreversible/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Editar metodos de pago/i })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: /^Volver$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reimprimir$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Emitir nota de credito/i })).toBeInTheDocument()
  })

  it('C.1b no auto-selecciona Total al elegir la factura (Total/Parcial ya no se ofrecen fuera de la seccion revelada)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Parcial' })).not.toBeInTheDocument()
  })

  it('C.2 "Emitir nota de credito" revela la seccion NC completa y el pie pasa al flujo de anulacion existente', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)

    // Item 5 (ajustes-qa-nota-credito-pos-modal): al revelar, ningun tipo
    // esta preseleccionado -> estado neutro, sin alerta ni boton de
    // confirmacion todavia.
    expect(screen.getByText('Tipo de nota de credito')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
    expect(screen.queryByText(/Esta accion es irreversible/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Editar metodos de pago/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Reimprimir$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Emitir nota de credito/i })).not.toBeInTheDocument()

    // Item 6: elegir Total revela la confirmacion DENTRO de la seccion.
    await elegirTotal(user)

    expect(screen.getByText(/Esta accion es irreversible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })

  it('C.3 seleccionar otra factura reoculta la seccion NC (gate revelado para A no persiste al elegir B)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)
    expect(screen.getByText('Tipo de nota de credito')).toBeInTheDocument()

    await user.click(screen.getByText(/C01-000002/i))

    expect(screen.queryByText('Tipo de nota de credito')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Emitir nota de credito/i })).toBeInTheDocument()
  })

  it('C.4 "Volver" con la seccion revelada regresa directo al estado vacio de seleccion (una sola etapa)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    expect(screen.getByText('Tipo de nota de credito')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Volver$/i }))

    expect(screen.getByText(/Selecciona una factura del listado/i)).toBeInTheDocument()
    expect(screen.queryByText('Tipo de nota de credito')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Volver$/i })).not.toBeInTheDocument()
  })

  it('C.5 cerrar el modal (isOpen=false) reoculta la seccion NC al reabrirlo sobre la misma factura', async () => {
    setup({ hasPermission: true })
    const { rerender } = render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    expect(screen.getByText('Tipo de nota de credito')).toBeInTheDocument()

    rerender(<NotaCreditoPosModal isOpen={false} onClose={() => {}} sesion={sesionActiva} />)
    rerender(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText(/Selecciona una factura del listado/i)).toBeInTheDocument()
  })
})

/**
 * Slice D (replicar-consulta-factura-ventas-caja, Spec notas-credito-pos:
 * "Reimpresion desde la entrada POS de NC"): el boton "Reimprimir" del pie
 * (renderizado inerte por Slice C) se conecta a `ConsultaFacturaModal`. Su
 * estado (`reimprimirOpen`) es INDEPENDIENTE del reveal-gate de NC
 * (`ncSectionRevealed`, Slice C) en ambas direcciones — abrir/cerrar uno
 * nunca afecta al otro.
 */
describe('NotaCreditoPosModal — Slice D (Reimprimir, Spec notas-credito-pos)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('D.1 con una factura seleccionada, "Reimprimir" abre ConsultaFacturaModal con esa factura', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    expect(screen.queryByTestId('consulta-factura-modal')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Reimprimir$/i }))

    expect(screen.getByTestId('consulta-factura-modal')).toHaveAttribute(
      'data-nro-factura',
      'C01-000001'
    )
  })

  it('D.2 cerrar el modal de Reimprimir NO revela ni altera la seccion NC (independencia del gate)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /^Reimprimir$/i }))
    expect(screen.getByTestId('consulta-factura-modal')).toBeInTheDocument()

    // `fireEvent` no se usa aqui porque el mock no monta un Dialog real de
    // Radix (sin `pointer-events:none`) — `user.click` es seguro.
    await user.click(screen.getByText('Cerrar consulta'))

    expect(screen.queryByTestId('consulta-factura-modal')).not.toBeInTheDocument()
    expect(screen.queryByText('Tipo de nota de credito')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Volver$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reimprimir$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Emitir nota de credito/i })).toBeInTheDocument()
  })

  it('D.3 revelar la seccion NC mientras Reimprimir esta abierto no lo cierra (independencia en sentido inverso)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /^Reimprimir$/i }))
    expect(screen.getByTestId('consulta-factura-modal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Emitir nota de credito/i }))

    expect(screen.getByText('Tipo de nota de credito')).toBeInTheDocument()
    expect(screen.getByTestId('consulta-factura-modal')).toBeInTheDocument()
  })
})

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
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'POS',
      sesionCajaActivaId: 'sesion-1',
      // Slice 3 (unificacion-modal-nc, Design §D2): EFECTIVO_REAL ya no es
      // alcanzable via UI POS (select "Modalidad de liquidacion" eliminado)
      // — "Credito a favor" (elegido por `elegirTotal`) mapea a SALDO_FAVOR
      // via `resolverModalidadDesdeOrigen`, misma funcion pura que admin.
      modalidad: 'SALDO_FAVOR',
    })
    expect(mockedToastSuccess).toHaveBeenCalledWith(expect.stringContaining('NCR-000001'))
  })

  it('sin permiso ventas.nota_credito: exige PIN de supervisor antes de emitir', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
  })

  it('Slice 3 (unificacion-modal-nc, Design §D2 — reemplaza el test "EFECTIVO_REAL reachable"): entryPoint POS + sesion activa + modalidad SALDO_FAVOR via "Credito a favor" (EFECTIVO_REAL ya no es alcanzable desde la UI POS, el select "Modalidad de liquidacion" fue eliminado — ver Design §D2)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      sesionCajaActivaId: 'sesion-1',
      modalidad: 'SALDO_FAVOR',
    })
    expect(mockedCrearNotaCredito.mock.calls[0][0].tipo).toBeUndefined()
  })

  it('FIX obs #4013/#4007 (nc-parcial-devolver-dinero, PR2): PARCIAL + "Devolver dinero" ya NO cae en el boton generico con modalidad AJUSTE_CXC — enruta a RefundTesoreriaForm con modalidad REFUND_TESORERIA y tipo PARCIAL + lineas (antes de este fix se perdia el egreso real de tesoreria/sesion; ver test dedicado de la suite PR2 mas abajo para el wiring completo)', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    // El boton generico "Confirmar Nota de Credito Parcial" ya NO aparece
    // para esta combinacion — RefundTesoreriaForm lo reemplaza.
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('mock-refund-tesoreria-form')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      tipo: 'PARCIAL',
      modalidad: 'REFUND_TESORERIA',
      lineas: [{ venta_det_id: 'vd-1', cantidadDevolver: '2.000' }],
      egresoParams: [
        expect.objectContaining({ destino: 'SESION_CAJA', sesionCajaId: sesionActiva.id }),
      ],
    })
  })

  it('por defecto (sin autorizar PIN B) NO pasa depositoReingresoId — usa el riel automatico', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
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

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)

    expect(screen.getByText(/Automatico/i)).toBeInTheDocument()
    // Slice 3 (unificacion-modal-nc, Design §D2): el select "Modalidad de
    // liquidacion" fue eliminado (reemplazado por `OrigenReversoSelector`,
    // botones, no combobox) — sin autorizar PIN B, NINGUN combobox esta
    // presente todavia (el select de deposito solo aparece autorizado).
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByText('Deposito Secundario')).not.toBeInTheDocument()
  })

  it('click en "Cambiar deposito" abre un PIN de supervisor SEPARADO del PIN de emision (PIN A), incluso con permiso de emision', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Cambiar deposito de reingreso/i)).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('tras autorizar PIN B: aparece el selector de deposito y la eleccion del usuario se envia como depositoReingresoId', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))

    const selects = screen.getAllByRole('combobox')
    const depositoSelect = selects[selects.length - 1]
    await user.selectOptions(depositoSelect, 'dep-1')
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].depositoReingresoId).toBe('dep-1')
  })

  it('UX C QA fix (Slice 5e): PIN B autorizado pero sin deposito elegido todavia — "Confirmar Anulacion" queda bloqueado, NUNCA cae en silencio al riel automatico (antes de este fix si lo hacia)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeDisabled()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('UX B (Slice 5e): hacer clic en "Volver" (deseleccionar factura) limpia la autorizacion del PIN de deposito (PIN B) — al re-seleccionar la misma factura, el selector vuelve a "Automatico"', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))
    expect(screen.queryByText(/Automatico/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Volver$/i }))
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)

    expect(screen.getByText(/Automatico/i)).toBeInTheDocument()
  })

  it('UX B (Slice 5e): seleccionar una factura DISTINTA limpia la autorizacion previa del PIN de deposito (PIN B)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-1', nro_factura: 'C01-000001' }),
        facturaSesion({ id: 'venta-2', nro_factura: 'C01-000002' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))
    expect(screen.queryByText(/Automatico/i)).not.toBeInTheDocument()

    await user.click(screen.getByText(/C01-000002/i))
    await revelarSeccionNc(user)

    expect(screen.getByText(/Automatico/i)).toBeInTheDocument()
  })

  it('PIN A y PIN B son independientes: sin permiso de emision, autorizar PIN B para el deposito NO exime del PIN A al confirmar', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)

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

  it('BUG 3 (QA C, Slice 5g): PIN A autorizado mientras PIN B quedo autorizado SIN deposito elegido — NUNCA debe emitir la NC (el callback async de PIN A debe revalidar depositoInvalido, igual que los handlers sincronos)', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)

    // Sin autorizar PIN B todavia, el riel es automatico -> depositoInvalido
    // es false y "Confirmar Anulacion" esta habilitado. Sin permiso de
    // emision, esto abre el PIN A (emision) y lo deja pendiente.
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))
    expect(screen.getByText(/Emision de Nota de Credito/i)).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    // Con el PIN A todavia pendiente de autorizar, el usuario abre y
    // autoriza el PIN B (deposito) SIN elegir un deposito concreto — el
    // selector de deposito de reingreso queda con el placeholder vacio.
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    const pinBDialog = screen
      .getByText(/Cambiar deposito de reingreso/i)
      .closest('[data-testid="mock-pin-dialog"]') as HTMLElement
    await user.click(within(pinBDialog).getByText('Autorizar'))

    // Ahora se autoriza el PIN A (emision), que estaba pendiente desde
    // antes — el deposito de reingreso NUNCA fue elegido. Antes de este
    // fix, el callback `onAuthorized` de PIN A no revalidaba
    // `depositoInvalido` y emitia la NC igual, cayendo en silencio al riel
    // automatico del backend.
    const pinADialog = screen
      .getByText(/Emision de Nota de Credito/i)
      .closest('[data-testid="mock-pin-dialog"]') as HTMLElement
    await user.click(within(pinADialog).getByText('Autorizar'))

    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })
})

describe('NotaCreditoPosModal — Slice 5e UX C (deposito de reingreso no puede quedar vacio al confirmar)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TOTAL: tras autorizar PIN B sin elegir deposito, "Confirmar Anulacion" queda deshabilitado y se muestra el mensaje de validacion', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeDisabled()
    expect(screen.getByText(/Debes seleccionar el deposito de reingreso/i)).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('TOTAL: elegir un deposito concreto habilita "Confirmar Anulacion" y limpia el mensaje de validacion', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[selects.length - 1], 'dep-1')

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).not.toBeDisabled()
    expect(screen.queryByText(/Debes seleccionar el deposito de reingreso/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))
    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
  })

  it('sin autorizar PIN B (riel automatico): "Confirmar Anulacion" nunca se bloquea por deposito', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).not.toBeDisabled()
    expect(screen.queryByText(/Debes seleccionar el deposito de reingreso/i)).not.toBeInTheDocument()
  })

  it('PARCIAL: tras autorizar PIN B sin elegir deposito, "Confirmar Nota de Credito Parcial" queda deshabilitado aun con cantidad valida', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))
    await user.type(screen.getByRole('spinbutton'), '2')

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeDisabled()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
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

  it('factura Abonada + badge acumulado PARCIAL muestra AMBOS badges en la misma fila', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_usd: '30.00', saldo_pend_usd: '10.00', tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: { 'venta-1': 'PARCIAL' }, isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Abonada')).toBeInTheDocument()
    expect(screen.getByText('Reverso Parcial')).toBeInTheDocument()
  })

  it('Slice 5e QA fix 3.5: el badge de reverso refleja lo ACUMULADO (via useBadgesReversoSesion), no el tipo de una NC individual — parcial acumulado a 100% muestra "Reverso Total", no "Reverso Parcial"', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      // El flag por-NC dice "parcial" (existe una NC tipo PARCIAL)...
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    // ...pero la acumulacion real (varias NCs PARCIALes sumando el 100%) es TOTAL.
    mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: { 'venta-1': 'TOTAL' }, isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Reverso Total')).toBeInTheDocument()
    expect(screen.queryByText('Reverso Parcial')).not.toBeInTheDocument()
    // BUG D fix: reverso TOTAL suprime el badge de pago, aunque la factura
    // tenga saldo_pend_usd == total_usd (que solo mostraria "Contado").
    expect(screen.queryByText('Contado')).not.toBeInTheDocument()
  })

  it('Slice 5e QA fix 3.5: sin entrada en badgesPorVenta para la factura, no muestra ningun badge de reverso', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({ facturas: [facturaSesion()], isLoading: false })
    mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: {}, isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.queryByText('Reverso Total')).not.toBeInTheDocument()
    expect(screen.queryByText('Reverso Parcial')).not.toBeInTheDocument()
  })

  it('F2 QA fix: Contado, Crédito y Abonada usan cada uno un color de badge distinto (antes compartian el mismo gris)', () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [
        facturaSesion({ id: 'venta-contado', nro_factura: 'C01-000001', total_usd: '30.00', saldo_pend_usd: '0.00' }),
        facturaSesion({ id: 'venta-credito', nro_factura: 'C01-000002', total_usd: '30.00', saldo_pend_usd: '30.00' }),
        facturaSesion({ id: 'venta-abonada', nro_factura: 'C01-000003', total_usd: '30.00', saldo_pend_usd: '10.00' }),
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const claseContado = screen.getByText('Contado').className
    const claseCredito = screen.getByText('Crédito').className
    const claseAbonada = screen.getByText('Abonada').className

    expect(claseContado).not.toBe(claseCredito)
    expect(claseContado).not.toBe(claseAbonada)
    expect(claseCredito).not.toBe(claseAbonada)
  })

  it('F1 QA fix: factura con tiene_reverso_total=1 (status ANULADA) permanece SELECCIONABLE — clickearla SI muestra su detalle, pero la ACCION "Nota de credito" queda bloqueada (read-only)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ status: 'ANULADA', tiene_reverso_total: 1 })],
      isLoading: false,
    })
    mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: { 'venta-1': 'TOTAL' }, isLoading: false })
    // QA fix 5f: el gating de accion ahora deriva del acumulado por-linea
    // (detalle + reversos), NUNCA de los flags crudos — la unica linea de
    // la factura fue reversada al 100% por su unica NC TOTAL.
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-1', nro_ncr: 'NCR-000001', tipo: 'TOTAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '5.000' },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Reverso Total')).toBeInTheDocument()
    expect(screen.getByText(/C01-000001/i)).toBeInTheDocument()
    // BUG D fix: la factura (status ANULADA, 100% reversada) ya NO combina
    // "Reverso Total" con su badge de metodo de pago previo ("Contado").
    expect(screen.queryByText('Contado')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))

    // SELECCION funciona: el detalle de la factura se muestra (panel montado).
    expect(screen.getAllByText(/C01-000001/i).length).toBeGreaterThan(0)
    // ACCION bloqueada: no se ofrece emitir otra NC sobre esta factura.
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Parcial' })).not.toBeInTheDocument()
    expect(screen.getByText(/ya fue reversada totalmente/i)).toBeInTheDocument()
  })

  it('F1 QA fix: factura con tiene_reverso_parcial=1 (sin total) — la accion SIGUE disponible pero el tipo TOTAL ya no se ofrece, solo PARCIAL sobre el remanente', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    // QA fix 5f: el gating de TOTAL ahora deriva del acumulado por-linea —
    // una NC PARCIAL previa que NO completa el 100% (2 de 5) bloquea TOTAL
    // pero deja PARCIAL disponible sobre el remanente.
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-0', nro_ncr: 'NCR-000000', tipo: 'PARCIAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '2.000' },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)

    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    // Item 5 (ajustes-qa-nota-credito-pos-modal): PARCIAL tampoco se
    // preselecciona, ni siquiera cuando es la unica opcion disponible.
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
  })

  it('QA fix 5f (consistencia badge/gating, obs verify-combined-final-v2): DOS NCs PARCIALes que juntas reversan el 100% de la unica linea -> el badge ya dice "Reverso Total" Y la accion queda bloqueada (read-only), consistentes por construccion', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      // El flag por-NC dice "parcial" (ninguna NC individual es tipo TOTAL)...
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    // ...pero el badge acumulado (misma fuente que el gating tras este fix)
    // ya dice TOTAL: dos NCs PARCIALes (2 + 3) suman exactamente los 5
    // facturados.
    mockedUseBadgesReversoSesion.mockReturnValue({ badgesPorVenta: { 'venta-1': 'TOTAL' }, isLoading: false })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-0', nro_ncr: 'NCR-000000', tipo: 'PARCIAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '2.000' },
        { nota_credito_id: 'nc-1', nro_ncr: 'NCR-000001', tipo: 'PARCIAL', fecha: '2026-01-02T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '3.000' },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByText('Reverso Total')).toBeInTheDocument()
    // BUG D fix: dos NCs PARCIALes que ACUMULAN el 100% (sin ninguna NC
    // tipo TOTAL literal) tambien deben suprimir el badge de pago.
    expect(screen.queryByText('Contado')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))

    // ANTES del fix 5f: el gating leia `tiene_reverso_total` (crudo, aun 0
    // aqui porque ninguna NC individual es TOTAL) y mostraba el formulario
    // interactivo — INCONSISTENTE con el badge de arriba. DESPUES: bloqueado.
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Total' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Parcial' })).not.toBeInTheDocument()
    expect(screen.getByText(/ya fue reversada totalmente/i)).toBeInTheDocument()
  })

  it('F1+F6 QA fix: linea ya parcialmente reversada limita el stepper de SeleccionLineasNc al REMANENTE — el input RECHAZA valores por encima, no a lo facturado originalmente', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    // Ya se acredito 3 de 5 en una NC previa — el remanente real es 2.
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-0', nro_ncr: 'NCR-000000', tipo: 'PARCIAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '3.000' },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '9')

    expect(screen.getByRole('spinbutton')).toHaveValue(null)

    await user.type(screen.getByRole('spinbutton'), '2')
    expect(screen.getByRole('spinbutton')).toHaveValue(2)
  })

  it('F1 QA fix: el panel muestra el historial de NC(s) aplicadas junto al detalle original de la factura', async () => {
    setup({ hasPermission: true })
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-1', nro_ncr: 'NCR-000005', tipo: 'PARCIAL', fecha: '2026-01-02T00:00:00Z', venta_det_id: 'vd-9', producto_descripcion: 'Botox 50U', cantidad: '1.000' },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.getByText(/Notas de credito aplicadas/i)).toBeInTheDocument()
    expect(screen.getByText('NCR-000005')).toBeInTheDocument()
  })

  it('factura con tiene_reverso_parcial=1 pero status activo sigue siendo clickable (puede recibir otra NC parcial); tampoco preselecciona PARCIAL automaticamente (Item 5, ajustes-qa-nota-credito-pos-modal: ningun tipo se preselecciona, ni siquiera con reverso parcial previo)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ tiene_reverso_parcial: 1 })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = userEvent.setup()
    await user.click(screen.getByText(/C01-000001/i))
    await revelarSeccionNc(user)

    // TOTAL ya no es opcion valida sobre una factura con reverso parcial
    // previo (puedeTotal=false) y PARCIAL ya no se preselecciona: hay que
    // elegirlo explicitamente.
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
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

  it('Slice 5d: NUNCA muestra la seccion de afectacion a cuentas por cobrar (dato no confiable en flujo SAF, obs #2896/#2897)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    expect(screen.queryByText(/afect(o|ó) cuentas por cobrar/i)).not.toBeInTheDocument()
  })

  it('el listado sigue visible en la columna izquierda incluso con una factura seleccionada (layout de dos columnas, no drill-down)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)

    expect(screen.getAllByText(/C01-000001/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })
})

describe('NotaCreditoPosModal — Slice 3b (eleccion TOTAL/PARCIAL, wiring completo a crearNotaCredito, Design §Decision 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function detalleUnaLinea() {
    return [
      {
        id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
        precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
        producto_nombre: 'Botox 50U', producto_codigo: 'P001',
        tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
      },
    ]
  }

  it('tras seleccionar una factura, se ofrece explicitamente elegir entre Total y Parcial, sin preseleccion (Item 5, ajustes-qa-nota-credito-pos-modal)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)

    expect(screen.getByRole('button', { name: 'Total' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parcial' })).toBeInTheDocument()
    // Ningun tipo esta preseleccionado al revelar: ni el aria-pressed de
    // ambos botones esta activo, ni ninguna UI de confirmacion se muestra.
    expect(screen.getByRole('button', { name: 'Total' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Parcial' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()
  })

  it('elegir Parcial reemplaza el footer "Confirmar Anulacion" por la seleccion de lineas (SeleccionLineasNc) y NO llama crearNotaCredito todavia', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('Scenario "Articulos a devolver" (Slice 2, D4 de unificacion-modal-nc; target actualizado en Slice 3 — el select "Modalidad de liquidacion" fue reemplazado por "Origen del reverso"): eligiendo Parcial, la tabla de SeleccionLineasNc se renderiza ANTES que "Origen del reverso" en el DOM', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    // QA fix (Fix 2): el boton de confirmar ya NO vive dentro de
    // `SeleccionLineasNc` en este modal (se movio a la seccion final,
    // ver test dedicado mas abajo) — el anclaje de posicion pasa a ser la
    // tabla de articulos en si.
    // NC-parcial QA: el modal renderiza DOS tablas en este estado (el panel
    // de detalle de la factura "Articulo/Cant./P.Unit./Total" y la de
    // `SeleccionLineasNc` "Producto/Facturado/A devolver"). Anclamos a la
    // segunda por su encabezado distintivo "A devolver" para evitar la
    // ambiguedad de `getByRole('table')` (pre-existente, latente hasta que
    // el fix del render-loop permitio ejecutar este test).
    const tablaArticulos = screen.getByRole('columnheader', { name: /A devolver/i }).closest('table')!
    const origenReverso = screen.getByText('Origen del reverso')
    expect(
      tablaArticulos.compareDocumentPosition(origenReverso) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('QA fix (Fix 2, unificacion-modal-nc): el boton "Confirmar Nota de Credito Parcial" se renderiza en la seccion FINAL del modal (despues de Modalidad/Deposito/Motivo), en la MISMA posicion que "Confirmar Anulacion" para TOTAL — ya no "salta" de lugar segun el tipo', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))

    const motivo = screen.getByPlaceholderText(/Motivo de la anulacion/i)
    const confirmarParcial = screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })
    expect(
      motivo.compareDocumentPosition(confirmarParcial) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    // Exactamente UN boton de confirmar visible — no queda un boton
    // "fantasma" dentro de SeleccionLineasNc ademas del externo.
    expect(screen.getAllByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toHaveLength(1)

    // Cambiar a Total: el mismo slot fisico (seccion final) ahora muestra
    // "Confirmar Anulacion" en vez de "Confirmar Nota de Credito Parcial".
    // Slice 3: el bloque TOTAL exige ADEMAS "Credito a favor" (ver
    // `elegirTotal`) — sin elegir origen quedaria en el estado transicional.
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
    const confirmarTotal = screen.getByRole('button', { name: /Confirmar Anulacion/i })
    expect(
      motivo.compareDocumentPosition(confirmarTotal) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('con permiso: PARCIAL completo ingresando cantidad y confirmando invoca crearNotaCredito con tipo=PARCIAL y las lineas mapeadas', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    // Slice 3 (unificacion-modal-nc): Confirmar exige Origen elegido (origenPendiente).
    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
    await user.click(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      venta_id: 'venta-1',
      entryPoint: 'POS',
      tipo: 'PARCIAL',
      lineas: [{ venta_det_id: 'vd-1', cantidadDevolver: '2.000' }],
    })
  })

  it('sin permiso: confirmar PARCIAL exige el mismo PIN de emision (PIN A) y, autorizado, invoca crearNotaCredito con tipo=PARCIAL', async () => {
    setup({ hasPermission: false })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '1')
    // Slice 3 (unificacion-modal-nc): Confirmar exige Origen elegido (origenPendiente).
    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))
    await user.click(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      tipo: 'PARCIAL',
      lineas: [{ venta_det_id: 'vd-1', cantidadDevolver: '1.000' }],
    })
  })

  it('NC TOTAL sigue sin enviar tipo/lineas (contrato preservado byte-a-byte, Spec: NC TOTAL reversa completa)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0].tipo).toBeUndefined()
    expect(mockedCrearNotaCredito.mock.calls[0][0].lineas).toBeUndefined()
  })
})

/**
 * Slice 3 (unificacion-modal-nc, Design §D1/D2/D4, Spec notas-credito-pos:
 * "Orden del flujo tras revelar la seccion de NC en POS" y "Gestion de
 * vueltos en POS — Devolver dinero y Credito a favor"). POS adopta el
 * mismo modelo `origenReverso` de `crear-ncr-modal.tsx`: el select
 * "Modalidad de liquidacion" desaparece, reemplazado por
 * `OrigenReversoSelector` (compartido). "Devolver dinero" (TOTAL) queda
 * transicional en este slice — Slice 4 conecta `RefundTesoreriaForm`
 * restringido + PIN C.
 */
describe('NotaCreditoPosModal — Slice 3 (Origen del reverso reemplaza Modalidad de liquidacion, Design §D1/D2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Requirement "Orden del flujo": el deposito de reingreso aparece ANTES que los botones Total/Parcial en el DOM', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)

    const deposito = screen.getByText('Deposito de reingreso de stock')
    const total = screen.getByRole('button', { name: 'Total' })
    expect(deposito.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('tras elegir Total o Parcial, ofrece "Devolver dinero" y "Credito a favor" (mismas opciones que admin) en vez del select "Modalidad de liquidacion"', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))

    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toBeInTheDocument()
    expect(screen.queryByText('Modalidad de liquidacion')).not.toBeInTheDocument()
    // Sin preseleccion — ninguno de los dos botones arranca activo.
    expect(screen.getByRole('button', { name: 'Devolver dinero' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Credito a favor' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('TOTAL + "Devolver dinero" revela RefundTesoreriaForm restringido a la sesion propia del cajero (Slice 4 cierra el gap transicional de Slice 3, NO el bloque "Confirmar Anulacion"/aviso irreversible de Credito a favor)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute(
      'data-restringir-origen-sesion-id',
      sesionActiva.id
    )
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Esta accion es irreversible/i)).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('TOTAL + "Credito a favor" SI revela el aviso irreversible y "Confirmar Anulacion" (unico origen accionable en este slice)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))

    expect(screen.getByText(/Esta accion es irreversible/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })

  it('PARCIAL: con cantidad valida pero SIN elegir Origen del reverso, "Confirmar Nota de Credito Parcial" permanece deshabilitado (origenPendiente); tras elegir Origen se habilita', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({
      detalle: [
        {
          id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
          precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
          producto_nombre: 'Botox 50U', producto_codigo: 'P001',
          tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
        },
      ],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).toBeDisabled()
    expect(screen.getByText(/Debes elegir el origen del reverso antes de confirmar/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))

    expect(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeDisabled()
  })

  it('nc-factura-credito-ux: factura 100% credito (saldo_pend_usd === total_usd) — confirmar TOTAL SIN elegir origen invoca crearNotaCredito con modalidad SALDO_FAVOR (soloCancelaDeuda)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_usd: '80.00', saldo_pend_usd: '80.00' })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))

    // Sin remanente: el panel NO ofrece "Devolver dinero"/"Credito a favor".
    expect(screen.queryByRole('button', { name: 'Devolver dinero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Credito a favor' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Esta nota de crédito cancela $80.00 de la deuda pendiente de la factura.')
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito.mock.calls[0][0]).toMatchObject({
      entryPoint: 'POS',
      sesionCajaActivaId: sesionActiva.id,
      modalidad: 'SALDO_FAVOR',
    })
  })

  it('nc-factura-credito-ux: factura mixta (con remanente) — "Confirmar Anulacion" NO aparece hasta elegir origen (regresion)', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      facturas: [facturaSesion({ total_usd: '100.00', saldo_pend_usd: '40.00' })],
      isLoading: false,
    })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))

    expect(
      screen.getByText('De $100.00: $40.00 cancela deuda pendiente, $60.00 disponible')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar Anulacion/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))

    expect(screen.getByRole('button', { name: /Confirmar Anulacion/i })).toBeInTheDocument()
  })
})

/**
 * Slice 4 (unificacion-modal-nc, Design §D3/D5): POS gana `RefundTesoreriaForm`
 * restringido a la sesion propia + PIN C (Tesoreria), cerrando el gap
 * transicional de Slice 3. `RefundTesoreriaForm` esta mockeado (ver arriba)
 * porque su comportamiento interno ya esta cubierto end-to-end en
 * `refund-tesoreria-form.test.tsx` — aqui se prueba SOLO el wiring del modal:
 * que props recibe, cuando aparece/desaparece el link de PIN C, y que
 * `crearNotaCredito` recibe los literales correctos al confirmar.
 *
 * NOTA (harness #3900): esta suite completa (`nota-credito-pos-modal.test.tsx`)
 * paga ~80s de "collect" (cadena de import PowerSync/WASM) y el worker de
 * Vitest puede morir con `ERR_IPC_CHANNEL_CLOSED` — estos tests fueron
 * escritos en RED siguiendo el patron ya usado en el resto del archivo y
 * verificados por LECTURA DE CODIGO cuidadosa contra la implementacion real
 * de `nota-credito-pos-modal.tsx`, NO ejecutados en este batch de apply.
 */
describe('NotaCreditoPosModal — Slice 4 (RefundTesoreriaForm restringido + PIN C, Design §D3/D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('link "Usar Tesoreria (requiere PIN)" es visible con Tesoreria oculta (mostrarOrigenTesoreria=false) hasta autorizar PIN C; tras autorizar, Tesoreria queda disponible y el link desaparece', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute(
      'data-mostrar-origen-tesoreria',
      'false'
    )
    expect(screen.getByRole('button', { name: /Usar Tesoreria \(requiere PIN\)/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Usar Tesoreria \(requiere PIN\)/i }))
    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Usar Tesoreria para el reembolso/i)).toBeInTheDocument()

    await user.click(screen.getByText('Autorizar'))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute(
      'data-mostrar-origen-tesoreria',
      'true'
    )
    expect(screen.queryByRole('button', { name: /Usar Tesoreria \(requiere PIN\)/i })).not.toBeInTheDocument()
  })

  it('PIN C (Tesoreria) autorizado NO habilita el deposito de reingreso (PIN B) ni salta el PIN A de otra accion (Editar metodos de pago) — 3 gates independientes (Design §D3)', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))
    await user.click(screen.getByRole('button', { name: /Usar Tesoreria \(requiere PIN\)/i }))
    await user.click(screen.getByText('Autorizar'))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute(
      'data-mostrar-origen-tesoreria',
      'true'
    )

    // PIN B (deposito) sigue pidiendo SU PROPIA autorizacion — PIN C no la
    // sustituye: el dialogo de PIN B se abre igual, con su propio titulo.
    expect(screen.getByText(/Automatico \(riel de deposito principal\)/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    expect(screen.getByText(/Cambiar deposito de reingreso/i)).toBeInTheDocument()

    // PIN A (via "Editar metodos de pago") tambien sigue pidiendo su propia
    // autorizacion, sin importar que PIN C ya este autorizado.
    await user.click(screen.getByRole('button', { name: /Editar metodos de pago/i }))
    expect(screen.getByText(/Emision de Nota de Credito/i)).toBeInTheDocument()
  })

  it('confirmar el reembolso (RefundTesoreriaForm) invoca crearNotaCredito con entryPoint POS, sesionCajaActivaId, modalidad REFUND_TESORERIA y tipo TOTAL (mirror de emitirNcRefund de crear-ncr-modal.tsx con literales de POS)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito).toHaveBeenCalledWith(
      expect.objectContaining({
        entryPoint: 'POS',
        sesionCajaActivaId: sesionActiva.id,
        modalidad: 'REFUND_TESORERIA',
        tipo: 'TOTAL',
      })
    )
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('tras confirmar el reembolso exitosamente, el modal permanece abierto (Behavior F) y las autorizaciones de PIN (incluida PIN C) se resetean', async () => {
    setup({ hasPermission: true })
    const onClose = vi.fn()
    render(<NotaCreditoPosModal isOpen onClose={onClose} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))
    await user.click(screen.getByRole('button', { name: /Usar Tesoreria \(requiere PIN\)/i }))
    await user.click(screen.getByText('Autorizar'))

    await user.click(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i }))
    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))

    expect(onClose).not.toHaveBeenCalled()
    // `origenReverso` se resetea a null tras exito (mismo patron que
    // `emitirNc`) — el catch-all "Selecciona un origen del reverso..." vuelve.
    expect(screen.getByText(/Selecciona un origen del reverso para continuar\./i)).toBeInTheDocument()
  })
})

/**
 * PR2 (nc-parcial-devolver-dinero, apply-progress obs #4019): "Devolver
 * dinero" enruta a `RefundTesoreriaForm` SIN IMPORTAR `tipoNc` —
 * `debeUsarRefundTesoreria` (PR1, capa pura) es el UNICO criterio del gate.
 * Antes de este fix (obs #4013/#4007), PARCIAL + "Devolver dinero" caia en
 * el boton generico "Confirmar Nota de Credito Parcial" con
 * `modalidad:'AJUSTE_CXC'` (fallback), perdiendo el egreso real de
 * tesoreria/sesion — ver el test renombrado "FIX obs #4013/#4007" mas
 * arriba (Slice 5a-2a) para la caracterizacion del wiring completo de
 * `crearNotaCredito`. Esta suite cubre el resto del contrato: que boton se
 * renderiza, que monto disponible recibe `RefundTesoreriaForm` (suma de
 * lineas seleccionadas, NUNCA `factura.total_usd`) y el gate
 * `disabledExterno` mientras las lineas todavia no son validas.
 */
describe('NotaCreditoPosModal — PR2 (nc-parcial-devolver-dinero): PARCIAL + Devolver dinero enruta a RefundTesoreriaForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function detalleUnaLinea() {
    return [
      {
        id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
        precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
        producto_nombre: 'Botox 50U', producto_codigo: 'P001',
        tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
      },
    ]
  }

  it('PARCIAL + "Devolver dinero" renderiza RefundTesoreriaForm en vez del boton "Confirmar Nota de Credito Parcial"', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toBeInTheDocument()
    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute(
      'data-restringir-origen-sesion-id',
      sesionActiva.id
    )
    expect(screen.queryByRole('button', { name: /Confirmar Nota de Credito Parcial/i })).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('el monto disponible pasado a RefundTesoreriaForm refleja la SUMA de las lineas seleccionadas, no el total completo de la factura', async () => {
    setup({ hasPermission: true })
    mockedUseFacturasSesionActiva.mockReturnValue({
      // total_usd deliberadamente MUY por encima de lo que suman las 2
      // unidades seleccionadas (~23.2 con 16% de IVA) — si el modal usara
      // `factura.total_usd` en vez de la suma de lineas, esta aserción lo
      // detectaria (regresion al bug de sobre-estimar el disponible).
      facturas: [facturaSesion({ total_usd: '100.00', saldo_pend_usd: '0.00' })],
      isLoading: false,
    })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    // 2 unidades x $10.00 = $20.00 base + 16% IVA ($3.20) = $23.20 — MISMA
    // formula pura que `previewMontoBsNc`/`buildReciboData` ya usan para el
    // preview "Total a devolver" de `SeleccionLineasNc` (cero calculo
    // paralelo). saldo_pend_usd=0 -> `calcularMontoDisponibleRefund` no
    // resta nada, el disponible es exactamente ese preview.
    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-monto-disponible-usd', '23.2')
  })

  it('sin lineas validas todavia (cantidad 0), "Confirmar reembolso" queda deshabilitado (disabledExterno); tras ingresar una cantidad valida se habilita', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'true')
    expect(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i })).toBeDisabled()

    await user.type(screen.getByRole('spinbutton'), '2')

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'false')
    expect(screen.getByRole('button', { name: /Confirmar reembolso \(mock\)/i })).not.toBeDisabled()
  })

  it('TOTAL + "Devolver dinero" sigue sin `disabledExterno` (caracterizacion, comportamiento preexistente sin cambios)', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Total' }))
    await user.click(screen.getByRole('button', { name: 'Devolver dinero' }))

    expect(screen.getByTestId('mock-refund-tesoreria-form')).toHaveAttribute('data-disabled-externo', 'false')
  })
})

describe('NotaCreditoPosModal — Slice 4 (placeholder "Editar metodos de pago" + gating PIN A extendido, Design §Decision 9)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('con permiso: click en "Editar metodos de pago" dispara un aviso de funcion no implementada y NUNCA llama crearNotaCredito', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: /Editar metodos de pago/i }))

    expect(mockedToastInfo).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('mock-pin-dialog')).not.toBeInTheDocument()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('sin permiso: click en "Editar metodos de pago" exige el MISMO PIN de supervisor que emision (PIN A)', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: /Editar metodos de pago/i }))

    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    expect(screen.getByText(/Emision de Nota de Credito/i)).toBeInTheDocument()
    expect(mockedToastInfo).not.toHaveBeenCalled()
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByText('Autorizar'))

    await waitFor(() => expect(mockedToastInfo).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()
  })

  it('las dos acciones pendientes (NC y Editar metodos de pago) son independientes en la misma sesion del modal: autorizar cada una dispara solo la accion correcta', async () => {
    setup({ hasPermission: false })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)

    await user.click(screen.getByRole('button', { name: /Editar metodos de pago/i }))
    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    await user.click(screen.getByText('Autorizar'))
    await waitFor(() => expect(mockedToastInfo).toHaveBeenCalledTimes(1))
    expect(mockedCrearNotaCredito).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))
    expect(screen.getByTestId('mock-pin-dialog')).toBeInTheDocument()
    await user.click(screen.getByText('Autorizar'))
    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(mockedToastInfo).toHaveBeenCalledTimes(1)
  })
})

describe('NotaCreditoPosModal — Slice 5g.5 (behavior F: el modal permanece abierto y se refresca en el lugar tras una emision exitosa)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function detalleUnaLinea() {
    return [
      {
        id: 'vd-1', venta_id: 'venta-1', producto_id: 'p1', cantidad: '5',
        precio_unitario_usd: '10.00', subtotal_usd: '50.00', subtotal_bs: '2000.00',
        producto_nombre: 'Botox 50U', producto_codigo: 'P001',
        tipo_impuesto: 'Gravable', impuesto_pct: '16', es_decimal: 0, precio_unitario_bs: '400.00',
      },
    ]
  }

  it('tras una emision TOTAL exitosa, el modal permanece abierto (onClose NO se llama) y la factura sigue seleccionada', async () => {
    setup({ hasPermission: true })
    const onClose = vi.fn()
    render(<NotaCreditoPosModal isOpen onClose={onClose} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))

    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getAllByText(/C01-000001/i).length).toBeGreaterThan(0)
  })

  it('tras una emision PARCIAL exitosa, SeleccionLineasNc se remonta: la cantidad ingresada se resetea a vacio (anti double-submit), aunque la factura siga seleccionada', async () => {
    setup({ hasPermission: true })
    mockedUseDetalleFactura.mockReturnValue({ detalle: detalleUnaLinea(), isLoading: false })
    const { rerender } = render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await user.click(screen.getByRole('button', { name: 'Parcial' }))
    await user.type(screen.getByRole('spinbutton'), '2')
    expect(screen.getByRole('spinbutton')).toHaveValue(2)
    // Slice 3 (unificacion-modal-nc): Confirmar exige Origen elegido (origenPendiente).
    await user.click(screen.getByRole('button', { name: 'Credito a favor' }))

    await user.click(screen.getByRole('button', { name: /Confirmar Nota de Credito Parcial/i }))
    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))

    // Simula el refresco de la live-query tras el commit de la transaccion:
    // el remanente ya refleja la NC parcial recien creada.
    mockedUseReversosFactura.mockReturnValue({
      reversos: [
        { nota_credito_id: 'nc-1', nro_ncr: 'NCR-000001', tipo: 'PARCIAL', fecha: '2026-01-01T00:00:00Z', venta_det_id: 'vd-1', producto_descripcion: 'Botox 50U', cantidad: '2.000' },
      ],
      isLoading: false,
    })
    rerender(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    expect(screen.getByRole('spinbutton')).toHaveValue(null)
  })

  it('tras una emision exitosa, la autorizacion del PIN de deposito (PIN B) se limpia: el selector vuelve a "Automatico" para la siguiente accion sobre la misma factura', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await revelarSeccionNc(user)
    await elegirTotal(user)
    await user.click(screen.getByRole('button', { name: /Cambiar deposito/i }))
    await user.click(screen.getByText('Autorizar'))
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[selects.length - 1], 'dep-1')
    expect(screen.queryByText(/Automatico/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Confirmar Anulacion/i }))
    await waitFor(() => expect(mockedCrearNotaCredito).toHaveBeenCalledTimes(1))

    expect(screen.getByText(/Automatico/i)).toBeInTheDocument()
  })
})

/**
 * Responsive master-detail (nota-credito-pos-modal-responsive, Spec
 * notas-credito-pos: "Diseño responsivo del modal"). jsdom NO calcula
 * visibilidad CSS real (no interpreta `@media (min-width: 768px)`), por lo
 * que estas pruebas verifican el CONTRATO comprobable en este entorno: la
 * presencia/ausencia de la clase `hidden` segun el estado `factura`
 * (null/no-null), que es exactamente lo que decide si mobile (`<md`) oculta
 * o muestra cada columna. La confirmacion visual real en viewport movil
 * (columna oculta de verdad, sin scroll forzado) es un gate MANUAL — no
 * automatizable en jsdom (ver tasks.md 3.3).
 */
describe('NotaCreditoPosModal — responsive master-detail (nota-credito-pos-modal-responsive)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sin factura seleccionada: la columna de listado no lleva la clase mobile "hidden" y la columna de detalle si la lleva', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const columnaLista = screen.getByTestId('nc-pos-columna-lista')
    const columnaDetalle = screen.getByTestId('nc-pos-columna-detalle')

    expect(columnaLista.className.split(/\s+/)).not.toContain('hidden')
    expect(columnaDetalle.className.split(/\s+/)).toContain('hidden')
  })

  it('al seleccionar una factura: la columna de listado pasa a "hidden" y la columna de detalle deja de tenerla', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    await seleccionarPrimeraFactura()

    const columnaLista = screen.getByTestId('nc-pos-columna-lista')
    const columnaDetalle = screen.getByTestId('nc-pos-columna-detalle')

    expect(columnaLista.className.split(/\s+/)).toContain('hidden')
    expect(columnaDetalle.className.split(/\s+/)).not.toContain('hidden')
  })

  it('"Volver" regresa la columna de listado a visible ("hidden" removido) y vuelve a ocultar la columna de detalle', async () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const user = await seleccionarPrimeraFactura()
    await user.click(screen.getByRole('button', { name: /^Volver$/i }))

    const columnaLista = screen.getByTestId('nc-pos-columna-lista')
    const columnaDetalle = screen.getByTestId('nc-pos-columna-detalle')

    expect(columnaLista.className.split(/\s+/)).not.toContain('hidden')
    expect(columnaDetalle.className.split(/\s+/)).toContain('hidden')
  })

  it('el <dialog> combina los tokens full-screen mobile-first con el override md: simultaneamente (desktop sin cambios)', () => {
    setup({ hasPermission: true })
    const { container } = render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const dialogEl = container.querySelector('dialog') as HTMLDialogElement
    const clases = dialogEl.className.split(/\s+/)

    expect(clases).toEqual(
      expect.arrayContaining(['w-screen', 'h-dvh', 'rounded-none', 'md:max-w-4xl', 'md:rounded-lg'])
    )
  })

  it('la columna de detalle ya no fuerza minHeight de 420px via inline style — el minimo queda escopeado a md: como clase', () => {
    setup({ hasPermission: true })
    render(<NotaCreditoPosModal isOpen onClose={() => {}} sesion={sesionActiva} />)

    const columnaDetalle = screen.getByTestId('nc-pos-columna-detalle')

    expect(columnaDetalle.style.minHeight).not.toBe('420px')
    expect(columnaDetalle.className.split(/\s+/)).toContain('md:min-h-[420px]')
  })
})
