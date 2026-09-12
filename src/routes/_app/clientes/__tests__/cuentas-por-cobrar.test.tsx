import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CuentasPorCobrarPage } from '../cuentas-por-cobrar'
import { usePermissions } from '@/core/hooks/use-permissions'

// `createFileRoute` no se ejecuta con un RouterProvider real en este test:
// `CuentasPorCobrarPage` no usa ningun hook del router (no `Route.useSearch`),
// asi que basta con que `createFileRoute(...)({...})` no explote al importarse.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

// Mismo patron que traspasos-page.test.tsx: `usePermissions` arrastra
// `@/core/db/powersync/connector` -> `@/core/db/powersync/db` (instancia
// PowerSyncDatabase real / Worker al importarse).
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})

// Aislamos el test de las dependencias internas de PowerSync de CxcList
// (design: mockear componentes hijos para probar solo el boton de la ruta).
vi.mock('@/features/cxc/components/cxc-list', () => ({
  CxcList: () => <div data-testid="cxc-list-mock" />,
}))

vi.mock('@/features/cxc/components/importar-cxc-modal', () => ({
  ImportarCxcModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="importar-cxc-modal-mock" /> : null,
}))

const mockedUsePermissions = vi.mocked(usePermissions)

beforeEach(() => {
  vi.clearAllMocks()
  mockedUsePermissions.mockReturnValue({
    hasPermission: () => true,
    hasAnyPermission: () => true,
    hasAllPermissions: () => true,
    isOwner: true,
    rolId: 'rol-1',
    rolNombre: 'Propietario',
    loading: false,
  })
})

describe('CuentasPorCobrarPage — boton Importar Saldos', () => {
  it('renderiza el boton con el variant primario (azul) del sistema, no outline', () => {
    render(<CuentasPorCobrarPage />)

    const boton = screen.getByRole('button', { name: /importar saldos/i })
    expect(boton).toHaveAttribute('data-variant', 'default')
  })

  it('al hacer click sigue abriendo el modal de importacion de saldos', async () => {
    const user = userEvent.setup()
    render(<CuentasPorCobrarPage />)

    expect(screen.queryByTestId('importar-cxc-modal-mock')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /importar saldos/i }))

    expect(screen.getByTestId('importar-cxc-modal-mock')).toBeInTheDocument()
  })
})
