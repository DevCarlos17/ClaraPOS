// `use-clientes.ts` importa `kysely` (`@/core/db/kysely/kysely`), que a su
// vez importa `db` desde `@/core/db/powersync/db` (instancia real de
// `PowerSyncDatabase`, un Worker, al cargar el modulo). Sin este mock,
// importar el archivo revienta con "Worker is not defined" en Vitest
// (happy-dom, sin Worker global) aunque `buildMovimientosClienteFiltro` no
// use `kysely` — mismo patron que `use-productos.test.ts`/`use-ajustes.test.ts`.
vi.mock('@/core/db/powersync/db', () => ({
  db: { execute: vi.fn(), writeTransaction: vi.fn() },
}))

import { DatabaseSync } from 'node:sqlite'
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
    // `fecha` se normaliza con replace(...,'+00','Z') porque SQLite no parsea
    // el offset `+00` de Postgres/PowerSync y datetime() retornaria NULL.
    expect(sql).toContain(
      "datetime(replace(fecha, '+00', 'Z')) >= datetime(? || 'T00:00:00-04:00')"
    )
    expect(sql).toContain(
      "datetime(replace(fecha, '+00', 'Z')) <= datetime(? || 'T23:59:59-04:00')"
    )
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

// Bug real de QA: el cliente mostraba saldo != 0 pero "Sin movimientos". Los
// tests de arriba solo comparan texto SQL — nunca ejecutaron la query contra
// un motor SQLite real, por lo que nunca hubieran detectado este bug. Estos
// tests SI ejecutan `buildMovimientosClienteFiltro` contra `node:sqlite`
// (mismo motor/gramatica de fechas que wa-sqlite en runtime) sembrando una
// fila con el formato REAL con el que Postgres/PowerSync guarda `fecha`:
// `'2026-09-10 15:06:42.788+00'` — offset UTC de 2 digitos SIN los dos
// puntos (`+00`, no `+00:00` ni `Z`). `datetime()` de SQLite no sabe parsear
// ese offset y retorna NULL, y toda comparacion contra NULL es `false` en
// SQLite -> 0 filas, aunque la fila exista dentro del rango.
describe('buildMovimientosClienteFiltro — inclusion de filas contra SQLite real (bug offset +00 de Postgres)', () => {
  function seedDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE movimientos_cuenta (
        id TEXT PRIMARY KEY,
        empresa_id TEXT,
        cliente_id TEXT,
        fecha TEXT,
        created_at TEXT
      )
    `)
    db.exec(`
      INSERT INTO movimientos_cuenta (id, empresa_id, cliente_id, fecha, created_at) VALUES
        ('mov-bug-qa', 'emp-1', 'cli-1', '2026-09-10 15:06:42.788+00', '2026-09-10 15:06:42.788+00'),
        ('mov-nocturno', 'emp-1', 'cli-1', '2026-09-30 01:30:00.000+00', '2026-09-30 01:30:00.000+00'),
        ('mov-fuera-de-rango', 'emp-1', 'cli-1', '2026-01-01 12:00:00.000+00', '2026-01-01 12:00:00.000+00')
    `)
    return db
  }

  it('RED: la fila reportada por QA (fecha con offset +00) NO aparece con el SQL previo a la correccion', () => {
    const db = seedDb()
    try {
      // SQL literal de `buildMovimientosClienteFiltro` ANTES de la correccion
      // (`datetime(fecha)` sin normalizar el offset) — reproduce el bug real
      // reportado por QA para dejar constancia permanente de la regresion.
      const sqlPreCorreccion = `SELECT * FROM movimientos_cuenta
         WHERE empresa_id = ? AND cliente_id = ?
           AND datetime(fecha) >= datetime(? || 'T00:00:00-04:00')
           AND datetime(fecha) <= datetime(? || 'T23:59:59-04:00')
         ORDER BY fecha DESC, created_at DESC, rowid DESC`

      const rows = db
        .prepare(sqlPreCorreccion)
        .all('emp-1', 'cli-1', '2026-09-01', '2026-09-11')

      expect(rows).toHaveLength(0)
    } finally {
      db.close()
    }
  })

  it('GREEN: buildMovimientosClienteFiltro (SQL corregido) SI retorna la fila real de QA', () => {
    const db = seedDb()
    try {
      const { sql, params } = buildMovimientosClienteFiltro('emp-1', 'cli-1', {
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-11',
      })

      const rows = db.prepare(sql).all(...(params as (string | number)[])) as {
        id: string
      }[]

      expect(rows.map((r) => r.id)).toEqual(['mov-bug-qa'])
    } finally {
      db.close()
    }
  })

  it('triangulacion (caso limite nocturno VET): fila de 21:30 VET (01:30 UTC del dia siguiente) cae en el dia VE correcto', () => {
    const db = seedDb()
    try {
      const { sql, params } = buildMovimientosClienteFiltro('emp-1', 'cli-1', {
        fechaDesde: '2026-09-29',
        fechaHasta: '2026-09-30',
      })

      const rows = db.prepare(sql).all(...(params as (string | number)[])) as {
        id: string
      }[]

      expect(rows.map((r) => r.id)).toEqual(['mov-nocturno'])
    } finally {
      db.close()
    }
  })

  it('triangulacion (exclusion): una fila fuera del rango sigue sin aparecer con el SQL corregido', () => {
    const db = seedDb()
    try {
      const { sql, params } = buildMovimientosClienteFiltro('emp-1', 'cli-1', {
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-11',
      })

      const rows = db.prepare(sql).all(...(params as (string | number)[])) as {
        id: string
      }[]

      expect(rows.map((r) => r.id)).not.toContain('mov-fuera-de-rango')
    } finally {
      db.close()
    }
  })
})
