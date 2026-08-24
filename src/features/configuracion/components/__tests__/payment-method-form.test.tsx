import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentMethodForm } from '../payment-method-form'
import {
  createPaymentMethod,
  updatePaymentMethod,
  type PaymentMethod,
} from '@/features/configuracion/hooks/use-payment-methods'
import { useBancosActivos, type Banco } from '@/features/configuracion/hooks/use-bancos'
import { useDeduccionesDeMetodo } from '@/features/configuracion/hooks/use-metodo-cobro-deducciones'
import { useCurrentUser } from '@/core/hooks/use-current-user'

// Mismo patron que caja-form.test.tsx: mockeamos `@/core/db/powersync/db`
// primero porque los modulos reales importados transitivamente construyen una
// PowerSyncDatabase real (efecto de modulo top-level) y revientan con
// "Worker is not defined" en el entorno de test.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/features/configuracion/hooks/use-payment-methods', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-payment-methods')>()
  return { ...actual, createPaymentMethod: vi.fn(), updatePaymentMethod: vi.fn() }
})
vi.mock('@/features/configuracion/hooks/use-bancos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-bancos')>()
  return { ...actual, useBancosActivos: vi.fn() }
})
vi.mock('@/features/configuracion/hooks/use-metodo-cobro-deducciones', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/configuracion/hooks/use-metodo-cobro-deducciones')>()
  return { ...actual, useDeduccionesDeMetodo: vi.fn(), persistDeduccionesDeMetodo: vi.fn() }
})
vi.mock('@/core/hooks/use-current-user', () => ({ useCurrentUser: vi.fn() }))

// DeduccionesEditor requiere plan de cuentas (use-plan-cuentas) — fuera del
// alcance de este fix. Se stubea porque solo se renderiza cuando hay un
// banco seleccionado (irrelevante para las aserciones de moneda/banco de
// este archivo).
vi.mock('@/features/configuracion/components/deducciones-editor', () => ({
  DeduccionesEditor: () => null,
}))

const mockedCreatePaymentMethod = vi.mocked(createPaymentMethod)
const mockedUpdatePaymentMethod = vi.mocked(updatePaymentMethod)
const mockedUseBancosActivos = vi.mocked(useBancosActivos)
const mockedUseDeduccionesDeMetodo = vi.mocked(useDeduccionesDeMetodo)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)

const BANCO_USD: Banco = {
  id: 'banco-usd',
  nombre_banco: 'BANCO UNO',
  nro_cuenta: '0001',
  tipo_cuenta: null,
  titular: 'Empresa',
  titular_documento: null,
  moneda_id: 'moneda-usd-id',
  moneda: 'USD',
  saldo_actual: '0',
  saldo_inicial: '0',
  cuenta_contable_id: null,
  cuenta_gasto_comision_id: null,
  cuenta_gasto_pasarela_id: null,
  is_active: 1,
  empresa_id: 'emp-1',
  created_at: '',
  updated_at: '',
  created_by: null,
} as Banco

const BANCO_BS: Banco = { ...BANCO_USD, id: 'banco-bs', nombre_banco: 'BANCO DOS', moneda_id: 'moneda-bs-id', moneda: 'BS' } as Banco

function setupMocks(bancos: Banco[] = [BANCO_USD, BANCO_BS]) {
  mockedUseBancosActivos.mockReturnValue({ bancos, isLoading: false })
  mockedUseDeduccionesDeMetodo.mockReturnValue({ deducciones: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: { id: 'user-1', email: 'a@a.com', nombre: 'Test', level: 1, rol_id: null, rol_nombre: null, empresa_id: 'emp-1' },
    loading: false,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedCreatePaymentMethod.mockResolvedValue('metodo-1')
  mockedUpdatePaymentMethod.mockResolvedValue(undefined)
})

describe('PaymentMethodForm — moneda derivada del banco (creacion)', () => {
  it('al elegir un banco, la moneda se deriva automaticamente y el select queda deshabilitado', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PaymentMethodForm isOpen onClose={() => {}} />)

    await user.selectOptions(screen.getByLabelText(/^tipo$/i), 'TRANSFERENCIA')
    await user.selectOptions(screen.getByLabelText(/banco asociado/i), 'banco-bs')

    const monedaSelect = screen.getByLabelText(/^moneda$/i) as HTMLSelectElement
    await waitFor(() => expect(monedaSelect.value).toBe('BS'))
    expect(monedaSelect).toBeDisabled()
  })

  it('crea el metodo con la moneda del banco seleccionado, no con la moneda por defecto', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PaymentMethodForm isOpen onClose={() => {}} />)

    await user.type(screen.getByLabelText(/^nombre$/i), 'Transferencia BS')
    await user.selectOptions(screen.getByLabelText(/^tipo$/i), 'TRANSFERENCIA')
    await user.selectOptions(screen.getByLabelText(/banco asociado/i), 'banco-bs')

    await waitFor(() => expect((screen.getByLabelText(/^moneda$/i) as HTMLSelectElement).value).toBe('BS'))

    fireEvent.submit(screen.getByRole('button', { name: /crear/i }).closest('form')!)

    await waitFor(() => expect(mockedCreatePaymentMethod).toHaveBeenCalled())
    expect(mockedCreatePaymentMethod.mock.calls[0]![0]).toMatchObject({ moneda: 'BS' })
  })

  it('sin banco (ej. EFECTIVO), la moneda sigue siendo seleccionable manualmente', async () => {
    const user = userEvent.setup()
    setupMocks()
    render(<PaymentMethodForm isOpen onClose={() => {}} />)

    const monedaSelect = screen.getByLabelText(/^moneda$/i) as HTMLSelectElement
    expect(monedaSelect).not.toBeDisabled()

    await user.selectOptions(monedaSelect, 'BS')
    expect(monedaSelect.value).toBe('BS')
  })
})

describe('PaymentMethodForm — inmutabilidad de moneda en edicion', () => {
  const METODO_EXISTENTE: PaymentMethod = {
    id: 'metodo-1',
    nombre: 'TRANSF VZLA',
    tipo: 'TRANSFERENCIA',
    moneda_id: 'moneda-usd-id',
    moneda: 'USD',
    banco_empresa_id: 'banco-usd',
    banco_nombre: 'BANCO UNO',
    caja_fuerte_id: null,
    caja_nombre: null,
    requiere_referencia: 0,
    saldo_actual: '0',
    is_active: 1,
    empresa_id: 'emp-1',
    created_at: '',
    deposito_directo: 0,
    comision_pct: '0',
    usa_pos: 1,
    usa_cxc: 1,
    usa_cxp: 1,
    consolidar_lotes: 1,
  }

  it('el select de moneda permanece deshabilitado en edicion aunque el metodo tenga banco', () => {
    setupMocks()
    render(<PaymentMethodForm isOpen onClose={() => {}} method={METODO_EXISTENTE} />)

    const monedaSelect = screen.getByLabelText(/^moneda$/i) as HTMLSelectElement
    expect(monedaSelect).toBeDisabled()
    expect(monedaSelect.value).toBe('USD')
  })

  it('el selector de banco en edicion solo lista bancos cuya moneda coincide con la moneda actual del metodo', () => {
    setupMocks([BANCO_USD, BANCO_BS])
    render(<PaymentMethodForm isOpen onClose={() => {}} method={METODO_EXISTENTE} />)

    expect(screen.getByRole('option', { name: /BANCO UNO/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /BANCO DOS/i })).not.toBeInTheDocument()
  })
})

describe('PaymentMethodForm — remediacion CRITICAL: edicion de metodo legado con banco desalineado', () => {
  // Dato legado real (root cause del bug original): moneda persistida BS
  // pero el banco vinculado es USD — un mismatch genuino, a diferencia de
  // METODO_EXISTENTE (que usa moneda USD + banco USD, sin mismatch real).
  const METODO_LEGADO_DESALINEADO: PaymentMethod = {
    id: 'metodo-legado',
    nombre: 'TRANSF VZLA LEGADO',
    tipo: 'TRANSFERENCIA',
    moneda_id: 'moneda-bs-id',
    moneda: 'BS',
    banco_empresa_id: 'banco-usd',
    banco_nombre: 'BANCO UNO',
    caja_fuerte_id: null,
    caja_nombre: null,
    requiere_referencia: 0,
    saldo_actual: '0',
    is_active: 1,
    empresa_id: 'emp-1',
    created_at: '',
    deposito_directo: 0,
    comision_pct: '0',
    usa_pos: 1,
    usa_cxc: 1,
    usa_cxp: 1,
    consolidar_lotes: 1,
  }

  it('permite editar (ej. desactivar) un metodo legado con banco desalineado, sin bloquear por el refine de moneda', async () => {
    const user = userEvent.setup()
    setupMocks([BANCO_USD, BANCO_BS])
    render(<PaymentMethodForm isOpen onClose={() => {}} method={METODO_LEGADO_DESALINEADO} />)

    await user.click(screen.getByLabelText(/^activo$/i))

    fireEvent.submit(screen.getByRole('button', { name: /actualizar/i }).closest('form')!)

    await waitFor(() => expect(mockedUpdatePaymentMethod).toHaveBeenCalled())
    expect(screen.queryByText(/la moneda debe coincidir/i)).not.toBeInTheDocument()
  })
})
