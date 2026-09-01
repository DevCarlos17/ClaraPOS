import { resolverCuentaSeleccionadaViva } from '../resolver-cuenta-seleccionada-viva'
import type { CuentaTesoreria } from '../../hooks/use-cuentas-tesoreria'

function mockCuenta(overrides: Partial<CuentaTesoreria> = {}): CuentaTesoreria {
  return {
    id: 'cuenta-1',
    tipo: 'BANCO',
    nombre: 'Banco Test',
    moneda_id: 'moneda-1',
    moneda_codigo: 'USD',
    moneda_simbolo: '$',
    saldo_actual: '0',
    is_active: true,
    detalle: {} as CuentaTesoreria['detalle'],
    ...overrides,
  }
}

describe('resolverCuentaSeleccionadaViva', () => {
  it('id presente en lista activa — retorna esActivo true', () => {
    const activa = mockCuenta({ id: 'banco-1', is_active: true })

    const resultado = resolverCuentaSeleccionadaViva('banco-1', [activa], [])

    expect(resultado.esActivo).toBe(true)
    expect(resultado.cuenta).toBe(activa)
  })

  it('id presente en lista inactiva — retorna esActivo false', () => {
    const inactiva = mockCuenta({ id: 'banco-1', is_active: false })

    const resultado = resolverCuentaSeleccionadaViva('banco-1', [], [inactiva])

    expect(resultado.esActivo).toBe(false)
    expect(resultado.cuenta).toBe(inactiva)
  })

  it('id ausente en ambas listas — retorna null/esActivo false (fallback seguro)', () => {
    const resultado = resolverCuentaSeleccionadaViva('banco-fantasma', [], [])

    expect(resultado.esActivo).toBe(false)
    expect(resultado.cuenta).toBeNull()
  })

  it('selectedId nulo — retorna null/esActivo false sin buscar en las listas', () => {
    const activa = mockCuenta({ id: 'banco-1', is_active: true })

    const resultado = resolverCuentaSeleccionadaViva(null, [activa], [])

    expect(resultado.esActivo).toBe(false)
    expect(resultado.cuenta).toBeNull()
  })

  it('banco reactivado que aun aparece en ambas listas (transicion) prioriza la lista activa', () => {
    const activa = mockCuenta({ id: 'banco-1', is_active: true })
    const inactiva = mockCuenta({ id: 'banco-1', is_active: false })

    const resultado = resolverCuentaSeleccionadaViva('banco-1', [activa], [inactiva])

    expect(resultado.esActivo).toBe(true)
    expect(resultado.cuenta).toBe(activa)
  })
})
