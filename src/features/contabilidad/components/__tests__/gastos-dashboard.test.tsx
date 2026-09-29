import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GastosDashboard } from '../gastos-dashboard'
import { useGastos } from '@/features/contabilidad/hooks/use-gastos'
import { useGruposGastoConSubcuentas } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useCompany } from '@/features/configuracion/hooks/use-company'

vi.mock('@/features/contabilidad/hooks/use-gastos', () => ({
  useGastos: vi.fn(),
}))
// Mock completo (sin importActual): el modulo real importa
// src/core/db/powersync/db.ts, que instancia PowerSyncDatabase y falla con
// "Worker is not defined" en happy-dom. Se reimplementan los 3 helpers
// puros (findGrupoGastoById/flattenGruposGasto/collectGrupoGastoIds) porque
// GastosDashboard los invoca via memos/handlers aunque `grupos` este vacio.
vi.mock('@/features/contabilidad/hooks/use-plan-cuentas', () => ({
  useGruposGastoConSubcuentas: vi.fn(),
  findGrupoGastoById: vi.fn(() => undefined),
  flattenGruposGasto: vi.fn(() => []),
  collectGrupoGastoIds: vi.fn(() => []),
}))
vi.mock('@/core/hooks/use-current-user', () => ({
  useCurrentUser: vi.fn(),
}))
vi.mock('@/features/configuracion/hooks/use-company', () => ({
  useCompany: vi.fn(),
}))

vi.mock('../gasto-form', () => ({ GastoForm: () => null }))
vi.mock('../cuenta-gasto-modal', () => ({ CuentaGastoModal: () => null }))
vi.mock('@/features/compras/components/factura-proveedor-modal', () => ({
  FacturaProveedorModal: () => null,
}))
// Mock completo (sin importActual): la cadena real del wizard mobile
// (GastoWizardSheet → GastoWizard → paso-identificacion/paso-pagos) importa
// src/core/db/powersync/db.ts a nivel de modulo, que falla con "Worker is
// not defined" en happy-dom (mismo motivo que el mock de use-plan-cuentas
// arriba). isMobile es false en este entorno (innerWidth=1024 fijo en
// happy-dom, useMobile(1024) exige `< 1024`), asi que el wizard nunca se
// renderiza, pero el import estatico igual se evalua.
vi.mock('../wizard/gasto-wizard-sheet', () => ({ GastoWizardSheet: () => null }))

const mockedUseGastos = vi.mocked(useGastos)
const mockedUseGruposGastoConSubcuentas = vi.mocked(useGruposGastoConSubcuentas)
const mockedUseCurrentUser = vi.mocked(useCurrentUser)
const mockedUseCompany = vi.mocked(useCompany)

beforeEach(() => {
  mockedUseGastos.mockReturnValue({ gastos: [], isLoading: false })
  mockedUseGruposGastoConSubcuentas.mockReturnValue({ grupos: [], isLoading: false })
  mockedUseCurrentUser.mockReturnValue({
    user: {
      id: 'u-1',
      email: 'test@test.com',
      nombre: 'Tester',
      level: 1,
      rol_id: null,
      rol_nombre: null,
      empresa_id: 'empresa-1',
    },
    loading: false,
  })
  mockedUseCompany.mockReturnValue({ company: null, isLoading: false })
})

describe('GastosDashboard - sin botones duplicados', () => {
  it('muestra un solo boton "Agregar gasto" al entrar en la pestaña Libro de gastos', async () => {
    render(<GastosDashboard />)

    await userEvent.click(screen.getByRole('tab', { name: 'Libro de gastos' }))

    expect(screen.getAllByRole('button', { name: /Agregar gasto/i })).toHaveLength(1)
  })

  it('muestra un solo boton "Crear cuenta" e "Imprimir" en la pestaña Libro de gastos', async () => {
    render(<GastosDashboard />)

    await userEvent.click(screen.getByRole('tab', { name: 'Libro de gastos' }))

    expect(screen.getAllByRole('button', { name: /Crear cuenta/i })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Imprimir/i })).toHaveLength(1)
  })
})
