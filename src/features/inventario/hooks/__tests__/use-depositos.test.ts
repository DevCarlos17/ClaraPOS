// Invariante "single es_principal deposito per empresa" (Lote B — tester
// request): `crearDeposito`/`actualizarDeposito` deben desmarcar, dentro de
// la MISMA `db.writeTransaction`, cualquier OTRO deposito principal de la
// misma empresa cuando el deposito guardado queda es_principal=true. Sin
// esto, `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` (que resuelven
// el principal via `... WHERE es_principal=1 LIMIT 1` sin ORDER BY) tendrian
// resultado no-determinista si 2+ depositos quedaran marcados.
//
// Mockeamos `@/core/db/powersync/db` porque `crearDeposito`/`actualizarDeposito`
// usan `db.getAll` (pre-fetch de empresa_id fuera de la tx, solo en el UPDATE)
// y `db.writeTransaction` a nivel de modulo — mismo patron que
// use-agenda-config.test.ts / use-compras.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/web'
import { db } from '@/core/db/powersync/db'
import { crearDeposito, actualizarDeposito } from '../use-depositos'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

/** Captura cada `tx.execute` dentro de la unica `db.writeTransaction`. */
function mockWriteTransaction() {
  const calls: Call[] = []
  mockedDb.writeTransaction.mockImplementation(async (callback) => {
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return callback(tx)
  })
  return calls
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crearDeposito — invariante single es_principal por empresa', () => {
  it('es_principal=true: desmarca los principales existentes de la empresa ANTES de insertar, en la misma transaccion', async () => {
    const calls = mockWriteTransaction()

    await crearDeposito({
      nombre: 'Almacen Norte',
      es_principal: true,
      permite_venta: true,
      empresa_id: 'empresa-1',
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('UPDATE depositos')
    expect(calls[0].sql).toContain('SET es_principal = 0')
    expect(calls[0].params).toEqual(expect.arrayContaining(['empresa-1']))
    expect(calls[1].sql).toContain('INSERT INTO depositos')
  })

  it('es_principal=false: NO emite el UPDATE de desmarcado, solo inserta', async () => {
    mockedDb.getAll.mockResolvedValue([{ cnt: 1 }])
    const calls = mockWriteTransaction()

    await crearDeposito({
      nombre: 'Almacen Secundario',
      es_principal: false,
      permite_venta: true,
      empresa_id: 'empresa-1',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO depositos')
  })
})

describe('crearDeposito — invariante deposito activo unico debe ser principal', () => {
  it('es_principal=false y ningun otro deposito activo (cnt=0): BLOQUEA con error en espanol y NO abre writeTransaction', async () => {
    mockedDb.getAll.mockResolvedValue([{ cnt: 0 }])
    const calls = mockWriteTransaction()

    await expect(
      crearDeposito({
        nombre: 'Almacen Unico',
        es_principal: false,
        permite_venta: true,
        empresa_id: 'empresa-1',
      })
    ).rejects.toThrow('El único depósito activo de la empresa debe ser principal')

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('es_principal=false pero YA existe otro deposito activo (cnt>0): PERMITE y escribe normalmente', async () => {
    mockedDb.getAll.mockResolvedValue([{ cnt: 1 }])
    const calls = mockWriteTransaction()

    await crearDeposito({
      nombre: 'Almacen Secundario',
      es_principal: false,
      permite_venta: true,
      empresa_id: 'empresa-1',
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('INSERT INTO depositos')
  })

  it('es_principal=true: nunca puede bloquear, NO consulta el conteo de activos y escribe normalmente', async () => {
    const calls = mockWriteTransaction()

    await crearDeposito({
      nombre: 'Almacen Principal',
      es_principal: true,
      permite_venta: true,
      empresa_id: 'empresa-1',
    })

    expect(mockedDb.getAll).not.toHaveBeenCalled()
    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })
})

describe('actualizarDeposito — invariante single es_principal por empresa', () => {
  it('es_principal=true: desmarca los OTROS principales de la empresa (excluyendo el propio id) antes de actualizar, en la misma transaccion', async () => {
    mockedDb.getAll.mockResolvedValue([{ empresa_id: 'empresa-1' }])
    const calls = mockWriteTransaction()

    await actualizarDeposito('deposito-actual', { es_principal: true })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(calls[0].sql).toContain('UPDATE depositos')
    expect(calls[0].sql).toContain('SET es_principal = 0')
    expect(calls[0].sql).toContain('id != ?')
    expect(calls[0].params).toEqual(expect.arrayContaining(['empresa-1', 'deposito-actual']))
    expect(calls[1].sql).toContain('UPDATE depositos SET')
    expect(calls[1].params[calls[1].params.length - 1]).toBe('deposito-actual')
  })

  it('es_principal=false (o ausente): NO emite el UPDATE de desmarcado, solo el UPDATE del propio deposito', async () => {
    const calls = mockWriteTransaction()

    await actualizarDeposito('deposito-actual', { nombre: 'Renombrado' })

    expect(mockedDb.getAll).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('UPDATE depositos SET')
  })
})

// Invariante "al menos un deposito principal activo por empresa" (at-least-one
// — cierra la decision de producto que quedo abierta en Lote B). El unico
// principal de la empresa NO puede quitarse (ni via es_principal:false, ni
// desactivandolo) sin antes marcar otro deposito como principal.
describe('actualizarDeposito — invariante al menos un principal por empresa (at-least-one)', () => {
  it('unset del UNICO principal activo (es_principal:false, sin otro principal en la empresa): BLOQUEA con error en espanol y NO escribe nada', async () => {
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 1, is_active: 1 }]
      }
      if (sql.startsWith('SELECT COUNT(*) as cnt FROM depositos')) {
        return [{ cnt: 0 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await expect(
      actualizarDeposito('deposito-unico-principal', { es_principal: false })
    ).rejects.toThrow('Debe existir al menos un deposito principal')

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('unset de un principal cuando OTRO deposito de la empresa YA es principal activo: PERMITE y escribe normalmente', async () => {
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 1, is_active: 1 }]
      }
      if (sql.startsWith('SELECT COUNT(*) as cnt FROM depositos')) {
        return [{ cnt: 1 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await actualizarDeposito('deposito-a', { es_principal: false })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('UPDATE depositos SET')
  })

  it('desactivar (is_active:false) el UNICO deposito principal activo TAMBIEN bloquea, aunque es_principal no se toque explicitamente', async () => {
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 1, is_active: 1 }]
      }
      if (sql.startsWith('SELECT COUNT(*) as cnt FROM depositos')) {
        return [{ cnt: 0 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await expect(
      actualizarDeposito('deposito-unico-principal', { is_active: false })
    ).rejects.toThrow('Debe existir al menos un deposito principal')

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('desactivar un deposito que NO es principal: PERMITE (el guard ni siquiera cuenta otros principales)', async () => {
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 0, is_active: 1 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await actualizarDeposito('deposito-secundario', { is_active: false })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
  })

  it('deposito NO principal, activo, es el UNICO activo (cnt=0), se reconfirma es_principal:false: BLOQUEA (invariante deposito activo unico debe ser principal)', async () => {
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 0, is_active: 1 }]
      }
      if (sql.startsWith('SELECT COUNT(*) as cnt FROM depositos')) {
        return [{ cnt: 0 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await expect(
      actualizarDeposito('deposito-no-principal-unico', { es_principal: false })
    ).rejects.toThrow('El único depósito activo de la empresa debe ser principal')

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })

  it('deposito NO principal, activo, existe OTRO deposito activo (aunque tampoco sea principal — drift de datos hipotetico): PERMITE, porque el conteo debe ser por is_active, no por es_principal (alineado con crearDeposito y el trigger 0086)', async () => {
    // Simula un estado hipotetico de drift de datos: otro deposito de la
    // empresa esta activo pero NO marcado es_principal (en operacion normal
    // esto no deberia ocurrir porque el guard at-least-one lo previene, pero
    // la query de esta rama NO debe depender de esa invariante externa para
    // ser correcta — debe usar el mismo criterio que `crearDeposito` y el
    // trigger Postgres: is_active=1, sin filtrar por es_principal).
    mockedDb.getAll.mockImplementation((async (sql: string) => {
      if (sql.startsWith('SELECT empresa_id, es_principal, is_active FROM depositos')) {
        return [{ empresa_id: 'empresa-1', es_principal: 0, is_active: 1 }]
      }
      if (sql.startsWith('SELECT COUNT(*) as cnt FROM depositos')) {
        // Bajo la query VIEJA (filtrada por es_principal=1) este sibling
        // activo-pero-no-principal es invisible -> cnt=0 -> bloquea mal.
        // Bajo la query NUEVA (solo is_active=1) se cuenta correctamente -> cnt=1 -> permite.
        if (sql.includes('es_principal = 1')) {
          return [{ cnt: 0 }]
        }
        return [{ cnt: 1 }]
      }
      return []
    }) as typeof db.getAll)
    const calls = mockWriteTransaction()

    await actualizarDeposito('deposito-no-principal', { es_principal: false })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('UPDATE depositos SET')
  })
})
