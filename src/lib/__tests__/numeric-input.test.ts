import { soloNumeroPositivo } from '../numeric-input'

describe('soloNumeroPositivo', () => {
  it('elimina letras dejando string vacio', () => {
    expect(soloNumeroPositivo('abc')).toBe('')
  })

  it('elimina el signo negativo de un entero', () => {
    expect(soloNumeroPositivo('-10')).toBe('10')
  })

  it('preserva un decimal valido', () => {
    expect(soloNumeroPositivo('3.5')).toBe('3.5')
  })

  it('descarta todo lo que sigue al segundo punto decimal', () => {
    expect(soloNumeroPositivo('3.5.2')).toBe('3.5')
  })

  it('un solo guion produce string vacio', () => {
    expect(soloNumeroPositivo('-')).toBe('')
  })

  it('elimina la notacion cientifica dejando solo los digitos', () => {
    expect(soloNumeroPositivo('12e5')).toBe('125')
  })

  it('espacios en blanco producen string vacio', () => {
    expect(soloNumeroPositivo('  ')).toBe('')
  })

  it('preserva un decimal positivo sin cambios', () => {
    expect(soloNumeroPositivo('0.27')).toBe('0.27')
  })

  it('elimina el signo negativo de un decimal', () => {
    expect(soloNumeroPositivo('-0.5')).toBe('0.5')
  })

  it('string vacio produce string vacio', () => {
    expect(soloNumeroPositivo('')).toBe('')
  })
})
