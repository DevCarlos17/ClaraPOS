import {
  agruparPagosPorMetodo,
  construirCierreRecibo,
  reconciliarTotalBs,
  wrapCanvasText,
  type ReciboCierreTipo,
  type ReciboDiscrepancyInput,
  type ReciboPagoInput,
  type ReciboPagoLinea,
} from '../recibo-pagos'

// ─── agruparPagosPorMetodo ──────────────────────────────────────

function pago(overrides: Partial<ReciboPagoInput> = {}): ReciboPagoInput {
  return {
    metodo_cobro_id: 'metodo-1',
    metodo_nombre: 'Pago Móvil Mercantil',
    moneda: 'BS',
    monto: 100,
    ...overrides,
  }
}

describe('agruparPagosPorMetodo', () => {
  it('consolida 2 pagos del mismo método en una sola línea sumando montos', () => {
    const pagos = [
      pago({ metodo_cobro_id: 'pm-mercantil', metodo_nombre: 'Pago Móvil Mercantil', moneda: 'BS', monto: 100 }),
      pago({ metodo_cobro_id: 'pm-mercantil', metodo_nombre: 'Pago Móvil Mercantil', moneda: 'BS', monto: 100 }),
    ]

    const lineas = agruparPagosPorMetodo(pagos, 500)

    expect(lineas).toHaveLength(1)
    expect(lineas[0].metodoCobroId).toBe('pm-mercantil')
    expect(lineas[0].montoNativo).toBe(200)
    expect(lineas[0].montoBs).toBe(200)
  })

  it('método USD calcula equivalente en Bs usando monto_usd × tasa', () => {
    const pagos = [pago({ metodo_cobro_id: 'efectivo-usd', metodo_nombre: 'Efectivo Dólares', moneda: 'USD', monto: 1 })]

    const lineas = agruparPagosPorMetodo(pagos, 500)

    expect(lineas).toHaveLength(1)
    expect(lineas[0].moneda).toBe('USD')
    expect(lineas[0].montoUsd).toBe(1)
    expect(lineas[0].montoBs).toBe(500)
  })

  it('método Bs no requiere conversión: montoNativo y montoBs son iguales', () => {
    const pagos = [pago({ metodo_cobro_id: 'pdv-banesco', metodo_nombre: 'Punto de Venta Banesco', moneda: 'BS', monto: 300 })]

    const lineas = agruparPagosPorMetodo(pagos, 500)

    expect(lineas).toHaveLength(1)
    expect(lineas[0].moneda).toBe('BS')
    expect(lineas[0].montoNativo).toBe(300)
    expect(lineas[0].montoBs).toBe(300)
  })

  it('ejemplo completo: factura Bs 1000 ($2) pagada con 3 métodos reconcilia a Bs 1000', () => {
    const pagos = [
      pago({ metodo_cobro_id: 'pm-mercantil', metodo_nombre: 'Pago Móvil Mercantil', moneda: 'BS', monto: 200 }),
      pago({ metodo_cobro_id: 'efectivo-usd', metodo_nombre: 'Efectivo Dólares', moneda: 'USD', monto: 1 }),
      pago({ metodo_cobro_id: 'pdv-banesco', metodo_nombre: 'Punto de Venta Banesco', moneda: 'BS', monto: 300 }),
    ]

    const lineas = agruparPagosPorMetodo(pagos, 500)

    expect(lineas).toHaveLength(3)
    const sumaBs = lineas.reduce((acc, l) => acc + l.montoBs, 0)
    expect(sumaBs).toBe(1000)
  })
})

// ─── construirCierreRecibo ──────────────────────────────────────

function discrepancy(overrides: Partial<ReciboDiscrepancyInput> = {}): ReciboDiscrepancyInput {
  return {
    mode: 'VUELTO',
    montoUsd: 5,
    montoBs: 2500,
    ...overrides,
  }
}

interface CierreCase {
  label: string
  mode: ReciboCierreTipo
}

const CIERRE_EXCEDENTE_CASES: CierreCase[] = [
  { label: 'VUELTO', mode: 'VUELTO' },
  { label: 'SAF', mode: 'SAF' },
  { label: 'PROPINA', mode: 'PROPINA' },
  { label: 'DIFERENCIAL_SOBRANTE', mode: 'DIFERENCIAL_SOBRANTE' },
]

describe('construirCierreRecibo', () => {
  it.each(CIERRE_EXCEDENTE_CASES)('modo $label produce cierre con ese tipo y los montos del discrepancy', ({ mode }) => {
    const input = discrepancy({ mode, montoUsd: 3, montoBs: 1500 })

    const cierre = construirCierreRecibo(input, 0, 500)

    expect(cierre).not.toBeNull()
    expect(cierre?.tipo).toBe(mode)
    expect(cierre?.montoUsd).toBe(3)
    expect(cierre?.montoBs).toBe(1500)
  })

  it('sin discrepancy y con saldo pendiente a crédito: retorna cierre CREDITO con Bs = saldoPendUsd × tasa', () => {
    const cierre = construirCierreRecibo(null, 10, 40)

    expect(cierre).not.toBeNull()
    expect(cierre?.tipo).toBe('CREDITO')
    expect(cierre?.montoUsd).toBe(10)
    expect(cierre?.montoBs).toBe(400)
  })

  it('sin discrepancy y sin saldo pendiente: no hay línea de cierre', () => {
    const cierre = construirCierreRecibo(null, 0, 40)

    expect(cierre).toBeNull()
  })

  it('discrepancy con modo ABSORBER (no es tipo de cierre visible) y sin saldo pendiente: no hay línea de cierre', () => {
    const input = discrepancy({ mode: 'ABSORBER', montoUsd: 0.5, montoBs: 250 })

    const cierre = construirCierreRecibo(input, 0, 500)

    expect(cierre).toBeNull()
  })

  it('discrepancy con modo DIFERENCIAL_FALTANTE (no es tipo de cierre visible) y sin saldo pendiente: no hay línea de cierre', () => {
    const input = discrepancy({ mode: 'DIFERENCIAL_FALTANTE', montoUsd: 0.2, montoBs: 100 })

    const cierre = construirCierreRecibo(input, 0, 500)

    expect(cierre).toBeNull()
  })
})

// ─── reconciliarTotalBs ──────────────────────────────────────

function linea(overrides: Partial<ReciboPagoLinea> = {}): ReciboPagoLinea {
  return {
    metodoCobroId: 'metodo-1',
    metodoNombre: 'Pago Móvil Mercantil',
    moneda: 'BS',
    montoNativo: 500,
    montoBs: 500,
    montoUsd: 1,
    ...overrides,
  }
}

describe('reconciliarTotalBs', () => {
  it('suma exacta de líneas igual al total de factura: reconcilia sin diferencia', () => {
    const lineas = [linea({ montoBs: 600 }), linea({ montoBs: 400 })]

    const resultado = reconciliarTotalBs(lineas, 1000)

    expect(resultado.reconciliado).toBe(true)
    expect(resultado.diferenciaBs).toBe(0)
  })

  it('diferencia dentro de la tolerancia de 0.01 Bs: reconcilia', () => {
    const lineas = [linea({ montoBs: 999.99 })]

    const resultado = reconciliarTotalBs(lineas, 1000)

    expect(resultado.reconciliado).toBe(true)
    expect(resultado.diferenciaBs).toBeCloseTo(-0.01, 6)
  })

  it('diferencia fuera de la tolerancia de 0.01 Bs: no reconcilia', () => {
    const lineas = [linea({ montoBs: 999.98 })]

    const resultado = reconciliarTotalBs(lineas, 1000)

    expect(resultado.reconciliado).toBe(false)
    expect(resultado.diferenciaBs).toBeCloseTo(-0.02, 6)
  })
})

// ─── wrapCanvasText ──────────────────────────────────────

/**
 * Mock de CanvasRenderingContext2D — solo implementa measureText.
 * Ancho determinístico: 10px por carácter (evita depender de fuentes reales).
 */
function mockCtx(): CanvasRenderingContext2D {
  return {
    measureText: (text: string) => ({ width: text.length * 10 }) as TextMetrics,
  } as unknown as CanvasRenderingContext2D
}

describe('wrapCanvasText', () => {
  it('texto corto que cabe en el ancho disponible: retorna una sola línea', () => {
    const lineas = wrapCanvasText(mockCtx(), 'HOLA', 100)

    expect(lineas).toEqual(['HOLA'])
  })

  it('texto largo que excede el ancho disponible: se envuelve en múltiples líneas por palabra', () => {
    const lineas = wrapCanvasText(mockCtx(), 'AAAAA BBBBB CCCCC DDDDD', 100)

    expect(lineas).toEqual(['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD'])
  })

  it('texto vacío: retorna un arreglo vacío', () => {
    const lineas = wrapCanvasText(mockCtx(), '', 100)

    expect(lineas).toEqual([])
  })
})
