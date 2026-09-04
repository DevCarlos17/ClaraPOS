import { derivarEstadoPago, huboAfectacionCxc } from '../notas-credito-ui'

// ─── derivarEstadoPago (Design §Decision 4 — tabla de verdad Contado/Credito/Abonada) ────────

describe('derivarEstadoPago (Design §Decision 4: pagado = total_usd - saldo_pend_usd, epsilon 0.005)', () => {
  it('CONTADO: saldo_pend_usd == 0 (pagado == total)', () => {
    expect(derivarEstadoPago({ total_usd: '100.00', saldo_pend_usd: '0.00' })).toBe('CONTADO')
  })

  it('CREDITO: saldo_pend_usd == total_usd (pagado == 0, sin ningun pago)', () => {
    expect(derivarEstadoPago({ total_usd: '50.00', saldo_pend_usd: '50.00' })).toBe('CREDITO')
  })

  it('ABONADA: saldo_pend_usd intermedio (0 < pagado < total)', () => {
    expect(derivarEstadoPago({ total_usd: '100.00', saldo_pend_usd: '40.00' })).toBe('ABONADA')
  })

  it('caso limite: saldo_pend_usd exactamente en el epsilon 0.005 -> CONTADO (lte)', () => {
    expect(derivarEstadoPago({ total_usd: '100.00', saldo_pend_usd: '0.005' })).toBe('CONTADO')
  })

  it('caso limite: saldo_pend_usd a distancia epsilon del total -> CREDITO (gte total - epsilon)', () => {
    expect(derivarEstadoPago({ total_usd: '100.00', saldo_pend_usd: '99.995' })).toBe('CREDITO')
  })

  it('justo fuera del epsilon de CREDITO por 0.01 -> ABONADA, no CREDITO', () => {
    expect(derivarEstadoPago({ total_usd: '100.00', saldo_pend_usd: '99.98' })).toBe('ABONADA')
  })
})

// ─── huboAfectacionCxc (Design §Decision 6 — COUNT(*) movimientos_cuenta) ────────

describe('huboAfectacionCxc (Design §Decision 6: fuente movimientos_cuenta, no recibo-pagos.ts)', () => {
  it('0 movimientos -> false (no afecto CxC)', () => {
    expect(huboAfectacionCxc(0)).toBe(false)
  })

  it('1 o mas movimientos -> true (afecto CxC)', () => {
    expect(huboAfectacionCxc(1)).toBe(true)
    expect(huboAfectacionCxc(3)).toBe(true)
  })
})
