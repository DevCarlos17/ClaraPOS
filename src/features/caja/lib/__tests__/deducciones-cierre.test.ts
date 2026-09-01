import Decimal from 'decimal.js'
import {
  resolverDeduccionesCierre,
  construirNroGastoDeduccion,
  type DeduccionActivaRow,
} from '../deducciones-cierre'

function deduccion(overrides: Partial<DeduccionActivaRow> = {}): DeduccionActivaRow {
  return {
    id: 'ded-1',
    cuenta_gasto_id: 'cuenta-comision-1',
    concepto: 'Comision bancaria',
    tipo: 'COMISION',
    porcentaje: '3',
    orden: 1,
    ...overrides,
  }
}

describe('resolverDeduccionesCierre', () => {
  it('calcula N montos en moneda nativa (sin conversion USD), uno por cada deduccion activa con su propia cuenta_gasto_id', () => {
    const deducciones: DeduccionActivaRow[] = [
      deduccion({ id: 'ded-1', concepto: 'Comision bancaria', tipo: 'COMISION', porcentaje: '3', orden: 1, cuenta_gasto_id: 'cuenta-comision' }),
      deduccion({ id: 'ded-2', concepto: 'Retencion ISLR', tipo: 'ISLR', porcentaje: '2', orden: 2, cuenta_gasto_id: 'cuenta-islr' }),
    ]

    const resultado = resolverDeduccionesCierre({
      deducciones,
      montoBaseD: new Decimal(1000),
      destinoTipo: 'BANCO',
      nombreMetodo: 'Punto de venta Banesco',
    })

    expect(resultado.toPost).toHaveLength(2)
    expect(resultado.toPost[0].cuentaGastoId).toBe('cuenta-comision')
    expect(resultado.toPost[0].montoDeduccionNativo.toFixed(2)).toBe('30.00')
    expect(resultado.toPost[1].cuentaGastoId).toBe('cuenta-islr')
    expect(resultado.toPost[1].montoDeduccionNativo.toFixed(2)).toBe('20.00')
    expect(resultado.warning).toBeUndefined()
  })

  it('mantiene la moneda nativa del metodo sin aplicar tasa de cambio (base VES se queda en VES)', () => {
    // 5000 Bs base, deduccion de 4% -> 200 Bs. No debe multiplicarse ni dividirse por ninguna tasa.
    const resultado = resolverDeduccionesCierre({
      deducciones: [deduccion({ porcentaje: '4', cuenta_gasto_id: 'cuenta-x' })],
      montoBaseD: new Decimal(5000),
      destinoTipo: 'BANCO',
      nombreMetodo: 'Pago movil',
    })

    expect(resultado.toPost).toHaveLength(1)
    expect(resultado.toPost[0].montoDeduccionNativo.toFixed(2)).toBe('200.00')
  })

  it('retorna toPost vacio cuando no hay deducciones activas (sin regresion)', () => {
    const resultado = resolverDeduccionesCierre({
      deducciones: [],
      montoBaseD: new Decimal(1000),
      destinoTipo: 'BANCO',
      nombreMetodo: 'Transferencia',
    })

    expect(resultado.toPost).toEqual([])
    expect(resultado.warning).toBeUndefined()
  })

  it('omite silenciosamente una deduccion con porcentaje 0 (sin gasto, sin error)', () => {
    const resultado = resolverDeduccionesCierre({
      deducciones: [
        deduccion({ id: 'ded-zero', porcentaje: '0', cuenta_gasto_id: null }),
        deduccion({ id: 'ded-real', porcentaje: '5', cuenta_gasto_id: 'cuenta-real' }),
      ],
      montoBaseD: new Decimal(1000),
      destinoTipo: 'BANCO',
      nombreMetodo: 'Punto de venta',
    })

    expect(resultado.toPost).toHaveLength(1)
    expect(resultado.toPost[0].cuentaGastoId).toBe('cuenta-real')
    expect(resultado.toPost[0].montoDeduccionNativo.toFixed(2)).toBe('50.00')
  })

  it('lanza un error en espanol cuando una deduccion activa (>0%) no tiene cuenta_gasto_id (nunca huerfano)', () => {
    const resultado = () =>
      resolverDeduccionesCierre({
        deducciones: [deduccion({ concepto: 'Comision bancaria', porcentaje: '3', cuenta_gasto_id: null })],
        montoBaseD: new Decimal(1000),
        destinoTipo: 'BANCO',
        nombreMetodo: 'Punto de venta Banesco',
      })

    expect(resultado).toThrow(/Comision bancaria/)
    expect(resultado).toThrow(/Punto de venta Banesco/)
  })

  it('advierte y omite las deducciones cuando el metodo liquida a caja fuerte (efectivo, W5)', () => {
    const resultado = resolverDeduccionesCierre({
      deducciones: [deduccion({ porcentaje: '3', cuenta_gasto_id: 'cuenta-comision' })],
      montoBaseD: new Decimal(1000),
      destinoTipo: 'CAJA_FUERTE',
      nombreMetodo: 'Efectivo',
    })

    expect(resultado.toPost).toEqual([])
    expect(resultado.warning).toBeDefined()
    expect(resultado.warning).toMatch(/Efectivo/)
  })

  it('no advierte cuando el metodo liquida a caja fuerte pero no tiene deducciones activas', () => {
    const resultado = resolverDeduccionesCierre({
      deducciones: [],
      montoBaseD: new Decimal(1000),
      destinoTipo: 'CAJA_FUERTE',
      nombreMetodo: 'Efectivo',
    })

    expect(resultado.toPost).toEqual([])
    expect(resultado.warning).toBeUndefined()
  })
})

describe('construirNroGastoDeduccion', () => {
  it('genera el formato POS-COM-{sesion8}-{metodo6}-{orden}-{gasto6}', () => {
    const nroGasto = construirNroGastoDeduccion({
      sesionCajaId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      metodoCobroId: 'f9e8d7c6-b5a4-3210-fedc-ba0987654321',
      orden: 1,
      gastoId: '11223344-5566-7788-99aa-bbccddeeff00',
    })

    expect(nroGasto).toMatch(/^POS-COM-[0-9A-F]{8}-[0-9A-F]{6}-\d+-[0-9A-F]{6}$/)
    expect(nroGasto).toBe('POS-COM-A1B2C3D4-F9E8D7-1-112233')
  })

  it('produce nro_gasto distintos para el mismo (sesion, metodo, orden) cuando cambia el gastoId (evita colision entre lotes)', () => {
    const base = {
      sesionCajaId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      metodoCobroId: 'f9e8d7c6-b5a4-3210-fedc-ba0987654321',
      orden: 2,
    }

    const nroGastoLote1 = construirNroGastoDeduccion({ ...base, gastoId: '11223344-0000-0000-0000-000000000000' })
    const nroGastoLote2 = construirNroGastoDeduccion({ ...base, gastoId: 'aabbccdd-0000-0000-0000-000000000000' })

    expect(nroGastoLote1).not.toBe(nroGastoLote2)
    expect(nroGastoLote1).toBe('POS-COM-A1B2C3D4-F9E8D7-2-112233')
    expect(nroGastoLote2).toBe('POS-COM-A1B2C3D4-F9E8D7-2-AABBCC')
  })
})
