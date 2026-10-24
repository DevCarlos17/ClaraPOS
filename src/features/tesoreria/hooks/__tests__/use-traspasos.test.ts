// `desvalidarTraspaso` (change `split-desconciliar-reversar-historico`) es
// el espejo invertido de `validarTraspaso` (use-traspasos.ts:986-1032):
// mismo SELECT + branch (`cuenta_origen_tipo`/`cuenta_destino_tipo`) + skip
// de `SESION_CAJA`, pero en vez de `validado=1` hace `validado=0` +
// `validado_por`/`validado_at`→NULL en AMBOS lados, dentro de una unica
// `db.writeTransaction`. Mockeamos `@/core/db/powersync/db` con el mismo
// patron de `use-reverso-abono-directo.test.ts`.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { desvalidarTraspaso } from '../use-traspasos'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

function mockTraspaso(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    cuenta_origen_tipo: 'BANCO',
    mov_origen_id: 'mov-origen-1',
    cuenta_destino_tipo: 'CAJA_FUERTE',
    mov_destino_id: 'mov-destino-1',
    reversado: 0,
    ...overrides,
  }
}

function buildFakeTx(traspaso: ReturnType<typeof mockTraspaso>) {
  const calls: Call[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (sql.startsWith('SELECT * FROM traspasos_tesoreria')) {
        return { rows: { length: 1, item: () => traspaso } }
      }
      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

function setupWriteTransaction(traspaso: ReturnType<typeof mockTraspaso>) {
  const { tx, calls } = buildFakeTx(traspaso)
  mockedDb.writeTransaction.mockImplementationOnce(async (callback) => callback(tx))
  return calls
}

describe('desvalidarTraspaso', () => {
  it('flip validado=0 + validado_por/validado_at→NULL en AMBOS lados (BANCO origen, CAJA_FUERTE destino) en una unica tx', async () => {
    const calls = setupWriteTransaction(mockTraspaso())

    await desvalidarTraspaso('traspaso-1', 'emp-1')

    expect(mockedDb.writeTransaction).toHaveBeenCalledTimes(1)

    const updateOrigen = calls.find(
      (c) => c.sql.startsWith('UPDATE movimientos_bancarios') && c.params.includes('mov-origen-1')
    )
    expect(updateOrigen).toBeDefined()
    expect(updateOrigen!.sql).toContain('validado = 0')
    expect(updateOrigen!.sql).toContain('validado_por = NULL')
    expect(updateOrigen!.sql).toContain('validado_at = NULL')
    expect(updateOrigen!.params).toEqual(['mov-origen-1'])

    const updateDestino = calls.find(
      (c) => c.sql.startsWith('UPDATE mov_caja_fuerte') && c.params.includes('mov-destino-1')
    )
    expect(updateDestino).toBeDefined()
    expect(updateDestino!.sql).toContain('validado = 0')
    expect(updateDestino!.sql).toContain('validado_por = NULL')
    expect(updateDestino!.sql).toContain('validado_at = NULL')
    expect(updateDestino!.params).toEqual(['mov-destino-1'])
  })

  it('branch invertido: origen CAJA_FUERTE → mov_caja_fuerte, destino BANCO → movimientos_bancarios', async () => {
    const calls = setupWriteTransaction(
      mockTraspaso({
        cuenta_origen_tipo: 'CAJA_FUERTE',
        mov_origen_id: 'mov-cf-origen',
        cuenta_destino_tipo: 'BANCO',
        mov_destino_id: 'mov-banco-destino',
      })
    )

    await desvalidarTraspaso('traspaso-2', 'emp-1')

    const updateOrigen = calls.find(
      (c) => c.sql.startsWith('UPDATE mov_caja_fuerte') && c.params.includes('mov-cf-origen')
    )
    expect(updateOrigen).toBeDefined()

    const updateDestino = calls.find(
      (c) => c.sql.startsWith('UPDATE movimientos_bancarios') && c.params.includes('mov-banco-destino')
    )
    expect(updateDestino).toBeDefined()
  })

  it('skip SESION_CAJA: no ejecuta UPDATE para el lado cuyo tipo es SESION_CAJA', async () => {
    const calls = setupWriteTransaction(
      mockTraspaso({
        cuenta_origen_tipo: 'SESION_CAJA',
        mov_origen_id: 'mov-sesion-1',
        cuenta_destino_tipo: 'BANCO',
        mov_destino_id: 'mov-destino-banco',
      })
    )

    await desvalidarTraspaso('traspaso-3', 'emp-1')

    // El lado SESION_CAJA no tiene columna validado — cero UPDATE con ese id.
    expect(calls.some((c) => c.params.includes('mov-sesion-1'))).toBe(false)

    const updateDestino = calls.find(
      (c) => c.sql.startsWith('UPDATE movimientos_bancarios') && c.params.includes('mov-destino-banco')
    )
    expect(updateDestino).toBeDefined()
  })

  it('guard: rechaza si reversado=1, sin ejecutar ningun UPDATE', async () => {
    const calls = setupWriteTransaction(mockTraspaso({ reversado: 1 }))

    await expect(desvalidarTraspaso('traspaso-4', 'emp-1')).rejects.toThrow(
      'Este traspaso ya fue reversado'
    )

    expect(calls.filter((c) => c.sql.startsWith('UPDATE'))).toHaveLength(0)
  })

  it('aislamiento multi-tenant: el SELECT filtra por id y empresa_id', async () => {
    const calls = setupWriteTransaction(mockTraspaso())

    await desvalidarTraspaso('traspaso-5', 'emp-b')

    const select = calls.find((c) => c.sql.startsWith('SELECT * FROM traspasos_tesoreria'))
    expect(select).toBeDefined()
    expect(select!.sql).toContain('WHERE id = ? AND empresa_id = ?')
    expect(select!.params).toEqual(['traspaso-5', 'emp-b'])
  })
})
