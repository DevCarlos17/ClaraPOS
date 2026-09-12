import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CxpRoutePage } from '../cxp'
import { usePermissions } from '@/core/hooks/use-permissions'

// `CxpRoutePage` usa `Route.useSearch()` para leer `proveedorId`. Mockeamos
// `createFileRoute` para que `Route` sea un objeto liviano con `useSearch`
// estatico, sin necesidad de un RouterProvider real.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    ...(options as object),
    useSearch: () => ({ proveedorId: undefined }),
  }),
}))

// Mismo patron que traspasos-page.test.tsx: `usePermissions` arrastra
// `@/core/db/powersync/connector` -> `@/core/db/powersync/db`.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})

vi.mock('@/features/compras/components/cxp-page', () => ({
  CxpPage: () => <div data-testid="cxp-page-mock" />,
}))

vi.mock('@/features/compras/components/importar-cxp-modal', () => ({
  ImportarCxpModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="importar-cxp-modal-mock" /> : null,
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

describe('CxpRoutePage — boton Importar Saldos', () => {
  it('renderiza el boton con el variant primario (azul) del sistema, no outline', () => {
    render(<CxpRoutePage />)

    const boton = screen.getByRole('button', { name: /importar saldos/i })
    expect(boton).toHaveAttribute('data-variant', 'default')
  })

  it('al hacer click sigue abriendo el modal de importacion de saldos', async () => {
    const user = userEvent.setup()
    render(<CxpRoutePage />)

    expect(screen.queryByTestId('importar-cxp-modal-mock')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /importar saldos/i }))

    expect(screen.getByTestId('importar-cxp-modal-mock')).toBeInTheDocument()
  })
})
