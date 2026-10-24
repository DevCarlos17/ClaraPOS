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
      {
        pago_id: 'pago-1',
        monto_aplicado_usd: '50.00000000',
        venta_id: 'venta-1',
        nro_factura: 'F-100',
        tasa: '40.0000',
        metodo_nombre: 'EFECTIVO USD',
        codigo_iso: 'USD',
      },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-1')

    expect(resultado.estado).toBe('OK')
    expect(resultado.facturasDirectas).toEqual([
      {
        ventaId: 'venta-1',
        nroFactura: 'F-100',
        montoAplicadoUsd: 50,
        montoAplicadoNativo: 2000,
        monedaCodigo: 'USD',
        metodoNombre: 'EFECTIVO USD',
        tasa: 40,
      },
    ])
    expect(resultado.facturasSaf).toEqual([])
    expect(resultado.totalUsd).toBe(50)

    const [sql, params] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('FROM movimientos_bancarios_pagos')
    expect(sql).toContain('JOIN pagos')
    expect(params).toEqual(['ingreso-1', 'emp-1'])

    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledWith('emp-1', 'pago-1')
  })

  it('factura directa incluye moneda nativa y metodo (deriva montoAplicadoNativo = montoAplicadoUsd * tasa)', async () => {
    mockedGetAll.mockResolvedValueOnce([
      {
        pago_id: 'pago-x',
        monto_aplicado_usd: '1.00000000',
        venta_id: 'venta-x',
        nro_factura: 'F-X',
        tasa: '500.0000',
        metodo_nombre: 'BANESCO PAGO MOVIL',
        codigo_iso: 'VES',
      },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-x')

    expect(resultado.facturasDirectas).toEqual([
      {
        ventaId: 'venta-x',
        nroFactura: 'F-X',
        montoAplicadoUsd: 1,
        montoAplicadoNativo: 500,
        monedaCodigo: 'VES',
        metodoNombre: 'BANESCO PAGO MOVIL',
        tasa: 500,
      },
    ])
  })

  it('monto nativo se deriva de montoAplicadoUsd*tasa de la fila puente, NO de pagos.monto completo', async () => {
    mockedGetAll.mockResolvedValueOnce([
      {
        pago_id: 'pago-parcial',
        monto_aplicado_usd: '1.00000000', // fila puente: solo $1 aplicado de este abono
        monto: '1000.00000000', // monto COMPLETO del pago (decoy — no debe leerse)
        venta_id: 'venta-parcial',
        nro_factura: 'F-PARCIAL',
        tasa: '500.0000',
        metodo_nombre: 'BANESCO PAGO MOVIL',
        codigo_iso: 'VES',
      },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-parcial')

    expect(resultado.facturasDirectas[0]?.montoAplicadoNativo).toBe(500)
    expect(resultado.facturasDirectas[0]?.montoAplicadoNativo).not.toBe(1000)
  })

  it('escenario abono-global: ingreso 38201beb con 2 filas puente ($1 c/u) -> facturas 8954d635/ab7d1bab, total=$2', async () => {
    mockedGetAll.mockResolvedValueOnce([
      {
        pago_id: 'pago-A',
        monto_aplicado_usd: '1.00000000',
        venta_id: '8954d635',
        nro_factura: 'F-A',
        tasa: '40.0000',
        metodo_nombre: 'ZELLE',
        codigo_iso: 'USD',
      },
      {
        pago_id: 'pago-B',
        monto_aplicado_usd: '1.00000000',
        venta_id: 'ab7d1bab',
        nro_factura: 'F-B',
        tasa: '40.0000',
        metodo_nombre: 'ZELLE',
        codigo_iso: 'USD',
      },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValue({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', '38201beb')

    expect(resultado.estado).toBe('OK')
    expect(resultado.facturasDirectas).toEqual([
      {
        ventaId: '8954d635',
        nroFactura: 'F-A',
        montoAplicadoUsd: 1,
        montoAplicadoNativo: 40,
        monedaCodigo: 'USD',
        metodoNombre: 'ZELLE',
        tasa: 40,
      },
      {
        ventaId: 'ab7d1bab',
        nroFactura: 'F-B',
        montoAplicadoUsd: 1,
        montoAplicadoNativo: 40,
        monedaCodigo: 'USD',
        metodoNombre: 'ZELLE',
        tasa: 40,
      },
    ])
    expect(resultado.totalUsd).toBe(2)
    expect(mockedDetectarLoteSafDePago).toHaveBeenCalledTimes(2)
  })

  it('escenario SAF: 1 pago sin venta_id cuyo detectarLoteSafDePago devuelve generatedLote=true -> factura etiquetada via facturasSaf, distinta de facturasDirectas', async () => {
    mockedGetAll.mockResolvedValueOnce([
      {
        pago_id: 'pago-anticipo',
        monto_aplicado_usd: '30.00000000',
        venta_id: null,
        nro_factura: null,
        tasa: '500.0000',
        metodo_nombre: 'BANESCO PAGO MOVIL',
        codigo_iso: 'VES',
      },
    ])
    // detectarLoteSafDePago sigue devolviendo SOLO {ventaId, nroFactura,
    // montoAplicadoUsd} — moneda/metodo/tasa NO vienen de aqui (prueba de
    // que el enriquecimiento ocurre en el spread del loop, con los campos
    // de la FILA PUENTE, no modificando este mock/contrato).
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
    expect(resultado.facturasSaf).toEqual([
      {
        ventaId: 'venta-D',
        nroFactura: 'F-D',
        montoAplicadoUsd: 30,
        montoAplicadoNativo: 15000,
        monedaCodigo: 'VES',
        metodoNombre: 'BANESCO PAGO MOVIL',
        tasa: 500,
      },
    ])
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
      {
        pago_id: 'pago-vivo',
        monto_aplicado_usd: '20.00000000',
        venta_id: 'venta-vivo',
        nro_factura: 'F-VIVO',
        tasa: '40.0000',
        metodo_nombre: 'EFECTIVO USD',
        codigo_iso: 'USD',
      },
    ])
    mockedDetectarLoteSafDePago.mockResolvedValueOnce({ generatedLote: false, facturasAfectadas: [] })

    const resultado = await previewFacturasAfectadas('emp-1', 'ingreso-mixto')

    const [sql] = mockedGetAll.mock.calls[0]!
    expect(sql).toContain('is_reversed')

    expect(resultado.facturasDirectas).toEqual([
      {
        ventaId: 'venta-vivo',
        nroFactura: 'F-VIVO',
        montoAplicadoUsd: 20,
        montoAplicadoNativo: 800,
        monedaCodigo: 'USD',
        metodoNombre: 'EFECTIVO USD',
        tasa: 40,
      },
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
