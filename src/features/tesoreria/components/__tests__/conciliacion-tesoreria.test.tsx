import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConciliacionTesoreria } from '../conciliacion-tesoreria'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import {
  useCuentasTesoreria,
  useBancosInactivosTesoreria,
  usePendingCounts,
  type CuentaTesoreria,
} from '../../hooks/use-cuentas-tesoreria'
import { useMovBancariosFiltrados, type MovBancario } from '@/features/caja/hooks/use-mov-bancarios'
import { useMovCajaFuerteFiltrados } from '../../hooks/use-mov-caja-fuerte'
import { useTraspasos } from '../../hooks/use-traspasos'

/**
 * Cambio `desconciliar-reverso-historico-tesoreria` (Phase 3/4): primera
 * cobertura de `conciliacion-tesoreria.tsx` (824 lineas, sin tests previos).
 * Mockeamos en el boundary — mismo patron que `nota-credito-pos-modal.test.tsx` —
 * para probar SOLO el wiring: click "Desconciliar" en Historico abre el
 * `ReversoModal` existente con el movimiento correcto (handler nuevo
 * `handleDesconciliarMov`), y fijamos como regresion que "Rechazar" en
 * Pendientes (handler preexistente `handleReversarMov`) sigue intacto.
 */

vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

vi.mock('../../hooks/use-cuentas-tesoreria', () => ({
  useCuentasTesoreria: vi.fn(),
  useBancosInactivosTesoreria: vi.fn(),
  usePendingCounts: vi.fn(),
}))

vi.mock('@/features/caja/hooks/use-mov-bancarios', () => ({
  useMovBancariosFiltrados: vi.fn(),
}))

vi.mock('../../hooks/use-mov-caja-fuerte', () => ({
  useMovCajaFuerteFiltrados: vi.fn(),
}))

vi.mock('../../hooks/use-traspasos', () => ({
  useTraspasos: vi.fn(),
  reversarTraspaso: vi.fn(),
  findTraspasoByMovId: vi.fn().mockResolvedValue(null),
  validarTraspaso: vi.fn(),
  crearTraspaso: vi.fn(),
  crearTraspasoTesoreriaASesion: vi.fn(),
}))

vi.mock('../../hooks/use-conciliacion-tesoreria', () => ({
  validarMovBancario: vi.fn(),
  validarMovCajaFuerte: vi.fn(),
  crearMovManualBanco: vi.fn(),
  crearMovManualCajaFuerte: vi.fn(),
}))

vi.mock('@/core/db/powersync/db', () => ({
  db: { execute: vi.fn().mockResolvedValue({ rows: { item: () => null } }), getAll: vi.fn() },
}))

vi.mock('../cuentas-overview', () => ({
  CuentasOverview: ({
    cuentas,
    onSelect,
  }: {
    cuentas: CuentaTesoreria[]
    onSelect: (cuenta: CuentaTesoreria) => void
  }) => (
    <div data-testid="mock-cuentas-overview">
      {cuentas.map((c) => (
        <button key={c.id} onClick={() => onSelect(c)}>
          Seleccionar {c.nombre}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('../reverso-modal', () => ({
  ReversoModal: ({
    isOpen,
    movimiento,
  }: {
    isOpen: boolean
    movimiento: { id: string } | null
  }) =>
    isOpen ? (
      <div data-testid="mock-reverso-modal" data-movimiento-id={movimiento?.id}>
        Reverso modal abierto
      </div>
    ) : null,
}))

const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseCuentasTesoreria = vi.mocked(useCuentasTesoreria)
const mockedUseBancosInactivos = vi.mocked(useBancosInactivosTesoreria)
const mockedUsePendingCounts = vi.mocked(usePendingCounts)
const mockedUseMovBancariosFiltrados = vi.mocked(useMovBancariosFiltrados)
const mockedUseMovCajaFuerteFiltrados = vi.mocked(useMovCajaFuerteFiltrados)
const mockedUseTraspasos = vi.mocked(useTraspasos)

const CUENTA_BANCO: CuentaTesoreria = {
  id: 'banco-1',
  tipo: 'BANCO',
  nombre: 'Banco Test',
  moneda_id: 'moneda-usd',
  moneda_codigo: 'USD',
  moneda_simbolo: '$',
  saldo_actual: '1000.00',
  is_active: true,
  detalle: {
    id: 'banco-1',
    empresa_id: 'empresa-1',
    nombre_banco: 'Banco Test',
  } as unknown as CuentaTesoreria['detalle'],
}

function buildMovBancario(overrides: Partial<MovBancario> = {}): MovBancario {
  return {
    id: 'mov-historico-1',
    empresa_id: 'empresa-1',
    banco_empresa_id: 'banco-1',
    tipo: 'INGRESO',
    origen: 'TRANSFERENCIA_CLIENTE',
    monto: '100.00',
    saldo_anterior: '0.00',
    saldo_nuevo: '100.00',
    doc_origen_id: null,
    doc_origen_tipo: null,
    referencia: 'REF-100',
    validado: 1,
    validado_por: null,
    validado_at: null,
    observacion: null,
    reversado: 0,
    reverso_de: null,
    descripcion: 'Cobro cliente',
    fecha: '2026-10-20',
    created_at: '2026-10-20T10:00:00Z',
    created_by: null,
    ...overrides,
  }
}

function setupDefaults() {
  mockedUseCurrentUser.mockReturnValue({
    user: {
      id: 'user-1',
      email: 'u@test.com',
      nombre: 'Usuario Test',
      level: 1,
      rol_id: null,
      rol_nombre: null,
      empresa_id: 'empresa-1',
    },
    loading: false,
  })

  mockedUseCuentasTesoreria.mockReturnValue({
    cuentas: [CUENTA_BANCO],
    bancos: [],
    cajas: [],
    isLoading: false,
  })
  mockedUseBancosInactivos.mockReturnValue({ cuentas: [], isLoading: false })
  mockedUsePendingCounts.mockReturnValue(new Map())

  mockedUseMovCajaFuerteFiltrados.mockReturnValue({
    data: [],
    total: 0,
    page: 1,
    totalPages: 1,
    isLoading: false,
  })

  mockedUseTraspasos.mockReturnValue({ traspasos: [], isLoading: false })
}

const movPendiente = buildMovBancario({ id: 'mov-pendiente-1', validado: 0 })
const movHistoricoConciliado = buildMovBancario({ id: 'mov-historico-1', validado: 1, reversado: 0 })

function mockMovBancariosByEstado() {
  mockedUseMovBancariosFiltrados.mockImplementation(({ estado }) => {
    if (estado === 'pendiente') {
      return { data: [movPendiente], total: 1, page: 1, totalPages: 1, isLoading: false }
    }
    return { data: [movHistoricoConciliado], total: 1, page: 1, totalPages: 1, isLoading: false }
  })
}

async function seleccionarCuentaYTab(tab: 'Pendientes' | 'Historico') {
  await userEvent.click(screen.getByRole('button', { name: /Seleccionar Banco Test/ }))
  await userEvent.click(screen.getByRole('tab', { name: tab }))
}

describe('ConciliacionTesoreria — Desconciliar desde Historico', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaults()
    mockMovBancariosByEstado()
  })

  it('click en "Desconciliar" abre ReversoModal con el movimiento historico correcto', async () => {
    render(<ConciliacionTesoreria />)

    await seleccionarCuentaYTab('Historico')

    await userEvent.click(screen.getByRole('button', { name: 'Desconciliar' }))

    const modal = screen.getByTestId('mock-reverso-modal')
    expect(modal).toHaveAttribute('data-movimiento-id', 'mov-historico-1')
  })

  it('regresion: click en "Rechazar" (Pendientes) sigue abriendo ReversoModal con el movimiento pendiente correcto', async () => {
    render(<ConciliacionTesoreria />)

    await seleccionarCuentaYTab('Pendientes')

    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }))

    const modal = screen.getByTestId('mock-reverso-modal')
    expect(modal).toHaveAttribute('data-movimiento-id', 'mov-pendiente-1')
  })
})
