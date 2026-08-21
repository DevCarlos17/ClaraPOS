// Mockeamos `@/core/db/powersync/db` porque `crearPlantilla`/`actualizarPlantilla`/
// `desactivarPlantilla` usan `db.writeTransaction` a nivel de modulo — sin este
// mock, importar `use-plantillas-traspaso.ts` construye una PowerSyncDatabase
// real y revienta con "Worker is not defined" en el entorno de test. Mismo
// patron que use-traspasos.test.ts / use-kardex.test.ts / use-ajustes.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { crearPlantilla, actualizarPlantilla, desactivarPlantilla } from '../use-plantillas-traspaso'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

/**
 * Simula la tx de crearPlantilla/actualizarPlantilla/desactivarPlantilla:
 * captura cada `tx.execute` sin necesitar estado (a diferencia de
 * `crearTraspaso`, estas escrituras no leen stock/kardex — son INSERT/UPDATE/
 * DELETE directos sobre las dos tablas nuevas).
 */
function mockPlantillaTx() {
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

describe('crearPlantilla — header + detalle atomicos (Crear Plantilla/Plantilla creada correctamente)', () => {
  it('inserta 1 header + N det en una unica writeTransaction, todo scoped a empresa_id', async () => {
    const calls = mockPlantillaTx()

    const id = await crearPlantilla({
      nombre: 'Reposicion Mostrador',
      descripcion: 'Set mensual',
      empresa_id: 'emp-1',
      productoIds: ['prod-1', 'prod-2', 'prod-3'],
    })

    expect(id).toBeDefined()
    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)

    const headerInsert = calls.find((c) => c.sql.startsWith('INSERT INTO traspaso_plantillas\n') || c.sql.startsWith('INSERT INTO traspaso_plantillas ('))
    expect(headerInsert).toBeDefined()
    expect(headerInsert!.params).toContain('emp-1')
    expect(headerInsert!.params).toContain(id)

    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspaso_plantillas_det'))
    expect(detInserts).toHaveLength(3)
    for (const det of detInserts) {
      expect(det.params).toContain(id)
      expect(det.params).toContain('emp-1')
    }
    expect(detInserts.map((c) => c.params).flat()).toContain('prod-1')
    expect(detInserts.map((c) => c.params).flat()).toContain('prod-2')
    expect(detInserts.map((c) => c.params).flat()).toContain('prod-3')
  })
})

describe('crearPlantilla — validaciones (Rechazo sin nombre, Rechazo sin productos)', () => {
  it('rechaza con nombre vacio ANTES de abrir la transaccion, no escribe ninguna fila', async () => {
    mockPlantillaTx()

    await expect(
      crearPlantilla({ nombre: '  ', empresa_id: 'emp-1', productoIds: ['prod-1'] })
    ).rejects.toThrow(/nombre/i)

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })

  it('rechaza con cero productos ANTES de abrir la transaccion, no escribe ninguna fila', async () => {
    mockPlantillaTx()

    await expect(
      crearPlantilla({ nombre: 'Set Vacio', empresa_id: 'emp-1', productoIds: [] })
    ).rejects.toThrow(/producto/i)

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
  })
})

describe('actualizarPlantilla — reemplazo de detalle (Editar Plantilla/Edicion de nombre y productos)', () => {
  it('renombra la cabecera y reemplaza TODO el detalle (delete-and-reinsert) en una unica writeTransaction', async () => {
    const calls = mockPlantillaTx()

    await actualizarPlantilla('plantilla-1', {
      nombre: 'Reposicion Semanal',
      empresa_id: 'emp-1',
      productoIds: ['prod-4', 'prod-5'],
    })

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)

    const headerUpdate = calls.find((c) => c.sql.startsWith('UPDATE traspaso_plantillas SET'))
    expect(headerUpdate).toBeDefined()
    expect(headerUpdate!.sql).toContain('nombre = ?')
    expect(headerUpdate!.params).toContain('REPOSICION SEMANAL')
    expect(headerUpdate!.params).toContain('plantilla-1')
    expect(headerUpdate!.params).toContain('emp-1')

    const deleteDet = calls.find((c) => c.sql.startsWith('DELETE FROM traspaso_plantillas_det'))
    expect(deleteDet).toBeDefined()
    expect(deleteDet!.params).toEqual(['plantilla-1'])

    // El DELETE debe ejecutarse ANTES de los nuevos INSERT (reemplazo completo del set).
    const deleteIdx = calls.indexOf(deleteDet!)
    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspaso_plantillas_det'))
    expect(detInserts).toHaveLength(2)
    for (const det of detInserts) {
      expect(calls.indexOf(det)).toBeGreaterThan(deleteIdx)
      expect(det.params).toContain('plantilla-1')
    }
    expect(detInserts.map((c) => c.params).flat()).toContain('prod-4')
    expect(detInserts.map((c) => c.params).flat()).toContain('prod-5')
  })

  it('sin `productoIds`, actualiza solo la cabecera y NO toca el detalle', async () => {
    const calls = mockPlantillaTx()

    await actualizarPlantilla('plantilla-2', { descripcion: 'Nueva descripcion', empresa_id: 'emp-1' })

    const headerUpdate = calls.find((c) => c.sql.startsWith('UPDATE traspaso_plantillas SET'))
    expect(headerUpdate).toBeDefined()
    expect(headerUpdate!.sql).toContain('descripcion = ?')

    const deleteDet = calls.find((c) => c.sql.startsWith('DELETE FROM traspaso_plantillas_det'))
    expect(deleteDet).toBeUndefined()
    const detInserts = calls.filter((c) => c.sql.startsWith('INSERT INTO traspaso_plantillas_det'))
    expect(detInserts).toHaveLength(0)
  })
})

describe('desactivarPlantilla — soft-delete (Desactivar Plantilla/Desactivacion no borra el registro)', () => {
  it('emite UPDATE is_active=0 unicamente — sin cambios de detalle, sin DELETE del header', async () => {
    const calls = mockPlantillaTx()

    await desactivarPlantilla('plantilla-3', 'emp-1')

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.sql).toContain('UPDATE traspaso_plantillas')
    expect(calls[0]!.sql).toContain('is_active = 0')
    expect(calls[0]!.params).toContain('plantilla-3')

    const deleteCalls = calls.filter((c) => c.sql.startsWith('DELETE'))
    expect(deleteCalls).toHaveLength(0)
  })

  it('filtra el UPDATE por empresa_id (aislamiento multi-tenant, no desactiva plantillas de otra empresa)', async () => {
    const calls = mockPlantillaTx()

    await desactivarPlantilla('plantilla-3', 'emp-1')

    expect(calls[0]!.sql).toContain('empresa_id = ?')
    // El empresa_id debe ir entre los params del UPDATE.
    expect(calls[0]!.params).toContain('emp-1')
  })
})
