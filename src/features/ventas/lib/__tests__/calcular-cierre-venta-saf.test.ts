import Decimal from 'decimal.js'
import { calcularCierreVentaConSaf } from '../calcular-cierre-venta-saf'

describe('calcularCierreVentaConSaf (pos-aplicar-saf-checkout, Decision 2)', () => {
  it('SAF cubre el total por completo → CONTADO, saldoPendUsd=0 (spec req.1 scn.1)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '1.30',
      creditoDisponibleUsd: '2.00',
      respetarEleccionCredito: false,
    })

    expect(r.tipo).toBe('CONTADO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('0.00')
    expect(r.safAplicadoUsd.toFixed(2)).toBe('1.30')
    expect(r.safFueCapeado).toBe(false)
  })

  it('SAF parcial + efectivo cubre el resto → CONTADO (spec req.1 scn.2)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0.80',
      safSolicitadoUsd: '0.50',
      creditoDisponibleUsd: '0.50',
      respetarEleccionCredito: false,
    })

    expect(r.tipo).toBe('CONTADO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('0.00')
    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.50')
    expect(r.safFueCapeado).toBe(false)
  })

  it('SAF parcial + resto a credito → CREDITO por el remanente SOLAMENTE: saldoPend=0.80, NO 1.30 (regresion, spec req.1 scn.3)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0.50',
      creditoDisponibleUsd: '0.50',
      respetarEleccionCredito: true,
    })

    expect(r.tipo).toBe('CREDITO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('0.80')
    expect(r.saldoPendUsd.toFixed(2)).not.toBe('1.30')
    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.50')
    expect(r.safFueCapeado).toBe(false)
  })

  it('SAF + efectivo + credito (split de 3 vias): saldoPend=1.00, tipo=CREDITO (spec req.1 scn.4)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '2.00',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0.50',
      safSolicitadoUsd: '0.50',
      creditoDisponibleUsd: '0.50',
      respetarEleccionCredito: true,
    })

    expect(r.tipo).toBe('CREDITO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('1.00')
    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.50')
    expect(r.safFueCapeado).toBe(false)
  })

  it('SAF solicitado excede el disponible → se capea al disponible, safFueCapeado=true, sin credito negativo (spec req.2 scn.2)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '2.00',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0.80',
      creditoDisponibleUsd: '0.50',
      respetarEleccionCredito: true,
    })

    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.50')
    expect(r.safFueCapeado).toBe(true)
    expect(r.safAplicadoUsd.isNegative()).toBe(false)
  })

  it('SAF solicitado excede el pendiente de la factura (no solo el disponible) → se capea al pendiente', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.00',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0.70',
      safSolicitadoUsd: '1.00',
      creditoDisponibleUsd: '5.00',
      respetarEleccionCredito: false,
    })

    // Pendiente antes de SAF = 1.00 - 0.70 = 0.30 → SAF no puede aplicar mas que eso
    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.30')
    expect(r.safFueCapeado).toBe(true)
    expect(r.tipo).toBe('CONTADO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('0.00')
  })

  it('guarda de regresion: sin SAF (safSolicitadoUsd=0), comportamiento CONTADO/CREDITO sin cambios', () => {
    const contado = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '650',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0',
      creditoDisponibleUsd: '0',
      respetarEleccionCredito: false,
    })
    expect(contado.tipo).toBe('CONTADO')
    expect(contado.saldoPendUsd.toFixed(2)).toBe('0.00')
    expect(contado.safAplicadoUsd.toFixed(2)).toBe('0.00')
    expect(contado.safFueCapeado).toBe(false)

    const credito = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0',
      creditoDisponibleUsd: '0',
      respetarEleccionCredito: true,
    })
    expect(credito.tipo).toBe('CREDITO')
    expect(credito.saldoPendUsd.toFixed(2)).toBe('1.30')
  })

  it('residuo de redondeo (<= tasa*0.01) sin SAF se auto-absorbe a CONTADO cuando no se eligio credito explicitamente', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.30',
      tasa: '500',
      abonadoBsNativo: '649.99',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0',
      creditoDisponibleUsd: '0',
      respetarEleccionCredito: false,
    })
    expect(r.tipo).toBe('CONTADO')
    expect(r.saldoPendUsd.toFixed(2)).toBe('0.00')
  })

  it('creditoDisponibleUsd negativo se trata como 0 (defensivo, nunca credito negativo)', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.00',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0.50',
      creditoDisponibleUsd: '-0.10',
      respetarEleccionCredito: true,
    })
    expect(r.safAplicadoUsd.toFixed(2)).toBe('0.00')
    expect(r.safFueCapeado).toBe(true)
  })

  it('el resultado expone Decimal instances (no numeros) para saldoPendUsd y safAplicadoUsd', () => {
    const r = calcularCierreVentaConSaf({
      totalUsd: '1.00',
      tasa: '500',
      abonadoBsNativo: '0',
      abonadoUsdNativo: '0',
      safSolicitadoUsd: '0',
      creditoDisponibleUsd: '0',
      respetarEleccionCredito: false,
    })
    expect(r.saldoPendUsd).toBeInstanceOf(Decimal)
    expect(r.safAplicadoUsd).toBeInstanceOf(Decimal)
  })
})
