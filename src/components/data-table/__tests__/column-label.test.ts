import { getColumnLabel } from '../column-label'

describe('getColumnLabel', () => {
  it('usa el header cuando es un string no vacio', () => {
    expect(getColumnLabel('Total USD', 'total_usd')).toBe('Total USD')
  })

  it('prettifica el id (snake_case -> Title Case) cuando el header no es string', () => {
    expect(getColumnLabel(undefined, 'nro_factura')).toBe('Nro Factura')
  })

  it('prettifica el id cuando el header es una render function (no string)', () => {
    const renderFn = () => 'Acciones'
    expect(getColumnLabel(renderFn, 'total_bs')).toBe('Total Bs')
  })

  it('prettifica un id de una sola palabra sin guion bajo', () => {
    expect(getColumnLabel(undefined, 'cliente')).toBe('Cliente')
  })
})
