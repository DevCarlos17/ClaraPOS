// Mockeamos `@/core/db/powersync/db` porque `inventario-stock-backfill.ts`
// importa `recalcularStockDesdeKardex` de `stock-deposito.ts`, que usa
// `db.execute`/`db.writeTransaction` a nivel de modulo — sin este mock,
// importar el archivo construye una PowerSyncDatabase real y revienta con
// "Worker is not defined" en el entorno de test. Mismo patron que
// stock-deposito.test.ts. Los tests aqui inyectan su propio `recalcular`
// mock, por lo que el `db` real nunca se invoca — el mock solo evita el
// efecto de modulo al importar.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    execute: vi.fn(),
    writeTransaction: vi.fn(),
  },
}))

import { ejecutarInventarioStockBackfillSiNecesario } from '../inventario-stock-backfill'

function mockStore(yaEjecutado: boolean) {
  return {
    yaEjecutado: vi.fn(() => yaEjecutado),
    marcarCompletado: vi.fn(),
  }
}

describe('ejecutarInventarioStockBackfillSiNecesario — orquestacion idempotente del backfill (fix CRITICAL Slice 2a)', () => {
  it('flag AUSENTE (yaEjecutado=false): llama a recalcular con el empresa_id correcto y marca completado al terminar', async () => {
    const store = mockStore(false)
    const recalcular = vi.fn().mockResolvedValue(undefined)

    await ejecutarInventarioStockBackfillSiNecesario({ empresaId: 'emp-1', store, recalcular })

    expect(recalcular).toHaveBeenCalledTimes(1)
    expect(recalcular).toHaveBeenCalledWith({ empresa_id: 'emp-1' })
    expect(store.marcarCompletado).toHaveBeenCalledTimes(1)
  })

  it('flag YA MARCADO (yaEjecutado=true): NO llama a recalcular ni a marcarCompletado (idempotente)', async () => {
    const store = mockStore(true)
    const recalcular = vi.fn().mockResolvedValue(undefined)

    await ejecutarInventarioStockBackfillSiNecesario({ empresaId: 'emp-1', store, recalcular })

    expect(recalcular).not.toHaveBeenCalled()
    expect(store.marcarCompletado).not.toHaveBeenCalled()
  })

  it('recalcular() falla a mitad de camino: NO marca completado (para reintentar en el proximo arranque) y NO propaga el error', async () => {
    const store = mockStore(false)
    const recalcular = vi.fn().mockRejectedValue(new Error('SQLite locked'))

    await expect(
      ejecutarInventarioStockBackfillSiNecesario({ empresaId: 'emp-1', store, recalcular })
    ).resolves.toBeUndefined()

    expect(store.marcarCompletado).not.toHaveBeenCalled()
  })
})
