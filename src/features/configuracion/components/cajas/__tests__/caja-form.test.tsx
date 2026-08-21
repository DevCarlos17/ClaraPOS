import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CajaForm } from '../caja-form'
import { crearCaja, actualizarCaja, type Caja } from '@/features/configuracion/hooks/use-cajas'
import { useDepositosVentaActivos } from '@/features/inventario/hooks/use-depositos'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que traspaso-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente construyen una
// PowerSyncDatabase real (efecto de modulo top-level) y revientan con
// "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/configuracion/hooks/use-cajas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-cajas')>()
  return { ...actual, crearCaja: vi.fn(), actualizarCaja: vi.fn() }
})
vi.mock('@/features/inventario/hooks/use-depositos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/inventario/hooks/use-depositos')>()
  return { ...actual, useDepositosVentaActivos: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

const mockedCrearCaja = vi.mocked(crearCaja)
const mockedActualizarCaja = vi.mocked(actualizarCaja)
const mockedUseDepositosVentaActivos = vi.mocked(useDepositosVentaActivos)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const DEPOSITOS_VENTA = [
  { id: 'dep-venta-1', nombre: 'Deposito Tienda', permite_venta: 1 },
  { id: 'dep-venta-2', nombre: 'Deposito Sucursal', permite_venta: 1 },
]

function setupMocks() {
  mockedUseDepositosVentaActivos.mockReturnValue({ depositos: DEPOSITOS_VENTA as never, isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCrearCaja.mockResolvedValue('caja-1')
  mockedActualizarCaja.mockResolvedValue(undefined)
})

describe('CajaForm — deposito obligatorio (Validacion 2)', () => {
  it('bloquea el submit sin deposito seleccionado, mostrando el mensaje del schema', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<CajaForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^nombre$/i), 'Caja Principal')
    fireEvent.submit(screen.getByRole('button', { name: /crear/i }).closest('form')!)

    expect(await screen.findByText('Selecciona un deposito')).toBeInTheDocument()
    expect(mockedCrearCaja).not.toHaveBeenCalled()
  })

  it('no muestra la opcion "Sin deposito" en el select', () => {
    setupMocks()
    render(<CajaForm isOpen onClose={() => {}} />)
    expect(screen.queryByText('Sin deposito')).not.toBeInTheDocument()
  })
})

describe('CajaForm — solo depositos con permite_venta (Validacion 3)', () => {
  it('el select de deposito usa useDepositosVentaActivos, listando solo depositos habilitados para venta', () => {
    setupMocks()
    render(<CajaForm isOpen onClose={() => {}} />)
    expect(mockedUseDepositosVentaActivos).toHaveBeenCalled()
    expect(screen.getByRole('option', { name: 'Deposito Tienda' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Deposito Sucursal' })).toBeInTheDocument()
  })

  it('crea la caja con el deposito seleccionado cuando este permite ventas', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<CajaForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^nombre$/i), 'Caja Principal')
    await user.selectOptions(screen.getByLabelText(/deposito/i), 'dep-venta-1')
    fireEvent.submit(screen.getByRole('button', { name: /crear/i }).closest('form')!)

    await waitFor(() => {
      expect(mockedCrearCaja).toHaveBeenCalled()
    })
    expect(mockedCrearCaja.mock.calls[0]![0]).toMatchObject({
      deposito_id: 'dep-venta-1',
      empresa_id: 'emp-1',
    })
  })

  it('rechaza el submit (defensa en profundidad) cuando el deposito de una caja en edicion ya no permite ventas', async () => {
    setupMocks()
    const cajaConDepositoInvalido: Caja = {
      id: 'caja-1',
      empresa_id: 'emp-1',
      nombre: 'CAJA VIEJA',
      ubicacion: null,
      deposito_id: 'dep-desactivado',
      is_active: 1,
      created_at: '',
      updated_at: '',
      created_by: null,
      updated_by: null,
    }
    render(<CajaForm isOpen onClose={() => {}} caja={cajaConDepositoInvalido} />)

    fireEvent.submit(screen.getByRole('button', { name: /actualizar/i }).closest('form')!)

    expect(await screen.findByText(/no permite ventas/i)).toBeInTheDocument()
    expect(mockedActualizarCaja).not.toHaveBeenCalled()
  })
})
