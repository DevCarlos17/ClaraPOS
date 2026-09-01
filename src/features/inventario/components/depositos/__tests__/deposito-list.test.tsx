import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { DepositoList } from '../deposito-list'
import { useDepositos, actualizarDeposito, type Deposito } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useQuery } from '@powersync/react'
import { toast } from 'sonner'

// Mismo patron que producto-list-deposito-col.test.tsx: mockeamos
// `@/core/db/powersync/db` primero porque los modulos reales importados
// transitivamente construyen una PowerSyncDatabase real (efecto de modulo
// top-level) y revientan con "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn(), getAll: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

// `deposito-list.tsx` llama a `useQuery` de `@powersync/react` directamente
// dos veces (conteosData ya existente + la nueva query agrupada de
// cajas-por-deposito, change `guarda-deposito-inactivo` Slice A) — se
// discrimina por el texto del SQL, mismo enfoque que `mockCrearVentaTx` en
// use-ventas.test.ts (discrimina por `sql.startsWith`/`sql.includes`).
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))

vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositos: vi.fn(), actualizarDeposito: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Stub de formularios/modales hijos irrelevantes para la columna de
// transparencia / flujo de toggle — mismo patron que producto-list-deposito-col.test.tsx.
vi.mock('../deposito-form', () => ({ DepositoForm: () => null }))
vi.mock('../deposito-productos-modal', () => ({ DepositoProductosModal: () => null }))

// `ReasignarCajaDialog` (nuevo, Slice A) se stubea para aislar el flujo de
// `DepositoList` — su propio comportamiento interno (selects por caja,
// llamadas a actualizarCaja/actualizarDeposito) se testea en su propio
// archivo (`reasignar-caja-dialog.test.tsx`). Aca solo verificamos que
// `DepositoList` lo abre con las cajas correctas cuando corresponde.
vi.mock('../reasignar-caja-dialog', () => ({
  ReasignarCajaDialog: (props: {
    isOpen: boolean
    deposito: Deposito | null
    cajas: { cajaId: string; cajaNombre: string; tieneSesionAbierta: boolean }[]
    onClose: () => void
  }) =>
    props.isOpen ? (
      <div data-testid="reasignar-caja-dialog">
        <span data-testid="reasignar-deposito-nombre">{props.deposito?.nombre}</span>
        {props.cajas.map((c) => (
          <span key={c.cajaId}>{c.cajaNombre}</span>
        ))}
      </div>
    ) : null,
}))

const mockedUseDepositos = vi.mocked(useDepositos)
const mockedActualizarDeposito = vi.mocked(actualizarDeposito)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseQuery = vi.mocked(useQuery)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

const BASE_DEPOSITO = {
  empresa_id: 'emp-1',
  direccion: null,
  es_principal: 0,
  permite_venta: 1,
  created_at: '',
  updated_at: '',
  created_by: null,
  updated_by: null,
}

const DEP_SESION_ABIERTA: Deposito = { ...BASE_DEPOSITO, id: 'dep-1', nombre: 'DEPOSITO EN USO ABIERTA', is_active: 1 }
const DEP_SIN_SESION: Deposito = { ...BASE_DEPOSITO, id: 'dep-2', nombre: 'DEPOSITO EN USO SIN SESION', is_active: 1 }
const DEP_LIBRE: Deposito = { ...BASE_DEPOSITO, id: 'dep-3', nombre: 'DEPOSITO LIBRE', is_active: 1 }
const DEP_INACTIVO: Deposito = { ...BASE_DEPOSITO, id: 'dep-4', nombre: 'DEPOSITO INACTIVO', is_active: 0 }

const DEPOSITOS = [DEP_SESION_ABIERTA, DEP_SIN_SESION, DEP_LIBRE, DEP_INACTIVO]

const CAJAS_ROWS = [
  { deposito_id: 'dep-1', caja_id: 'caja-1', caja_nombre: 'CAJA UNO', tiene_sesion_abierta: 1 },
  { deposito_id: 'dep-2', caja_id: 'caja-2', caja_nombre: 'CAJA DOS', tiene_sesion_abierta: 0 },
]

function setupMocks() {
  mockedUseDepositos.mockReturnValue({ depositos: DEPOSITOS, isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
  mockedUseQuery.mockImplementation((sql: unknown) => {
    const sqlStr = sql as string
    if (sqlStr.includes('movimientos_inventario')) {
      return { data: [], isLoading: false } as never
    }
    if (sqlStr.includes('FROM cajas c')) {
      return { data: CAJAS_ROWS, isLoading: false } as never
    }
    return { data: [], isLoading: false } as never
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedActualizarDeposito.mockResolvedValue(undefined)
  setupMocks()
})

describe('DepositoList — transparencia de uso (Requirement: Transparencia de Uso en el Listado de Depositos)', () => {
  it('Scenario: Deposito en uso con sesion abierta — la fila muestra el nombre de la caja y su estado de sesion activa', () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO EN USO ABIERTA').closest('tr')!
    expect(within(fila).getByText('CAJA UNO')).toBeInTheDocument()
    expect(within(fila).getByText(/sesi[oó]n abierta/i)).toBeInTheDocument()
  })

  it('Scenario: Deposito sin cajas asociadas — la fila muestra que no hay cajas asociadas', () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO LIBRE').closest('tr')!
    expect(within(fila).getByText(/sin cajas/i)).toBeInTheDocument()
  })

  it('deposito en uso sin sesion abierta: muestra el nombre de la caja sin indicar sesion activa', () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO EN USO SIN SESION').closest('tr')!
    expect(within(fila).getByText('CAJA DOS')).toBeInTheDocument()
    expect(within(fila).queryByText(/sesi[oó]n abierta/i)).not.toBeInTheDocument()
  })
})

describe('DepositoList — toggle proactivo al desactivar (Decision de producto #1)', () => {
  it('Scenario: Bloqueada por sesion abierta — bloquea con un toast y NO llama a actualizarDeposito ni abre el dialogo', async () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO EN USO ABIERTA').closest('tr')!
    const toggle = within(fila).getByRole('button', { name: /activo/i })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockedToastError).toHaveBeenCalled()
    })
    expect(mockedToastError.mock.calls[0]![0]).toMatch(/CAJA UNO/)
    expect(mockedActualizarDeposito).not.toHaveBeenCalled()
    expect(screen.queryByTestId('reasignar-caja-dialog')).not.toBeInTheDocument()
  })

  it('Scenario: Bloqueada por caja sin sesion abierta — abre ReasignarCajaDialog con la caja afectada, sin llamar a actualizarDeposito todavia', async () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO EN USO SIN SESION').closest('tr')!
    const toggle = within(fila).getByRole('button', { name: /activo/i })
    fireEvent.click(toggle)

    const dialog = await screen.findByTestId('reasignar-caja-dialog')
    expect(within(dialog).getByTestId('reasignar-deposito-nombre')).toHaveTextContent('DEPOSITO EN USO SIN SESION')
    expect(within(dialog).getByText('CAJA DOS')).toBeInTheDocument()
    expect(mockedActualizarDeposito).not.toHaveBeenCalled()
  })

  it('Scenario: Permitida sin cajas referenciandolo — llama a actualizarDeposito(is_active:false) directamente, sin dialogo ni bloqueo', async () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO LIBRE').closest('tr')!
    const toggle = within(fila).getByRole('button', { name: /activo/i })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockedActualizarDeposito).toHaveBeenCalledWith('dep-3', { is_active: false })
    })
    expect(screen.queryByTestId('reasignar-caja-dialog')).not.toBeInTheDocument()
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('activar un deposito inactivo no aplica ninguna guarda (solo aplica a la desactivacion)', async () => {
    render(<DepositoList />)

    const fila = screen.getByText('DEPOSITO INACTIVO').closest('tr')!
    const toggle = within(fila).getByRole('button', { name: /inactivo/i })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockedActualizarDeposito).toHaveBeenCalledWith('dep-4', { is_active: true })
    })
    expect(mockedToastSuccess).toHaveBeenCalled()
  })
})
