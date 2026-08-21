import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TraspasosPage } from '../traspasos'
import { usePermissions } from '@/core/hooks/use-permissions'

// Mismo patron que traspaso-form.test.tsx: `usePermissions` importa
// `connector` de `@/core/db/powersync/connector`, que a su vez arrastra
// `@/core/db/powersync/db` (instancia una PowerSyncDatabase real / Worker al
// importarse) — hay que mockear ambos antes de que se resuelva la cadena.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

// La ruta importa `createFileRoute` de TanStack Router — no lo ejecutamos
// (no hay harness de router en este codebase, ver design.md "Testing
// Strategy > Manual"), pero renderizamos `TraspasosPage` (named export,
// tarea 4.1) directamente via React Testing Library.
vi.mock('@/core/hooks/use-permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/hooks/use-permissions')>()
  return { ...actual, usePermissions: vi.fn() }
})

// Mockeamos los dos componentes de pestana para aislar el test de sus
// dependencias internas de PowerSync (design.md: tarea 4.2 mockea
// ExistenciasPorDeposito y TraspasoList).
vi.mock('@/features/inventario/components/existencias/existencias-por-deposito', () => ({
  ExistenciasPorDeposito: () => <div data-testid="existencias-tab-content">Contenido Existencias</div>,
}))
vi.mock('@/features/inventario/components/traspasos/traspaso-list', () => ({
  TraspasoList: () => <div data-testid="traspaso-list-tab-content">Contenido Historico</div>,
}))
vi.mock('@/features/inventario/components/plantillas/plantilla-list', () => ({
  PlantillaList: () => <div data-testid="plantilla-list-tab-content">Contenido Plantillas</div>,
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

describe('TraspasosPage — pestanas (EPD/Pestanas sin Alterar el Historico de Traspasos)', () => {
  it('la pestana "Existencias por deposito" esta activa por defecto y ambos triggers se renderizan', () => {
    render(<TraspasosPage />)

    expect(screen.getByRole('tab', { name: /existencias por deposito/i })).toHaveAttribute(
      'data-state',
      'active'
    )
    expect(screen.getByRole('tab', { name: /historico de traspasos/i })).toBeInTheDocument()
    expect(screen.getByTestId('existencias-tab-content')).toBeInTheDocument()
  })

  it('al cambiar a "Historico de traspasos" se renderiza TraspasoList sin cambios de comportamiento', async () => {
    const user = userEvent.setup()
    render(<TraspasosPage />)

    await user.click(screen.getByRole('tab', { name: /historico de traspasos/i }))

    expect(screen.getByTestId('traspaso-list-tab-content')).toBeInTheDocument()
  })

  it('la pestana "Plantillas" se renderiza junto a las otras dos y al hacer click muestra PlantillaList', async () => {
    const user = userEvent.setup()
    render(<TraspasosPage />)

    expect(screen.getByRole('tab', { name: /^plantillas$/i })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /^plantillas$/i }))

    expect(screen.getByTestId('plantilla-list-tab-content')).toBeInTheDocument()
  })
})
