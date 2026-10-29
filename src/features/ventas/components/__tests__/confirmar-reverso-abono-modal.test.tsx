import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { toast } from 'sonner'
import { ConfirmarReversoAbonoModal } from '../confirmar-reverso-abono-modal'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { useClasificarAbonoParaReverso } from '../../hooks/use-clasificar-abono-reverso'
import { previewFacturasAfectadas } from '@/features/tesoreria/hooks/use-preview-facturas-afectadas'
import { reversarAbonoDirectoDesdeTesoreria } from '@/features/tesoreria/hooks/use-reverso-abono-directo'

/**
 * consulta-factura-reverso-abono-directo (Unit 2): mismo criterio de
 * mocking-en-el-boundary que `reverso-modal.test.tsx` — el clasificador
 * (Unit 1) y los 2 orquestadores de Tesoreria ya tienen su propia suite,
 * aqui solo se prueba el WIRING de este modal (clasificar -> preview ->
 * confirmar -> orquestador), sin repetir su logica interna.
 */
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('@/core/hooks/use-permissions', () => ({
  usePermissions: vi.fn(),
  PERMISSIONS: { CXC_REVERSE: 'cxc.reversar_abono' },
}))
vi.mock('../../hooks/use-clasificar-abono-reverso', () => ({
  useClasificarAbonoParaReverso: vi.fn(),
  REASON_BATCH_NO_DISPONIBLE: 'BATCH_NO_DISPONIBLE',
  REASON_SAF_BLOQUEADO: 'SAF_BLOQUEADO',
  REASON_LEGACY_SIN_TRAZABILIDAD: 'LEGACY_SIN_TRAZABILIDAD',
}))
vi.mock('@/features/tesoreria/hooks/use-preview-facturas-afectadas', () => ({
  previewFacturasAfectadas: vi.fn(),
}))
vi.mock('@/features/tesoreria/hooks/use-reverso-abono-directo', () => ({
  reversarAbonoDirectoDesdeTesoreria: vi.fn(),
}))
// Mismo criterio que `reverso-modal.test.tsx`: mockeamos el dialogo de PIN
// en el boundary (usa `usePowerSync`/`connector` reales).
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUsePermissions = vi.mocked(usePermissions)
const mockedUseClasificarAbonoParaReverso = vi.mocked(useClasificarAbonoParaReverso)
const mockedPreviewFacturasAfectadas = vi.mocked(previewFacturasAfectadas)
const mockedReversarAbonoDirectoDesdeTesoreria = vi.mocked(reversarAbonoDirectoDesdeTesoreria)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

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
  fireEvent.click(screen.getByRole('button', { name: /confirmar reverso/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Admin', level: 1, rol_id: 'rol-1', rol_nombre: 'Propietario', empresa_id: 'emp-1' },
    loading: false,
  })
  allowCxcReverse()
})

describe('ConfirmarReversoAbonoModal — estado de carga de la clasificacion', () => {
  it('mientras clasifica: muestra "Clasificando abono...", confirmar deshabilitado', () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({ clasificacion: null, loading: true, error: null })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(screen.getByText('Clasificando abono...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeDisabled()
  })

  it('isOpen=false: clasifica con pagoId null (no clasifica el pago cerrado)', () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({ clasificacion: null, loading: false, error: null })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen={false} onClose={vi.fn()} />)

    expect(mockedUseClasificarAbonoParaReverso).toHaveBeenCalledWith(null)
  })
})

describe('ConfirmarReversoAbonoModal — 3 estados deshabilitados distintos', () => {
  it('BATCH: deshabilitado con el mensaje de lote', () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: { pagoId: 'pago-1', estado: 'BATCH', sesionCerrada: false, reasonCode: 'BATCH_NO_DISPONIBLE' },
      loading: false,
      error: null,
    })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(screen.getByText('Reverso por lote no disponible todavía')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeDisabled()
    expect(screen.queryByTestId('preview-facturas-afectadas')).not.toBeInTheDocument()
  })

  it('SAF: deshabilitado con el mensaje de bloqueo SAF', () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: { pagoId: 'pago-1', estado: 'SAF', ingresoId: 'ing-1', sesionCerrada: false, reasonCode: 'SAF_BLOQUEADO' },
      loading: false,
      error: null,
    })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(screen.getByText(/saldo a favor consumido en otras facturas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeDisabled()
  })

  it('LEGACY: deshabilitado con el mensaje de "sin trazabilidad"', () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: { pagoId: 'pago-1', estado: 'LEGACY', sesionCerrada: false, reasonCode: 'LEGACY_SIN_TRAZABILIDAD' },
      loading: false,
      error: null,
    })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(screen.getByText(/no tiene trazabilidad/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeDisabled()
  })
})

describe('ConfirmarReversoAbonoModal — DIRECT, preview de fan-in', () => {
  function clasificacionDirect(overrides: Partial<{ sesionCerrada: boolean }> = {}) {
    return {
      pagoId: 'pago-1',
      estado: 'DIRECT' as const,
      ingresoId: 'ing-1',
      sesionCerrada: false,
      ...overrides,
    }
  }

  it('fan-in simple (1 factura): muestra "afecta solo esta factura"', async () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: clasificacionDirect(),
      loading: false,
      error: null,
    })
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        { ventaId: 'v1', nroFactura: 'F-1', montoAplicadoUsd: 10, montoAplicadoNativo: 10, monedaCodigo: 'USD', metodoNombre: 'Transferencia', tasa: 1 },
      ],
      facturasSaf: [],
      totalUsd: 10,
    })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalledWith('emp-1', 'ing-1'))
    expect(await screen.findByText('Este reverso afecta solo esta factura.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeEnabled()
  })

  it('fan-in global (N facturas): lista cada factura con su monto y el conteo', async () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: clasificacionDirect(),
      loading: false,
      error: null,
    })
    mockedPreviewFacturasAfectadas.mockResolvedValue({
      estado: 'OK',
      facturasDirectas: [
        { ventaId: 'v1', nroFactura: 'F-1', montoAplicadoUsd: 10, montoAplicadoNativo: 10, monedaCodigo: 'USD', metodoNombre: 'Transferencia', tasa: 1 },
        { ventaId: 'v2', nroFactura: 'F-2', montoAplicadoUsd: 5, montoAplicadoNativo: 5, monedaCodigo: 'USD', metodoNombre: 'Transferencia', tasa: 1 },
      ],
      facturasSaf: [],
      totalUsd: 15,
    })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(await screen.findByText(/se reversaran 2 facturas/i)).toBeInTheDocument()
    expect(screen.getByText('F-1')).toBeInTheDocument()
    expect(screen.getByText('F-2')).toBeInTheDocument()
  })

  it('sesionCerrada=true: muestra el warning pasivo Y el boton de confirmar sigue habilitado (warn-and-allow)', async () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: clasificacionDirect({ sesionCerrada: true }),
      loading: false,
      error: null,
    })
    mockedPreviewFacturasAfectadas.mockResolvedValue({ estado: 'OK', facturasDirectas: [], facturasSaf: [], totalUsd: 0 })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    expect(
      await screen.findByText(/esta sesión ya está cerrada; el reverso puede desincronizar el cuadre/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirmar reverso/i })).toBeEnabled()
  })

  it('sesionCerrada=false: NO muestra el warning', async () => {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: clasificacionDirect({ sesionCerrada: false }),
      loading: false,
      error: null,
    })
    mockedPreviewFacturasAfectadas.mockResolvedValue({ estado: 'OK', facturasDirectas: [], facturasSaf: [], totalUsd: 0 })

    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)

    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())
    expect(screen.queryByText(/sesión ya está cerrada/i)).not.toBeInTheDocument()
  })
})

describe('ConfirmarReversoAbonoModal — confirmar, wiring al orquestador', () => {
  function stubDirectoListo() {
    mockedUseClasificarAbonoParaReverso.mockReturnValue({
      clasificacion: { pagoId: 'pago-1', estado: 'DIRECT', ingresoId: 'ing-1', sesionCerrada: false },
      loading: false,
      error: null,
    })
    mockedPreviewFacturasAfectadas.mockResolvedValue({ estado: 'OK', facturasDirectas: [], facturasSaf: [], totalUsd: 0 })
  }

  it('motivo vacio: muestra error de validacion y NO llama al orquestador', async () => {
    stubDirectoListo()
    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)
    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())

    await escribirMotivoYSubmit('')

    expect(screen.getByText(/ingrese al menos/i)).toBeInTheDocument()
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })

  it('con permiso CXC_REVERSE: confirmar llama a reversarAbonoDirectoDesdeTesoreria con ingresoId/motivo/userId/empresaId correctos', async () => {
    stubDirectoListo()
    mockedReversarAbonoDirectoDesdeTesoreria.mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={onClose} />)
    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())

    await escribirMotivoYSubmit('Cliente pidio reverso')

    await waitFor(() =>
      expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledWith({
        ingresoId: 'ing-1',
        motivo: 'Cliente pidio reverso',
        userId: 'user-1',
        reversedByNombre: 'Admin',
        empresaId: 'emp-1',
      })
    )
    expect(mockedToastSuccess).toHaveBeenCalledWith('Abono reversado correctamente')
    expect(onClose).toHaveBeenCalled()
  })

  it('sin permiso CXC_REVERSE: abre el PIN de supervisor; autorizar ejecuta el reverso con reversedByNombre="Supervisor"', async () => {
    stubDirectoListo()
    denyCxcReverse()
    mockedReversarAbonoDirectoDesdeTesoreria.mockResolvedValue(undefined)
    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={vi.fn()} />)
    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())

    await escribirMotivoYSubmit('Motivo supervisado')
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('mock-pin-authorize'))

    await waitFor(() =>
      expect(mockedReversarAbonoDirectoDesdeTesoreria).toHaveBeenCalledWith({
        ingresoId: 'ing-1',
        motivo: 'Motivo supervisado',
        userId: 'supervisor-1',
        reversedByNombre: 'Supervisor',
        empresaId: 'emp-1',
      })
    )
  })

  it('el orquestador rechaza: muestra toast.error con el mensaje, el modal NO se cierra', async () => {
    stubDirectoListo()
    mockedReversarAbonoDirectoDesdeTesoreria.mockRejectedValue(new Error('Este movimiento ya fue reversado'))
    const onClose = vi.fn()
    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={onClose} />)
    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())

    await escribirMotivoYSubmit('Motivo valido')

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledWith('Este movimiento ya fue reversado'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('click en "Cancelar" cierra el modal sin llamar al orquestador', async () => {
    stubDirectoListo()
    const onClose = vi.fn()
    render(<ConfirmarReversoAbonoModal pagoId="pago-1" isOpen onClose={onClose} />)
    await waitFor(() => expect(mockedPreviewFacturasAfectadas).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockedReversarAbonoDirectoDesdeTesoreria).not.toHaveBeenCalled()
  })
})
