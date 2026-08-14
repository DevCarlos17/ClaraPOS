import autoTable from 'jspdf-autotable'
import {
  buildReciboData,
  buildReciboTextoPlano,
  buildReciboImagenBlob,
  buildReciboPdfBlob,
  descargarReciboPdf,
  compartirReciboImagen,
  nombreArchivoRecibo,
  RECIBO_ANCHO_CHARS,
  generarSeparador,
  medirAnchoPngDesdeSeparador,
  construirFilasTotales,
  type BuildReciboDataInput,
  type ReciboData,
  type ReciboTotales,
} from '../factura-export'
import type { ReciboPagoInput } from '../recibo-pagos'

// Envuelve la implementacion REAL de jspdf-autotable con un spy: preserva el
// renderizado real (los tests de PDF existentes siguen generando un Blob valido)
// mientras permite inspeccionar los argumentos (`body`) de cada llamada — usado
// por el test de paridad PDF vs texto mas abajo.
vi.mock('jspdf-autotable', async (importOriginal) => {
  const actual = await importOriginal<{ default: (doc: unknown, opts: unknown) => void }>()
  return { ...actual, default: vi.fn(actual.default) }
})

function baseInput(overrides: Partial<BuildReciboDataInput> = {}): BuildReciboDataInput {
  return {
    nroFactura: 'FAC-000123',
    fecha: '2026-08-13T10:30:00.000-04:00',
    emisor: { nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: 'Av. Principal, Caracas' },
    cliente: { nombre: 'Maria Perez', identificacion: 'V-12345678', direccion: 'Calle 5, Valencia' },
    lineas: [],
    tasa: '40.5000',
    igtfUsd: null,
    pagos: [],
    discrepancy: null,
    saldoPendUsd: 0,
    ...overrides,
  }
}

describe('RECIBO_ANCHO_CHARS y generarSeparador', () => {
  it('RECIBO_ANCHO_CHARS es 32 (58mm termico, fuente ESC/POS Font A)', () => {
    expect(RECIBO_ANCHO_CHARS).toBe(32)
  })

  it('generarSeparador() sin argumentos retorna exactamente 32 guiones', () => {
    const separador = generarSeparador()

    expect(separador).toBe('-'.repeat(32))
    expect(separador.length).toBe(RECIBO_ANCHO_CHARS)
  })

  it('generarSeparador(10) retorna exactamente 10 guiones', () => {
    expect(generarSeparador(10)).toBe('----------')
  })
})

describe('medirAnchoPngDesdeSeparador', () => {
  /** Mock deterministico: 10px por caracter, igual convencion que recibo-pagos.test.ts. */
  function mockCtx(): CanvasRenderingContext2D {
    return {
      measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D
  }

  it('mide el ancho del separador canonico de 32 caracteres + padding a cada lado', () => {
    const separador = generarSeparador()

    expect(medirAnchoPngDesdeSeparador(mockCtx(), separador, 24)).toBe(32 * 10 + 24 * 2)
  })

  it('con un separador mas corto, el ancho medido es proporcionalmente menor', () => {
    const separador = generarSeparador(10)

    expect(medirAnchoPngDesdeSeparador(mockCtx(), separador, 24)).toBe(10 * 10 + 24 * 2)
  })
})

describe('buildReciboData', () => {
  it('single alicuota: una linea Gravable al 16% calcula base, iva y total general', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '2',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
      })
    )

    expect(recibo.totales.baseImponibleUsd).toBe(20)
    expect(recibo.totales.montoExentoUsd).toBe(0)
    expect(recibo.totales.alicuotas).toEqual([{ pct: 16, baseUsd: 20, ivaUsd: 3.2 }])
    expect(recibo.totales.totalGeneralUsd).toBe(23.2)
    expect(recibo.totales.totalGeneralBs).toBeCloseTo(23.2 * 40.5, 5)
  })

  it('mixed alicuotas: lineas al 16% y al 8% generan dos buckets separados', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Vitamina C',
            cantidad: '1',
            precioUnitarioUsd: '50.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
        ],
      })
    )

    expect(recibo.totales.baseImponibleUsd).toBe(150)
    expect(recibo.totales.alicuotas).toEqual([
      { pct: 8, baseUsd: 50, ivaUsd: 4 },
      { pct: 16, baseUsd: 100, ivaUsd: 16 },
    ])
    expect(recibo.totales.totalGeneralUsd).toBe(170)
  })

  it('fully exento/exonerado: ambos tipos van al bucket montoExentoUsd, sin alicuotas', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-003',
            nombre: 'Servicio Medico',
            cantidad: '1',
            precioUnitarioUsd: '30.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
          {
            codigo: 'PROD-004',
            nombre: 'Consulta Exonerada',
            cantidad: '1',
            precioUnitarioUsd: '20.00',
            tipoImpuesto: 'Exonerado',
            impuestoPct: '0',
          },
        ],
      })
    )

    expect(recibo.totales.montoExentoUsd).toBe(50)
    expect(recibo.totales.baseImponibleUsd).toBe(0)
    expect(recibo.totales.alicuotas).toEqual([])
    expect(recibo.totales.totalGeneralUsd).toBe(50)
    expect(recibo.lineas.every((l) => l.esExento)).toBe(true)
  })

  it('igtf presente: se suma al total general y queda expuesto en totales.igtfUsd', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: 3.48,
      })
    )

    expect(recibo.totales.igtfUsd).toBe(3.48)
    expect(recibo.totales.totalGeneralUsd).toBe(119.48)
  })

  it('igtf ausente: totales.igtfUsd es null y no se suma nada al total general', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: null,
      })
    )

    expect(recibo.totales.igtfUsd).toBeNull()
    expect(recibo.totales.totalGeneralUsd).toBe(116)
  })

  it('propaga nroFactura, fecha, emisor y cliente sin transformarlos', () => {
    const recibo = buildReciboData(baseInput())

    expect(recibo.nroFactura).toBe('FAC-000123')
    expect(recibo.fecha).toBe('2026-08-13T10:30:00.000-04:00')
    expect(recibo.emisor).toEqual({
      nombre: 'ClaraPOS Estetica C.A.',
      rif: 'J-12345678-9',
      direccion: 'Av. Principal, Caracas',
    })
    expect(recibo.cliente).toEqual({
      nombre: 'Maria Perez',
      identificacion: 'V-12345678',
      direccion: 'Calle 5, Valencia',
    })
  })

  it('agrupa los pagos por metodo usando agruparPagosPorMetodo', () => {
    const pagos: ReciboPagoInput[] = [
      { metodo_cobro_id: 'pm-1', metodo_nombre: 'Pago Movil Mercantil', moneda: 'BS', monto: 100 },
      { metodo_cobro_id: 'pm-1', metodo_nombre: 'Pago Movil Mercantil', moneda: 'BS', monto: 100 },
      { metodo_cobro_id: 'ef-usd', metodo_nombre: 'Efectivo Dolares', moneda: 'USD', monto: 1 },
    ]
    const recibo = buildReciboData(baseInput({ tasa: '500', pagos }))

    expect(recibo.pagos).toHaveLength(2)
    const pagoMovil = recibo.pagos.find((p) => p.metodoCobroId === 'pm-1')
    expect(pagoMovil?.montoBs).toBe(200)
    const efectivo = recibo.pagos.find((p) => p.metodoCobroId === 'ef-usd')
    expect(efectivo?.montoUsd).toBe(1)
    expect(efectivo?.montoBs).toBe(500)
  })

  it('sin discrepancia ni saldo pendiente, cierre es null', () => {
    const recibo = buildReciboData(baseInput())
    expect(recibo.cierre).toBeNull()
  })

  it('con saldo_pend_usd > 0, cierre es CREDITO calculado con la tasa', () => {
    const recibo = buildReciboData(baseInput({ tasa: '100', saldoPendUsd: 5 }))
    expect(recibo.cierre).toEqual({ tipo: 'CREDITO', montoUsd: 5, montoBs: 500 })
  })

  it('con discrepancy VUELTO, cierre refleja el modo y montos de la discrepancia', () => {
    const recibo = buildReciboData(
      baseInput({
        discrepancy: { mode: 'VUELTO', montoUsd: 2, montoBs: 100 },
      })
    )
    expect(recibo.cierre).toEqual({ tipo: 'VUELTO', montoUsd: 2, montoBs: 100 })
  })
})

describe('buildReciboData — totalFacturaUsd/totalFacturaBs (subtotal pre-IGTF)', () => {
  function reciboConIgtf() {
    return buildReciboData(
      baseInput({
        tasa: '10',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Exento',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Gravable 8%',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
          {
            codigo: 'PROD-003',
            nombre: 'Gravable 16%',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: 0.06,
      })
    )
  }

  it('totalFacturaUsd = exento + base imponible + iva total, excluye IGTF', () => {
    const recibo = reciboConIgtf()
    // Exento $1 + Base $2 (dos lineas gravables) + IVA8% $0.08 + IVA16% $0.16 = $3.24
    expect(recibo.totales.totalFacturaUsd).toBe(3.24)
  })

  it('con IGTF, totalGeneralUsd = totalFacturaUsd + igtf, pero totalFacturaUsd no cambia', () => {
    const recibo = reciboConIgtf()
    expect(recibo.totales.totalGeneralUsd).toBe(3.3)
    expect(recibo.totales.totalFacturaUsd).toBe(3.24)
  })

  it('totalFacturaBs = totalFacturaUsd convertido a la tasa de la venta', () => {
    const recibo = reciboConIgtf()
    expect(recibo.totales.totalFacturaBs).toBe(32.4)
  })

  it('sin IGTF, totalFacturaUsd coincide con totalGeneralUsd (no hay IGTF que restar)', () => {
    const recibo = buildReciboData(
      baseInput({
        tasa: '10',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Gravable 16%',
            cantidad: '1',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: null,
      })
    )
    expect(recibo.totales.totalFacturaUsd).toBe(recibo.totales.totalGeneralUsd)
    expect(recibo.totales.totalFacturaUsd).toBe(11.6)
  })
})

describe('construirFilasTotales', () => {
  function totalesFixture(overrides: Partial<ReciboTotales> = {}): ReciboTotales {
    return {
      montoExentoUsd: 1,
      baseImponibleUsd: 3,
      alicuotas: [
        { pct: 8, baseUsd: 1, ivaUsd: 0.08 },
        { pct: 16, baseUsd: 2, ivaUsd: 0.16 },
      ],
      igtfUsd: 0.06,
      totalFacturaUsd: 4.24,
      totalFacturaBs: 4.24,
      totalGeneralUsd: 4.3,
      totalGeneralBs: 4.3,
      ...overrides,
    }
  }

  it('con IGTF > 0: orden Exento -> Base -> alicuotas -> TOTAL FACTURA (subtotal) -> IGTF -> TOTAL + IGTF (bold, final)', () => {
    const filas = construirFilasTotales(totalesFixture())

    expect(filas.map((f) => f.label)).toEqual([
      'Monto Exento',
      'Base Imponible',
      'IVA 8%',
      'IVA 16%',
      'TOTAL FACTURA',
      'IGTF',
      'TOTAL + IGTF',
    ])
    expect(filas[4]).toEqual({ label: 'TOTAL FACTURA', usd: '$4.24', bold: false })
    expect(filas[5]).toEqual({ label: 'IGTF', usd: '$0.06', bold: false })
    expect(filas[6]).toEqual({ label: 'TOTAL + IGTF', usd: '$4.30', bs: 'Bs. 4,30', bold: true })
  })

  it('sin IGTF (null): TOTAL FACTURA es la fila final, bold, bimonetaria, sin fila de IGTF ni sufijo "+ IGTF"', () => {
    const filas = construirFilasTotales(totalesFixture({ igtfUsd: null }))

    expect(filas.map((f) => f.label)).not.toContain('IGTF')
    expect(filas.map((f) => f.label)).not.toContain('TOTAL + IGTF')
    expect(filas.at(-1)).toEqual({ label: 'TOTAL FACTURA', usd: '$4.24', bs: 'Bs. 4,24', bold: true })
  })

  it('sin IGTF (0): mismo comportamiento que null — sin fila de IGTF', () => {
    const filas = construirFilasTotales(totalesFixture({ igtfUsd: 0 }))

    expect(filas.map((f) => f.label)).not.toContain('IGTF')
    expect(filas.at(-1)?.bold).toBe(true)
  })

  it('sin monto exento ni base imponible: omite esas filas (no aparecen en 0)', () => {
    const filas = construirFilasTotales(totalesFixture({ montoExentoUsd: 0, baseImponibleUsd: 0, alicuotas: [] }))

    expect(filas.map((f) => f.label)).toEqual(['TOTAL FACTURA', 'IGTF', 'TOTAL + IGTF'])
  })
})

describe('paridad: PDF vs texto en orden de totales', () => {
  it('el body de la tabla de totales del PDF coincide exactamente con construirFilasTotales del mismo recibo', () => {
    const mockedAutoTable = vi.mocked(autoTable)
    mockedAutoTable.mockClear()

    const recibo = buildReciboData(
      baseInput({
        tasa: '10',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Exento',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Gravable 8%',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
          {
            codigo: 'PROD-003',
            nombre: 'Gravable 16%',
            cantidad: '1',
            precioUnitarioUsd: '1.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: 0.06,
      })
    )

    buildReciboPdfBlob(recibo)

    // 1ra llamada a autoTable: tabla de articulos. 2da llamada: tabla de totales
    // (orden fijo dentro de buildReciboPdfBlob).
    const totalesCall = mockedAutoTable.mock.calls[1]
    const totalesBody = (totalesCall[1] as { body: string[][] }).body

    const filasEsperadas = construirFilasTotales(recibo.totales).map((f) => [
      f.label,
      f.bs ? `${f.usd} / ${f.bs}` : f.usd,
    ])

    expect(totalesBody).toEqual(filasEsperadas)

    const texto = buildReciboTextoPlano(recibo)
    for (const fila of construirFilasTotales(recibo.totales)) {
      const lineaEsperada = fila.bs ? `${fila.label}: ${fila.usd} / ${fila.bs}` : `${fila.label}: ${fila.usd}`
      expect(texto).toContain(lineaEsperada)
    }
  })
})

describe('formatearCierre — SAF con referencia de factura(s) (B5)', () => {
  function reciboConDiscrepancy(discrepancy: BuildReciboDataInput['discrepancy']): ReciboData {
    return buildReciboData(
      baseInput({
        tasa: '500',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        discrepancy,
      })
    )
  }

  it('1 factura: la linea de cierre muestra "Abono aplicado a factura(s) {nro} por Bs X ($Y)"', () => {
    const texto = buildReciboTextoPlano(
      reciboConDiscrepancy({
        mode: 'SAF',
        montoUsd: 1,
        montoBs: 500,
        invoiceAssignments: [{ nroFactura: '1234', montoUsd: 1 }],
      })
    )

    expect(texto).toContain('Abono aplicado a factura(s) 1234 por Bs 500 ($1)')
  })

  it('2 facturas (FIFO): la linea de cierre lista ambas con su monto aplicado', () => {
    const texto = buildReciboTextoPlano(
      reciboConDiscrepancy({
        mode: 'SAF',
        montoUsd: 1,
        montoBs: 500,
        invoiceAssignments: [
          { nroFactura: '1234', montoUsd: 0.6 },
          { nroFactura: '1235', montoUsd: 0.4 },
        ],
      })
    )

    expect(texto).toContain('Abono aplicado a factura(s) 1234 por Bs 300 ($0.6), 1235 por Bs 200 ($0.4)')
  })

  it('SAF sin invoiceAssignments (saldo a favor puro): conserva el texto actual', () => {
    const texto = buildReciboTextoPlano(reciboConDiscrepancy({ mode: 'SAF', montoUsd: 1, montoBs: 500 }))

    expect(texto).toContain('Saldo a favor del cliente: Bs. 500,00 ($1.00)')
    expect(texto).not.toContain('Abono aplicado a factura')
  })

  it('VUELTO no cambia su texto/comportamiento (invoiceAssignments no aplica a este modo)', () => {
    const texto = buildReciboTextoPlano(reciboConDiscrepancy({ mode: 'VUELTO', montoUsd: 1, montoBs: 500 }))

    expect(texto).toContain('Vuelto entregado: Bs. 500,00 ($1.00)')
  })

  it('PROPINA no cambia su texto/comportamiento', () => {
    const texto = buildReciboTextoPlano(reciboConDiscrepancy({ mode: 'PROPINA', montoUsd: 1, montoBs: 500 }))

    expect(texto).toContain('Propina: Bs. 500,00 ($1.00)')
  })

  it('DIFERENCIAL_SOBRANTE no cambia su texto/comportamiento', () => {
    const texto = buildReciboTextoPlano(
      reciboConDiscrepancy({ mode: 'DIFERENCIAL_SOBRANTE', montoUsd: 1, montoBs: 500 })
    )

    expect(texto).toContain('Diferencial cambiario (sobrante): Bs. 500,00 ($1.00)')
  })
})

describe('buildReciboTextoPlano', () => {
  function reciboConLineas(): ReciboData {
    return buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Vitamina C',
            cantidad: '1',
            precioUnitarioUsd: '50.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
          {
            codigo: 'PROD-003',
            nombre: 'Servicio Medico',
            cantidad: '1',
            precioUnitarioUsd: '30.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
        ],
        igtfUsd: 5.4,
      })
    )
  }

  it('usa la palabra RECIBO y nunca la palabra Factura', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('RECIBO')
    expect(texto).not.toContain('Factura')
  })

  it('marca las lineas exentas con (E)', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('Servicio Medico (E)')
  })

  it('incluye una linea por cada alicuota agrupada', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('IVA 16%')
    expect(texto).toContain('IVA 8%')
  })

  it('incluye la linea de IGTF solo cuando igtfUsd no es null', () => {
    const conIgtf = buildReciboTextoPlano(reciboConLineas())
    expect(conIgtf).toContain('IGTF')

    const sinIgtf = buildReciboTextoPlano(
      buildReciboData(
        baseInput({
          lineas: [
            {
              codigo: 'PROD-001',
              nombre: 'Crema Facial',
              cantidad: '1',
              precioUnitarioUsd: '100.00',
              tipoImpuesto: 'Gravable',
              impuestoPct: '16',
            },
          ],
          igtfUsd: null,
        })
      )
    )
    expect(sinIgtf).not.toContain('IGTF')
  })

  it('el emisor aparece antes que el numero/fecha de recibo (orden de secciones)', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    const idxEmisor = texto.indexOf('ClaraPOS Estetica C.A.')
    const idxNroFecha = texto.indexOf('RECIBO\nNro:')
    expect(idxEmisor).toBeGreaterThanOrEqual(0)
    expect(idxNroFecha).toBeGreaterThan(idxEmisor)
  })

  it('sin pagos, no incluye la seccion Metodos de pago', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())
    expect(texto).not.toContain('Metodos de pago')
  })

  it('con pagos agrupados, incluye la seccion Metodos de pago con cada linea', () => {
    const recibo = buildReciboData(
      baseInput({
        tasa: '40.5000',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        pagos: [
          { metodo_cobro_id: 'pv-1', metodo_nombre: 'Punto de Venta Banesco', moneda: 'BS', monto: 300 },
        ],
      })
    )
    const texto = buildReciboTextoPlano(recibo)

    expect(texto).toContain('Metodos de pago')
    expect(texto).toContain('Punto de Venta Banesco')
    expect(texto).toContain('Bs. 300,00')
  })

  it('sin cierre (sin discrepancia ni credito), no incluye linea de credito/vuelto', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())
    expect(texto).not.toContain('Quedo a credito')
  })

  it('con saldo a credito, la ultima linea muestra "Quedo a credito"', () => {
    const recibo = buildReciboData(
      baseInput({
        tasa: '100',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        saldoPendUsd: 10,
      })
    )
    const texto = buildReciboTextoPlano(recibo)
    const lineas = texto.split('\n').filter((l) => l.trim() !== '')

    expect(lineas[lineas.length - 1]).toContain('Quedo a credito')
    expect(lineas[lineas.length - 1]).toContain('Bs. 1.000,00')
    expect(lineas[lineas.length - 1]).toContain('$10.00')
  })
})

describe('contrato v1: recibo sin descuento comercial (decision #1470)', () => {
  it('totalGeneralUsd = exento + base imponible + suma(iva) + igtf, sin restar ningun descuento', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '2',
            precioUnitarioUsd: '25.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Consulta',
            cantidad: '1',
            precioUnitarioUsd: '15.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
        ],
        igtfUsd: 2.5,
      })
    )

    const sumaComponentes =
      recibo.totales.montoExentoUsd +
      recibo.totales.baseImponibleUsd +
      recibo.totales.alicuotas.reduce((sum, a) => sum + a.ivaUsd, 0) +
      (recibo.totales.igtfUsd ?? 0)

    expect(recibo.totales.totalGeneralUsd).toBeCloseTo(sumaComponentes, 8)
    // Los descuentos comerciales estan pausados (decision #1470): el contrato de
    // ReciboTotales no expone ningun campo de descuento, por lo que no existe
    // forma de que un descuento reduzca el total del recibo.
    expect('descuento' in recibo.totales).toBe(false)
    expect('descuentoUsd' in recibo.totales).toBe(false)
  })
})

function reciboMinimo(): ReciboData {
  return buildReciboData(
    baseInput({
      lineas: [
        {
          codigo: 'PROD-001',
          nombre: 'Crema Facial',
          cantidad: '1',
          precioUnitarioUsd: '10.00',
          tipoImpuesto: 'Gravable',
          impuestoPct: '16',
        },
      ],
    })
  )
}

describe('nombreArchivoRecibo', () => {
  function reciboCon(nroFactura: string, clienteNombre: string): ReciboData {
    return buildReciboData(
      baseInput({
        nroFactura,
        cliente: { nombre: clienteNombre, identificacion: 'V-1', direccion: null },
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
      })
    )
  }

  it('nombre normal: mayusculas, espacios a guiones, extension correcta', () => {
    const recibo = reciboCon('C01-000276', 'Francisco Palmar')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000276_FRANCISCO-PALMAR.pdf')
    expect(nombreArchivoRecibo(recibo, 'png')).toBe('RECIBO_C01-000276_FRANCISCO-PALMAR.png')
  })

  it('nombre con acentos y ene: normaliza sin diacriticos', () => {
    const recibo = reciboCon('C01-000300', 'José Ñoño')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000300_JOSE-NONO.pdf')
  })

  it('nombre con caracteres invalidos para sistema de archivos: los elimina', () => {
    const recibo = reciboCon('C01-000400', 'A/B:C')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000400_ABC.pdf')
  })

  it('nombre vacio o solo espacios: cae a solo el nro, sin segmento de cliente ni guion bajo colgante', () => {
    const recibo = reciboCon('C01-000500', '   ')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000500.pdf')
  })
})

describe('descargarReciboPdf', () => {
  it('genera el PDF y dispara la descarga via blob + anchor con el nombre de archivo sanitizado', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-pdf')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const recibo = reciboMinimo()
    descargarReciboPdf(recibo)

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(createObjectURLSpy.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-pdf')

    clickSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})

describe('buildReciboImagenBlob', () => {
  it('cuando el entorno no soporta contexto 2D de canvas, rechaza con un error claro en vez de crashear', async () => {
    // happy-dom (entorno de test) no implementa render 2D real: HTMLCanvasElement.getContext()
    // siempre retorna null. Este test documenta la ruta de degradacion elegante ante esa
    // limitacion (o ante un fallo real de contexto 2D en un dispositivo de baja memoria).
    await expect(buildReciboImagenBlob(reciboMinimo())).rejects.toThrow(/contexto 2D/i)
  })
})

describe('compartirReciboImagen', () => {
  const fakePngBlob = async (): Promise<Blob> => new Blob(['fake-png-bytes'], { type: 'image/png' })

  it('cuando navigator.share no existe, rechaza con un error claro (el boton Compartir debe estar oculto en la UI)', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })

    await expect(compartirReciboImagen(reciboMinimo())).rejects.toThrow(/no esta disponible/i)

    vi.unstubAllGlobals()
  })

  it('cuando navigator.canShare({files}) es true, comparte la imagen PNG como archivo', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: canShareMock })

    const recibo = reciboMinimo()
    await compartirReciboImagen(recibo, fakePngBlob)

    expect(canShareMock).toHaveBeenCalledTimes(1)
    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; title?: string; text?: string }
    expect(payload.files).toHaveLength(1)
    expect(payload.files?.[0]).toBeInstanceOf(File)
    expect(payload.files?.[0].name).toBe(nombreArchivoRecibo(recibo, 'png'))
    expect(payload.title).toContain(recibo.nroFactura)
    expect(payload.text).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('cuando navigator.canShare({files}) es false, cae a compartir texto plano', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(false)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: canShareMock })

    await compartirReciboImagen(reciboMinimo(), fakePngBlob)

    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; text?: string }
    expect(payload.files).toBeUndefined()
    expect(payload.text).toContain('RECIBO')

    vi.unstubAllGlobals()
  })

  it('cuando la generacion de la imagen falla (ej. canvas no soportado), cae a compartir texto plano', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await compartirReciboImagen(reciboMinimo(), async () => {
      throw new Error('canvas no soportado')
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; text?: string }
    expect(payload.files).toBeUndefined()
    expect(payload.text).toContain('RECIBO')

    vi.unstubAllGlobals()
  })

  it('cuando navigator.share rechaza con AbortError, la promesa se resuelve sin lanzar', async () => {
    const shareMock = vi.fn().mockRejectedValue(new DOMException('AbortError', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await expect(compartirReciboImagen(reciboMinimo(), fakePngBlob)).resolves.toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('cuando navigator.share rechaza con un error generico, la promesa se rechaza', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('permission denied'))
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await expect(compartirReciboImagen(reciboMinimo(), fakePngBlob)).rejects.toThrow('permission denied')

    vi.unstubAllGlobals()
  })
})
