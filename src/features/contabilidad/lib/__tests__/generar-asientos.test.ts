import {
  construirLineasDebitoCompra,
  distribuirMontoConResiduo,
  generarAsientosCompra,
  generarAsientosGasto,
  generarAsientosVenta,
  type LineaAsiento,
} from '../generar-asientos'

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

describe('distribuirMontoConResiduo', () => {
  it('repro exacto del bug: totalUsd=50, tasa=37.123, pagos=[5,45] -> las 2 partes suman EXACTO el total redondeado (1856.15), no 1856.14', () => {
    const totalUsd = 50
    const tasa = 37.123
    const montoTotal = Number((totalUsd * tasa).toFixed(2))
    expect(montoTotal).toBe(1856.15)

    const partes = distribuirMontoConResiduo(montoTotal, [5, 45], tasa, 'BS')

    const suma = partes.reduce((acc, v) => acc + v, 0)
    expect(suma).toBe(1856.15)
    // Redondeando cada parte por separado (comportamiento previo, bugueado)
    // 5*37.123=185.615->185.62(o .61 según redondeo bancario) y 45*37.123=1670.535->1670.53/1670.54
    // cualquiera sea el redondeo independiente, la suma derivada DEBE calzar exacto:
    expect(partes).toHaveLength(2)
  })

  it('una sola parte: retorna el total tal cual, sin redondeo adicional', () => {
    const montoTotal = 116
    const partes = distribuirMontoConResiduo(montoTotal, [116], 1, 'BS')
    expect(partes).toEqual([116])
  })

  it('cero partes: retorna array vacio', () => {
    const partes = distribuirMontoConResiduo(0, [], 1, 'BS')
    expect(partes).toEqual([])
  })

  it('N partes (3): las primeras N-1 se redondean normal, la ultima absorbe el residuo, suma exacta', () => {
    const totalUsd = 100
    const tasa = 33.333
    const montoTotal = Number((totalUsd * tasa).toFixed(2))

    const partes = distribuirMontoConResiduo(montoTotal, [10, 30, 60], tasa, 'BS')
    const suma = partes.reduce((acc, v) => acc + v, 0)

    expect(partes).toHaveLength(3)
    expect(suma).toBe(montoTotal)
  })

  it('conversion USD (monedaContable=USD): montoContable es identidad, sigue calzando exacto', () => {
    const montoTotal = 50
    const partes = distribuirMontoConResiduo(montoTotal, [5, 45], 1, 'USD')
    expect(partes).toEqual([5, 45])
    expect(partes.reduce((acc, v) => acc + v, 0)).toBe(50)
  })

  it('caso residuo de centavo forzado: partes que individualmente redondean hacia el mismo lado igual calzan', () => {
    // 3 partes que fuerzan redondeo hacia arriba en cada una si se hiciera independiente
    const totalUsd = 0.03
    const tasa = 1
    const montoTotal = Number((totalUsd * tasa).toFixed(2)) // 0.03
    const partes = distribuirMontoConResiduo(montoTotal, [0.011, 0.011, 0.008], tasa, 'BS')
    const suma = partes.reduce((acc, v) => acc + v, 0)
    expect(Number(suma.toFixed(2))).toBe(0.03)
  })
})

describe('generarAsientosCompra multi-pago: regresion de drift de redondeo', () => {
  function fakeTx(): { execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>; inserted: LineaAsiento[] } {
    const inserted: LineaAsiento[] = []
    return {
      inserted,
      execute: async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: { item: () => ({ cnt: 0 }), length: 1 } }
        }
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

  it('repro: totalUsd=50, tasa=37.123, 2 pagos ($5 y $45) sin CxP -> no lanza partida doble, balancea exacto', async () => {
    const tx = fakeTx()
    const cuentas = { INVENTARIO: 'cta-inventario', BANCO_DEFAULT: 'cta-banco', CAJA_EFECTIVO: 'cta-caja' }

    await expect(
      generarAsientosCompra(tx, {
        empresaId: 'e1',
        compraId: 'c-drift',
        nroFactura: 'F-DRIFT-PAGO',
        totalUsd: 50,
        baseInventarioUsd: 50,
        ivaUsd: 0,
        esContado: false,
        banco_empresa_id: null,
        pagos: [
          { monto_usd: 5, banco_empresa_id: null },
          { monto_usd: 45, banco_empresa_id: null },
        ],
        cuentas,
        usuarioId: 'u1',
        monedaContable: 'BS',
        tasa: 37.123,
      })
    ).resolves.not.toThrow()

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 1856.15, detalle: 'Compra mercancia F-DRIFT-PAGO' },
      { cuenta_contable_id: 'cta-caja', monto: -185.61, detalle: 'Pago compra F-DRIFT-PAGO' },
      { cuenta_contable_id: 'cta-caja', monto: -1670.54, detalle: 'Pago compra F-DRIFT-PAGO' },
    ])

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBe(0)
  })

  it('multi-pago con residuo a CxP: 3 pagos + restante a credito, todo balancea exacto', async () => {
    const tx = fakeTx()
    const cuentas = { INVENTARIO: 'cta-inventario', BANCO_DEFAULT: 'cta-banco', CAJA_EFECTIVO: 'cta-caja', CXP_PROVEEDORES: 'cta-cxp' }

    await generarAsientosCompra(tx, {
      empresaId: 'e1',
      compraId: 'c-residuo',
      nroFactura: 'F-RESIDUO',
      totalUsd: 100,
      baseInventarioUsd: 100,
      ivaUsd: 0,
      esContado: false,
      banco_empresa_id: null,
      pagos: [
        { monto_usd: 10, banco_empresa_id: null },
        { monto_usd: 20, banco_empresa_id: null },
        { monto_usd: 30, banco_empresa_id: null },
      ],
      cuentas,
      usuarioId: 'u1',
      monedaContable: 'BS',
      tasa: 33.333,
    })

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-inventario', monto: 3333.3, detalle: 'Compra mercancia F-RESIDUO' },
      { cuenta_contable_id: 'cta-caja', monto: -333.33, detalle: 'Pago compra F-RESIDUO' },
      { cuenta_contable_id: 'cta-caja', monto: -666.66, detalle: 'Pago compra F-RESIDUO' },
      { cuenta_contable_id: 'cta-caja', monto: -999.99, detalle: 'Pago compra F-RESIDUO' },
      { cuenta_contable_id: 'cta-cxp', monto: -1333.32, detalle: 'Credito compra F-RESIDUO' },
    ])

    // Ruido de punto flotante en la ultima cifra decimal (~1e-13), no drift
    // de redondeo real — mismo criterio que el test de empaque/flete de
    // construirLineasDebitoCompra (toBeCloseTo, no toBe exacto).
    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBeCloseTo(0, 8)
  })
})

describe('generarAsientosGasto multi-pago: regresion de drift de redondeo', () => {
  function fakeTx(): { execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>; inserted: LineaAsiento[] } {
    const inserted: LineaAsiento[] = []
    return {
      inserted,
      execute: async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: { item: () => ({ cnt: 0 }), length: 1 } }
        }
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

  it('gasto totalmente pagado con 2 pagos y tasa que fuerza drift de redondeo: balancea exacto', async () => {
    const tx = fakeTx()
    const cuentas = { GASTO_GENERICO: 'cta-gasto', BANCO_DEFAULT: 'cta-banco', CAJA_EFECTIVO: 'cta-caja' }

    await expect(
      generarAsientosGasto(tx, {
        empresaId: 'e1',
        gastoId: 'g-drift',
        nroGasto: 'G-DRIFT',
        cuentaGastoId: cuentas['GASTO_GENERICO'],
        monto_usd: 50,
        pagos: [
          { monto_usd: 5, banco_empresa_id: null },
          { monto_usd: 45, banco_empresa_id: null },
        ],
        cuentas,
        usuarioId: 'u1',
        monedaContable: 'BS',
        tasa: 37.123,
        saldoPendienteProveedorUsd: 0,
      })
    ).resolves.not.toThrow()

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-gasto', monto: 1856.15, detalle: 'Gasto G-DRIFT' },
      { cuenta_contable_id: 'cta-caja', monto: -185.61, detalle: 'Pago gasto G-DRIFT' },
      { cuenta_contable_id: 'cta-caja', monto: -1670.54, detalle: 'Pago gasto G-DRIFT' },
    ])

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBe(0)
  })
})

describe('generarAsientosVenta: regresion de drift de redondeo (multi-pago y split productos/servicios)', () => {
  function fakeTx(): { execute: (sql: string, params?: unknown[]) => Promise<{ rows?: { item: (i: number) => unknown; length: number } }>; inserted: LineaAsiento[] } {
    const inserted: LineaAsiento[] = []
    return {
      inserted,
      execute: async (sql: string, params?: unknown[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: { item: () => ({ cnt: 0 }), length: 1 } }
        }
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

  it('venta con 2 pagos de contado + productos/servicios split, tasa que fuerza drift: balancea exacto', async () => {
    const tx = fakeTx()
    const cuentas = {
      CAJA_EFECTIVO: 'cta-caja',
      BANCO_DEFAULT: 'cta-banco',
      CXC_CLIENTES: 'cta-cxc',
      INGRESO_VENTA_PRODUCTO: 'cta-ingreso-prod',
      INGRESO_VENTA_SERVICIO: 'cta-ingreso-serv',
    }

    await expect(
      generarAsientosVenta(tx, {
        empresaId: 'e1',
        ventaId: 'v-drift',
        nroFactura: 'V-DRIFT',
        pagosContado: [
          { monto_usd: 5, banco_empresa_id: null },
          { monto_usd: 45, banco_empresa_id: null },
        ],
        montoCredito: 0,
        montoProductos: 30,
        montoServicios: 20,
        cuentas,
        usuarioId: 'u1',
        monedaContable: 'BS',
        tasa: 37.123,
      })
    ).resolves.not.toThrow()

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-caja', monto: 185.61, detalle: 'Cobro venta V-DRIFT' },
      { cuenta_contable_id: 'cta-caja', monto: 1670.54, detalle: 'Cobro venta V-DRIFT' },
      { cuenta_contable_id: 'cta-ingreso-prod', monto: -1113.69, detalle: 'Ingreso productos V-DRIFT' },
      { cuenta_contable_id: 'cta-ingreso-serv', monto: -742.46, detalle: 'Ingreso servicios V-DRIFT' },
    ])

    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBe(0)
  })

  it('venta con credito parcial: pagos de contado + CxC, balancea exacto', async () => {
    const tx = fakeTx()
    const cuentas = {
      CAJA_EFECTIVO: 'cta-caja',
      BANCO_DEFAULT: 'cta-banco',
      CXC_CLIENTES: 'cta-cxc',
      INGRESO_VENTA_PRODUCTO: 'cta-ingreso-prod',
      INGRESO_VENTA_SERVICIO: 'cta-ingreso-serv',
    }

    await generarAsientosVenta(tx, {
      empresaId: 'e1',
      ventaId: 'v-credito',
      nroFactura: 'V-CREDITO',
      pagosContado: [
        { monto_usd: 10, banco_empresa_id: null },
        { monto_usd: 20, banco_empresa_id: null },
      ],
      montoCredito: 20,
      montoProductos: 33.333,
      montoServicios: 16.667,
      cuentas,
      usuarioId: 'u1',
      monedaContable: 'BS',
      tasa: 33.333,
    })

    expect(tx.inserted).toEqual([
      { cuenta_contable_id: 'cta-caja', monto: 333.33, detalle: 'Cobro venta V-CREDITO' },
      { cuenta_contable_id: 'cta-caja', monto: 666.66, detalle: 'Cobro venta V-CREDITO' },
      { cuenta_contable_id: 'cta-cxc', monto: 666.66, detalle: 'Credito venta V-CREDITO' },
      { cuenta_contable_id: 'cta-ingreso-prod', monto: -1111.09, detalle: 'Ingreso productos V-CREDITO' },
      { cuenta_contable_id: 'cta-ingreso-serv', monto: -555.56, detalle: 'Ingreso servicios V-CREDITO' },
    ])

    // Ruido de punto flotante en la ultima cifra decimal (~1e-13), no drift
    // de redondeo real — ver nota arriba.
    const suma = tx.inserted.reduce((acc, l) => acc + l.monto, 0)
    expect(suma).toBeCloseTo(0, 8)
  })
})
