import Decimal from 'decimal.js'
import { formatBs, formatUsd } from '@/lib/currency'
import { calcularPendienteVenta } from '../pendiente-venta'

describe('calcularPendienteVenta (fix pos-cobro-pendiente-exacto — sin redondeo intermedio)', () => {
  it('venta a credito sin pagos: $5.41 @ tasa 500 → Pendiente Bs 2.704,00 exacto (NO 2.705,00)', () => {
    // totalEfectivoBs=2704.00 exacto produce un USD real de 5.408 (se muestra
    // como "$5.41" solo al formatear con 2 decimales de vista). El bug legado
    // redondeaba 5.408 -> 5.41 ANTES de multiplicar por la tasa, dando 2705.00.
    const { pendienteBs4, pendienteBs, pendienteUsd } = calcularPendienteVenta(
      new Decimal('2704.00'),
      new Decimal(0),
      new Decimal(0),
      500,
    )

    expect(pendienteBs4.toFixed(2)).toBe('2704.00')
    expect(pendienteBs.toFixed(2)).toBe('2704.00')
    expect(formatBs(pendienteBs)).toBe('Bs. 2.704,00')
    expect(formatUsd(pendienteUsd)).toBe('$5.41')
    // Prueba dura del bug: el calculo NUNCA debe pasar por 2705.00
    expect(formatBs(pendienteBs)).not.toBe('Bs. 2.705,00')
  })

  it('pago parcial: resta exacta de totalPagadoBs, sin inflacion de flotante', () => {
    const { pendienteBs4, pendienteBs, pendienteUsd } = calcularPendienteVenta(
      new Decimal('2704.00'),
      new Decimal(0),
      new Decimal('1000.00'),
      500,
    )

    expect(pendienteBs4.toFixed(2)).toBe('1704.00')
    expect(pendienteBs.toFixed(2)).toBe('1704.00')
    expect(pendienteUsd.toFixed(3)).toBe('3.408')
  })

  it('incluye el IGTF en el pendiente (factura + IGTF generado)', () => {
    const { pendienteBs4 } = calcularPendienteVenta(
      new Decimal('2704.00'),
      new Decimal('50.00'),
      new Decimal(0),
      500,
    )

    expect(pendienteBs4.toFixed(2)).toBe('2754.00')
  })

  it('contado (pago cubre el total, incluso con sobrepago): pendienteBs se capea en 0, nunca negativo', () => {
    const { pendienteBs4, pendienteBs, pendienteUsd } = calcularPendienteVenta(
      new Decimal('2704.00'),
      new Decimal(0),
      new Decimal('2800.00'),
      500,
    )

    expect(pendienteBs4.toFixed(2)).toBe('-96.00') // interno: overpago, sin capear
    expect(pendienteBs.toFixed(2)).toBe('0.00') // capeado para el helper de pendiente
    expect(pendienteUsd.toFixed(2)).toBe('0.00')
  })

  it('USD pendiente deriva de la MISMA fuente Bs exacta via bsToUsd (no totalUsd - totalAbonadoUsd)', () => {
    const { pendienteBs, pendienteUsd } = calcularPendienteVenta(
      new Decimal('1357.00'),
      new Decimal(0),
      new Decimal('500.00'),
      479,
    )

    // pendienteBs = 857.00 ; pendienteUsd debe ser EXACTAMENTE 857/479, no un
    // redondeo previo de 1357/479 menos 500/479.
    expect(pendienteBs.toFixed(2)).toBe('857.00')
    expect(pendienteUsd.toString()).toBe(new Decimal('857.00').dividedBy(479).toString())
  })
})
