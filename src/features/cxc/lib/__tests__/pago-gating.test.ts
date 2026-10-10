import { hayFormaDeCobroValida, calcularTotalAplicado } from '../pago-gating'

// ─── hayFormaDeCobroValida ──────────────────────────────────────
// Truth table del owner (PR11, fix A): habilitar el boton de cobro CxC cuando
// EXISTE alguna via de pago valida — SAF solo, abono normal solo, o ambos.

describe('hayFormaDeCobroValida', () => {
  it('SAF marcado CON monto > 0, sin metodo de cobro: HABILITA (SAF-only, bug previo exigia cubrir el 100%)', () => {
    expect(hayFormaDeCobroValida(true, 25, false, 0)).toBe(true)
  })

  it('SAF marcado CON monto > 0 que NO cubre el saldo completo (parcial), sin metodo: HABILITA igual', () => {
    // 10 de SAF sobre una deuda de 100 — no cubre el 100%, pero sigue siendo una via valida
    expect(hayFormaDeCobroValida(true, 10, false, 0)).toBe(true)
  })

  it('metodo de cobro seleccionado CON monto > 0, sin SAF: HABILITA (abono normal, comportamiento historico)', () => {
    expect(hayFormaDeCobroValida(false, 0, true, 50)).toBe(true)
  })

  it('SAF marcado CON monto > 0 Y metodo de cobro CON monto > 0 (mixto): HABILITA', () => {
    expect(hayFormaDeCobroValida(true, 10, true, 40)).toBe(true)
  })

  it('SAF marcado pero SIN monto (0): NO habilita, incluso sin metodo', () => {
    expect(hayFormaDeCobroValida(true, 0, false, 0)).toBe(false)
  })

  it('metodo de cobro seleccionado pero monto es 0 (incompleto), sin SAF: NO habilita', () => {
    expect(hayFormaDeCobroValida(false, 0, true, 0)).toBe(false)
  })

  it('nada seleccionado (sin SAF, sin metodo, sin montos): NO habilita', () => {
    expect(hayFormaDeCobroValida(false, 0, false, 0)).toBe(false)
  })
})

// ─── calcularTotalAplicado ──────────────────────────────────────

describe('calcularTotalAplicado', () => {
  it('solo abono normal (SAF en 0): el total es el monto del abono', () => {
    expect(calcularTotalAplicado(50, 0)).toBe(50)
  })

  it('solo SAF (abono normal en 0): el total es el monto del SAF', () => {
    expect(calcularTotalAplicado(0, 25)).toBe(25)
  })

  it('mixto (abono normal + SAF): el total es la suma de ambos', () => {
    expect(calcularTotalAplicado(40, 10)).toBe(50)
  })
})
