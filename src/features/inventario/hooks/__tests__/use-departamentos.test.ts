// `use-departamentos.ts` importa `useCurrentUser`, que a su vez importa
// `auth-provider.tsx` → `@/core/db/powersync` (singleton PowerSyncDatabase
// real). Sin este mock, importar el modulo revienta con "Worker is not
// defined" en el entorno de test aunque `crearDepartamento`/`actualizarDepartamento`
// no lo usen directamente — mismo patron que use-productos.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/core/db/powersync', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/core/db/powersync/connector', () => ({
  connector: {},
}))

// `crearDepartamento`/`actualizarDepartamento` escriben via
// `kysely.insertInto(...)` / `kysely.updateTable(...)`; `crearDepartamento`
// ademas lee `kysely.selectFrom('departamentos')` dentro de
// `getSiguienteCodigoDepartamento` — mockeamos el builder encadenable
// minimo, mismo patron que use-productos.test.ts.
vi.mock('@/core/db/kysely/kysely', () => {
  const builder = {
    selectFrom: vi.fn(),
    select: vi.fn(),
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    execute: vi.fn(),
  }
  builder.selectFrom.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.insertInto.mockReturnValue(builder)
  builder.updateTable.mockReturnValue(builder)
  builder.values.mockReturnValue(builder)
  builder.set.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  builder.execute.mockResolvedValue([])
  return { kysely: builder }
})

import { kysely } from '@/core/db/kysely/kysely'
import { crearDepartamento, actualizarDepartamento } from '../use-departamentos'

const mockedKysely = vi.mocked(kysely, true) as unknown as {
  values: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedKysely.execute.mockResolvedValue([])
})

describe('crearDepartamento — trim de nombre antes de mayusculizar', () => {
  it('recorta espacios al inicio/fin del nombre antes de guardarlo en mayusculas', async () => {
    await crearDepartamento(' viveres ', 'empresa-1')

    const values = mockedKysely.values.mock.calls[0]![0] as Record<string, unknown>
    expect(values.nombre).toBe('VIVERES')
  })

  it('nombre sin espacios extra: sigue guardandose en mayusculas (no regresion)', async () => {
    await crearDepartamento('bebidas', 'empresa-1')

    const values = mockedKysely.values.mock.calls[0]![0] as Record<string, unknown>
    expect(values.nombre).toBe('BEBIDAS')
  })
})

describe('actualizarDepartamento — trim de nombre antes de mayusculizar', () => {
  it('recorta espacios al inicio/fin del nombre antes de guardarlo en mayusculas', async () => {
    await actualizarDepartamento('depto-1', { nombre: '  limpieza  ' })

    const updates = mockedKysely.set.mock.calls[0]![0] as Record<string, unknown>
    expect(updates.nombre).toBe('LIMPIEZA')
  })
})
