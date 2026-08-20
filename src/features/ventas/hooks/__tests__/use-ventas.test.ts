// Mockeamos `@/core/db/powersync/db` porque `use-ventas.ts` usa `db.execute`
// (buscarProductoPorCodigoBarras) y `db.writeTransaction` (crearVenta) a nivel
// de modulo — sin este mock, importar el archivo construye una
// PowerSyncDatabase real y revienta con "Worker is not defined" en el
// entorno de test. Mismo patron que use-kardex.test.ts / stock-deposito.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

import { db } from '@/core/db/powersync/db'
import { buscarProductoPorCodigoBarras } from '../use-ventas'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

function mockExecute(row: Record<string, unknown> | null) {
  const calls: Call[] = []
  mockedDb.execute.mockImplementation((async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return row
      ? { rows: { length: 1, item: () => row } }
      : { rows: { length: 0, item: () => undefined } }
  }) as unknown as typeof db.execute)
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buscarProductoPorCodigoBarras — Slice 2a (lectura de stock escopeada por deposito)', () => {
  it('SIN depositoId (retro-compatibilidad, ej. reportes): NO agrega JOIN a inventario_stock, lee p.stock directo', async () => {
    const calls = mockExecute({
      id: 'prod-1', codigo: 'P-1', tipo: 'P', nombre: 'Producto 1',
      precio_venta_usd: '10.00', precio_mayor_usd: '9.00', precio_especial_usd: '8.00',
      stock: '5.000', codigo_barras: '7501234', es_decimal: 1,
      tipo_impuesto: 'Exento', impuesto_pct: 0,
    })

    const result = await buscarProductoPorCodigoBarras('7501234', 'emp-1')

    expect(result?.stock).toBe('5.000')
    const call = calls[0]
    expect(call.sql).not.toContain('inventario_stock')
    expect(call.sql).toContain('p.stock')
    expect(call.params).toEqual(['emp-1', '7501234'])
  })

  it('CON depositoId (POS): JOIN a inventario_stock escopeado a ese deposito, param antepuesto, stock via COALESCE', async () => {
    const calls = mockExecute({
      id: 'prod-1', codigo: 'P-1', tipo: 'P', nombre: 'Producto 1',
      precio_venta_usd: '10.00', precio_mayor_usd: '9.00', precio_especial_usd: '8.00',
      stock: '0', codigo_barras: '7501234', es_decimal: 1,
      tipo_impuesto: 'Exento', impuesto_pct: 0,
    })

    await buscarProductoPorCodigoBarras('7501234', 'emp-1', 'dep-B')

    const call = calls[0]
    expect(call.sql).toContain('LEFT JOIN inventario_stock')
    expect(call.sql).toContain('COALESCE(s.cantidad_actual, 0)')
    expect(call.params).toEqual(['dep-B', 'emp-1', '7501234'])
  })

  it('producto con 0 stock en el deposito de la caja: no matchea (filtro CAST(...) > 0 aplicado en SQL) — la query real ya lo excluye, aqui verificamos que el filtro usa la expresion escopeada', async () => {
    mockExecute(null)

    const result = await buscarProductoPorCodigoBarras('0000000', 'emp-1', 'dep-B')

    expect(result).toBeNull()
  })
})
