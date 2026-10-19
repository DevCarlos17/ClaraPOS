// `detectarLoteSafDePago` es PURA LECTURA (slice 3b-i de
// cxc-ledger-saldos-redesign) — usa `db.getAll` directo (sin
// `db.writeTransaction`), mismo patron que los reportes de solo-lectura en
// `cxc-reportes-general.tsx`/`cxc-cliente-reporte.tsx`. Mockeamos el modulo
// completo para controlar las 2 queries (lote + aplicaciones) sin una
// PowerSyncDatabase real.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
  },
}))

import { db } from '@/core/db/powersync/db'
import { detectarLoteSafDePago } from '../reversa-pago-saf'

const mockedGetAll = vi.mocked(db.getAll)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('detectarLoteSafDePago — deteccion de lote SAF generado por un pago (read-only)', () => {
  it('escenario: el pago NO genero ningun lote SAF', async () => {
    mockedGetAll.mockResolvedValueOnce([])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-sin-lote')

    expect(resultado.generatedLote).toBe(false)
    expect(resultado.facturasAfectadas).toEqual([])
    expect(resultado.loteId).toBeUndefined()
    expect(resultado.montoConsumidoUsd).toBeUndefined()

    // La query de aplicaciones NUNCA debe dispararse si no hubo lote.
    expect(mockedGetAll).toHaveBeenCalledTimes(1)
    const [sqlLote, paramsLote] = mockedGetAll.mock.calls[0]!
    expect(sqlLote).toContain('FROM saf_creditos_lotes')
    expect(sqlLote).toContain("origen_tipo = 'PAGO'")
    expect(paramsLote).toEqual(['pago-sin-lote', 'emp-1'])
  })

  it('escenario: lote generado pero intacto (consumo cero)', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-1', monto_original_usd: '100.00000000', saldo_disponible_usd: '100.00000000' },
      ])
      .mockResolvedValueOnce([])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-intacto')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.loteId).toBe('lote-1')
    expect(resultado.montoOriginalUsd).toBe(100)
    expect(resultado.saldoDisponibleUsd).toBe(100)
    expect(resultado.montoConsumidoUsd).toBe(0)
    expect(resultado.facturasAfectadas).toEqual([])
  })

  it('escenario: lote parcialmente consumido ($60 de $100, 1 factura)', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-2', monto_original_usd: '100.00000000', saldo_disponible_usd: '40.00000000' },
      ])
      .mockResolvedValueOnce([
        { venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' },
      ])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-parcial')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.montoConsumidoUsd).toBe(60)
    expect(resultado.facturasAfectadas).toEqual([
      { ventaId: 'venta-1', nroFactura: 'F-001', montoAplicadoUsd: 60 },
    ])

    const [sqlAplicaciones, paramsAplicaciones] = mockedGetAll.mock.calls[1]!
    expect(sqlAplicaciones).toContain('FROM saf_creditos_aplicaciones')
    expect(sqlAplicaciones).toContain('JOIN ventas')
    expect(paramsAplicaciones).toEqual(['lote-2', 'emp-1'])
  })

  it('escenario: lote totalmente consumido ($100 = $60+$40) a traves de 2 ventas', async () => {
    mockedGetAll
      .mockResolvedValueOnce([
        { id: 'lote-3', monto_original_usd: '100.00000000', saldo_disponible_usd: '0.00000000' },
      ])
      .mockResolvedValueOnce([
        { venta_id: 'venta-1', nro_factura: 'F-001', monto_aplicado_usd: '60.00000000' },
        { venta_id: 'venta-2', nro_factura: 'F-002', monto_aplicado_usd: '40.00000000' },
      ])

    const resultado = await detectarLoteSafDePago('emp-1', 'pago-total')

    expect(resultado.generatedLote).toBe(true)
    expect(resultado.montoConsumidoUsd).toBe(100)
    expect(resultado.facturasAfectadas).toHaveLength(2)
    expect(resultado.facturasAfectadas).toEqual([
      { ventaId: 'venta-1', nroFactura: 'F-001', montoAplicadoUsd: 60 },
      { ventaId: 'venta-2', nroFactura: 'F-002', montoAplicadoUsd: 40 },
    ])
  })

  it('aislamiento multi-tenant: un pago_id de empresa A nunca expone el lote de empresa B', async () => {
    // El mock simula el comportamiento real de SQLite/Postgres: el WHERE
    // filtra por empresa_id, asi que si se consulta con la empresa
    // equivocada, la fila nunca aparece aunque el pago_id "adivinado" matchee.
    mockedGetAll.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        const [origenId, empresaId] = params as [string, string]
        if (origenId === 'pago-empresa-a' && empresaId === 'emp-a') {
          return [{ id: 'lote-a', monto_original_usd: '100.00000000', saldo_disponible_usd: '100.00000000' }]
        }
        return []
      }
      return []
    })

    const resultadoCorrecto = await detectarLoteSafDePago('emp-a', 'pago-empresa-a')
    expect(resultadoCorrecto.generatedLote).toBe(true)
    expect(resultadoCorrecto.loteId).toBe('lote-a')

    const resultadoCruzado = await detectarLoteSafDePago('emp-b', 'pago-empresa-a')
    expect(resultadoCruzado.generatedLote).toBe(false)
    expect(resultadoCruzado.facturasAfectadas).toEqual([])

    // Ambas queries (lote + aplicaciones, cuando aplica) deben llevar
    // empresa_id como parametro — no-negociable, ver spec Requirement
    // "Multitenant isolation".
    for (const [sql, params] of mockedGetAll.mock.calls) {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        expect(sql).toContain('AND empresa_id = ?')
        expect(params).toHaveLength(2)
      }
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')) {
        expect(sql).toContain('empresa_id = ?')
      }
    }
  })

  it('aislamiento multi-tenant: la query de aplicaciones tambien filtra empresa_id (consumo del lote no cruza empresas)', async () => {
    mockedGetAll.mockImplementation(async (sql: unknown) => {
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_lotes')) {
        return [{ id: 'lote-1', monto_original_usd: '100', saldo_disponible_usd: '40' }] as never
      }
      if (typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')) {
        return [{ venta_id: 'v1', nro_factura: 'F-001', monto_aplicado_usd: '60' }] as never
      }
      return [] as never
    })

    await detectarLoteSafDePago('emp-a', 'pago-con-lote')

    const callAplicaciones = mockedGetAll.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM saf_creditos_aplicaciones')
    )
    expect(callAplicaciones).toBeDefined()
    const [sqlAplic, paramsAplic] = callAplicaciones!
    expect(sqlAplic).toContain('empresa_id = ?')
    // params: [lote_id, empresa_id]
    expect(paramsAplic).toContain('emp-a')
  })
})
