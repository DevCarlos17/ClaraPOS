// Mockeamos `@/core/db/powersync/db` porque `registrarSafExcedente`,
// `aplicarSaldoFavor` y `registrarPagoFactura` usan `db.writeTransaction` a
// nivel de modulo — sin este mock, importar `use-cxc.ts` construye una
// PowerSyncDatabase real y revienta con "Worker is not defined" en el
// entorno de test. Mismo patron que use-ventas.test.ts / use-ajustes.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
  },
}))

// `use-cxc.ts` importa `cargarMapaCuentas` (que a su vez importa `kysely`,
// backed por PowerSync real) y `generarAsientosPagoCxC`/`leerMonedaContable` —
// mockeados para que el import del modulo no construya un Kysely/PowerSync
// real en el entorno de test. Mismo patron que use-ventas.test.ts para
// generarAsientosVenta/leerMonedaContable.
vi.mock('@/features/contabilidad/hooks/use-cuentas-config', () => ({
  cargarMapaCuentas: vi.fn(async () => ({})),
}))
vi.mock('@/features/contabilidad/lib/generar-asientos', () => ({
  generarAsientosPagoCxC: vi.fn(async () => undefined),
  reversarAsientos: vi.fn(async () => undefined),
  leerMonedaContable: vi.fn(async () => 'USD'),
}))

// `useDetalleFactura` usa `useQuery` de `@powersync/react` — mismo patron que
// use-facturas-sesion-activa.test.ts / use-deuda-cliente.test.ts. Ninguna de
// las funciones ya testeadas en este archivo (registrarSafExcedente,
// aplicarSaldoFavor, registrarPagoFactura) llama useQuery, asi que mockear el
// modulo completo aqui es seguro para el resto de la suite.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))

import type { Transaction } from '@powersync/common'
import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { toStorageString } from '@/lib/currency'
import {
  registrarSafExcedente,
  aplicarSaldoFavor,
  registrarPagoFactura,
  registrarAbonoGlobal,
  registrarReversoAbono,
  consumirSafLotesEnTx,
  useDetalleFactura,
  useAfectacionCxc,
  useEvolucionFactura,
  useSafAplicacionesFactura,
  useClientesConDeuda,
  type RegistrarSafExcedenteParams,
  type AplicarSaldoFavorParams,
  type PagoFacturaParams,
  type AbonoGlobalParams,
  type ConsumirSafLotesEnTxParams,
} from '../use-cxc'

const mockedDb = vi.mocked(db, true)
const mockedUseQuery = vi.mocked(useQuery)

interface Call {
  sql: string
  params: unknown[]
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────
// registrarSafExcedente — CREACION de credito (tipo 'SAFC', WARNING 2)
// ─────────────────────────────────────────────────────────────────────────

describe('registrarSafExcedente — creacion de credito standing (tipo SAFC, no SAF/PAG)', () => {
  function mockTx(opts: { saldoActual: string; safDisponible?: string }) {
    const calls: Call[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id FROM monedas WHERE codigo_iso = ?')) {
            const codigo = params[0] as string
            return {
              rows: {
                length: 1,
                item: () => ({ id: codigo === 'VES' ? 'moneda-bs-id' : 'moneda-usd-id' }),
              },
            }
          }
          if (sql.startsWith('SELECT saldo_actual, saf_disponible FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: opts.saldoActual, saf_disponible: opts.safDisponible ?? '0' }),
              },
            }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  function baseParams(overrides: Partial<RegistrarSafExcedenteParams> = {}): RegistrarSafExcedenteParams {
    return {
      cliente_id: 'cliente-1',
      venta_id: 'venta-1',
      nro_factura: 'F-001',
      excedenteUsd: 25,
      tasa: 40,
      moneda: 'USD',
      metodo_cobro_id: 'metodo-1',
      empresa_id: 'emp-1',
      procesado_por: 'user-1',
      ...overrides,
    }
  }

  it('escribe UN SOLO movimiento_cuenta con tipo=SAFC (nunca SAF/PAG), con saldo_anterior/saldo_nuevo provistos', async () => {
    const calls = mockTx({ saldoActual: '0.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 25 }))

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta'))
    expect(inserts).toHaveLength(1)
    expect(inserts[0]!.sql).toContain("'SAFC'")

    // Columnas: id, cliente_id, [tipo literal 'SAFC'], referencia, monto,
    // saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id,
    // created_at, created_by, moneda_pago, monto_moneda, tasa_pago, saf_origen_refs
    const params = inserts[0]!.params
    expect(params[3]).toBe(toStorageString(25)) // monto = excedente
    expect(params[4]).toBe(toStorageString(0)) // saldo_anterior
    expect(params[5]).toBe(toStorageString(-25)) // saldo_nuevo = anterior - excedente (crea credito)
    expect(params[4]).not.toBeNull()
    expect(params[5]).not.toBeNull()
  })

  it('NO reduce saldo_pend_usd de ninguna factura — la creacion de credito es independiente de las facturas pendientes', async () => {
    const calls = mockTx({ saldoActual: '10.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 15 }))

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas'))
    expect(ventaUpdates).toHaveLength(0)
  })

  it('escritura optimista pareada: el UPDATE clientes final incluye saf_disponible = anterior + excedente (SAFC suma)', async () => {
    const calls = mockTx({ saldoActual: '0.00000000', safDisponible: '20.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 15 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saf_disponible')
    // 20 (anterior) + 15 (excedente) = 35
    expect(clienteUpdate!.params).toContain(toStorageString(35))
  })

  it('PR7 (saf-trazabilidad-pago): inserta un pago anticipo (venta_id=NULL) por el excedente, con el metodo_cobro_id real', async () => {
    const calls = mockTx({ saldoActual: '0.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 25, tasa: 36.5, metodo_cobro_id: 'metodo-efectivo' }))

    const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
    expect(pagoInsert).toBeDefined()
    expect(pagoInsert!.sql).toMatch(/VALUES \(\?, NULL,/) // venta_id = NULL (anticipo)
    expect(pagoInsert!.params).toContain('metodo-efectivo')
    expect(pagoInsert!.params).toContain('moneda-usd-id')
    expect(pagoInsert!.params).toContain(toStorageString(25)) // monto_usd
  })

  it('PR7 (saf-trazabilidad-pago): el lote saf_creditos_lotes apunta origen_tipo=PAGO al pago anticipo recien creado (no VENTA), anclado al SAFC, saldo_disponible_usd=monto_original_usd, status=ACTIVO, misma transaccion', async () => {
    const calls = mockTx({ saldoActual: '0.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 25, venta_id: 'venta-9', tasa: 36.5 }))

    const safcInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'")
    )
    expect(safcInsert).toBeDefined()
    const safcMovId = safcInsert!.params[0] as string

    const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
    expect(pagoInsert).toBeDefined()
    const pagoExcedenteId = pagoInsert!.params[0] as string

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeDefined()
    expect(loteInsert!.sql).toContain('movimiento_cuenta_id')
    expect(loteInsert!.sql).toContain("'PAGO'")
    expect(loteInsert!.sql).not.toContain("'VENTA'")
    expect(loteInsert!.sql).toContain("'ACTIVO'")

    // movimiento_cuenta_id ancla el lote al SAFC recien insertado (coexistencia, design-v2.md §3)
    expect(loteInsert!.params).toContain(safcMovId)
    // origen_id = el PAGO anticipo recien creado, YA NO el venta_id directo
    expect(loteInsert!.params).toContain(pagoExcedenteId)
    expect(loteInsert!.params).not.toContain('venta-9')
    // monto_original_usd = saldo_disponible_usd = excedente completo (creacion, sin consumo aun)
    expect(loteInsert!.params).toContain(toStorageString(25))
    const montoOcurrencias = loteInsert!.params.filter((p) => p === toStorageString(25))
    expect(montoOcurrencias).toHaveLength(2) // monto_original_usd Y saldo_disponible_usd
    // tasa_origen fotografia la tasa provista
    expect(loteInsert!.params).toContain(toStorageString(36.5))
  })

  it('Fix B3.1a (PR7): moneda_origen del lote y moneda_pago del SAFC reflejan la moneda real del metodo de cobro (BS), no USD hardcodeado', async () => {
    const calls = mockTx({ saldoActual: '0.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 25, tasa: 40, moneda: 'BS', metodo_cobro_id: 'metodo-bs' }))

    const safcInsert = calls.find(
      (c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'")
    )
    expect(safcInsert).toBeDefined()
    expect(safcInsert!.sql).not.toMatch(/'USD'/)
    expect(safcInsert!.params).toContain('BS')
    // monto_moneda = excedente en moneda nativa (Bs) = 25 * 40 = 1000
    expect(safcInsert!.params).toContain(toStorageString(1000))

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeDefined()
    expect(loteInsert!.sql).not.toMatch(/'USD'/)
    expect(loteInsert!.params).toContain('BS')
    // monto_original_usd/saldo_disponible_usd siempre en USD (el lote no tiene columna nativa)
    expect(loteInsert!.params).toContain(toStorageString(25))

    const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos'))
    expect(pagoInsert).toBeDefined()
    expect(pagoInsert!.params).toContain('moneda-bs-id')
    expect(pagoInsert!.params).toContain(toStorageString(1000)) // monto nativo (Bs)
    expect(pagoInsert!.params).toContain(toStorageString(25)) // monto_usd
  })

  it('crea el pago+lote incondicionalmente aunque no exista ningun otro pago previo (caso borde: SAF manual cubre 100% + excedente)', async () => {
    // Simula el caso borde donde registrarPagoFactura recibio monto=0 y NUNCA
    // llamo a aplicarPagoFacturaEnTx — ningun pago previo existe en esta tx.
    // registrarSafExcedente debe seguir creando su propio pago+lote, sin
    // depender de estado dejado por otra llamada.
    const calls = mockTx({ saldoActual: '0.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 50, metodo_cobro_id: 'metodo-x' }))

    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO pagos'))).toHaveLength(1)
    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// aplicarSaldoFavor — gate re-sourced a clientes.saf_disponible (snapshot,
// ya no escanea movimientos_cuenta), NO saldo_actual neteado
// ─────────────────────────────────────────────────────────────────────────

describe('aplicarSaldoFavor — gate re-sourced a clientes.saf_disponible (snapshot), no clientes.saldo_actual', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    facturaSaldoPend: Record<string, string>
    /**
     * Lotes SAF activos disponibles para `consumirSafLotesEnTx` (PR4). Default:
     * un lote unico con saldo suficiente para cubrir `safDisponible` — cubre
     * todos los tests PRE-EXISTENTES de este describe (que no les interesa el
     * detalle de lotes, solo que la llamada no lance por falta de cobertura).
     */
    lotes?: Array<{ id: string; saldo_disponible_usd: string }>
  }) {
    const calls: Call[] = []
    const lotesIniciales = opts.lotes ?? [{ id: 'lote-default', saldo_disponible_usd: opts.safDisponible }]
    const lotesState = new Map(lotesIniciales.map((l) => [l.id, l.saldo_disponible_usd]))
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT saldo_actual, saf_disponible FROM clientes WHERE id = ? AND empresa_id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: opts.saldoActual, saf_disponible: opts.safDisponible }),
              },
            }
          }
          if (sql.startsWith('SELECT saldo_pend_usd FROM ventas WHERE id = ? AND empresa_id = ?')) {
            const ventaId = params[0] as string
            const saldo = opts.facturaSaldoPend[ventaId]
            return saldo !== undefined
              ? { rows: { length: 1, item: () => ({ saldo_pend_usd: saldo }) } }
              : { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
            const rows = lotesIniciales
              .filter((l) => Number(lotesState.get(l.id) ?? '0') > 0.0000001)
              .map((l) => ({ id: l.id, saldo_disponible_usd: lotesState.get(l.id) ?? '0' }))
            return { rows: { length: rows.length, item: (i: number) => rows[i] } }
          }
          if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
            lotesState.set(params[3] as string, params[0] as string)
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  function baseParams(overrides: Partial<AplicarSaldoFavorParams> = {}): AplicarSaldoFavorParams {
    return {
      clienteId: 'cliente-1',
      empresaId: 'emp-1',
      cajeroId: 'user-1',
      tasa: 40,
      facturas: [{ ventaId: 'venta-1', nroFactura: 'F-001', montoAplicarUsd: 50 }],
      totalAplicadoUsd: 50,
      ...overrides,
    }
  }

  it('el gate lee saf_disponible, NO clientes.saldo_actual: procede aunque saldo_actual sea 0 (netaria "sin credito") mientras saf_disponible sea suficiente', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000', // netted: parece "sin deuda ni credito"
      safDisponible: '100.00000000',
      facturaSaldoPend: { 'venta-1': '50.00000000' },
    })

    await expect(aplicarSaldoFavor(baseParams({ totalAplicadoUsd: 50 }))).resolves.not.toThrow()

    const safInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAF'"))
    expect(safInsert).toBeDefined()
    expect(safInsert!.sql).not.toContain("'SAFC'")

    const ventaUpdate = calls.find((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd'))
    expect(ventaUpdate).toBeDefined()
    expect(ventaUpdate!.params).toEqual([toStorageString(0), 'venta-1']) // 50 - 50 = 0

    // El gate ya NO escanea movimientos_cuenta (SUM(SAFC)/SUM(SAF)) — lee el snapshot directo
    const scanCalls = calls.filter((c) => c.sql.includes('as creado') && c.sql.includes('as consumido'))
    expect(scanCalls).toHaveLength(0)
  })

  it('regresion: rechaza cuando el monto excede saf_disponible real, AUNQUE clientes.saldo_actual sugiera mucho mas credito disponible (no se debe volver a leer saldo_actual como gate)', async () => {
    mockTx({
      saldoActual: '-500.00000000', // netted MUY negativo: un gate viejo basado en esto dejaria pasar cualquier monto
      safDisponible: '10.00000000', // disponible real
      facturaSaldoPend: { 'venta-1': '50.00000000' },
    })

    await expect(
      aplicarSaldoFavor(baseParams({ totalAplicadoUsd: 50 }))
    ).rejects.toThrow(/excede el crédito disponible/i)
  })

  it('rechaza cuando no hay credito disponible (saf_disponible <= 0), sin importar cuantas facturas se seleccionen', async () => {
    mockTx({
      saldoActual: '0.00000000',
      safDisponible: '0',
      facturaSaldoPend: { 'venta-1': '50.00000000' },
    })

    await expect(
      aplicarSaldoFavor(baseParams({ totalAplicadoUsd: 10 }))
    ).rejects.toThrow(/no tiene saldo a favor disponible/i)
  })

  it('escritura optimista pareada: el UPDATE clientes final incluye saf_disponible = anterior - totalAplicado (SAF resta)', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '100.00000000',
      facturaSaldoPend: { 'venta-1': '50.00000000' },
    })

    await aplicarSaldoFavor(baseParams({ totalAplicadoUsd: 50 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saf_disponible')
    // 100 (anterior) - 50 (aplicado) = 50
    expect(clienteUpdate!.params).toContain(toStorageString(50))
  })

  it('PR4 (saf-snapshot-y-trazabilidad): 2 facturas aplicadas comparten el pool de lotes FIFO — la 2a factura ve el saldo del lote YA decrementado por la 1a (dentro de la misma writeTransaction)', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '100.00000000',
      facturaSaldoPend: { 'venta-1': '30.00000000', 'venta-2': '20.00000000' },
      lotes: [{ id: 'lote-unico', saldo_disponible_usd: '100.00000000' }],
    })

    await aplicarSaldoFavor(
      baseParams({
        facturas: [
          { ventaId: 'venta-1', nroFactura: 'F-001', montoAplicarUsd: 30 },
          { ventaId: 'venta-2', nroFactura: 'F-002', montoAplicarUsd: 20 },
        ],
        totalAplicadoUsd: 50,
      })
    )

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
    expect(aplicaciones).toHaveLength(2)
    expect(aplicaciones[0]!.params[4]).toBe('venta-1')
    expect(aplicaciones[0]!.params[6]).toBe(toStorageString(30))
    expect(aplicaciones[0]!.params[7]).toBe(toStorageString(100)) // lote_saldo_antes
    expect(aplicaciones[0]!.params[8]).toBe(toStorageString(70)) // lote_saldo_despues

    expect(aplicaciones[1]!.params[4]).toBe('venta-2')
    expect(aplicaciones[1]!.params[6]).toBe(toStorageString(20))
    expect(aplicaciones[1]!.params[7]).toBe(toStorageString(70)) // ve el remanente de la 1a llamada
    expect(aplicaciones[1]!.params[8]).toBe(toStorageString(50))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarPagoFactura (rama SAF inline) — mismo re-source que
// aplicarSaldoFavor pero como gate embebido dentro del pago de una factura
// especifica (WARNING 2)
// ─────────────────────────────────────────────────────────────────────────

describe('registrarPagoFactura — rama SAF inline: gate re-sourced a clientes.saf_disponible (snapshot, ya no escanea movimientos_cuenta)', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    facturaSaldoPend: string
    nroFactura?: string
    /** Lotes SAF activos para `consumirSafLotesEnTx` (PR4). Default: un lote con saldo = safDisponible. */
    lotes?: Array<{ id: string; saldo_disponible_usd: string }>
  }) {
    const calls: Call[] = []
    const lotesIniciales = opts.lotes ?? [{ id: 'lote-default', saldo_disponible_usd: opts.safDisponible }]
    const lotesState = new Map(lotesIniciales.map((l) => [l.id, l.saldo_disponible_usd]))
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT saldo_actual, saf_disponible FROM clientes WHERE id = ? LIMIT 1')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: opts.saldoActual, saf_disponible: opts.safDisponible }),
              },
            }
          }
          if (sql.startsWith('SELECT nro_factura, saldo_pend_usd FROM ventas WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ nro_factura: opts.nroFactura ?? 'F-001', saldo_pend_usd: opts.facturaSaldoPend }),
              },
            }
          }
          if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
            const rows = lotesIniciales
              .filter((l) => Number(lotesState.get(l.id) ?? '0') > 0.0000001)
              .map((l) => ({ id: l.id, saldo_disponible_usd: lotesState.get(l.id) ?? '0' }))
            return { rows: { length: rows.length, item: (i: number) => rows[i] } }
          }
          if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
            lotesState.set(params[3] as string, params[0] as string)
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  function baseParams(overrides: Partial<PagoFacturaParams> = {}): PagoFacturaParams {
    return {
      venta_id: 'venta-1',
      cliente_id: 'cliente-1',
      metodo_cobro_id: 'metodo-1',
      moneda: 'USD',
      tasa: 40,
      monto: 0, // SAF cubre todo — no se llama aplicarPagoFacturaEnTx
      empresa_id: 'emp-1',
      procesado_por: 'user-1',
      procesado_por_nombre: 'Cajero Test',
      aplicarSaf: true,
      ...overrides,
    }
  }

  it('procede con SAF aunque clientes.saldo_actual sea 0 (netted), porque saf_disponible es suficiente; escribe tipo=SAF y reduce SOLO la factura seleccionada', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '80.00000000',
      facturaSaldoPend: '50.00000000',
    })

    await registrarPagoFactura(baseParams({ montoSaf: 50 }))

    const safInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAF'"))
    expect(safInsert).toBeDefined()
    expect(safInsert!.sql).not.toContain("'SAFC'")

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(0), 'venta-1']) // 50 - 50 = 0

    // El gate ya NO escanea movimientos_cuenta (SUM(SAFC)/SUM(SAF)) — lee el snapshot directo
    const scanCalls = calls.filter((c) => c.sql.includes('as creado') && c.sql.includes('as consumido'))
    expect(scanCalls).toHaveLength(0)
  })

  it('regresion: rechaza el SAF cuando excede saf_disponible real, aunque clientes.saldo_actual (netted) sea muy negativo y sugiera credito de sobra', async () => {
    mockTx({
      saldoActual: '-500.00000000',
      safDisponible: '10.00000000',
      facturaSaldoPend: '50.00000000',
    })

    await expect(
      registrarPagoFactura(baseParams({ montoSaf: 50 }))
    ).rejects.toThrow(/excede el saldo disponible/i)
  })

  it('escritura optimista pareada: el UPDATE clientes final incluye saf_disponible = anterior - montoSaf (SAF resta)', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '80.00000000',
      facturaSaldoPend: '50.00000000',
    })

    await registrarPagoFactura(baseParams({ montoSaf: 50 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saf_disponible')
    // 80 (anterior) - 50 (montoSaf) = 30
    expect(clienteUpdate!.params).toContain(toStorageString(30))
  })

  it('PR4 (saf-snapshot-y-trazabilidad): montoSaf que cruza 2 lotes genera 2 filas saf_creditos_aplicaciones, ambas pareadas con el SAF recien creado', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '80.00000000',
      facturaSaldoPend: '50.00000000',
      lotes: [
        { id: 'lote-viejo', saldo_disponible_usd: '30.00000000' },
        { id: 'lote-nuevo', saldo_disponible_usd: '50.00000000' },
      ],
    })

    await registrarPagoFactura(baseParams({ montoSaf: 50 }))

    const safInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAF'"))
    const safMovId = safInsert!.params[0] as string

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
    expect(aplicaciones).toHaveLength(2)
    expect(aplicaciones[0]!.params[3]).toBe('lote-viejo')
    expect(aplicaciones[0]!.params[6]).toBe(toStorageString(30)) // lote-viejo agotado
    expect(aplicaciones[1]!.params[3]).toBe('lote-nuevo')
    expect(aplicaciones[1]!.params[6]).toBe(toStorageString(20)) // resto: 50 - 30 = 20

    expect(aplicaciones[0]!.params[5]).toBe(safMovId)
    expect(aplicaciones[1]!.params[5]).toBe(safMovId)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarAbonoGlobal (SAF pre-step) — escritura optimista pareada de
// saf_disponible (Fase 4, saf-snapshot-y-trazabilidad). El gate de este
// sitio usa clientes.saldo_actual directamente (no la derivada SUM(SAFC)-
// SUM(SAF)) — eso es comportamiento PRE-EXISTENTE fuera de alcance de este
// cambio; esta suite solo cubre el pareo optimista nuevo.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarAbonoGlobal (SAF pre-step) — escritura optimista pareada de saf_disponible', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    /** Facturas pendientes que el pre-step SAF distribuye FIFO. Default: ninguna (comportamiento pre-existente). */
    facturasSaf?: Array<{ id: string; nro_factura: string; saldo_pend_usd: string }>
    /** Lotes SAF activos para la cascada 2D (`consumirSafLotesEnTx`, PR4). Default: un lote con saldo = safDisponible. */
    lotes?: Array<{ id: string; saldo_disponible_usd: string }>
  }) {
    const calls: Call[] = []
    const facturas = opts.facturasSaf ?? []
    const lotesIniciales = opts.lotes ?? [{ id: 'lote-default', saldo_disponible_usd: opts.safDisponible }]
    const lotesState = new Map(lotesIniciales.map((l) => [l.id, l.saldo_disponible_usd]))
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          // Prefijo comun a ambas lecturas de cliente de esta funcion: el gate del
          // SAF pre-step ('...WHERE id = ? LIMIT 1') y el nuevo paso 5 (bug fix,
          // PR4, '...WHERE id = ?' sin LIMIT) — mismo shape de fila para ambas.
          if (sql.startsWith('SELECT saldo_actual, saf_disponible FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: opts.saldoActual, saf_disponible: opts.safDisponible }),
              },
            }
          }
          if (sql.startsWith('SELECT id, nro_factura, saldo_pend_usd FROM ventas')) {
            return { rows: { length: facturas.length, item: (i: number) => facturas[i] } }
          }
          if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
            const rows = lotesIniciales
              .filter((l) => Number(lotesState.get(l.id) ?? '0') > 0.0000001)
              .map((l) => ({ id: l.id, saldo_disponible_usd: lotesState.get(l.id) ?? '0' }))
            return { rows: { length: rows.length, item: (i: number) => rows[i] } }
          }
          if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
            lotesState.set(params[3] as string, params[0] as string)
          }
          if (sql.startsWith('SELECT id FROM monedas WHERE codigo_iso = ?')) {
            const codigo = params[0] as string
            return { rows: { length: 1, item: () => ({ id: codigo === 'VES' ? 'moneda-bs' : 'moneda-usd' }) } }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  function baseParams(overrides: Partial<AbonoGlobalParams> = {}): AbonoGlobalParams {
    return {
      cliente_id: 'cliente-1',
      metodo_cobro_id: 'metodo-1',
      moneda: 'USD',
      tasa: 40,
      monto: 0,
      empresa_id: 'emp-1',
      procesado_por: 'user-1',
      procesado_por_nombre: 'Cajero Test',
      aplicarSaf: true,
      ...overrides,
    }
  }

  it('escritura optimista pareada: el UPDATE clientes final incluye saf_disponible = anterior - montoSaf (SAF resta)', async () => {
    const calls = mockTx({ saldoActual: '-80.00000000', safDisponible: '80.00000000' })

    await registrarAbonoGlobal(baseParams({ montoSaf: 50 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saf_disponible')
    // 80 (anterior) - 50 (montoSaf) = 30
    expect(clienteUpdate!.params).toContain(toStorageString(30))
  })

  it('cascada 2D (tasks-v2.md 5.1, PR4): 2 lotes x 3 facturas — SUM(aplicaciones.monto_aplicado_usd) = monto SAF total, split exacto por combo lote x factura, FIFO de lotes dentro de cada factura', async () => {
    const calls = mockTx({
      saldoActual: '-100.00000000',
      safDisponible: '100.00000000',
      facturasSaf: [
        { id: 'fac-1', nro_factura: 'F-001', saldo_pend_usd: '20.00000000' },
        { id: 'fac-2', nro_factura: 'F-002', saldo_pend_usd: '30.00000000' },
        { id: 'fac-3', nro_factura: 'F-003', saldo_pend_usd: '50.00000000' },
      ],
      lotes: [
        { id: 'lote-A', saldo_disponible_usd: '60.00000000' },
        { id: 'lote-B', saldo_disponible_usd: '50.00000000' },
      ],
    })

    await registrarAbonoGlobal(baseParams({ montoSaf: 90 }))

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
    // 4 combos tocados: (A,fac-1) (A,fac-2) (A,fac-3) (B,fac-3) — fac-3 cruza 2 lotes
    expect(aplicaciones).toHaveLength(4)

    const sumaTotal = aplicaciones.reduce((acc, c) => acc + Number(c.params[6]), 0)
    expect(sumaTotal).toBeCloseTo(90, 8)

    // Columnas: id, empresa_id, cliente_id, lote_id, venta_id, movimiento_cuenta_id,
    // monto_aplicado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd, tasa_pago, fecha, created_by
    expect(aplicaciones[0]!.params[3]).toBe('lote-A')
    expect(aplicaciones[0]!.params[4]).toBe('fac-1')
    expect(aplicaciones[0]!.params[6]).toBe(toStorageString(20))

    expect(aplicaciones[1]!.params[3]).toBe('lote-A')
    expect(aplicaciones[1]!.params[4]).toBe('fac-2')
    expect(aplicaciones[1]!.params[6]).toBe(toStorageString(30))

    // fac-3 necesita $40 (90 - 20 - 30); lote-A solo le quedan $10 (60-20-30) -> se agota y cruza a lote-B
    expect(aplicaciones[2]!.params[3]).toBe('lote-A')
    expect(aplicaciones[2]!.params[4]).toBe('fac-3')
    expect(aplicaciones[2]!.params[6]).toBe(toStorageString(10))

    expect(aplicaciones[3]!.params[3]).toBe('lote-B')
    expect(aplicaciones[3]!.params[4]).toBe('fac-3')
    expect(aplicaciones[3]!.params[6]).toBe(toStorageString(30))

    // Todas las aplicaciones comparten el MISMO movimiento_cuenta_id (el SAF
    // unico del abono global) — venta_id por fila es lo que cierra el "blind
    // spot" de trazabilidad (design-v2.md Pregunta 9): antes
    // movimientos_cuenta.venta_id=NULL para este caso, ahora cada aplicacion
    // apunta a su factura real.
    const movCuentaIds = new Set(aplicaciones.map((c) => c.params[5]))
    expect(movCuentaIds.size).toBe(1)
  })

  it('bug fix (design-v2.md Pregunta 5): excedente de efectivo tras FIFO de facturas se promueve a credito real (SAFC + lote), ya NO se evapora con Decimal.max(0,...)', async () => {
    const calls = mockTx({
      saldoActual: '50.00000000',
      safDisponible: '0.00000000',
      facturasSaf: [
        { id: 'fac-1', nro_factura: 'F-001', saldo_pend_usd: '30.00000000' },
        { id: 'fac-2', nro_factura: 'F-002', saldo_pend_usd: '20.00000000' },
      ],
    })

    const result = await registrarAbonoGlobal(baseParams({ aplicarSaf: false, montoSaf: undefined, monto: 70 }))

    expect(result.facturasAfectadas).toBe(2)

    // El PAG se escribe SOLO por lo realmente aplicado a facturas reales (50),
    // NO por el monto total pagado (70) — ya no absorbe el excedente.
    const pagInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'PAG'"))
    expect(pagInsert).toBeDefined()
    expect(pagInsert!.params[3]).toBe(toStorageString(50)) // monto = aplicado a facturas
    expect(pagInsert!.params[5]).toBe(toStorageString(0)) // saldo_nuevo = 50 - 50, SIN floor artificial

    // El excedente ($20) se promueve: SAFC + lote, NO se evapora.
    const safcInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'"))
    expect(safcInsert).toBeDefined()
    expect(safcInsert!.params[4]).toBe(toStorageString(20)) // monto = excedente
    expect(safcInsert!.params[6]).toBe(toStorageString(-20)) // saldo_nuevo = 0 (post-PAG) - 20 = credito real visible

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeDefined()
    expect(loteInsert!.sql).toContain("'PAGO'")
    const safcMovId = safcInsert!.params[0] as string
    expect(loteInsert!.params).toContain(safcMovId)

    // origen_id = pagoAnticipoId (la fila `pagos` sin venta_id que ya se crea hoy)
    const anticipoPago = calls.find((c) => c.sql.startsWith('INSERT INTO pagos') && c.params[1] === null)
    expect(anticipoPago).toBeDefined()
    const pagoAnticipoId = anticipoPago!.params[0] as string
    expect(loteInsert!.params).toContain(pagoAnticipoId)

    // Escritura optimista pareada final: saf_disponible sube por el excedente
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    const ultimoUpdate = clienteUpdates[clienteUpdates.length - 1]!
    expect(ultimoUpdate.sql).toContain('saf_disponible')
    expect(ultimoUpdate.params).toContain(toStorageString(20)) // 0 (antes) + 20 (excedente)
  })

  it('regresion (comportamiento default sin cambios): monto cash == deuda exacta, sin excedente -> NO crea SAFC/lote', async () => {
    const calls = mockTx({
      saldoActual: '50.00000000',
      safDisponible: '0.00000000',
      facturasSaf: [{ id: 'fac-1', nro_factura: 'F-001', saldo_pend_usd: '50.00000000' }],
    })

    await registrarAbonoGlobal(baseParams({ aplicarSaf: false, montoSaf: undefined, monto: 50 }))

    const safcInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'"))
    expect(safcInsert).toBeUndefined()

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeUndefined()

    const pagInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'PAG'"))
    expect(pagInsert).toBeDefined()
    expect(pagInsert!.params[3]).toBe(toStorageString(50)) // monto = aplicado = total, sin cambio
  })

  it('guard CHECK (monto > 0): cliente SIN facturas pendientes + pago completo cae como excedente -> NO escribe PAG con monto=0 (violaria movimientos_cuenta CHECK, migrations/0006), el 100% se promueve directo a SAFC+lote', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '0.00000000',
      facturasSaf: [], // sin facturas pendientes
    })

    await registrarAbonoGlobal(baseParams({ aplicarSaf: false, montoSaf: undefined, monto: 30 }))

    const pagInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'PAG'"))
    expect(pagInsert).toBeUndefined() // nunca se escribe PAG con monto=0

    const safcInsert = calls.find((c) => c.sql.startsWith('INSERT INTO movimientos_cuenta') && c.sql.includes("'SAFC'"))
    expect(safcInsert).toBeDefined()
    expect(safcInsert!.params[4]).toBe(toStorageString(30)) // excedente completo
    expect(safcInsert!.params[5]).toBe(toStorageString(0)) // saldo_anterior del SAFC = saldoActual sin tocar (0, PAG se salto)
    expect(safcInsert!.params[6]).toBe(toStorageString(-30)) // saldo_nuevo = credito real

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// consumirSafLotesEnTx (PR4, saf-snapshot-y-trazabilidad Fase 4) — helper
// compartido por los 3 sitios de consumo SAF. Tests directos sobre la
// funcion exportada (el llamador ya provee `tx`, no abre su propia
// writeTransaction) para cubrir el algoritmo de cascada FIFO en aislamiento.
// ─────────────────────────────────────────────────────────────────────────

describe('consumirSafLotesEnTx — cascada FIFO de lotes (PR4)', () => {
  function makeTx(opts: { lotes: Array<{ id: string; saldo_disponible_usd: string }> }) {
    const calls: Call[] = []
    const lotesState = new Map(opts.lotes.map((l) => [l.id, l.saldo_disponible_usd]))
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id, saldo_disponible_usd FROM saf_creditos_lotes')) {
          const rows = opts.lotes
            .filter((l) => Number(lotesState.get(l.id) ?? '0') > 0.0000001)
            .map((l) => ({ id: l.id, saldo_disponible_usd: lotesState.get(l.id) ?? '0' }))
          return { rows: { length: rows.length, item: (i: number) => rows[i] } }
        }
        if (sql.startsWith('UPDATE saf_creditos_lotes SET saldo_disponible_usd')) {
          lotesState.set(params[3] as string, params[0] as string)
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return { tx, calls, lotesState }
  }

  function baseParams(overrides: Partial<ConsumirSafLotesEnTxParams> = {}): ConsumirSafLotesEnTxParams {
    return {
      empresaId: 'emp-1',
      clienteId: 'cliente-1',
      ventaId: 'venta-1',
      movimientoCuentaId: 'mov-1',
      montoUsd: 10,
      tasaPago: 40,
      fecha: '2026-10-08T00:00:00-04:00',
      now: '2026-10-08T00:00:00-04:00',
      usuarioId: 'user-1',
      ...overrides,
    }
  }

  it('1 factura consume de 3 lotes FIFO (orden de llegada): 3 filas saf_creditos_aplicaciones, suma = monto total, snapshot antes/despues correcto por fila', async () => {
    const { tx, calls } = makeTx({
      lotes: [
        { id: 'lote-A', saldo_disponible_usd: '5.00000000' },
        { id: 'lote-B', saldo_disponible_usd: '3.00000000' },
        { id: 'lote-C', saldo_disponible_usd: '20.00000000' },
      ],
    })

    await consumirSafLotesEnTx(tx, baseParams({ montoUsd: 10 }))

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
    expect(inserts).toHaveLength(3)

    expect(inserts[0]!.params[3]).toBe('lote-A')
    expect(inserts[0]!.params[6]).toBe(toStorageString(5)) // lote-A agotado
    expect(inserts[1]!.params[3]).toBe('lote-B')
    expect(inserts[1]!.params[6]).toBe(toStorageString(3)) // lote-B agotado
    expect(inserts[2]!.params[3]).toBe('lote-C')
    expect(inserts[2]!.params[6]).toBe(toStorageString(2)) // resto: 10 - 5 - 3 = 2

    const sumaAplicada = inserts.reduce((acc, c) => acc + Number(c.params[6]), 0)
    expect(sumaAplicada).toBeCloseTo(10, 8)
  })

  it('1 lote dividido entre 3 facturas (llamadas secuenciales dentro de la misma tx): cada llamada ve el saldo YA decrementado por la anterior (escritura optimista local, SQLite no corre el trigger Postgres)', async () => {
    const { tx, calls } = makeTx({ lotes: [{ id: 'lote-unico', saldo_disponible_usd: '10.00000000' }] })

    await consumirSafLotesEnTx(tx, baseParams({ ventaId: 'venta-1', montoUsd: 4 }))
    await consumirSafLotesEnTx(tx, baseParams({ ventaId: 'venta-2', montoUsd: 4 }))
    await consumirSafLotesEnTx(tx, baseParams({ ventaId: 'venta-3', montoUsd: 2 }))

    const inserts = calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))
    expect(inserts).toHaveLength(3)

    expect(inserts[0]!.params[4]).toBe('venta-1')
    expect(inserts[0]!.params[6]).toBe(toStorageString(4))
    expect(inserts[0]!.params[7]).toBe(toStorageString(10)) // lote_saldo_antes
    expect(inserts[0]!.params[8]).toBe(toStorageString(6)) // lote_saldo_despues

    expect(inserts[1]!.params[4]).toBe('venta-2')
    expect(inserts[1]!.params[7]).toBe(toStorageString(6))
    expect(inserts[1]!.params[8]).toBe(toStorageString(2))

    expect(inserts[2]!.params[4]).toBe('venta-3')
    expect(inserts[2]!.params[7]).toBe(toStorageString(2))
    expect(inserts[2]!.params[8]).toBe(toStorageString(0))
  })

  it('reconciliacion/overdraft: si el total de lotes activos no cubre el monto solicitado, lanza (defensa en profundidad — mirror del guard SQL del trigger)', async () => {
    const { tx } = makeTx({ lotes: [{ id: 'lote-chico', saldo_disponible_usd: '5.00000000' }] })

    await expect(consumirSafLotesEnTx(tx, baseParams({ montoUsd: 100 }))).rejects.toThrow(/insuficiente/i)
  })

  it('monto 0: no-op, cero INSERTs (defensa adicional; los sitios de llamada ya validan monto > 0 antes de invocar)', async () => {
    const { tx, calls } = makeTx({ lotes: [{ id: 'lote-A', saldo_disponible_usd: '5' }] })

    await consumirSafLotesEnTx(tx, baseParams({ montoUsd: 0 }))

    expect(calls.filter((c) => c.sql.startsWith('INSERT INTO saf_creditos_aplicaciones'))).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarReversoAbono — saldo acotado a total_usd (bugfix-reversa-cxc)
//
// Regresion para el bug P0001 en CxC: el trigger vivo `prevent_venta_mutation`
// (migrations/0006_ventas.sql) rechazaba CUALQUIER aumento de
// `ventas.saldo_pend_usd`, incluso el aumento controlado que hace un reverso
// de pago para reabrir la deuda de la factura. El fix relaja el trigger en
// `migrations/0097_permitir_reverso_saldo_venta.sql` (SQL, no testeable por
// Vitest — se valida manualmente via Supabase SQL Editor, ver design.md).
//
// Esta suite es un test de APROBACION (approval test) sobre la logica JS que
// ya existia ANTES de este cambio: `registrarReversoAbono` (use-cxc.ts:1565)
// ya acota el nuevo saldo con `Decimal.min(total_usd, saldo_pend_usd + monto)`
// — no requirio ningun cambio de codigo (design.md, File Changes: "Sin cambio
// de codigo — Decimal.min ya existe"). El test PASA contra la implementacion
// EXISTENTE sin modificarla, documentando y congelando ese comportamiento
// correcto como regresion permanente.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarReversoAbono — saldo acotado a total_usd', () => {
  function mockTx(opts: {
    pagoMontoUsd: string
    saldoPendActual: string
    totalUsd: string
    saldoClienteActual: string
    ventaId?: string | null
  }) {
    const calls: Call[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: 'pago-1',
                  venta_id: opts.ventaId ?? 'venta-1',
                  cliente_id: 'cliente-1',
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
                  nro_factura: 'F-001',
                  saldo_pend_usd: opts.saldoPendActual,
                  total_usd: opts.totalUsd,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT saldo_actual FROM clientes WHERE id = ?')) {
            return { rows: { length: 1, item: () => ({ saldo_actual: opts.saldoClienteActual }) } }
          }
          if (sql.startsWith('SELECT id FROM libro_contable WHERE')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })
    return calls
  }

  function baseParams() {
    return {
      pago_id: 'pago-1',
      reason: 'Cliente reporto error de cobro',
      reversed_by: 'user-1',
      reversed_by_nombre: 'Cajero Test',
      empresa_id: 'emp-1',
    }
  }

  it('reverso parcial: nuevo saldo = saldo_pend_usd + monto cuando la suma queda por debajo de total_usd', async () => {
    const calls = mockTx({
      pagoMontoUsd: '20.00000000',
      saldoPendActual: '30.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
    })

    await registrarReversoAbono(baseParams())

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(50), 'venta-1']) // 30 + 20 = 50 < 100
  })

  it('reverso saturante: nuevo saldo se acota a total_usd cuando la suma lo excederia', async () => {
    const calls = mockTx({
      pagoMontoUsd: '30.00000000',
      saldoPendActual: '90.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
    })

    await registrarReversoAbono(baseParams())

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    // 90 + 30 = 120, pero nunca puede exceder total_usd = 100
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(100), 'venta-1'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useClientesConDeuda — read-site swap (saf-snapshot-y-trazabilidad, Fase 5):
// credito_disponible_usd lee clientes.saf_disponible (snapshot) en vez de
// escanear SUM(SAFC)-SUM(SAF) sobre movimientos_cuenta en cada render.
// ─────────────────────────────────────────────────────────────────────────

describe('useClientesConDeuda — credito_disponible_usd lee el snapshot saf_disponible, ya NO escanea movimientos_cuenta', () => {
  it('el SQL lee c.saf_disponible directo, sin SUM(CASE WHEN tipo = ...) sobre movimientos_cuenta', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useClientesConDeuda())

    const clientesCall = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(clientesCall).toBeDefined()
    const [sql] = clientesCall!
    expect(sql).toContain('saf_disponible')
    expect(sql).not.toContain('movimientos_cuenta')
    expect(sql).not.toContain("tipo = 'SAFC'")
  })

  it('el valor mostrado en credito_disponible_usd es EXACTAMENTE saf_disponible (contrato de lectura UI congelado)', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        {
          id: 'cliente-1',
          identificacion: 'V-1',
          nombre: 'Cliente Uno',
          telefono: null,
          saldo_actual: '-30.00000000',
          limite_credito_usd: '500',
          facturas_pendientes: 0,
          deuda_usd: 0,
          credito_disponible_usd: 30,
        },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useClientesConDeuda())

    expect(result.current.clientes[0]).toMatchObject({ credito_disponible_usd: 30 })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useDetalleFactura — extension aditiva (Design §Decision 3): es_decimal +
// precio_unitario_bs, via JOIN a ventas (tasa historica) + unidades.
// ─────────────────────────────────────────────────────────────────────────

describe('useDetalleFactura — extension aditiva (Design §Decision 3)', () => {
  it('agrega JOIN a ventas (tasa) y LEFT JOIN a unidades (es_decimal) al SQL, sin remover columnas existentes', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useDetalleFactura('venta-1'))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('es_decimal')
    expect(sql).toContain('precio_unitario_bs')
    expect(sql).toContain('JOIN ventas v ON vd.venta_id = v.id')
    expect(sql).toContain('LEFT JOIN unidades u ON p.unidad_base_id = u.id')
    // Columnas preexistentes (contrato de los 3 consumidores verificados) intactas:
    expect(sql).toContain('vd.subtotal_usd')
    expect(sql).toContain('vd.tipo_impuesto')
    expect(sql).toContain('p.nombre as producto_nombre')
    expect(params).toEqual(['venta-1'])
  })

  it('precio_unitario_bs se calcula con la tasa HISTORICA de la venta (v.tasa), nunca una tasa vigente', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        {
          id: 'vd-1',
          venta_id: 'venta-1',
          producto_id: 'prod-1',
          cantidad: '2',
          precio_unitario_usd: '10.00',
          subtotal_usd: '20.00',
          subtotal_bs: '1000.00',
          tipo_impuesto: 'Gravable',
          impuesto_pct: '16',
          producto_nombre: 'Producto Test',
          producto_codigo: 'P001',
          es_decimal: 0,
          precio_unitario_bs: '500.00',
        },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useDetalleFactura('venta-1'))

    expect(result.current.detalle[0]).toMatchObject({ es_decimal: 0, precio_unitario_bs: '500.00' })
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useAfectacionCxc — Design §Decision 6: fuente correcta de "afectacion CxC"
// para el panel de detalle (Slice 3a). COUNT(*) sobre movimientos_cuenta,
// NUNCA construirCierreRecibo/discrepancy (estado efimero de React).
// ─────────────────────────────────────────────────────────────────────────

describe('useAfectacionCxc (Design §Decision 6: COUNT movimientos_cuenta WHERE venta_id + empresa_id)', () => {
  it('sin ventaId: no ejecuta la query (sql vacio) y retorna 0', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { result } = renderHook(() => useAfectacionCxc(null, 'emp-1'))

    expect(result.current.cantidadMovimientos).toBe(0)
    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
  })

  it('con ventaId: ejecuta COUNT escopeado a venta_id + empresa_id y retorna el conteo', () => {
    mockedUseQuery.mockReturnValue({ data: [{ n: 2 }], isLoading: false } as never)

    const { result } = renderHook(() => useAfectacionCxc('venta-1', 'emp-1'))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('COUNT(*)')
    expect(sql).toContain('FROM movimientos_cuenta')
    expect(sql).toContain('WHERE venta_id = ? AND empresa_id = ?')
    expect(params).toEqual(['venta-1', 'emp-1'])
    expect(result.current.cantidadMovimientos).toBe(2)
  })

  it('0 movimientos: retorna cantidadMovimientos=0 (huboAfectacionCxc(0) sera false en el llamador)', () => {
    mockedUseQuery.mockReturnValue({ data: [{ n: 0 }], isLoading: false } as never)

    const { result } = renderHook(() => useAfectacionCxc('venta-2', 'emp-1'))

    expect(result.current.cantidadMovimientos).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useEvolucionFactura — Design §Decision "useEvolucionFactura return shape"
// (consulta-factura-evolucion PR3). Pre-agrupado por tipo (PAG/REV/SAFC),
// escopeado a venta_id + empresa_id (rule #11 — codigo NUEVO, no repetir el
// gap pre-existente de useDetalleFactura/usePagosFactura).
// ─────────────────────────────────────────────────────────────────────────

describe('useEvolucionFactura (movimientos_cuenta PAG/REV/SAFC, pre-agrupado por tipo)', () => {
  it('sin ventaId: no ejecuta la query (sql vacio) y retorna grupos vacios', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { result } = renderHook(() => useEvolucionFactura(null, 'emp-1'))

    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
    expect(result.current.abonos).toEqual([])
    expect(result.current.reversosPago).toEqual([])
    expect(result.current.saldoAFavor).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('sin empresaId: no ejecuta la query (sql vacio) y retorna grupos vacios', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { result } = renderHook(() => useEvolucionFactura('venta-1', ''))

    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
    expect(result.current.abonos).toEqual([])
  })

  it('con ventaId+empresaId: ejecuta SELECT escopeado a venta_id + empresa_id + tipo IN (...)', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useEvolucionFactura('venta-1', 'emp-1'))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('FROM movimientos_cuenta')
    expect(sql).toContain('WHERE venta_id = ? AND empresa_id = ?')
    expect(sql).toContain("tipo IN ('PAG','REV','SAFC')")
    expect(sql).toContain('ORDER BY fecha ASC')
    expect(params).toEqual(['venta-1', 'emp-1'])
  })

  it('filas mixtas (PAG/REV/SAFC): agrupa correctamente por tipo', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        { tipo: 'PAG', monto: '100', tasa_pago: '40', fecha: '2026-01-01', referencia: 'PAG-1', observacion: 'x' },
        { tipo: 'REV', monto: '50', tasa_pago: '40', fecha: '2026-01-02', referencia: 'REV-1', observacion: 'y' },
        { tipo: 'SAFC', monto: '10', tasa_pago: '40', fecha: '2026-01-03', referencia: 'SAFC-1', observacion: 'z' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useEvolucionFactura('venta-1', 'emp-1'))

    expect(result.current.abonos).toHaveLength(1)
    expect(result.current.abonos[0]).toMatchObject({ tipo: 'PAG', monto: '100' })
    expect(result.current.reversosPago).toHaveLength(1)
    expect(result.current.reversosPago[0]).toMatchObject({ tipo: 'REV', monto: '50' })
    expect(result.current.saldoAFavor).toHaveLength(1)
    expect(result.current.saldoAFavor[0]).toMatchObject({ tipo: 'SAFC', monto: '10' })
    expect(result.current.isLoading).toBe(false)
  })

  it('sin filas SAFC: saldoAFavor es un array vacio', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        { tipo: 'PAG', monto: '100', tasa_pago: '40', fecha: '2026-01-01', referencia: 'PAG-1', observacion: 'x' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useEvolucionFactura('venta-1', 'emp-1'))

    expect(result.current.saldoAFavor).toEqual([])
    expect(result.current.abonos).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useSafAplicacionesFactura — PR5 read-path (design-v2.md §9, Pregunta 9).
// Reemplaza `movimientos_cuenta WHERE venta_id AND tipo='SAF'` por
// `saf_creditos_aplicaciones WHERE venta_id=?` — cierra el blind spot de
// `registrarAbonoGlobal` (fila SAF ancla con venta_id=NULL).
// ─────────────────────────────────────────────────────────────────────────

describe('useSafAplicacionesFactura (saf_creditos_aplicaciones WHERE venta_id, PR5 read-path)', () => {
  it('sin ventaId: no ejecuta la query (sql vacio) y retorna lista vacia', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    const { result } = renderHook(() => useSafAplicacionesFactura(null))

    expect(mockedUseQuery).toHaveBeenCalledWith('', [])
    expect(result.current.safAplicaciones).toEqual([])
  })

  it('con ventaId: consulta saf_creditos_aplicaciones (no movimientos_cuenta.tipo=SAF) filtrando por sca.venta_id', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useSafAplicacionesFactura('venta-1'))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain('FROM saf_creditos_aplicaciones sca')
    expect(sql).toContain('WHERE sca.venta_id = ?')
    expect(sql).not.toContain("tipo = 'SAF'")
    expect(sql).toContain('JOIN movimientos_cuenta mc ON mc.id = sca.movimiento_cuenta_id')
    // PR8 (saf-display-factura): tasa_pago propia de la aplicacion (migrations/0105),
    // usada para convertir monto_aplicado_usd -> Bs en la linea "Saldo a favor" del
    // historial de pagos sin depender de la tasa_pago de movimientos_cuenta.
    expect(sql).toContain('sca.tasa_pago')
    expect(params).toEqual(['venta-1'])
  })

  it('1 aplicacion: mapea monto_aplicado_usd -> monto, trae tasa_pago propia y referencia/saf_origen_refs via JOIN', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        {
          id: 'sca-1',
          referencia: 'SAF-0001',
          monto: '30.00000000',
          tasa_pago: '40.0000',
          fecha: '2026-02-01',
          saf_origen_refs: '["VTA-100"]',
        },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useSafAplicacionesFactura('venta-1'))

    expect(result.current.safAplicaciones).toHaveLength(1)
    expect(result.current.safAplicaciones[0]).toMatchObject({
      id: 'sca-1',
      referencia: 'SAF-0001',
      monto: '30.00000000',
      tasa_pago: '40.0000',
      saf_origen_refs: '["VTA-100"]',
    })
  })

  it('abono-global cruzando 2 lotes: retorna 2 filas de aplicacion para la MISMA factura (antes invisible via movimientos_cuenta.venta_id=NULL)', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        { id: 'sca-1', referencia: 'ABG-0001', monto: '20.00000000', fecha: '2026-02-01', saf_origen_refs: null },
        { id: 'sca-2', referencia: 'ABG-0001', monto: '15.00000000', fecha: '2026-02-01', saf_origen_refs: null },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useSafAplicacionesFactura('venta-2'))

    expect(result.current.safAplicaciones).toHaveLength(2)
    const total = result.current.safAplicaciones.reduce((sum, r) => sum + parseFloat(r.monto), 0)
    expect(total).toBe(35)
  })
})
