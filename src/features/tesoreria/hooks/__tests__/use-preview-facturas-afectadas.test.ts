// `previewFacturasAfectadas` es PURA LECTURA (slice 1a-hook de
// preview-facturas-afectadas-reverso-tesoreria) — usa `db.getAll` directo
// (sin `db.writeTransaction`), mismo patron que `detectarLoteSafDePago`
// (`reversa-pago-saf.ts`). Mockeamos ambos modulos para controlar la query
// del puente (`movimientos_bancarios_pagos` JOIN `pagos` LEFT JOIN `ventas`)
// y la deteccion de lote SAF sin una PowerSyncDatabase real.
vi.mock('@/core/db/powersync/db', () => ({
  db: {
    getAll: vi.fn(),
  },
}))

vi.mock('@/features/cxc/hooks/reversa-pago-saf', () => ({
  detectarLoteSafDePago: vi.fn(),
}))

import { db } from '@/core/db/powersync/db'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'
import { previewFacturasAfectadas } from '../use-preview-facturas-afectadas'

const mockedGetAll = vi.mocked(db.getAll)
const mockedDetectarLoteSafDePago = vi.mocked(detectarLoteSafDePago)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('previewFacturasAfectadas — preview read-only de facturas afectadas por reverso de tesoreria', () => {
  it('escenario simple: 1 fila puente hacia 1 pago con venta_id no-NULL -> 1 factura directa', async () => {
    mockedGetAll.mockResolvedValueOnce([
      { pago_id: 'pago-1', monto_aplicado_usd: '50.00000000', venta_id: 'venta-1', nro_factura: 'F-100' },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-1')

    expect(resultado.estado).toBe('OK')
    expect(resultado.facturasDirectas).toEqual([
      { ventaId: 'venta-1', nroFactura: 'F-100', montoAplicadoUsd: 50 },
    ])
    expect(resultado.facturasSaf).toEqual([])
    expect(resultado.totalUsd).toBe(50)

    const [sql, params] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('FROM movimientos_bancarios_pagos')
    expect(sql).toContain('JOIN pagos')
    expect(params).toEqual(['ingreso-1', 'emp-1'])

    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-1')
  })

  it('escenario abono-global: ingreso 38201beb con 2 filas puente ($1 c/u) -> facturas 8954d635/ab7d1bab, total=$2', async () => {
    mockedGetAll.mockResolvedValueOnce([
      { pago_id: 'pago-A', monto_aplicado_usd: '1.00000000', venta_id: '8954d635', nro_factura: 'F-A' },
      { pago_id: 'pago-B', monto_aplicado_usd: '1.00000000', venta_id: 'ab7d1bab', nro_factura: 'F-B' },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValue({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', '38201beb')

    expect(resultado.estado).toBe('OK')
    expect(resultado.facturasDirectas).toEqual([
      { ventaId: '8954d635', nroFactura: 'F-A', montoAplicadoUsd: 1 },
      { ventaId: 'ab7d1bab', nroFactura: 'F-B', montoAplicadoUsd: 1 },
    ])
    expect(resultado.totalUsd).toBe(2)
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledTimes(2)
  })

  it('escenario SAF: 1 pago sin venta_id cuyo detectarLoteSafDePago devuelve generatedLote=true -> factura etiquetada via facturasSaf, distinta de facturasDirectas', async () => {
    mockedGetAll.mockResolvedValueOnce([
      { pago_id: 'pago-anticipo', monto_aplicado_usd: '30.00000000', venta_id: null, nro_factura: null },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({
      generatedLote: true,
      loteId: 'lote-1',
      montoOriginalUsd: 30,
      saldoDisponibleUsd: 0,
      montoConsumidoUsd: 30,
      facturasAfectadas: [{ ventaId: 'venta-D', nroFactura: 'F-D', montoAplicadoUsd: 30 }],
    })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-saf')

    expect(resultado.facturasDirectas).toEqual([])
    expect(resultado.facturasSaf).toEqual([{ ventaId: 'venta-D', nroFactura: 'F-D', montoAplicadoUsd: 30 }])
    expect(resultado.totalUsd).toBe(30)
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-anticipo')
  })

  it('exclusion: la query filtra pagos con is_reversed=1, por lo que una fila puente reversada no llega al resultado', async () => {
    // El filtro `(p.is_reversed IS NULL OR p.is_reversed = 0)` vive en el SQL
    // (igual que el resto del modulo CxC/Tesoreria) — el mock devuelve solo la
    // fila NO reversada, como lo haria la base real. Verificamos que el SQL
    // enviado contiene la clausula, y que el resultado se deriva exactamente
    // de la fila sobreviviente (no un hardcode).
    mockedGetAll.mockResolvedValueOnce([
      { pago_id: 'pago-vivo', monto_aplicado_usd: '20.00000000', venta_id: 'venta-vivo', nro_factura: 'F-VIVO' },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-mixto')

    const [sql] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('is_reversed')

    expect(resultado.facturasDirectas).toEqual([
      { ventaId: 'venta-vivo', nroFactura: 'F-VIVO', montoAplicadoUsd: 20 },
    ])
    expect(resultado.totalUsd).toBe(20)
  })

  it('legacy: 0 filas puente para el ingreso_id -> estado LEGACY, distinto de "0 facturas afectadas"', async () => {
    mockedGetAll.mockResolvedValueOnce([])

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-legacy')

    expect(resultado.estado).toBe('LEGACY')
    expect(resultado.facturasDirectas).toEqual([])
    expect(resultado.facturasSaf).toEqual([])
    expect(resultado.totalUsd).toBe(0)
    expect(mockedDetectarLoteSafDePago).not.toHaveBeenCalled()
  })

  it('aislamiento multi-tenant: la query del puente lleva empresa_id como parametro', async () => {
    mockedGetAll.mockResolvedValueOnce([])

    await previewFacturasAfectadas('emp-a', 'ingreso-1')

    const [sql, params] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('empresa_id = ?')
    expect(params).toContain('emp-a')
  })
})
