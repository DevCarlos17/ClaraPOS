// `use-clientes.ts` importa `kysely` (`@/core/db/kysely/kysely`), que a su
// vez importa `db` desde `@/core/db/powersync/db` (instancia real de
// `PowerSyncDatabase`, un Worker, al cargar el modulo). Sin este mock,
// importar el archivo revienta con "Worker is not defined" en Vitest
// (happy-dom, sin Worker global) aunque `buildMovimientosClienteFiltro` no
// use `kysely` — mismo patron que `use-productos.test.ts`/`use-ajustes.test.ts`.
vi.mock('@/core/db/powersync/db', () => ({
  db: { execute: vi.fn(), writeTransaction: vi.fn() },
}))

import { buildMovimientosClienteFiltro } from '../use-clientes'

// `buildMovimientosClienteFiltro` es el constructor PURO del SQL de
// `useMovimientosClienteFiltrados` (Design §Root Cause — elimina las dos
// queries independientes que hacian divergir header/body). Mismo patron que
// `kardex-sql.ts`/`notas-credito-admin-filters.ts`: `datetime(col) >= datetime(?
// || 'T00:00:00' || VE_OFFSET)` en vez de comparacion de string directa, y
// SIEMPRE parametrizado. NUNCA lleva LIMIT — el estado de cuenta muestra
// TODOS los movimientos del rango, no solo los ultimos N (Spec: "Renders all
// fetched movements").
describe('buildMovimientosClienteFiltro', () => {
  it('incluye empresa_id, cliente_id y rango de fecha inclusive via datetime()/VE_OFFSET, sin LIMIT', () => {
    const { sql, params } = buildMovimientosClienteFiltro('emp-1', 'cli-1', {
      fechaDesde: '2026-08-01',
      fechaHasta: '2026-08-31',
    })

    expect(sql).toContain('WHERE empresa_id = ? AND cliente_id = ?')
    expect(sql).toContain("datetime(fecha) >= datetime(? || 'T00:00:00-04:00')")
    expect(sql).toContain("datetime(fecha) <= datetime(? || 'T23:59:59-04:00')")
    expect(sql).toContain('ORDER BY fecha DESC, created_at DESC, rowid DESC')
    expect(sql).not.toMatch(/LIMIT/i)
    expect(params).toEqual(['emp-1', 'cli-1', '2026-08-01', '2026-08-31'])
  })

  it('triangulacion: otro empresaId/clienteId/rango produce otros params — mismo shape de SQL', () => {
    const { sql, params } = buildMovimientosClienteFiltro('emp-2', 'cli-9', {
      fechaDesde: '2026-01-01',
      fechaHasta: '2026-01-01',
    })

    expect(params).toEqual(['emp-2', 'cli-9', '2026-01-01', '2026-01-01'])
    expect(sql).not.toMatch(/LIMIT/i)
    expect(sql).toContain('WHERE empresa_id = ? AND cliente_id = ?')
  })
})
