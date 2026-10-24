import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { ReversoModal } from '../reverso-modal'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { previewFacturasAfectadas } from '../../hooks/use-preview-facturas-afectadas'
import { reversarMovBancario, reversarMovCajaFuerte } from '../../hooks/use-conciliacion-tesoreria'
import { reversarAbonoDirectoDesdeTesoreria } from '../../hooks/use-reverso-abono-directo'
import type { MovimientoTesoreria } from '../movimientos-table'

/**
 * Slice 1b-panel (preview-facturas-afectadas-reverso-tesoreria, PR #2):
 * cubre el gate de aplicabilidad (origen === TRANSFERENCIA_CLIENTE,
 * reemplazando la condicion muerta `doc_origen_tipo === 'PAGO'`) y los 3
 * estados del panel read-only (OK con facturas, LEGACY, 0-facturas).
 * `previewFacturasAfectadas` ya tiene su propia suite (slice 1a-hook,
 * 6/6 verde) — aqui se mockea en el boundary para probar solo el WIRING
 * del modal (gate -> llamada -> render), sin repetir la logica del hook.
 *
 * Slice 2b-ii (reverso-abono-directo-tesoreria-sin-saf, PR3): cubre el
 * WIRING del submit — branch TRANSFERENCIA_CLIENTE -> orquestador nuevo
 * vs. resto de origenes -> funciones existentes sin cambios (regresion),
 * el gate SAF (boton deshabilitado + guard interno) y el PIN gate
 * (`CXC_REVERSE`, mismo patron que `factura-detalle-cxc.tsx`). El
 * orquestador (`reversarAbonoDirectoDesdeTesoreria`) y las funciones
 * existentes de tesoreria se mockean en el boundary — este slice NO
 * repite su logica interna, ya cubierta en sus propias suites.
 */
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
  PERMISSIONS: { CXC_REVERSE: 'cxc.reversar_abono' },
}))
vi.mock('../../hooks/use-preview-facturas-afectadas', () => ({
  previewFacturasAfectadas: vi.fn(),
}))
vi.mock('../../hooks/use-conciliacion-tesoreria', () => ({
  reversarMovBancario: vi.fn(),
  reversarMovCajaFuerte: vi.fn(),
}))
vi.mock('../../hooks/use-reverso-abono-directo', () => ({
  reversarAbonoDirectoDesdeTesoreria: vi.fn(),
}))
vi.mock('../../hooks/use-traspasos', () => ({ reversarTraspaso: vi.fn() }))
// Mismo criterio que `crear-ncr-modal.test.tsx`: mockeamos el dialogo de
// PIN en el boundary (usa `usePowerSync`/`connector` reales) y exponemos
// un boton de autorizacion simulada para probar el flujo SIN permiso.
vi.mock('@/components/ui/supervisor-pin-dialog', () => ({
  SupervisorPinDialog: ({
    isOpen,
    onAuthorized,
  }: {
    isOpen: boolean
    onAuthorized: (supervisorId: string) => void
  }) =>
    isOpen ? (
      <button type="button" data-testid="mock-pin-authorize" onClick={() => onAuthorized('supervisor-1')}>
        Autorizar PIN (mock)
      </button>
    ) : null,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
// `reversarMovBancario`/`reversarMovCajaFuerte` importan `db` directo
// (modulo que instancia un PowerSyncDatabase real al cargarse) — se
// mockea en el boundary igual que `pago-factura-modal.test.tsx` para
// poder renderizar sin Worker real. Este slice NO toca estas funciones.
vi.mock('@/core/db/powersync/db', () => ({ db: { getAll: vi.fn(), execute: vi.fn() } }))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedPreviewFacturasAfectadas = vi.mocked(previewFacturasAfectadas)
const mockedReversarMovBancario = vi.mocked(reversarMovBancario)
const mockedReversarMovCajaFuerte = vi.mocked(reversarMovCajaFuerte)
const mockedReversarAbonoDirectoDesdeTesoreria = vi.mocked(reversarAbonoDirectoDesdeTesoreria)
const mockedToastError = vi.mocked(toast.error)

function allowCxcReverse() {
  mockedUsePermissions.mockReturnValue({
    hasPermission: (p: string) => p === PERMISSIONS.CXC_REVERSE,
    hasAnyPermission: vi.fn(() => true),
    hasAllPermissions: vi.fn(() => true),
    isOwner: false,
    rolId: 'rol-1',
    rolNombre: 'Supervisor',
    loading: false,
  })
}

function denyCxcReverse() {
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => false,
    hasAnyPermission: vi.fn(() => false),
    hasAllPermissions: vi.fn(() => false),
    isOwner: false,
    rolId: 'rol-2',
    rolNombre: 'Cajero',
    loading: false,
  })
}

async function escribirMotivoYSubmit(motivo = 'Motivo valido de prueba') {
  const input = screen.getByLabelText(/motivo del reverso/i)
  fireEvent.change(input, { target: { value: motivo } })
  const submitButton = screen.getByRole('button', { name: /confirmar reverso/i })
  fireEvent.click(submitButton)
}

function movimiento(overrides: Partial<MovimientoTesoreria> = {}): MovimientoTesoreria {
  return {
    _source: 'BANCO',
    id: 'mov-1',
    empresa_id: 'empresa-1',
    banco_empresa_id: 'banco-1',
    tipo: 'INGRESO',
    origen: 'TRANSFERENCIA_CLIENTE',
    monto: '100.00',
    saldo_anterior: '0.00',
    saldo_nuevo: '100.00',
    doc_origen_id: null,
    doc_origen_tipo: 'PAGO_CXC',
    referencia: null,
    validado: 1,
    validado_por: null,
    validado_at: null,
    observacion: null,
    reversado: 0,
    reverso_de: null,
    descripcion: null,
    fecha: '2026-05-10',
    created_at: '2026-05-10T10:00:00Z',
    created_by: null,
    ...overrides,
  } as MovimientoTesoreria
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Admin', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'empresa-1' },
    loading: false,
  })
  // Default: usuario CON permiso (la mayoria de tests preexistentes no
  // ejercitan el submit; los nuevos tests del PIN gate sobre-escriben
  // con `denyCxcReverse()` cuando necesitan el camino sin permiso).
  allowCxcReverse()
})

describe('ReversoModal — formato del Monto en el header segun moneda', () => {
  const previewVacio = { estado: 'OK' as const, facturasDirectas: [], facturasSaf: [], totalUsd: 0 }

  it('monedaSimbolo="Bs": usa formatBs (ej. "Bs. 100,00"), NO mezcla "Bs" con el "$" de formatUsd', () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue(previewVacio)
    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="Bs" />
    )

    expect(screen.getByText('Bs. 100,00')).toBeInTheDocument()
    // Regresion del bug "Bs $100.00": el simbolo Bs NO debe anteponerse al $
    expect(screen.queryByText(/Bs \$/)).not.toBeInTheDocument()
  })

  it('monedaSimbolo="$": usa formatUsd (ej. "$100.00")', () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue(previewVacio)
    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })
})

describe('ReversoModal — gate de aplicabilidad (origen, no doc_origen_tipo)', () => {
  it('origen !== TRANSFERENCIA_CLIENTE (ej. CIERRE_CONSOLIDACION): NO renderiza el panel ni llama al hook', async () => {
    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ origen: 'CIERRE_CONSOLIDACION', doc_origen_tipo: null })}
        monedaSimbolo="$"
      />
    )

    expect(screen.queryByTestId('preview-facturas-afectadas')).not.toBeInTheDocument()
    expect(mockedPreviewFacturasAfectadas).not.toHaveBeenCalled()
  })

  it('origen === TRANSFERENCIA_CLIENTE con doc_origen_tipo que NO es "PAGO" (caso real: PAGO_CXC): SI renderiza el panel y llama al hook — regresion del bug de la condicion muerta', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [],
      facturasSaf: [],
      totalUsd: 0,
    })

    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ origen: 'TRANSFERENCIA_CLIENTE', doc_origen_tipo: 'PAGO_CXC' })}
        monedaSimbolo="$"
      />
    )

    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalledWith('empresa-1', 'mov-1'))
    expect(screen.getByTestId('preview-facturas-afectadas')).toBeInTheDocument()
  })
})

describe('ReversoModal — panel de facturas afectadas, estado OK', () => {
  it('mientras el hook resuelve: muestra estado de carga, sin facturas ni total', () => {
    mockedPreviewFacturasAfectadas.mockReturnValue(new Promise(() => {}))

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(screen.getByText(/cargando/i)).toBeInTheDocument()
  })

  it('con facturas directas y via SAF: lista ambos grupos distinguidos, cada fila con su nro_factura y monto, y el total', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        {
          ventaId: 'venta-A',
          nroFactura: 'F-A',
          montoAplicadoUsd: 1,
          montoAplicadoNativo: 500,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      facturasSaf: [
        {
          ventaId: 'venta-D',
          nroFactura: 'F-D',
          montoAplicadoUsd: 30,
          montoAplicadoNativo: 15000,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      totalUsd: 31,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(await screen.findByText('F-A')).toBeInTheDocument()
    expect(screen.getByText('F-D')).toBeInTheDocument()
    expect(screen.getByText(/pago directo/i)).toBeInTheDocument()
    // Slice 2b-ii agrego el mensaje de bloqueo SAF, que TAMBIEN contiene
    // "saldo a favor" — se usa el label especifico del grupo (unico en el
    // DOM) para evitar ambiguedad con ese nuevo mensaje de bloqueo.
    expect(screen.getByText(/afectada por saldo a favor \(saf\)/i)).toBeInTheDocument()
    expect(screen.getByText('$31.00')).toBeInTheDocument()
    // Monto dual-moneda (via formatMontoPago) + metodo de pago, uniforme en
    // ambos arreglos (directa y SAF) — spec Requirement "Renderizado
    // dual-moneda y metodo de pago en el panel".
    expect(screen.getAllByText('$1.00 (Bs. 500,00)')).toHaveLength(1)
    expect(screen.getAllByText('$30.00 (Bs. 15.000,00)')).toHaveLength(1)
    expect(screen.getAllByText('BANESCO PAGO MOVIL')).toHaveLength(2)
  })

  it('estado OK con 0 facturas (sin facturas asociadas, trazabilidad confirmada): copy distinto de LEGACY', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [],
      facturasSaf: [],
      totalUsd: 0,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(await screen.findByText(/no se encontraron facturas/i)).toBeInTheDocument()
    expect(screen.queryByText(/sin trazabilidad/i)).not.toBeInTheDocument()
  })
})

describe('ReversoModal — panel de facturas afectadas, estado LEGACY', () => {
  it('muestra copy explicito "sin trazabilidad", distinto de "no afecta facturas"', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'LEGACY',
      facturasDirectas: [],
      facturasSaf: [],
      totalUsd: 0,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(await screen.findByText(/sin trazabilidad/i)).toBeInTheDocument()
    expect(screen.queryByText(/no se encontraron facturas/i)).not.toBeInTheDocument()
  })
})

describe('ReversoModal — panel no muta datos', () => {
  it('el panel no renderiza ningun boton de accion propio (solo lectura)', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        {
          ventaId: 'venta-A',
          nroFactura: 'F-A',
          montoAplicadoUsd: 1,
          montoAplicadoNativo: 500,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      facturasSaf: [],
      totalUsd: 1,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    await screen.findByText('F-A')
    const panel = screen.getByTestId('preview-facturas-afectadas')
    expect(panel.querySelector('button')).not.toBeInTheDocument()
  })
})

// ─── Slice 2b-ii: wiring del submit al orquestador + PIN gate ──────────

describe('ReversoModal — submit, origen TRANSFERENCIA_CLIENTE (orquestador nuevo)', () => {
  it('con permiso CXC_REVERSE, sin SAF: llama reversarAbonoDirectoDesdeTesoreria con los params exactos, NO reversarMovBancario', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        {
          ventaId: 'venta-A',
          nroFactura: 'F-A',
          montoAplicadoUsd: 1,
          montoAplicadoNativo: 500,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      facturasSaf: [],
      totalUsd: 1,
    })
    mockedReversarAbonoDirectoDesdeTesoreria.mockResolvedValue(undefined)
    const onClose = vi.fn()

    render(
      <ReversoModal
        isOpen
        onClose={onClose}
        movimiento={movimiento({ id: 'mov-1', origen: 'TRANSFERENCIA_CLIENTE' })}
        monedaSimbolo="$"
      />
    )

    await screen.findByText('F-A')
    await escribirMotivoYSubmit('Pago duplicado por error de caja')

    await waitFor(() =>
      expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledWith({
        ingresoId: 'mov-1',
        motivo: 'Pago duplicado por error de caja',
        userId: 'user-1',
        reversedByNombre: 'Admin',
        empresaId: 'empresa-1',
      })
    )
    expect(mockedReversarMovBancario).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ReversoModal — submit, origenes NO transferencia (regresion, sin cambios)', () => {
  it('_source BANCO con origen DEPOSITO_CAJA: sigue llamando reversarMovBancario, nunca el orquestador nuevo', async () => {
    mockedReversarMovBancario.mockResolvedValue({ needsManualCxc: false })

    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ id: 'mov-2', origen: 'DEPOSITO_CAJA', _source: 'BANCO' })}
        monedaSimbolo="$"
      />
    )

    expect(mockedPreviewFacturasAfectadas).not.toHaveBeenCalled()
    await escribirMotivoYSubmit('Error de registro')

    await waitFor(() =>
      expect(mockedReversarMovBancario).toHaveBeenCalledWith({
        movId: 'mov-2',
        motivo: 'Error de registro',
        userId: 'user-1',
        empresaId: 'empresa-1',
      })
    )
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })

  it('_source distinto de BANCO (caja fuerte): sigue llamando reversarMovCajaFuerte, nunca el orquestador nuevo', async () => {
    mockedReversarMovCajaFuerte.mockResolvedValue(undefined)

    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ id: 'mov-3', origen: 'MANUAL', _source: 'CAJA_FUERTE' })}
        monedaSimbolo="$"
      />
    )

    await escribirMotivoYSubmit('Ajuste manual')

    await waitFor(() =>
      expect(mockedReversarMovCajaFuerte).toHaveBeenCalledWith({
        movId: 'mov-3',
        motivo: 'Ajuste manual',
        userId: 'user-1',
        empresaId: 'empresa-1',
      })
    )
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })
})

describe('ReversoModal — bloqueo SAF (accion de reverso deshabilitada)', () => {
  it('facturasSaf no vacio: boton "Confirmar reverso" deshabilitado y el guard interno bloquea el submit sin llamar al orquestador', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [],
      facturasSaf: [
        {
          ventaId: 'venta-D',
          nroFactura: 'F-D',
          montoAplicadoUsd: 30,
          montoAplicadoNativo: 15000,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      totalUsd: 30,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    await screen.findByText('F-D')
    const submitButton = screen.getByRole('button', { name: /confirmar reverso/i })
    expect(submitButton).toBeDisabled()
    expect(
      screen.getByText(
        /este abono generó saldo a favor consumido en otras facturas; reversar desde tesorería no está disponible todavía/i
      )
    ).toBeInTheDocument()

    // Defensa en profundidad: aunque se dispare el submit del form
    // directamente (p.ej. Enter en el input), el guard interno de
    // `handleSubmit` debe bloquear la mutacion igual que el `disabled`.
    const input = screen.getByLabelText(/motivo del reverso/i)
    fireEvent.change(input, { target: { value: 'Intento de reverso con SAF' } })
    const form = document.getElementById('reverso-form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => expect(mockedToastError).toHaveBeenCalled())
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })
})

describe('ReversoModal — PIN gate (CXC_REVERSE)', () => {
  it('sin permiso CXC_REVERSE: abre el dialogo de PIN y NO llama al orquestador hasta autorizar', async () => {
    denyCxcReverse()
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        {
          ventaId: 'venta-A',
          nroFactura: 'F-A',
          montoAplicadoUsd: 1,
          montoAplicadoNativo: 500,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      facturasSaf: [],
      totalUsd: 1,
    })
    mockedReversarAbonoDirectoDesdeTesoreria.mockResolvedValue(undefined)

    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ id: 'mov-4', origen: 'TRANSFERENCIA_CLIENTE' })}
        monedaSimbolo="$"
      />
    )

    await screen.findByText('F-A')
    await escribirMotivoYSubmit('Motivo del supervisor')

    const pinButton = await screen.findByTestId('mock-pin-authorize')
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()

    fireEvent.click(pinButton)

    await waitFor(() =>
      expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledWith({
        ingresoId: 'mov-4',
        motivo: 'Motivo del supervisor',
        userId: 'supervisor-1',
        reversedByNombre: 'Supervisor',
        empresaId: 'empresa-1',
      })
    )
  })
})

describe('ReversoModal — manejo de errores del orquestador', () => {
  it('el orquestador rechaza (ej. SAF-block tardio o ya reversado): muestra toast de error y no lanza', async () => {
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        {
          ventaId: 'venta-A',
          nroFactura: 'F-A',
          montoAplicadoUsd: 1,
          montoAplicadoNativo: 500,
          monedaCodigo: 'VES',
          metodoNombre: 'BANESCO PAGO MOVIL',
          tasa: 500,
        },
      ],
      facturasSaf: [],
      totalUsd: 1,
    })
    mockedReversarAbonoDirectoDesdeTesoreria.mockRejectedValue(
      new Error('Este movimiento ya fue reversado')
    )

    render(
      <ReversoModal
        isOpen
        onClose={vi.fn()}
        movimiento={movimiento({ id: 'mov-5', origen: 'TRANSFERENCIA_CLIENTE' })}
        monedaSimbolo="$"
      />
    )

    await screen.findByText('F-A')
    await escribirMotivoYSubmit('Reintento de reverso')

    await waitFor(() =>
      expect(mockedToastError).toHaveBeenCalledWith('Este movimiento ya fue reversado')
    )
  })
})
