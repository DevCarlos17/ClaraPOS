import { render, screen, waitFor } from '@testing-library/react'
import { ReversoModal } from '../reverso-modal'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { previewFacturasAfectadas } from '../../hooks/use-preview-facturas-afectadas'
import type { MovimientoTesoreria } from '../movimientos-table'

/**
 * Slice 1b-panel (preview-facturas-afectadas-reverso-tesoreria, PR #2):
 * cubre el gate de aplicabilidad (origen === TRANSFERENCIA_CLIENTE,
 * reemplazando la condicion muerta `doc_origen_tipo === 'PAGO'`) y los 3
 * estados del panel read-only (OK con facturas, LEGACY, 0-facturas).
 * `previewFacturasAfectadas` ya tiene su propia suite (slice 1a-hook,
 * 6/6 verde) — aqui se mockea en el boundary para probar solo el WIRING
 * del modal (gate -> llamada -> render), sin repetir la logica del hook.
 */
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('../../hooks/use-preview-facturas-afectadas', () => ({
  previewFacturasAfectadas: vi.fn(),
}))
// `reversarMovBancario`/`reversarMovCajaFuerte` importan `db` directo
// (modulo que instancia un PowerSyncDatabase real al cargarse) — se
// mockea en el boundary igual que `pago-factura-modal.test.tsx` para
// poder renderizar sin Worker real. Este slice NO toca estas funciones.
vi.mock('@/core/db/powersync/db', () => ({ db: { getAll: vi.fn(), execute: vi.fn() } }))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedPreviewFacturasAfectadas = vi.mocked(previewFacturasAfectadas)

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
      facturasDirectas: [{ ventaId: 'venta-A', nroFactura: 'F-A', montoAplicadoUsd: 1 }],
      facturasSaf: [{ ventaId: 'venta-D', nroFactura: 'F-D', montoAplicadoUsd: 30 }],
      totalUsd: 31,
    })

    render(
      <ReversoModal isOpen onClose={vi.fn()} movimiento={movimiento()} monedaSimbolo="$" />
    )

    expect(await screen.findByText('F-A')).toBeInTheDocument()
    expect(screen.getByText('F-D')).toBeInTheDocument()
    expect(screen.getByText(/pago directo/i)).toBeInTheDocument()
    expect(screen.getByText(/saldo a favor/i)).toBeInTheDocument()
    expect(screen.getByText('$31.00')).toBeInTheDocument()
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
      facturasDirectas: [{ ventaId: 'venta-A', nroFactura: 'F-A', montoAplicadoUsd: 1 }],
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
