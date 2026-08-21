// `use-productos.ts` importa `useCurrentUser`, que a su vez importa
// `auth-provider.tsx` → `@/core/db/powersync` (singleton PowerSyncDatabase
// real). Sin este mock, importar el modulo revienta con "Worker is not
// defined" en el entorno de test aunque `crearProducto`/`actualizarProducto`
// no lo usen directamente — mismo patron que use-kardex.test.ts.
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

// `crearProducto`/`actualizarProducto` escriben via `kysely.insertInto(...)`
// / `kysely.updateTable(...)` — mockeamos el builder encadenable minimo,
// mismo patron que use-ajustes.test.ts.
vi.mock('@/core/db/kysely/kysely', () => {
  const builder = {
    insertInto: vi.fn(),
    updateTable: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    execute: vi.fn(),
  }
  builder.insertInto.mockReturnValue(builder)
  builder.updateTable.mockReturnValue(builder)
  builder.values.mockReturnValue(builder)
  builder.set.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  builder.execute.mockResolvedValue(undefined)
  return { kysely: builder }
})

import { kysely } from '@/core/db/kysely/kysely'
import { crearProducto, actualizarProducto } from '../use-productos'

const mockedKysely = vi.mocked(kysely, true) as unknown as {
  values: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

function baseCrearData(overrides: Partial<Parameters<typeof crearProducto>[0]> = {}) {
  return {
    codigo: 'PROD-1',
    tipo: 'P',
    nombre: 'Producto Test',
    departamento_id: 'depto-1',
    costo_usd: 5,
    precio_venta_usd: 8,
    precio_mayor_usd: null,
    stock_minimo: 0,
    empresa_id: 'emp-1',
    ...overrides,
  }
}

describe('crearProducto — persistencia de productos.deposito_id (Slice 1c, PDD/Persistencia del Deposito por Defecto)', () => {
  it('deposito_id provisto: se persiste en el INSERT', async () => {
    await crearProducto(baseCrearData({ deposito_id: 'dep-A' }))

    const values = mockedKysely.values.mock.calls[0]![0] as Record<string, unknown>
    expect(values.deposito_id).toBe('dep-A')
  })

  it('deposito_id no provisto: se persiste como NULL (producto sin deposito default aun)', async () => {
    await crearProducto(baseCrearData())

    const values = mockedKysely.values.mock.calls[0]![0] as Record<string, unknown>
    expect(values.deposito_id).toBeNull()
  })
})

describe('actualizarProducto — edicion de productos.deposito_id (Slice 1c, PDD/Editar deposito default)', () => {
  it('deposito_id provisto en la edicion: se incluye en el UPDATE', async () => {
    await actualizarProducto('prod-1', { deposito_id: 'dep-B' })

    const updates = mockedKysely.set.mock.calls[0]![0] as Record<string, unknown>
    expect(updates.deposito_id).toBe('dep-B')
  })

  it('deposito_id NO provisto (undefined): no se toca el campo en el UPDATE (preserva el valor existente)', async () => {
    await actualizarProducto('prod-1', { nombre: 'Otro nombre' })

    const updates = mockedKysely.set.mock.calls[0]![0] as Record<string, unknown>
    expect('deposito_id' in updates).toBe(false)
  })
})
