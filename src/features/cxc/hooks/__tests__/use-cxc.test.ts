// Mockeamos `@/core/db/powersync/db` porque `registrarSafExcedente`,
// `registrarAbonoGlobal` y `registrarPagoFactura` usan `db.writeTransaction` a
// nivel de modulo — sin este mock, importar `use-cxc.ts` construye una
// PowerSyncDatabase real y revienta con "Worker is not defined" en el
// entorno de test. Mismo patron que use-ventas.test.ts / use-ajustes.test.ts.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    writeTransaction: vi.fn(),
    // `detectarLoteSafDePago` (slice 3b-iii, cxc-ledger-saldos-redesign) usa
    // `db.getAll` (lectura fuera de la tx del llamador). Default `[]` ->
    // `generatedLote: false` para TODOS los tests existentes que no
    // configuran explicitamente un lote SAF (cero regresion).
    getAll: vi.fn().mockResolvedValue([]),
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
// registrarAbonoGlobal, registrarPagoFactura) llama useQuery, asi que mockear
// el modulo completo aqui es seguro para el resto de la suite.
vi.mock('@powersync/react', () => ({ useQuery: vi.fn() }))

import type { Transaction } from '@powersync/common'
import { renderHook } from '@testing-library/react'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { toStorageString } from '@/lib/currency'
import Decimal from 'decimal.js'
import { calcularEstadoVenta } from '@/features/cxc/lib/estado-venta'
import {
  registrarSafExcedente,
  registrarPagoFactura,
  registrarAbonoGlobal,
  registrarAbonoPrestamo,
  registrarReversoAbono,
  consumirSafLotesEnTx,
  aplicarPagoFacturaEnTx,
  reversarDiferencialEnTx,
  registrarDiferencialCxC,
  useDetalleFactura,
  useAfectacionCxc,
  useEvolucionFactura,
  useFacturasPendientes,
  useSafAplicacionesFactura,
  useClientesConDeuda,
  useBuscarClientesDeuda,
  type RegistrarSafExcedenteParams,
  type PagoFacturaParams,
  type AbonoGlobalParams,
  type AbonoPrestamoParams,
  type ConsumirSafLotesEnTxParams,
  type AplicarPagoEnTxParams,
  type ReversoDiferencialCxCParams,
  type DiferencialCxCParams,
} from '../use-cxc'
import { calcularSaldoPendienteClienteNuevo } from '@/features/cxc/lib/saldo-cliente'

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
  function mockTx(opts: { saldoActual: string; safDisponible?: string; saldoPendienteUsd?: string }) {
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
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.includes('FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoActual,
                  saf_disponible: opts.safDisponible ?? '0',
                  saldo_pendiente_usd: opts.saldoPendienteUsd ?? '0',
                }),
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

  it('wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign): el UPDATE clientes incluye saldo_pendiente_usd sin cambio (tipo SAFC es no-op para deuda pendiente, migrations/0110 ELSE branch)', async () => {
    const calls = mockTx({ saldoActual: '0.00000000', saldoPendienteUsd: '45.00000000' })

    await registrarSafExcedente(baseParams({ excedenteUsd: 25 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    const esperado = calcularSaldoPendienteClienteNuevo('SAFC', '45.00000000', 25)
    expect(toStorageString(esperado)).toBe('45.00000000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
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
// registrarPagoFactura (rama SAF inline) — mismo re-source que
// registrarAbonoGlobal pero como gate embebido dentro del pago de una
// factura especifica (WARNING 2)
// ─────────────────────────────────────────────────────────────────────────

describe('registrarPagoFactura — rama SAF inline: gate re-sourced a clientes.saf_disponible (snapshot, ya no escanea movimientos_cuenta)', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    facturaSaldoPend: string
    nroFactura?: string
    totalUsd?: string
    /** `clientes.saldo_pendiente_usd` anterior (slice 1b, cxc-ledger-saldos-redesign). Default '0'. */
    saldoPendienteUsd?: string
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
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.includes('FROM clientes WHERE id = ? LIMIT 1')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoActual,
                  saf_disponible: opts.safDisponible,
                  saldo_pendiente_usd: opts.saldoPendienteUsd ?? '0',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  nro_factura: opts.nroFactura ?? 'F-001',
                  saldo_pend_usd: opts.facturaSaldoPend,
                  total_usd: opts.totalUsd ?? '100.00000000',
                }),
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

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(0), 'pago', 'venta-1']) // 50 - 50 = 0

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

  it('wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign): el UPDATE clientes de la rama SAF inline incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(SAF, anterior, montoSaf)', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '80.00000000',
      facturaSaldoPend: '50.00000000',
      saldoPendienteUsd: '90.00000000',
    })

    await registrarPagoFactura(baseParams({ montoSaf: 50 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    // 90 (anterior) - 50 (SAF) = 40
    expect(clienteUpdate!.params).toContain(toStorageString(40))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarAbonoGlobal (SAF pre-step) — escritura optimista pareada de
// saf_disponible (Fase 4, saf-snapshot-y-trazabilidad). El gate de este
// sitio fue corregido en PR13 (saf-gate-disponible): antes validaba contra
// clientes.saldo_actual (neteado deuda+credito), ahora valida contra
// clientes.saf_disponible (snapshot puro), igual que registrarPagoFactura.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarAbonoGlobal (SAF pre-step) — escritura optimista pareada de saf_disponible', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    /** `clientes.saldo_pendiente_usd` anterior (slice 1b, cxc-ledger-saldos-redesign). Default '0'. */
    saldoPendienteUsd?: string
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
          // Matchea con o sin `saldo_pendiente_usd` en la lista de columnas
          // (slice 1b, cxc-ledger-saldos-redesign) via includes en vez de
          // startsWith exacto, para no acoplar el test al orden literal.
          if (sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.startsWith('SELECT') && sql.includes('FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoActual,
                  saf_disponible: opts.safDisponible,
                  saldo_pendiente_usd: opts.saldoPendienteUsd ?? '0',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT id, nro_factura, saldo_pend_usd, total_usd FROM ventas')) {
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

  // slice 1b (cxc-ledger-saldos-redesign): el pre-step SAF reduce deuda
  // pendiente igual que un PAG — mismo UPDATE clientes de arriba.
  it('wiring saldo_pendiente_usd (slice 1b): el UPDATE clientes del pre-step SAF incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(SAF, anterior, montoSaf)', async () => {
    const calls = mockTx({
      saldoActual: '-80.00000000',
      safDisponible: '80.00000000',
      saldoPendienteUsd: '50.00000000',
    })

    await registrarAbonoGlobal(baseParams({ montoSaf: 50 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    // 50 (anterior) - 50 (SAF) = 0, piso en 0
    expect(clienteUpdate!.params).toContain(toStorageString(0))
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
      saldoPendienteUsd: '90.00000000',
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

    // wiring saldo_pendiente_usd (slice 1b): el UPDATE del FIFO-aggregate PAG
    // (primer UPDATE clientes) reduce la deuda pendiente por lo APLICADO a
    // facturas reales (50), NO por el total pagado (70).
    expect(clienteUpdates).toHaveLength(2)
    const primerUpdate = clienteUpdates[0]!
    expect(primerUpdate.sql).toContain('saldo_pendiente_usd')
    expect(primerUpdate.params).toContain(toStorageString(40)) // 90 (anterior) - 50 (aplicado a facturas)

    // El UPDATE del anticipo SAFC (no-op para deuda pendiente) preserva el
    // mismo valor post-PAG (40), encadenado — NO vuelve al valor pre-abono (90).
    expect(ultimoUpdate.sql).toContain('saldo_pendiente_usd')
    expect(ultimoUpdate.params).toContain(toStorageString(40))
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
      saldoPendienteUsd: '0.00000000',
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

    // wiring saldo_pendiente_usd (slice 1b): el PAG (site C) se saltea
    // enteramente (igual que su INSERT), por lo que la UNICA UPDATE clientes
    // es la del anticipo SAFC (site D) — no-op, preserva 0 sin tocar.
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)
    expect(clienteUpdates[0]!.sql).toContain('saldo_pendiente_usd')
    expect(clienteUpdates[0]!.params).toContain(toStorageString(0))
  })

  // Coverage migrada desde el describe eliminado de `aplicarSaldoFavor`
  // (saf-consolidar-abono-global, PR12): la aplicacion SAF-only ahora vive
  // exclusivamente en `registrarAbonoGlobal` via `usarSaf`/`montoSaf` — el
  // gate de credito disponible de este pre-step debe seguir rechazando los
  // mismos 2 casos borde que el modal dedicado ya eliminado cubria.
  // ───────────────────────────────────────────────────────────────────────
  // pagos_aplicaciones — FIFO loop (slice 2, cxc-ledger-saldos-redesign).
  // 1 fila por factura tocada por el FIFO cash (NO por el pre-step SAF,
  // que usa saf_creditos_aplicaciones — tabla distinta).
  // ───────────────────────────────────────────────────────────────────────

  it('abono global FIFO de $100 sobre 2 facturas ($30 + $70): escribe 2 filas pagos_aplicaciones, SUM(monto_aplicado_usd) = 100', async () => {
    const calls = mockTx({
      saldoActual: '100.00000000',
      safDisponible: '0.00000000',
      saldoPendienteUsd: '100.00000000',
      facturasSaf: [
        { id: 'fac-a', nro_factura: 'F-A', saldo_pend_usd: '30.00000000' },
        { id: 'fac-b', nro_factura: 'F-B', saldo_pend_usd: '70.00000000' },
      ],
    })

    await registrarAbonoGlobal(baseParams({ aplicarSaf: false, montoSaf: undefined, monto: 100 }))

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos_aplicaciones'))
    expect(aplicaciones).toHaveLength(2)

    const suma = aplicaciones.reduce((acc, c) => acc + Number(c.params[5]), 0)
    expect(suma).toBeCloseTo(100, 8)

    // Columnas: id, empresa_id, cliente_id, pago_id, venta_id,
    // monto_aplicado_usd, saldo_venta_antes_usd, saldo_venta_despues_usd,
    // fecha, created_at, created_by
    expect(aplicaciones[0]!.params[4]).toBe('fac-a')
    expect(aplicaciones[0]!.params[5]).toBe(toStorageString(30))
    expect(aplicaciones[0]!.params[6]).toBe(toStorageString(30)) // saldo_venta_antes_usd
    expect(aplicaciones[0]!.params[7]).toBe(toStorageString(0)) // saldo_venta_despues_usd

    expect(aplicaciones[1]!.params[4]).toBe('fac-b')
    expect(aplicaciones[1]!.params[5]).toBe(toStorageString(70))
    expect(aplicaciones[1]!.params[6]).toBe(toStorageString(70))
    expect(aplicaciones[1]!.params[7]).toBe(toStorageString(0))

    // Cada fila lleva su propio pago_id (1 fila `pagos` por factura en el FIFO)
    const pagoIds = new Set(aplicaciones.map((c) => c.params[3]))
    expect(pagoIds.size).toBe(2)
  })

  it('abono global con excedente SAF (bug fix Pregunta 5): la porcion excedente promovida a SAFC/lote NO escribe fila pagos_aplicaciones', async () => {
    const calls = mockTx({
      saldoActual: '20.00000000',
      safDisponible: '0.00000000',
      saldoPendienteUsd: '20.00000000',
      facturasSaf: [{ id: 'fac-1', nro_factura: 'F-001', saldo_pend_usd: '20.00000000' }],
    })

    await registrarAbonoGlobal(baseParams({ aplicarSaf: false, montoSaf: undefined, monto: 50 }))

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos_aplicaciones'))
    // Solo 1 fila por la factura de $20 realmente aplicada; el excedente de
    // $30 va a saf_creditos_lotes, NUNCA a pagos_aplicaciones.
    expect(aplicaciones).toHaveLength(1)
    expect(aplicaciones[0]!.params[4]).toBe('fac-1')
    expect(aplicaciones[0]!.params[5]).toBe(toStorageString(20))

    const loteInsert = calls.find((c) => c.sql.startsWith('INSERT INTO saf_creditos_lotes'))
    expect(loteInsert).toBeDefined()
  })

  it('gate SAF: rechaza cuando montoSaf excede el credito disponible real (saldo_actual negativo = credito), sin importar cuan grande sea el monto solicitado', async () => {
    mockTx({ saldoActual: '-10.00000000', safDisponible: '10.00000000' })

    await expect(
      registrarAbonoGlobal(baseParams({ montoSaf: 50 }))
    ).rejects.toThrow(/excede el saldo disponible/i)
  })

  it('gate SAF: rechaza cuando el cliente no tiene saldo a favor disponible (saldo_actual >= 0, sin credito neto), sin importar el monto SAF solicitado', async () => {
    mockTx({ saldoActual: '0.00000000', safDisponible: '0.00000000' })

    await expect(
      registrarAbonoGlobal(baseParams({ montoSaf: 10 }))
    ).rejects.toThrow(/no tiene saldo a favor disponible/i)
  })

  // PR13 (fix saf-gate-disponible): bug exacto reportado — cliente con
  // $1.30 de SAF real (saf_disponible) Y $1.30 de deuda, cuyo saldo_actual
  // NETEADO (mezcla deuda/credito de otras facturas) da -1.00, NO -1.30. El
  // gate roto leia `saldoActualSaf.abs()` (1.00) en vez de `saf_disponible`
  // (1.30) para la comparacion de exceso, rechazando una aplicacion 100%
  // valida con "El monto SAF excede el saldo disponible ($1.00)".
  it('PR13 bug fix: permite aplicar el SAF completo cuando saf_disponible (1.30) difiere de |saldo_actual netead| (1.00) — antes rechazaba con el monto neteado', async () => {
    mockTx({ saldoActual: '-1.00000000', safDisponible: '1.30000000' })

    await expect(
      registrarAbonoGlobal(baseParams({ montoSaf: 1.3 }))
    ).resolves.not.toThrow()
  })

  it('PR13 bug fix: sigue rechazando cuando el monto excede saf_disponible real, y el mensaje de error muestra saf_disponible (1.30), NO |saldo_actual| neteado (1.00)', async () => {
    mockTx({ saldoActual: '-1.00000000', safDisponible: '1.30000000' })

    await expect(
      registrarAbonoGlobal(baseParams({ montoSaf: 1.35 }))
    ).rejects.toThrow(/excede el saldo disponible \(\$1\.30000000\)/)
  })

  it('PR13 bug fix: rechaza "no tiene saldo a favor" cuando saf_disponible es 0, aun si saldo_actual neteado sugiere credito (-5.00) por mezcla con otras facturas', async () => {
    mockTx({ saldoActual: '-5.00000000', safDisponible: '0.00000000' })

    await expect(
      registrarAbonoGlobal(baseParams({ montoSaf: 2 }))
    ).rejects.toThrow(/no tiene saldo a favor disponible/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarAbonoPrestamo (SAF pre-step) — PR13 (fix saf-gate-disponible):
// este sitio tenia el MISMO bug que registrarAbonoGlobal (y ni siquiera leia
// saf_disponible): el gate validaba contra clientes.saldo_actual neteado.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarAbonoPrestamo (SAF pre-step) — gate corregido a saf_disponible (PR13)', () => {
  function mockTx(opts: {
    saldoActual: string
    safDisponible: string
    saldoPendienteVenc?: string
    /** `clientes.saldo_pendiente_usd` anterior (slice 1b, cxc-ledger-saldos-redesign). Default '0'. */
    clienteSaldoPendienteUsd?: string
    /** `venc.venta_id` — cuando se provee, ejercita el branch 7e (PAG) de factura vinculada. */
    ventaId?: string | null
    /** `ventas.saldo_pend_usd/total_usd` del `venc.venta_id` vinculado. */
    ventaSaldoPend?: string
    ventaTotalUsd?: string
  }) {
    const calls: Call[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id, saldo_pendiente_usd, monto_pagado_usd, status, venta_id, cliente_id')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: 'venc-1',
                  saldo_pendiente_usd: opts.saldoPendienteVenc ?? '100.00000000',
                  monto_pagado_usd: '0.00000000',
                  status: 'PENDIENTE',
                  venta_id: opts.ventaId ?? null,
                  cliente_id: 'cliente-1',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('saf_disponible') && sql.includes('FROM clientes WHERE id = ? LIMIT 1')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoActual,
                  saf_disponible: opts.safDisponible,
                  saldo_pendiente_usd: opts.clienteSaldoPendienteUsd ?? '0',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT id FROM monedas WHERE codigo_iso = ?')) {
            const codigo = params[0] as string
            return { rows: { length: 1, item: () => ({ id: codigo === 'VES' ? 'moneda-bs' : 'moneda-usd' }) } }
          }
          if (sql.startsWith('SELECT saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_pend_usd: opts.ventaSaldoPend ?? '0.00000000',
                  total_usd: opts.ventaTotalUsd ?? '0.00000000',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('FROM clientes WHERE id = ?') && !sql.includes('saf_disponible')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoActual,
                  saldo_pendiente_usd: opts.clienteSaldoPendienteUsd ?? '0',
                }),
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

  function baseParams(overrides: Partial<AbonoPrestamoParams> = {}): AbonoPrestamoParams {
    return {
      vencimiento_id: 'venc-1',
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

  it('PR13 bug fix: permite aplicar el SAF completo cuando saf_disponible (1.30) difiere de |saldo_actual| neteado (1.00) — antes rechazaba con el monto neteado', async () => {
    mockTx({ saldoActual: '-1.00000000', safDisponible: '1.30000000', saldoPendienteVenc: '1.30000000' })

    await expect(
      registrarAbonoPrestamo(baseParams({ montoSaf: 1.3 }))
    ).resolves.not.toThrow()
  })

  it('PR13 bug fix: sigue rechazando cuando el monto excede saf_disponible real, mostrando saf_disponible (1.30) en el error, no |saldo_actual| neteado (1.00)', async () => {
    mockTx({ saldoActual: '-1.00000000', safDisponible: '1.30000000', saldoPendienteVenc: '50.00000000' })

    await expect(
      registrarAbonoPrestamo(baseParams({ montoSaf: 1.35 }))
    ).rejects.toThrow(/excede el saldo disponible \(\$1\.30000000\)/)
  })

  it('PR13 bug fix: rechaza "no tiene saldo a favor" cuando saf_disponible es 0, aun si saldo_actual neteado sugiere credito', async () => {
    mockTx({ saldoActual: '-5.00000000', safDisponible: '0.00000000', saldoPendienteVenc: '50.00000000' })

    await expect(
      registrarAbonoPrestamo(baseParams({ montoSaf: 2 }))
    ).rejects.toThrow(/no tiene saldo a favor disponible/i)
  })

  it('wiring saldo_pendiente_usd (slice 1b, cxc-ledger-saldos-redesign): el UPDATE clientes del SAF pre-step incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(SAF, anterior, montoSafNum)', async () => {
    const calls = mockTx({
      saldoActual: '-1.30000000',
      safDisponible: '1.30000000',
      saldoPendienteVenc: '1.30000000',
      clienteSaldoPendienteUsd: '60.00000000',
    })

    await registrarAbonoPrestamo(baseParams({ montoSaf: 1.3 }))

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    // 60 (anterior) - 1.3 (SAF) = 58.7
    expect(clienteUpdate!.params).toContain(toStorageString(58.7))
  })

  it('wiring saldo_pendiente_usd (slice 1b): prestamo vinculado a una factura (venc.venta_id) — el UPDATE clientes del paso 7e (tipo PAG) incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(PAG, anterior, montoUsd)', async () => {
    const calls = mockTx({
      saldoActual: '0.00000000',
      safDisponible: '0.00000000',
      saldoPendienteVenc: '50.00000000',
      clienteSaldoPendienteUsd: '70.00000000',
      ventaId: 'venta-vinc-1',
      ventaSaldoPend: '50.00000000',
      ventaTotalUsd: '100.00000000',
    })

    await registrarAbonoPrestamo(baseParams({ monto: 20, aplicarSaf: false }))

    // El paso 7e inserta un segundo movimiento_cuenta tipo PAG (ligado a la
    // venta), con su propio UPDATE clientes — distinto del paso 6
    // (movimientos_metodo_cobro) y sin saf_disponible (no es rama SAF).
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    const pagLigadoUpdate = clienteUpdates.find((c) => !c.sql.includes('saf_disponible'))
    expect(pagLigadoUpdate).toBeDefined()
    expect(pagLigadoUpdate!.sql).toContain('saldo_pendiente_usd')
    // 70 (anterior) - 20 (PAG por metodo) = 50
    expect(pagLigadoUpdate!.params).toContain(toStorageString(50))
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
// aplicarPagoFacturaEnTx — wiring de saldo_pendiente_usd (slice 1b,
// cxc-ledger-saldos-redesign). Mismo patron de escritura optimista pareada
// que saf_disponible (migrations/0102) — aqui el espejo es
// calcularSaldoPendienteClienteNuevo + migrations/0110. Test directo sobre
// la funcion exportada (mismo patron que consumirSafLotesEnTx: el llamador
// ya provee `tx`, sin pasar por `db.writeTransaction`).
// ─────────────────────────────────────────────────────────────────────────

describe('aplicarPagoFacturaEnTx — wiring de saldo_pendiente_usd (slice 1b)', () => {
  function makeTx(opts: { saldoActual: string; saldoPendienteUsd: string; facturaSaldoPend: string }) {
    const calls: Call[] = []
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id FROM monedas WHERE codigo_iso = ?')) {
          return { rows: { length: 1, item: () => ({ id: 'moneda-usd-id' }) } }
        }
        if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd, tasa FROM ventas WHERE id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({
                nro_factura: 'F-001',
                saldo_pend_usd: opts.facturaSaldoPend,
                total_usd: '100.00000000',
                tasa: '40.00000000',
              }),
            },
          }
        }
        if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({ saldo_actual: opts.saldoActual, saldo_pendiente_usd: opts.saldoPendienteUsd }),
            },
          }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return { tx, calls }
  }

  function baseParams(overrides: Partial<AplicarPagoEnTxParams> = {}): AplicarPagoEnTxParams {
    return {
      venta_id: 'venta-1',
      cliente_id: 'cliente-1',
      metodo_cobro_id: 'metodo-1',
      moneda: 'USD',
      tasa: 40,
      monto: 30,
      empresa_id: 'emp-1',
      procesado_por: 'user-1',
      skipBankAndAccounting: true,
      ...overrides,
    }
  }

  it('el UPDATE clientes final incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(PAG, anterior, montoUsd)', async () => {
    const { tx, calls } = makeTx({
      saldoActual: '0.00000000',
      saldoPendienteUsd: '80.00000000',
      facturaSaldoPend: '30.00000000',
    })

    await aplicarPagoFacturaEnTx(tx, baseParams({ monto: 30 }), '2026-10-19T00:00:00-04:00')

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    const esperado = calcularSaldoPendienteClienteNuevo('PAG', '80.00000000', '30.00000000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
  })

  it('triangulacion: pago parcial ($10 sobre deuda pendiente $50) reduce saldo_pendiente_usd por EXACTAMENTE el monto aplicado, piso en 0', async () => {
    const { tx, calls } = makeTx({
      saldoActual: '0.00000000',
      saldoPendienteUsd: '50.00000000',
      facturaSaldoPend: '10.00000000',
    })

    await aplicarPagoFacturaEnTx(tx, baseParams({ monto: 10 }), '2026-10-19T00:00:00-04:00')

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    // 50 (anterior) - 10 (pago) = 40
    const esperado = calcularSaldoPendienteClienteNuevo('PAG', '50.00000000', '10.00000000')
    expect(toStorageString(esperado)).toBe('40.00000000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// aplicarPagoFacturaEnTx — pagos_aplicaciones (slice 2,
// cxc-ledger-saldos-redesign). Auditoria per-invoice append-only, mirror de
// saf_creditos_aplicaciones (migrations/0112). El INSERT va DESPUES del
// UPDATE ventas, reusando el `saldoFactura`/`nuevoSaldoFactura` ya en
// scope — nunca un recalculo nuevo.
// ─────────────────────────────────────────────────────────────────────────

describe('aplicarPagoFacturaEnTx — pagos_aplicaciones (slice 2)', () => {
  function makeTx(opts: { saldoActual: string; saldoPendienteUsd: string; facturaSaldoPend: string }) {
    const calls: Call[] = []
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id FROM monedas WHERE codigo_iso = ?')) {
          return { rows: { length: 1, item: () => ({ id: 'moneda-usd-id' }) } }
        }
        if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd, tasa FROM ventas WHERE id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({
                nro_factura: 'F-001',
                saldo_pend_usd: opts.facturaSaldoPend,
                total_usd: '100.00000000',
                tasa: '40.00000000',
              }),
            },
          }
        }
        if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({ saldo_actual: opts.saldoActual, saldo_pendiente_usd: opts.saldoPendienteUsd }),
            },
          }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return { tx, calls }
  }

  function baseParams(overrides: Partial<AplicarPagoEnTxParams> = {}): AplicarPagoEnTxParams {
    return {
      venta_id: 'venta-1',
      cliente_id: 'cliente-1',
      metodo_cobro_id: 'metodo-1',
      moneda: 'USD',
      tasa: 40,
      monto: 100,
      empresa_id: 'emp-1',
      procesado_por: 'user-1',
      skipBankAndAccounting: true,
      ...overrides,
    }
  }

  it('pago de $100 sobre factura con saldo $100 escribe exactamente 1 fila pagos_aplicaciones con snapshot antes=100/despues=0', async () => {
    const { tx, calls } = makeTx({
      saldoActual: '0.00000000',
      saldoPendienteUsd: '100.00000000',
      facturaSaldoPend: '100.00000000',
    })

    await aplicarPagoFacturaEnTx(tx, baseParams({ monto: 100 }), '2026-10-19T00:00:00-04:00')

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos_aplicaciones'))
    expect(aplicaciones).toHaveLength(1)

    const pagoInsert = calls.find((c) => c.sql.startsWith('INSERT INTO pagos ('))
    const pagoId = pagoInsert!.params[0] as string

    // Columnas: id, empresa_id, cliente_id, pago_id, venta_id,
    // monto_aplicado_usd, saldo_venta_antes_usd, saldo_venta_despues_usd,
    // fecha, created_at, created_by
    const row = aplicaciones[0]!
    expect(row.params[1]).toBe('emp-1')
    expect(row.params[2]).toBe('cliente-1')
    expect(row.params[3]).toBe(pagoId)
    expect(row.params[4]).toBe('venta-1')
    expect(row.params[5]).toBe(toStorageString(100))
    expect(row.params[6]).toBe(toStorageString(100)) // saldo_venta_antes_usd
    expect(row.params[7]).toBe(toStorageString(0)) // saldo_venta_despues_usd
  })

  it('pago parcial de $40 sobre factura con saldo $100 escribe snapshot antes=100/despues=60', async () => {
    const { tx, calls } = makeTx({
      saldoActual: '0.00000000',
      saldoPendienteUsd: '100.00000000',
      facturaSaldoPend: '100.00000000',
    })

    await aplicarPagoFacturaEnTx(tx, baseParams({ monto: 40 }), '2026-10-19T00:00:00-04:00')

    const aplicaciones = calls.filter((c) => c.sql.startsWith('INSERT INTO pagos_aplicaciones'))
    expect(aplicaciones).toHaveLength(1)
    expect(aplicaciones[0]!.params[5]).toBe(toStorageString(40))
    expect(aplicaciones[0]!.params[6]).toBe(toStorageString(100))
    expect(aplicaciones[0]!.params[7]).toBe(toStorageString(60))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// reversarDiferencialEnTx — wiring de saldo_pendiente_usd (slice 1b,
// cxc-ledger-saldos-redesign). tipo='REV': reversar un diferencial cambiario
// reabre deuda pendiente igual que cualquier otro reverso. Test directo
// sobre la funcion exportada (el llamador ya provee `tx`, sin pasar por
// `db.writeTransaction` — mismo patron que consumirSafLotesEnTx).
// ─────────────────────────────────────────────────────────────────────────

describe('reversarDiferencialEnTx — wiring de saldo_pendiente_usd (slice 1b)', () => {
  function makeTx(opts: {
    difeMontoUsd: string
    saldoActual: string
    saldoPendienteUsd: string
    totalUsd?: string
    yaReversado?: boolean
  }) {
    const calls: Call[] = []
    const tx = {
      execute: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params })
        if (sql.startsWith('SELECT id, monto FROM movimientos_cuenta')) {
          return { rows: { length: 1, item: () => ({ id: 'dife-1', monto: opts.difeMontoUsd }) } }
        }
        if (sql.startsWith('SELECT id FROM movimientos_cuenta WHERE venta_id = ? AND referencia = ? LIMIT 1')) {
          return opts.yaReversado
            ? { rows: { length: 1, item: () => ({ id: 'rev-ya-existe' }) } }
            : { rows: { length: 0, item: () => undefined } }
        }
        if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('FROM clientes WHERE id = ? AND empresa_id = ?')) {
          return {
            rows: {
              length: 1,
              item: () => ({ saldo_actual: opts.saldoActual, saldo_pendiente_usd: opts.saldoPendienteUsd }),
            },
          }
        }
        if (sql.startsWith('SELECT total_usd FROM ventas WHERE id = ?')) {
          return { rows: { length: 1, item: () => ({ total_usd: opts.totalUsd ?? '100.00000000' }) } }
        }
        return { rows: { length: 0, item: () => undefined } }
      }),
    } as unknown as Transaction
    return { tx, calls }
  }

  function baseParams(overrides: Partial<ReversoDiferencialCxCParams> = {}): ReversoDiferencialCxCParams {
    return {
      ventaId: 'venta-1',
      clienteId: 'cliente-1',
      nroFactura: 'F-001',
      empresaId: 'emp-1',
      procesadoPor: 'user-1',
      ...overrides,
    }
  }

  it('el UPDATE clientes incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(REV, anterior, montoUsd) — tipo REV reabre deuda', async () => {
    const { tx, calls } = makeTx({
      difeMontoUsd: '0.005',
      saldoActual: '0.00000000',
      saldoPendienteUsd: '20.00000000',
    })

    await reversarDiferencialEnTx(tx, baseParams(), '2026-10-19T00:00:00-04:00')

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    const esperado = calcularSaldoPendienteClienteNuevo('REV', '20.00000000', '0.005')
    expect(toStorageString(esperado)).toBe('20.00500000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
  })

  it('triangulacion: monto DIFE distinto (1.25) sobre un anterior distinto (50) produce 51.25 — no un literal fijo', async () => {
    const { tx, calls } = makeTx({
      difeMontoUsd: '1.25000000',
      saldoActual: '0.00000000',
      saldoPendienteUsd: '50.00000000',
    })

    await reversarDiferencialEnTx(tx, baseParams(), '2026-10-19T00:00:00-04:00')

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate!.params).toContain(toStorageString(51.25))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarDiferencialCxC — wiring de saldo_pendiente_usd (slice 1b,
// cxc-ledger-saldos-redesign). tipo='PAG': cerrar el saldo sub-centavo
// residual via diferencial cambiario reduce deuda pendiente igual que PAG.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarDiferencialCxC — wiring de saldo_pendiente_usd (slice 1b)', () => {
  function mockTx(opts: {
    saldoPendVenta: string
    totalUsd?: string
    saldoActual: string
    saldoPendienteUsd: string
  }) {
    const calls: Call[] = []
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ? AND empresa_id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  nro_factura: 'F-001',
                  saldo_pend_usd: opts.saldoPendVenta,
                  total_usd: opts.totalUsd ?? '100.00000000',
                }),
              },
            }
          }
          if (sql.startsWith('SELECT') && sql.includes('saldo_actual') && sql.includes('FROM clientes WHERE id = ? AND empresa_id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: opts.saldoActual, saldo_pendiente_usd: opts.saldoPendienteUsd }),
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

  function baseParams(overrides: Partial<DiferencialCxCParams> = {}): DiferencialCxCParams {
    return {
      ventaId: 'venta-1',
      clienteId: 'cliente-1',
      empresaId: 'emp-1',
      procesadoPor: 'user-1',
      tasa: 40,
      ...overrides,
    }
  }

  it('el UPDATE clientes incluye saldo_pendiente_usd = calcularSaldoPendienteClienteNuevo(PAG, anterior, saldoUsd) — tipo PAG reduce deuda, floor 0', async () => {
    const calls = mockTx({
      saldoPendVenta: '0.005',
      saldoActual: '0.00000000',
      saldoPendienteUsd: '20.00000000',
    })

    await registrarDiferencialCxC(baseParams())

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    const esperado = calcularSaldoPendienteClienteNuevo('PAG', '20.00000000', '0.005')
    expect(toStorageString(esperado)).toBe('19.99500000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
  })

  it('triangulacion: cuando el residual DIFE excede el saldo_pendiente_usd anterior, el resultado se topa en 0 (piso), nunca negativo — saldo_actual distinto para evitar colision numerica con saldo_pendiente_usd', async () => {
    const calls = mockTx({
      saldoPendVenta: '0.009',
      saldoActual: '5.00000000',
      saldoPendienteUsd: '0.003',
    })

    await registrarDiferencialCxC(baseParams())

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    // saldo_actual (clientes): max(0, 5 - 0.009) = 4.991 — distinto de saldo_pendiente_usd (0),
    // para que la aserticion de abajo no pueda pasar por coincidencia con otro parametro.
    expect(clienteUpdate!.params).toContain(toStorageString(4.991))
    const esperado = calcularSaldoPendienteClienteNuevo('PAG', '0.003', '0.009')
    expect(toStorageString(esperado)).toBe('0.00000000')
    expect(clienteUpdate!.params).toContain(toStorageString(esperado))
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
    /** `clientes.saldo_pendiente_usd` anterior (slice 1b, cxc-ledger-saldos-redesign). Default '0'. */
    saldoPendienteClienteActual?: string
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
          if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoClienteActual,
                  saldo_pendiente_usd: opts.saldoPendienteClienteActual ?? '0',
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

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(50), 'reversado', 'venta-1']) // 30 + 20 = 50 < 100
  })

  it('reverso saturante: nuevo saldo se acota a total_usd cuando la suma lo excederia', async () => {
    const calls = mockTx({
      pagoMontoUsd: '30.00000000',
      saldoPendActual: '90.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
    })

    await registrarReversoAbono(baseParams())

    const ventaUpdates = calls.filter((c) => c.sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?'))
    expect(ventaUpdates).toHaveLength(1)
    // 90 + 30 = 120, pero nunca puede exceder total_usd = 100
    expect(ventaUpdates[0]!.params).toEqual([toStorageString(100), 'reversado', 'venta-1'])
  })

  it('wiring saldo_pendiente_usd (slice 1b): el UPDATE clientes incluye saldo_pendiente_usd = anterior + monto (tipo REV reabre deuda)', async () => {
    const calls = mockTx({
      pagoMontoUsd: '20.00000000',
      saldoPendActual: '30.00000000',
      totalUsd: '100.00000000',
      saldoClienteActual: '0.00000000',
      saldoPendienteClienteActual: '70.00000000',
    })

    await registrarReversoAbono(baseParams())

    const clienteUpdate = calls.find((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdate).toBeDefined()
    expect(clienteUpdate!.sql).toContain('saldo_pendiente_usd')
    // 70 (anterior) + 20 (monto reversado) = 90
    expect(clienteUpdate!.params).toContain(toStorageString(90))
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarReversoAbono — mutua exclusion con reversarPagoSafEnTx (slice
// 3b-iii, cxc-ledger-saldos-redesign)
//
// CONTRATO (ver reversa-pago-saf.ts, docstring "CONTRATO PARA EL LLAMADOR",
// 3b-ii.7): cuando el pago reversado genero un lote SAF
// (`detectarLoteSafDePago(...).generatedLote === true`), `reversarPagoSafEnTx`
// es la UNICA escritora de los efectos de saldo de este reverso — los Steps
// 4/5 ORIGINALES de `registrarReversoAbono` (UPDATE clientes con el monto
// COMPLETO del pago + INSERT REV generico con venta_id=NULL) deben quedar
// OMITIDOS por completo. Si ambos corrieran, `saldo_pendiente_usd` se
// triplicaria (bug corregido en 3b-ii.7, documentado en
// `sdd/cxc-ledger-saldos-redesign/analysis-reverso-saldo-actual`).
// Cuando `generatedLote` es `false`, el comportamiento de hoy (Steps 3-5)
// corre sin cambios — cero regresion para reversos normales.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarReversoAbono — mutua exclusion con reversarPagoSafEnTx (slice 3b-iii)', () => {
  // Forma SQL de los Steps 4/5 ORIGINALES (pre-3b-iii) — deben desaparecer
  // por completo cuando `generatedLote` es `true`.
  const STEP4_UPDATE_CLIENTES = 'UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, updated_at = ? WHERE id = ?'
  const STEP5_INSERT_MOVIMIENTO =
    'INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, created_by, moneda_pago, monto_moneda, tasa_pago)'

  // Forma SQL NUEVA de `reversarPagoSafEnTx` — deben ser las UNICAS
  // escrituras de saldo cuando `generatedLote` es `true`.
  const LOTE_QUERY_PREFIX = 'SELECT id, monto_original_usd, saldo_disponible_usd'
  const NUEVO_UPDATE_CLIENTES =
    'UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, saf_disponible = ?, updated_at = ? WHERE id = ? AND empresa_id = ?'

  function mockTxConLote(opts: {
    pagoMontoUsd: string
    saldoClienteActual: string
    saldoPendienteClienteActual: string
    safDisponibleClienteActual: string
    loteMontoOriginalUsd: string
    loteSaldoDisponibleUsd: string
    aplicaciones: Array<{ ventaId: string; nroFactura: string; montoAplicadoUsd: string }>
  }) {
    const calls: Call[] = []
    mockedDb.getAll.mockImplementation(async (sql: string) => {
      if (sql.startsWith(LOTE_QUERY_PREFIX)) {
        return [
          {
            id: 'lote-1',
            monto_original_usd: opts.loteMontoOriginalUsd,
            saldo_disponible_usd: opts.loteSaldoDisponibleUsd,
          },
        ]
      }
      if (sql.startsWith('SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd')) {
        return opts.aplicaciones.map((a) => ({
          venta_id: a.ventaId,
          nro_factura: a.nroFactura,
          monto_aplicado_usd: a.montoAplicadoUsd,
        }))
      }
      return []
    })
    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params })
          if (sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: 'pago-saf-1',
                  venta_id: null,
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
          if (sql.startsWith(LOTE_QUERY_PREFIX)) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: 'lote-1',
                  monto_original_usd: opts.loteMontoOriginalUsd,
                  saldo_disponible_usd: opts.loteSaldoDisponibleUsd,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd')) {
            return {
              rows: {
                length: opts.aplicaciones.length,
                item: (i: number) => ({
                  venta_id: opts.aplicaciones[i]!.ventaId,
                  nro_factura: opts.aplicaciones[i]!.nroFactura,
                  monto_aplicado_usd: opts.aplicaciones[i]!.montoAplicadoUsd,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd, saf_disponible FROM clientes WHERE id = ? AND empresa_id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  saldo_actual: opts.saldoClienteActual,
                  saldo_pendiente_usd: opts.saldoPendienteClienteActual,
                  saf_disponible: opts.safDisponibleClienteActual,
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
                  saldo_pendiente_usd: opts.saldoPendienteClienteActual,
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
      return callback(tx)
    })
    return calls
  }

  function baseParamsSaf() {
    return {
      pago_id: 'pago-saf-1',
      reason: 'Cliente reporto error de cobro',
      reversed_by: 'user-1',
      reversed_by_nombre: 'Cajero Test',
      empresa_id: 'emp-1',
    }
  }

  it('generatedLote=true: llama a reversarPagoSafEnTx y OMITE los Steps 4/5 originales por completo', async () => {
    const calls = mockTxConLote({
      pagoMontoUsd: '30.00000000',
      saldoClienteActual: '-30.00000000',
      saldoPendienteClienteActual: '130.00000000',
      safDisponibleClienteActual: '10.00000000',
      loteMontoOriginalUsd: '30.00000000',
      loteSaldoDisponibleUsd: '10.00000000',
      aplicaciones: [{ ventaId: 'venta-2', nroFactura: 'F-002', montoAplicadoUsd: '20.00000000' }],
    })

    await registrarReversoAbono(baseParamsSaf())

    // (a) reversarPagoSafEnTx SI corrio: su query interna de deteccion de
    // lote (via tx.execute) debe aparecer.
    const loteQuery = calls.find((c) => c.sql.startsWith(LOTE_QUERY_PREFIX))
    expect(loteQuery).toBeDefined()

    // (b) Step 4 ORIGINAL (UPDATE clientes con el monto COMPLETO del pago,
    // sin saf_disponible) NUNCA debe ejecutarse.
    const step4Update = calls.find((c) => c.sql.startsWith(STEP4_UPDATE_CLIENTES))
    expect(step4Update).toBeUndefined()

    // (c) Step 5 ORIGINAL (REV generico con venta_id=NULL, columnas
    // moneda_pago/monto_moneda/tasa_pago) NUNCA debe ejecutarse.
    const step5Insert = calls.find((c) => c.sql.startsWith(STEP5_INSERT_MOVIMIENTO))
    expect(step5Insert).toBeUndefined()

    // reversarPagoSafEnTx es la UNICA escritora: exactamente 1 UPDATE
    // clientes, con la forma NUEVA (incluye saf_disponible + empresa_id).
    const clienteUpdates = calls.filter((c) => c.sql.startsWith('UPDATE clientes SET'))
    expect(clienteUpdates).toHaveLength(1)
    expect(clienteUpdates[0]!.sql).toBe(NUEVO_UPDATE_CLIENTES)
  })

  it('generatedLote=false: NO llama a reversarPagoSafEnTx, corre los Steps 4/5 originales sin cambios', async () => {
    const calls = mockTxConLote({
      pagoMontoUsd: '30.00000000',
      saldoClienteActual: '-30.00000000',
      saldoPendienteClienteActual: '130.00000000',
      safDisponibleClienteActual: '10.00000000',
      loteMontoOriginalUsd: '30.00000000',
      loteSaldoDisponibleUsd: '10.00000000',
      aplicaciones: [],
    })
    // Sin lote para este pago: `detectarLoteSafDePago` (via `db.getAll`)
    // retorna `[]` -> `generatedLote: false`.
    mockedDb.getAll.mockResolvedValue([])

    await registrarReversoAbono(baseParamsSaf())

    // reversarPagoSafEnTx NO se invoca: su query interna de deteccion de
    // lote (via tx.execute) nunca aparece.
    const loteQuery = calls.find((c) => c.sql.startsWith(LOTE_QUERY_PREFIX))
    expect(loteQuery).toBeUndefined()

    // Steps 4/5 ORIGINALES SI corren, forma identica a la pre-existente.
    const step4Update = calls.find((c) => c.sql.startsWith(STEP4_UPDATE_CLIENTES))
    expect(step4Update).toBeDefined()
    const step5Insert = calls.find((c) => c.sql.startsWith(STEP5_INSERT_MOVIMIENTO))
    expect(step5Insert).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarReversoAbono — deadlock de wa-sqlite por `db.getAll` DENTRO de
// `db.writeTransaction` (fix/cxc-reverso-deadlock-getall)
//
// BUG CONFIRMADO EN STAGING: `detectarLoteSafDePago` (reversa-pago-saf.ts)
// usa `db.getAll` — una conexion de LECTURA separada de la conexion de
// ESCRITURA que abre `db.writeTransaction`. Llamar `db.getAll` DESDE DENTRO
// de un `db.writeTransaction` abierto hace DEADLOCK en wa-sqlite: la tx de
// escritura tiene el lock, `db.getAll` espera ese lock para su propia
// conexion de lectura, y la tx espera a que `db.getAll` retorne — espera
// circular, nunca se resuelve. La UI se queda en "Reversando..." para
// SIEMPRE, para TODO reverso (SAF o no — la deteccion corre incondicional).
//
// Un mock de `db.writeTransaction` NUNCA puede reproducir el hang real (no
// mantiene locks reales), asi que este test verifica el FIX ESTRUCTURAL:
// `detectarLoteSafDePago` (via `db.getAll`) debe invocarse ANTES de que
// `db.writeTransaction` abra su callback, nunca despues. Se rastrea el
// ORDEN de invocacion de ambos mocks con un array compartido.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarReversoAbono — orden de invocacion: detectarLoteSafDePago ANTES de db.writeTransaction (fix deadlock)', () => {
  function mockTxOrdenado() {
    const callOrder: string[] = []

    mockedDb.getAll.mockImplementation(async () => {
      callOrder.push('db.getAll')
      return []
    })

    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      callOrder.push('db.writeTransaction-abre-callback')
      const tx = {
        execute: vi.fn(async (sql: string) => {
          if (sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')) {
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: 'pago-1',
                  venta_id: null,
                  cliente_id: 'cliente-1',
                  monto_usd: '20.00000000',
                  is_reversed: 0,
                  tasa: null,
                  monto: null,
                  moneda_id: null,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
            return {
              rows: {
                length: 1,
                item: () => ({ saldo_actual: '0.00000000', saldo_pendiente_usd: '20.00000000' }),
              },
            }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })

    return callOrder
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

  it('la deteccion SAF (db.getAll) corre ANTES de abrir db.writeTransaction — nunca dentro (previene el deadlock de wa-sqlite)', async () => {
    const callOrder = mockTxOrdenado()

    await registrarReversoAbono(baseParams())

    expect(callOrder).toEqual(['db.getAll', 'db.writeTransaction-abre-callback'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// registrarReversoAbono — integracion $130 FIFO+SAF, net-zero
// pendiente+disponible (slice 3b-iii)
//
// Reverso de un abono global de $130 ($100 FIFO aplicado a factura-1 +
// $30 excedente SAF, del cual $20 fue consumido contra factura-2 y $10
// quedo sin consumir). `registrarAbonoGlobal` crea 2 filas `pagos`
// independientes para este abono (una por cada eje: FIFO por-factura y el
// excedente SAF, ver use-cxc.ts ~L1122/1208) — reversar el abono completo
// significa 2 llamadas SECUENCIALES a `registrarReversoAbono`, una por
// `pago_id`. Este test simula ambas llamadas contra un estado MUTABLE
// compartido de `clientes`/`ventas` (como 2 `writeTransaction` reales
// corriendo una tras la otra) para probar el stack completo end-to-end.
// ─────────────────────────────────────────────────────────────────────────

describe('registrarReversoAbono — integracion $130 FIFO+SAF, net-zero pendiente+disponible (slice 3b-iii)', () => {
  it('reverso de pago-A ($100 FIFO, factura-1) + pago-B ($30 SAF excedente, $20 consumido en factura-2, $10 remanente): saldo_pendiente_usd y saf_disponible vuelven exactamente al valor pre-abono (net-zero); saldo_actual queda con el residual documentado (riesgo fuera de alcance, ver 3b-ii.6/3b-ii.7)', async () => {
    // Estado PRE-REVERSO (resultado del abono de $130 ya aplicado):
    // factura-1 totalmente pagada por el FIFO de $100; factura-2 con $20
    // de sus $50 ya cubiertos por el SAF; cliente con $10 de credito SAF
    // sin consumir y $30 de deuda pendiente real (los $30 de factura-2).
    const cliente = { saldo_actual: '-130.00000000', saldo_pendiente_usd: '30.00000000', saf_disponible: '10.00000000' }
    const ventas: Record<string, { nro_factura: string; saldo_pend_usd: string; total_usd: string }> = {
      'factura-1': { nro_factura: 'F-001', saldo_pend_usd: '0.00000000', total_usd: '100.00000000' },
      'factura-2': { nro_factura: 'F-002', saldo_pend_usd: '30.00000000', total_usd: '50.00000000' },
    }
    const lotePagoB = { id: 'lote-B', monto_original_usd: '30.00000000', saldo_disponible_usd: '10.00000000' }
    const aplicacionesLoteB = [{ venta_id: 'factura-2', nro_factura: 'F-002', monto_aplicado_usd: '20.00000000' }]

    mockedDb.getAll.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const pagoId = params[0] as string
      if (sql.startsWith('SELECT id, monto_original_usd, saldo_disponible_usd')) {
        return pagoId === 'pago-B' ? [lotePagoB] : []
      }
      return []
    })

    mockedDb.writeTransaction.mockImplementation(async (callback) => {
      const tx = {
        execute: vi.fn(async (sql: string, params: unknown[] = []) => {
          if (sql.startsWith('SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos')) {
            const pagoId = params[0] as string
            const esPagoA = pagoId === 'pago-A'
            return {
              rows: {
                length: 1,
                item: () => ({
                  id: pagoId,
                  venta_id: esPagoA ? 'factura-1' : null,
                  cliente_id: 'cliente-1',
                  monto_usd: esPagoA ? '100.00000000' : '30.00000000',
                  is_reversed: 0,
                  tasa: null,
                  monto: null,
                  moneda_id: null,
                }),
              },
            }
          }
          if (sql.startsWith('SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?')) {
            const ventaId = params[0] as string
            const v = ventas[ventaId]!
            return { rows: { length: 1, item: () => ({ ...v }) } }
          }
          if (sql.startsWith('UPDATE ventas SET saldo_pend_usd = ?, estado = ? WHERE id = ?')) {
            const [nuevoSaldo, , ventaId] = params as [string, string, string]
            ventas[ventaId]!.saldo_pend_usd = nuevoSaldo
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('UPDATE ventas SET saldo_pend_usd = saldo_pend_usd + ? WHERE id = ?')) {
            const [montoStr, ventaId] = params as [string, string]
            const v = ventas[ventaId]!
            v.saldo_pend_usd = toStorageString(new Decimal(v.saldo_pend_usd).plus(new Decimal(montoStr)))
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd, saf_disponible FROM clientes WHERE id = ? AND empresa_id = ?')) {
            return { rows: { length: 1, item: () => ({ ...cliente }) } }
          }
          if (sql.startsWith('SELECT saldo_actual, saldo_pendiente_usd FROM clientes WHERE id = ?')) {
            return { rows: { length: 1, item: () => ({ saldo_actual: cliente.saldo_actual, saldo_pendiente_usd: cliente.saldo_pendiente_usd }) } }
          }
          if (sql.startsWith('UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, saf_disponible = ?, updated_at = ? WHERE id = ? AND empresa_id = ?')) {
            const [saldoActual, saldoPendiente, safDisponible] = params as [string, string, string]
            cliente.saldo_actual = saldoActual
            cliente.saldo_pendiente_usd = saldoPendiente
            cliente.saf_disponible = safDisponible
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, updated_at = ? WHERE id = ?')) {
            const [saldoActual, saldoPendiente] = params as [string, string]
            cliente.saldo_actual = saldoActual
            cliente.saldo_pendiente_usd = saldoPendiente
            return { rows: { length: 0, item: () => undefined } }
          }
          if (sql.startsWith('SELECT id, monto_original_usd, saldo_disponible_usd')) {
            return { rows: { length: 1, item: () => ({ ...lotePagoB }) } }
          }
          if (sql.startsWith('SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd')) {
            return {
              rows: {
                length: aplicacionesLoteB.length,
                item: (i: number) => ({ ...aplicacionesLoteB[i]! }),
              },
            }
          }
          if (sql.startsWith('SELECT id FROM libro_contable WHERE')) {
            return { rows: { length: 0, item: () => undefined } }
          }
          return { rows: { length: 0, item: () => undefined } }
        }),
      } as unknown as Transaction
      return callback(tx)
    })

    // Reverso 1: pago-A (venta-linked, $100, generatedLote=false)
    await registrarReversoAbono({
      pago_id: 'pago-A',
      reason: 'Reverso integral $130',
      reversed_by: 'user-1',
      reversed_by_nombre: 'Cajero Test',
      empresa_id: 'emp-1',
    })

    // Reverso 2: pago-B (SAF excedente, $30, generatedLote=true)
    await registrarReversoAbono({
      pago_id: 'pago-B',
      reason: 'Reverso integral $130',
      reversed_by: 'user-1',
      reversed_by_nombre: 'Cajero Test',
      empresa_id: 'emp-1',
    })

    // Net-zero en los 2 ejes que este slice garantiza:
    expect(cliente.saldo_pendiente_usd).toBe(toStorageString(150)) // 100 + 50 pre-abono
    expect(cliente.saf_disponible).toBe(toStorageString(0))
    expect(ventas['factura-1']!.saldo_pend_usd).toBe(toStorageString(100))
    expect(ventas['factura-2']!.saldo_pend_usd).toBe(toStorageString(50))

    // saldo_actual: riesgo documentado (3b-ii.6/3b-ii.7) — NO neteable a 0
    // en este escenario multi-hop sin corregir la convencion de signo
    // aguas-arriba de `registrarAbonoGlobal` (fuera de alcance de este
    // slice). Se congela el residual REAL observado como regresion.
    expect(cliente.saldo_actual).toBe(toStorageString(-10))
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
// useClientesConDeuda / useBuscarClientesDeuda — corrective (cxc-sync-
// snapshot-redesign, Task A): el filtro de DEUDA (saldo_pend_usd) baja de
// magnitud 0.001 a tolerancia 0, en paridad con `estado != 'pago'`
// (migrations/0108) — sin esto, un saldo en la banda (0, 0.001] queda
// `estado='pendiente'` (cuenta como factura pendiente, Fase 3) pero NO suma
// a `deuda_usd`/`facturas_pendientes` aqui, una "deuda fantasma" invisible
// en el agregado de cliente. El umbral de `credito_disponible_usd`
// (disponibilidad de SAF, NO deuda) queda INTACTO en 0.001 — es un concepto
// distinto, ver JSDoc de DEUDA_CREDITO_CLIENTE_SELECT.
// ─────────────────────────────────────────────────────────────────────────

describe('useClientesConDeuda / useBuscarClientesDeuda — deuda a tolerancia 0, SAF intacto en 0.001', () => {
  it('useClientesConDeuda: credito_disponible_usd conserva > 0.001 en el WHERE externo (SAF, concepto distinto de deuda)', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useClientesConDeuda())

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    expect(sql).toContain('WHERE deuda_usd > 0 OR credito_disponible_usd > 0.001')
  })

  it('useBuscarClientesDeuda: misma paridad — credito_disponible_usd intacto en 0.001', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useBuscarClientesDeuda('ab'))

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    expect(sql).toContain('WHERE deuda_usd > 0 OR credito_disponible_usd > 0.001')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// useClientesConDeuda / useBuscarClientesDeuda — slice 1c (cxc-ledger-saldos-
// redesign): read-path swap. `deuda_usd` ya NO agrega
// SUM(ventas.saldo_pend_usd) por cliente en cada render — lee directo
// `clientes.saldo_pendiente_usd` (snapshot O(1) mantenido por el trigger
// 0110, backfill 0111 ya corrido en la DB destino — ver design.md
// "Read-path parity proof"). `facturas_pendientes` unifica su predicado al
// de `estado != 'pago'` (cierra la inconsistencia de 2 predicados distintos
// para "pendiente" dentro del mismo SELECT: antes esta subconsulta usaba
// magnitud `saldo_pend_usd > 0`, mientras `useFacturasPendientes` (arriba,
// ~L172) ya usaba `estado != 'pago'` — ambos son tolerancia-0-equivalentes
// por migrations/0108, pero el SQL ahora lo expresa con el MISMO predicado).
// ─────────────────────────────────────────────────────────────────────────

describe('useClientesConDeuda / useBuscarClientesDeuda — slice 1c: deuda_usd lee clientes.saldo_pendiente_usd (O(1)), ya NO agrega SUM(ventas.saldo_pend_usd) en cada render', () => {
  it('useClientesConDeuda: el SQL lee CAST(c.saldo_pendiente_usd AS REAL) como deuda_usd, sin el SUM correlacionado sobre ventas', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useClientesConDeuda())

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    expect(sql).not.toContain('SUM(CAST(v.saldo_pend_usd')
    expect(sql).toContain('CAST(c.saldo_pendiente_usd AS REAL) as deuda_usd')
  })

  it('useClientesConDeuda: facturas_pendientes unifica el predicado a v.estado != \'pago\' (cierra la inconsistencia de predicados)', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useClientesConDeuda())

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    expect(sql).toContain("v.estado != 'pago'")
    expect(sql).not.toContain('CAST(v.saldo_pend_usd AS REAL) > 0) as facturas_pendientes')
  })

  it("useClientesConDeuda: facturas_pendientes excluye facturas ANULADA con guard status != 'ANULADA' (paridad con useFacturasPendientes, no depende solo de que estado='pago' se setee en la anulacion)", () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useClientesConDeuda())

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    // El COUNT de facturas_pendientes debe excluir ANULADA explicitamente,
    // igual que useFacturasPendientes (status y estado son columnas
    // independientes: validez fiscal vs cobranza).
    expect(sql).toContain("v.status != 'ANULADA'")
  })

  it('useBuscarClientesDeuda: misma lectura directa de saldo_pendiente_usd, mismo predicado unificado en facturas_pendientes', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useBuscarClientesDeuda('ab'))

    const call = mockedUseQuery.mock.calls.find(([sql]) => String(sql).includes('FROM clientes c'))
    expect(call).toBeDefined()
    const [sql] = call!
    expect(sql).not.toContain('SUM(CAST(v.saldo_pend_usd')
    expect(sql).toContain('CAST(c.saldo_pendiente_usd AS REAL) as deuda_usd')
    expect(sql).toContain("v.estado != 'pago'")
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Slice 1c — VALUE-PARITY proof (tolerancia 0, NO solo forma de SQL): la
// lectura O(1) de `clientes.saldo_pendiente_usd` debe producir EXACTAMENTE
// el mismo numero que la agregacion legacy `SUM(saldo_pend_usd WHERE
// saldo_pend_usd > 0)` Y que `SUM(saldo_pend_usd WHERE estado != 'pago')`
// (migrations/0108: estado='pago' <=> saldo_pend_usd<=0, tolerancia 0). Usa
// las DOS funciones puras de produccion que realmente gobiernan estos
// numeros: `calcularEstadoVenta` (deriva `estado` desde `saldo_pend_usd` +
// `total_usd`, espejo 1:1 del trigger 0108) y
// `calcularSaldoPendienteClienteNuevo` (espejo 1:1 del trigger 0110 que
// mantiene `clientes.saldo_pendiente_usd` incrementalmente ante cada
// movimiento — la misma funcion ya cableada al 100% de los write-sites en
// slice 1b). Fixture mixto: una venta 100% pendiente (V1), una pagada
// completamente — saldo EXACTAMENTE 0 (V2), una parcial (V3).
// ─────────────────────────────────────────────────────────────────────────

describe('Slice 1c — value-parity: saldo_pendiente_usd (materializado) === SUM(saldo_pend_usd>0) === SUM(estado!=\'pago\')', () => {
  it('fixture mixto (pendiente/pagada-en-cero/parcial): las 3 fuentes convergen al mismo numero, tolerancia 0', () => {
    // V1: factura de $100 a credito, nunca pagada -> sigue 100% pendiente.
    const v1Total = new Decimal('100')
    let saldoPendienteCliente = new Decimal('0')
    saldoPendienteCliente = calcularSaldoPendienteClienteNuevo('FAC', saldoPendienteCliente, v1Total)
    const v1SaldoPend = v1Total // sin pagos
    const v1Estado = calcularEstadoVenta(v1SaldoPend, v1Total, null)

    // V2: factura de $50 a credito, pagada en su totalidad -> saldo EXACTAMENTE 0.
    const v2Total = new Decimal('50')
    saldoPendienteCliente = calcularSaldoPendienteClienteNuevo('FAC', saldoPendienteCliente, v2Total)
    let v2SaldoPend = v2Total
    v2SaldoPend = v2SaldoPend.minus(new Decimal('50')) // pago total
    saldoPendienteCliente = calcularSaldoPendienteClienteNuevo('PAG', saldoPendienteCliente, new Decimal('50'))
    const v2Estado = calcularEstadoVenta(v2SaldoPend, v2Total, 'PAG')

    // V3: factura de $80 a credito, pago parcial de $30 -> queda $50 pendiente.
    const v3Total = new Decimal('80')
    saldoPendienteCliente = calcularSaldoPendienteClienteNuevo('FAC', saldoPendienteCliente, v3Total)
    let v3SaldoPend = v3Total
    v3SaldoPend = v3SaldoPend.minus(new Decimal('30')) // pago parcial
    saldoPendienteCliente = calcularSaldoPendienteClienteNuevo('PAG', saldoPendienteCliente, new Decimal('30'))
    const v3Estado = calcularEstadoVenta(v3SaldoPend, v3Total, 'PAG')

    const ventas = [
      { saldoPend: v1SaldoPend, estado: v1Estado },
      { saldoPend: v2SaldoPend, estado: v2Estado },
      { saldoPend: v3SaldoPend, estado: v3Estado },
    ]

    // Sanidad del fixture: exactamente 1 pendiente, 1 pagada-en-cero, 1 parcial.
    expect(ventas.map((v) => v.estado)).toEqual(['pendiente', 'pago', 'parcial'])
    expect(v2SaldoPend.toString()).toBe('0')

    // Fuente legacy: SUM(saldo_pend_usd WHERE saldo_pend_usd > 0).
    const legacySum = ventas
      .filter((v) => v.saldoPend.greaterThan(0))
      .reduce((acc, v) => acc.plus(v.saldoPend), new Decimal(0))

    // Fuente unificada (nuevo predicado de facturas_pendientes, 1c.2): SUM(saldo_pend_usd WHERE estado != 'pago').
    const estadoSum = ventas
      .filter((v) => v.estado !== 'pago')
      .reduce((acc, v) => acc.plus(v.saldoPend), new Decimal(0))

    // Fuente materializada: clientes.saldo_pendiente_usd, mantenida incrementalmente
    // por el trigger 0110 via calcularSaldoPendienteClienteNuevo en cada movimiento
    // (misma funcion cableada al 100% de los write-sites, slice 1b) — NO una
    // nueva agregacion, es el snapshot que 1c.2 ahora lee directo.
    const materializedSum = saldoPendienteCliente

    expect(legacySum.toString()).toBe('150')
    expect(estadoSum.toString()).toBe('150')
    expect(materializedSum.toString()).toBe('150')
    expect(legacySum.equals(estadoSum)).toBe(true)
    expect(legacySum.equals(materializedSum)).toBe(true)
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

// ─────────────────────────────────────────────────────────────────────────
// useFacturasPendientes — Fase 3 (cxc-sync-snapshot-redesign): read-path
// swap de `CAST(saldo_pend_usd AS REAL) > 0.001` a `estado != 'pago'`
// (snapshot trigger-derivado, migrations/0106), manteniendo `status !=
// 'ANULADA'` como guard SEPARADO (validez fiscal vs cobranza). Contrato de
// paridad congelada: el set de facturas pendientes debe ser IDENTICO al de
// la magnitud-filter anterior (design.md §8, spec ventas-estado-derivado).
//
// DIVERGENCIA DOCUMENTADA (migrations/0108, tolerancia de `estado` bajada a
// 0 exacto): con tolerancia 0.005 la fixture de abajo evitaba a proposito la
// banda ambigua (0.001, 0.005]. Con tolerancia 0, esa banda deja de existir
// — la UNICA banda de divergencia posible queda en `(0, 0.001]`: el filtro
// VIEJO (`saldo_pend_usd > 0.001`) trataba un saldo en esa banda como NO
// pendiente (lo ignoraba), mientras que `estado` (tolerancia 0) SI lo marca
// como no-pago (pendiente/parcial) para cualquier saldo > 0. Es decir,
// `estado` es ahora MAS ESTRICTO que el filtro viejo en esa banda —
// alineado con la intencion del owner de "cobrar todo, no redondear deuda
// real a cero". Esto es un CAMBIO DE COMPORTAMIENTO real (no solo interno)
// pero deliberado e interino: ver estado-venta.ts para la nota de que
// tolerancia 0 no es la respuesta final de produccion contra polvo de
// redondeo (pendiente de la migracion futura de diferencial-cambiario).
// ─────────────────────────────────────────────────────────────────────────

describe('useFacturasPendientes — Fase 3: read-path estado (frozen UI-contract parity)', () => {
  it('rama por defecto (incluirPagadas=false): usa estado != \'pago\' + status != \'ANULADA\', ya NO escanea CAST(saldo_pend_usd AS REAL)', () => {
    mockedUseQuery.mockReturnValue({ data: [], isLoading: false } as never)

    renderHook(() => useFacturasPendientes('cliente-1'))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).toContain("status != 'ANULADA'")
    expect(sql).toContain("estado != 'pago'")
    expect(sql).not.toContain('saldo_pend_usd')
    expect(params).toEqual(['cliente-1'])
  })

  it('rama incluirPagadas=true: elimina el filtro muerto \'REVERSADA\' pero preserva status != \'ANULADA\' (sigue incluyendo pagadas)', () => {
    mockedUseQuery.mockReturnValue({
      data: [
        { id: 'v-1', nro_factura: 'F-001', fecha: '2026-01-01', total_usd: '100', total_bs: '4000', saldo_pend_usd: '0', tasa: '40', tipo: 'CONTADO', cliente_id: 'cliente-1' },
      ],
      isLoading: false,
    } as never)

    const { result } = renderHook(() => useFacturasPendientes('cliente-1', true))

    const [sql, params] = mockedUseQuery.mock.calls[0]
    expect(sql).not.toContain('REVERSADA')
    expect(sql).toContain("status != 'ANULADA'")
    expect(params).toEqual(['cliente-1'])
    // Contrato preservado: incluirPagadas=true debe seguir devolviendo facturas
    // con saldo_pend_usd=0 (pagadas) — si el swap hubiera filtrado por estado
    // aqui, esta factura (CONTADO pagada) desaparecería del historial.
    expect(result.current.facturas).toHaveLength(1)
    expect(result.current.facturas[0].saldo_pend_usd).toBe('0')
  })

  it('paridad congelada: para una fixture de ledger fija, estado != \'pago\' incluye EXACTAMENTE el mismo set que el filtro de magnitud anterior (saldo_pend_usd > 0.001)', () => {
    // Fixture realista (no en la zona de tolerancia ambigua 0.001-0.005):
    // cada fila simula el resultado de calcularEstadoVenta sobre saldo/total
    // reales de distintos movimientos del Design §4 matrix.
    const fixture: Array<{ saldo: string; total: string; ultimoMov: string | null }> = [
      { saldo: '100.00', total: '100.00', ultimoMov: null },  // FAC CREDITO sin pagar -> pendiente
      { saldo: '0.00', total: '50.00', ultimoMov: null },     // FAC CONTADO pagada al nacer -> pago
      { saldo: '40.00', total: '100.00', ultimoMov: 'PAG' },  // pago parcial -> parcial
      { saldo: '0.00', total: '100.00', ultimoMov: 'PAG' },   // pago total -> pago
      { saldo: '0.00', total: '30.00', ultimoMov: 'NCR' },    // NC cubre 100% -> pago
      { saldo: '80.00', total: '100.00', ultimoMov: 'REV' },  // reverso reabre -> reversado
      { saldo: '0.00', total: '100.00', ultimoMov: 'REV' },   // reverso que vuelve a 0 (caso limite, no reversado) -> pago
    ]

    for (const { saldo, total, ultimoMov } of fixture) {
      const saldoDecimal = new Decimal(saldo)
      const totalDecimal = new Decimal(total)
      const estado = calcularEstadoVenta(saldoDecimal, totalDecimal, ultimoMov)

      const oldFilterIncluye = parseFloat(saldo) > 0.001
      const newFilterIncluye = estado !== 'pago'

      expect(newFilterIncluye).toBe(oldFilterIncluye)
    }
  })
})
