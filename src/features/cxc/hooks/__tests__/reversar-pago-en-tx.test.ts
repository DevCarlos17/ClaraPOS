// `reversarPagoEnTx` (slice 2a, `reverso-abono-directo-tesoreria-sin-saf`) es
// el cuerpo transaccional extraido de `registrarReversoAbono` para ser
// reutilizable por el futuro orquestador de reverso directo desde tesoreria
// (slice 2b-i), que abre SU PROPIA `db.writeTransaction` y necesita delegar
// la reversa de cada pago SIN abrir una tx anidada (wa-sqlite no soporta tx
// anidadas). Estos tests prueban el CONTRATO: `reversarPagoEnTx` ejecuta las
// statements de reversa contra la `tx` PROVISTA por el llamador y JAMAS
// llama `db.writeTransaction` — mismo patron de mock que
// `use-cxc.test.ts`/`reversa-pago-saf.test.ts` (importar `use-cxc.ts`
// requiere mockear `@/core/db/powersync/db` y los modulos de contabilidad
// para no construir un PowerSyncDatabase/Kysely real en el entorno de test).
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosPagoCxC: vi.fn(async () => undefined),
  reversarAsientos: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))

import type { Transaction } from '@powersync/common'
import { db } from '@/core/db/powersync/db'
import { reversarPagoSafEnTx } from '@/features/cxc/hooks/reversa-pago-saf'
import { toStorageString } from '@/lib/currency'
import { reversarPagoEnTx } from '../use-cxc'

const mockedDb = vi.mocked(db, true)

interface Call {
  sql: string
  params: unknown[]
}

vi.mock('@/features/cxc/hooks/reversa-pago-saf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/cxc/hooks/reversa-pago-saf')>()
  return {
    ...actual,
    reversarPagoSafEnTx: vi.fn(async () => undefined),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
})

function buildFakeTx(opts: {
  pagoMontoUsd: string
  saldoPendActual: string
  totalUsd: string
  saldoClienteActual: string
  ventaId?: string | null
}) {
  const calls: Call[] = []
  const tx = {
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (
        sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')
      ) {
        return {
          rows: {
            length: 1,
            item: () => ({
              id: 'pago-ext-1',
              venta_id: opts.ventaId ?? 'venta-ext-1',
              cliente_id: 'cliente-ext-1',
              monto_usd: opts.pagoMontoUsd,
              is_reversed: 0,
              tasa: null,
              monto: null,
              moneda_id: null,
            }),
          },
        }
      }
      if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
        return {
          rows: {
            length: 1,
            item: () => ({
              nro_factura: 'F-EXT-001',
              saldo_pend_usd: opts.saldoPendActual,
              total_usd: opts.totalUsd,
            }),
          },
        }
      }
      if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
        return {
          rows: {
            length: 1,
            item: () => ({
              saldo_actual: opts.saldoClienteActual,
              saldo_pendiente_usd: '0',
            }),
          },
        }
      }
      if (sql.startsWith('SELECT id FROM libro_contable WHERE')) {
        return { rows: { length: 0, item: () => undefined } }
      }
      return { rows: { length: 0, item: () => undefined } }
    }),
  } as unknown as Transaction
  return { tx, calls }
}

describe('reversarPagoEnTx — acepta tx externa, no abre su propio writeTransaction', () => {
  it('ejecuta la reversa contra la tx PROVISTA por el llamador y nunca llama db.writeTransaction', async () => {
    const { tx, calls } = buildFakeTx({
      pagoMontoUsd: '15.00000000',
      saldoPendActual: '40.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      reversedBy: 'user-ext-1',
      reversedByNombre: 'Supervisor Test',
      reason: 'Reverso directo desde tesoreria (test)',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: false,
    })

    // Contrato (slice 2a): jamas abre su propia tx — toda la escritura va
    // contra la `tx` provista por el llamador (mock inyectado directamente,
    // nunca via `mockedDb.writeTransaction`). Este assert es el que
    // falla si alguien reintroduce un `db.writeTransaction` dentro de
    // `reversarPagoEnTx` (tx anidada, no soportada por wa-sqlite).
    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()

    // Prueba de comportamiento real: la mutacion de reversa SI corrio contra
    // la tx provista (UPDATE pagos marca is_reversed=1 con los datos exactos
    // pasados por params).
    const pagoUpdate = calls.find((c) => c.sql.startsWith('UPDATE pagos SET is_reversed = 1'))
    expect(pagoUpdate).toBeDefined()
    expect(pagoUpdate!.params).toEqual([
      '2026-01-01T00:00:00.000Z',
      'user-ext-1',
      'Reverso directo desde tesoreria (test)',
      'pago-ext-1',
    ])

    const ventaUpdate = calls.find((c) =>
      c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?')
    )
    expect(ventaUpdate).toBeDefined()
    // 40 + 15 = 55 < 100
    expect(ventaUpdate!.params).toEqual([toStorageString(55), 'reversado', 'venta-ext-1'])
  })

  it('triangulacion: generatedLote=true delega en reversarPagoSafEnTx(tx,...) contra la MISMA tx, y nunca llama db.writeTransaction', async () => {
    const { tx, calls } = buildFakeTx({
      pagoMontoUsd: '15.00000000',
      saldoPendActual: '40.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
      ventaId: null,
    })

    await reversarPagoEnTx(tx, {
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      reversedBy: 'user-ext-1',
      reversedByNombre: 'Supervisor Test',
      reason: 'Reverso directo desde tesoreria (test, con lote SAF)',
      now: '2026-01-01T00:00:00.000Z',
      generatedLote: true,
    })

    expect(mockedDb.writeTransaction).not.toHaveBeenCalled()
    expect(reversarPagoSafEnTx).toHaveBeenCalledTimes(1)
    // La compensacion SAF recibe la MISMA `tx` provista al llamador (primer
    // arg), nunca una tx nueva.
    expect(vi.mocked(reversarPagoSafEnTx).mock.calls[0]![0]).toBe(tx)
    expect(vi.mocked(reversarPagoSafEnTx).mock.calls[0]![1]).toMatchObject({
      pagoId: 'pago-ext-1',
      empresaId: 'emp-ext-1',
      clienteId: 'cliente-ext-1',
      reversedBy: 'user-ext-1',
      now: '2026-01-01T00:00:00.000Z',
    })

    // Cuando generatedLote=true, el path normal (Steps 4/5: UPDATE clientes
    // + INSERT REV generico) queda OMITIDO — reversarPagoSafEnTx es la UNICA
    // escritora de los efectos de saldo (contrato documentado en
    // reversa-pago-saf.ts).
    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET saldo_actual'))
    expect(clienteUpdate).toBeUndefined()
  })
})
