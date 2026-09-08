import Decimal from 'decimal.js'

// Cortamos la PowerSyncDatabase real (efecto top-level en `producto-form.tsx`
// via `db.ts` -> `new PowerSyncDatabase(...)`) antes de que reviente con
// "Worker is not defined" en el entorno de test. Mismo patron que
// producto-list-deposito-col.test.tsx. Estos mocks son solo para permitir el
// import del modulo — las funciones bajo test son puras y no los usan.
vi.mock('@/core/db/powersync/db', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync', () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }))
vi.mock('@/core/db/powersync/connector', () => ({ connector: {} }))

import {
  formatearCostoExploradoParaEstado,
  resolverPvpCascadaStrings,
} from '../producto-form'

describe('formatearCostoExploradoParaEstado', () => {
  it('preserva 8 decimales (regla de negocio #10) en vez de redondear a 2 (caso del tester: 104 Bs / tasa 500)', () => {
    const costo = new Decimal(104).dividedBy(new Decimal(500))
    expect(formatearCostoExploradoParaEstado(costo)).toBe('0.20800000')
  })

  it('redondea a 8 decimales cuando el costo tiene mas precision aun (triangulacion)', () => {
    const costo = new Decimal(100).dividedBy(new Decimal(3))
    expect(formatearCostoExploradoParaEstado(costo)).toBe('33.33333333')
  })
})

describe('resolverPvpCascadaStrings', () => {
  it('deriva el Bs del Decimal de precision completa, no del string USD ya redondeado (caso del tester: costo 0.208, margen especial 10%, tasa 500 -> 114.40 Bs, no 115.00)', () => {
    const costoUsd = new Decimal(104).dividedBy(new Decimal(500)) // 0.208
    const pvpEspecial = costoUsd.times(new Decimal(1).plus(new Decimal(10).dividedBy(100))) // 0.2288
    const { usdStr, bsStr } = resolverPvpCascadaStrings(pvpEspecial, 500)
    expect(usdStr).toBe('0.23')
    expect(bsStr).toBe('114.40')
  })

  it('triangula con otro nivel/margen (detal 30%, tasa 500 -> 135.20 Bs, no 135.00)', () => {
    const costoUsd = new Decimal(104).dividedBy(new Decimal(500)) // 0.208
    const pvpDetal = costoUsd.times(new Decimal(1).plus(new Decimal(30).dividedBy(100))) // 0.2704
    const { usdStr, bsStr } = resolverPvpCascadaStrings(pvpDetal, 500)
    expect(usdStr).toBe('0.27')
    expect(bsStr).toBe('135.20')
  })

  it('retorna bsStr null cuando la tasa es 0 (guard, sin escribir un Bs invalido)', () => {
    const pvp = new Decimal(0.23)
    expect(resolverPvpCascadaStrings(pvp, 0)).toEqual({ usdStr: '0.23', bsStr: null })
  })
})
