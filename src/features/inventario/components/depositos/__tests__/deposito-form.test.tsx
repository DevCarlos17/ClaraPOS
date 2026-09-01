import { render, screen } from '@testing-library/react'
import { DepositoForm } from '../deposito-form'
import { crearDeposito, actualizarDeposito, type Deposito } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que caja-form.test.tsx / plantilla-form.test.tsx: mockeamos
// `@/core/db/powersync/db` primero porque los modulos reales importados
// transitivamente construyen una PowerSyncDatabase real (efecto de modulo
// top-level) y revientan con "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, crearDeposito: vi.fn(), actualizarDeposito: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedCrearDeposito = vi.mocked(crearDeposito)
const mockedActualizarDeposito = vi.mocked(actualizarDeposito)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const DEPOSITO_ACTIVO: Deposito = {
  id: 'dep-1',
  empresa_id: 'emp-1',
  nombre: 'ALMACEN PRINCIPAL',
  direccion: null,
  es_principal: 1,
  permite_venta: 1,
  is_active: 1,
  created_at: '',
  updated_at: '',
  created_by: null,
  updated_by: null,
}

const DEPOSITO_INACTIVO: Deposito = { ...DEPOSITO_ACTIVO, id: 'dep-2', is_active: 0, es_principal: 0 }

function setupMocks() {
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCrearDeposito.mockResolvedValue('dep-new')
  mockedActualizarDeposito.mockResolvedValue(undefined)
})

describe('DepositoForm — invariante deposito activo unico debe ser principal (bloqueo UI)', () => {
  it('creacion con activeDepositosCount=0: checkbox principal bloqueado, marcado, y con hint', () => {
    setupMocks()
    render(<DepositoForm isOpen onClose={() => {}} activeDepositosCount={0} />)

    const checkbox = screen.getByRole('checkbox', { name: /deposito principal/i })
    expect(checkbox).toBeDisabled()
    expect(checkbox).toBeChecked()
    expect(screen.getByText('Es el único depósito activo — debe ser el principal.')).toBeInTheDocument()
  })

  it('edicion de un deposito activo con activeDepositosCount=1: checkbox bloqueado, marcado, y con hint', () => {
    setupMocks()
    render(
      <DepositoForm
        isOpen
        onClose={() => {}}
        deposito={DEPOSITO_ACTIVO}
        activeDepositosCount={1}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: /deposito principal/i })
    expect(checkbox).toBeDisabled()
    expect(checkbox).toBeChecked()
    expect(screen.getByText('Es el único depósito activo — debe ser el principal.')).toBeInTheDocument()
  })

  it('creacion con activeDepositosCount=2: checkbox libre, sin marcar por defecto, sin hint', () => {
    setupMocks()
    render(<DepositoForm isOpen onClose={() => {}} activeDepositosCount={2} />)

    const checkbox = screen.getByRole('checkbox', { name: /deposito principal/i })
    expect(checkbox).not.toBeDisabled()
    expect(checkbox).not.toBeChecked()
    expect(
      screen.queryByText('Es el único depósito activo — debe ser el principal.')
    ).not.toBeInTheDocument()
  })

  it('edicion de un deposito INACTIVO mientras existe otro activo (activeDepositosCount=1): checkbox libre, sin hint', () => {
    setupMocks()
    render(
      <DepositoForm
        isOpen
        onClose={() => {}}
        deposito={DEPOSITO_INACTIVO}
        activeDepositosCount={1}
      />
    )

    const checkbox = screen.getByRole('checkbox', { name: /deposito principal/i })
    expect(checkbox).not.toBeDisabled()
    expect(
      screen.queryByText('Es el único depósito activo — debe ser el principal.')
    ).not.toBeInTheDocument()
  })
})
