import { construirLineasDebitoCompra, generarAsientosCompra, type LineaAsiento } from '../generar-asientos'

describe('construirLineasDebitoCompra', () => {
  const cuentasCompletas = { INVENTARIO: 'cta-inventario', IVA_CREDITO: 'cta-iva-credito' }

  it('base e iva > 0: dos lineas de DEBE, base a INVENTARIO e iva a IVA_CREDITO (ejemplo Bs 116 = 100 base + 16 iva)', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 100,
      ivaUsd: 16,
      tasa: 1,
      monedaContable: 'BS',
      cuentas: cuentasCompletas,
      nroFactura: 'F-001',
    })

    expect(lineas).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 100, detalle: 'Compra mercancia F-001' },
      { cuenta_contable_id: 'cta-iva-credito', monto: 16, detalle: 'IVA credito fiscal compra F-001' },
    ])
  })

  it('iva = 0 (factura exenta): una sola linea a INVENTARIO, sin linea IVA_CREDITO', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 50,
      ivaUsd: 0,
      tasa: 1,
      monedaContable: 'BS',
      cuentas: cuentasCompletas,
      nroFactura: 'F-002',
    })

    expect(lineas).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 50, detalle: 'Compra mercancia F-002' },
    ])
  })

  it('sin cuenta INVENTARIO configurada: no genera ninguna linea (comportamiento previo)', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 100,
      ivaUsd: 16,
      tasa: 1,
      monedaContable: 'BS',
      cuentas: { IVA_CREDITO: 'cta-iva-credito' },
      nroFactura: 'F-003',
    })

    expect(lineas).toEqual([])
  })

  it('sin cuenta IVA_CREDITO configurada pero iva > 0: fallback, todo pliega en INVENTARIO (no se pierde el monto)', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 100,
      ivaUsd: 16,
      tasa: 1,
      monedaContable: 'BS',
      cuentas: { INVENTARIO: 'cta-inventario' },
      nroFactura: 'F-004',
    })

    expect(lineas).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 116, detalle: 'Compra mercancia F-004' },
    ])
  })

  it('con empaque/flete plegado en base e iva (folding ya resuelto por el caller): sigue separando correctamente', () => {
    // Ejemplo: productos base=100/iva=16 + empaque base=30/iva=4.8 ya sumados por el caller
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 130,
      ivaUsd: 20.8,
      tasa: 1,
      monedaContable: 'BS',
      cuentas: cuentasCompletas,
      nroFactura: 'F-005',
    })

    expect(lineas).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 130, detalle: 'Compra mercancia F-005' },
      { cuenta_contable_id: 'cta-iva-credito', monto: 20.8, detalle: 'IVA credito fiscal compra F-005' },
    ])
  })

  it('regresion: base+iva con decimales realistas y tasa VES no rompe partida doble (redondeo independiente causaba drift de 1 centavo)', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 164.9572,
      ivaUsd: 26.3932,
      tasa: 109.4643,
      monedaContable: 'BS',
      cuentas: cuentasCompletas,
      nroFactura: 'F-007',
    })

    const suma = lineas.reduce((acc, l) => acc + l.monto, 0)
    const montoTotalEsperado = Number(((164.9572 + 26.3932) * 109.4643).toFixed(2))
    expect(suma).toBe(montoTotalEsperado)
  })

  it('conversion a Bs con tasa != 1: monto se multiplica por la tasa (base y iva por separado)', () => {
    const lineas = construirLineasDebitoCompra({
      baseInventarioUsd: 10,
      ivaUsd: 1.6,
      tasa: 50,
      monedaContable: 'BS',
      cuentas: cuentasCompletas,
      nroFactura: 'F-006',
    })

    expect(lineas).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 500, detalle: 'Compra mercancia F-006' },
      { cuenta_contable_id: 'cta-iva-credito', monto: 80, detalle: 'IVA credito fiscal compra F-006' },
    ])
  })
})

describe('generarAsientosCompra (integracion): debitos balancean creditos', () => {
  function fakeTx(): { execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>; inserted: LineaAsiento[] } {
    const inserted: LineaAsiento[] = []
    return {
      inserted,
      execute: async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: { item: () => ({ cnt: 0 }), length: 1 } }
        }
        // INSERT INTO libro_contable — capturar cuenta_contable_id y monto insertados
        if (sql.includes('INSERT INTO libro_contable') && params) {
          inserted.push({
            cuenta_contable_id: params[7] as string,
            monto: Number(params[9]),
            detalle: params[10] as string,
          })
        }
        return { rows: { item: () => undefined, length: 0 } }
      },
    }
  }

  it('compra a credito (CxP): base->INVENTARIO, iva->IVA_CREDITO, credito->CXP_PROVEEDORES, suma total = 0', async () => {
    const tx = fakeTx()
    const cuentas = { INVENTARIO: 'cta-inventario', IVA_CREDITO: 'cta-iva-credito', CXP_PROVEEDORES: 'cta-cxp' }

    await generarAsientosCompra(tx, {
      empresaId: 'e1',
      compraId: 'c1',
      nroFactura: 'F-100',
      totalUsd: 116,
      baseInventarioUsd: 100,
      ivaUsd: 16,
      esContado: false,
      banco_empresa_id: null,
      cuentas,
      usuarioId: 'u1',
      monedaContable: 'BS',
      tasa: 1,
    })

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 100, detalle: 'Compra mercancia F-100' },
      { cuenta_contable_id: 'cta-iva-credito', monto: 16, detalle: 'IVA credito fiscal compra F-100' },
      { cuenta_contable_id: 'cta-cxp', monto: -116, detalle: 'Credito compra F-100' },
    ])

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBe(0)
  })

  it('compra a credito con empaque/flete plegado en base e iva: sigue balanceando', async () => {
    const tx = fakeTx()
    const cuentas = { INVENTARIO: 'cta-inventario', IVA_CREDITO: 'cta-iva-credito', CXP_PROVEEDORES: 'cta-cxp' }

    await generarAsientosCompra(tx, {
      empresaId: 'e1',
      compraId: 'c2',
      nroFactura: 'F-101',
      totalUsd: 150.8,
      baseInventarioUsd: 130,
      ivaUsd: 20.8,
      esContado: false,
      banco_empresa_id: null,
      cuentas,
      usuarioId: 'u1',
      monedaContable: 'BS',
      tasa: 1,
    })

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBeCloseTo(0, 8)
    expect(tx.inserted).toContainEqual({ cuenta_contable_id: 'cta-inventario', monto: 130, detalle: 'Compra mercancia F-101' })
    expect(tx.inserted).toContainEqual({ cuenta_contable_id: 'cta-iva-credito', monto: 20.8, detalle: 'IVA credito fiscal compra F-101' })
  })

  it('regresion: compra contado con decimales realistas y tasa VES no lanza error de partida doble', async () => {
    const tx = fakeTx()
    const cuentas = { INVENTARIO: 'cta-inventario', IVA_CREDITO: 'cta-iva-credito', BANCO_DEFAULT: 'cta-banco' }
    const baseInventarioUsd = 164.9572
    const ivaUsd = 26.3932
    const totalUsd = baseInventarioUsd + ivaUsd
    const tasa = 109.4643

    await generarAsientosCompra(tx, {
      empresaId: 'e1',
      compraId: 'c3',
      nroFactura: 'F-DRIFT',
      totalUsd,
      baseInventarioUsd,
      ivaUsd,
      esContado: true,
      banco_empresa_id: null,
      cuentas,
      usuarioId: 'u1',
      monedaContable: 'BS',
      tasa,
    })

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBe(0)
  })
})
