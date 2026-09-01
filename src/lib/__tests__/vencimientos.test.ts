import { diasHastaVencimiento } from '../vencimientos'

describe('diasHastaVencimiento', () => {
  it('retorna N para una fecha N dias adelante', () => {
    const result = diasHastaVencimiento('2026-05-26', new Date('2026-05-21T16:00:00.000Z'))
    expect(result).toBe(5)
  })

  it('retorna 0 cuando la fecha de vencimiento es hoy', () => {
    const result = diasHastaVencimiento('2026-05-21', new Date('2026-05-21T16:00:00.000Z'))
    expect(result).toBe(0)
  })

  it('retorna -1 cuando la fecha de vencimiento fue ayer', () => {
    const result = diasHastaVencimiento('2026-05-20', new Date('2026-05-21T16:00:00.000Z'))
    expect(result).toBe(-1)
  })

  it('boundary 20:00-23:59 VET: no desplaza el resultado al dia anterior', () => {
    // UTC 01:00 del 22 de mayo = 21:00 del 21 de mayo en Venezuela (UTC-4)
    const result = diasHastaVencimiento('2026-05-21', new Date('2026-05-22T01:00:00.000Z'))
    expect(result).toBe(0)
  })
})
