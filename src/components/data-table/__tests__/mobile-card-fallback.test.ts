import { derivarCamposMobile, type MobileCardColumn } from '../mobile-card-fallback'

describe('derivarCamposMobile', () => {
  it('deriva pares label/valor de columnas con header string no vacio', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'Nombre', value: 'Juan Perez' },
      { header: 'Total USD', value: 125.5 },
      { header: 'Estado', value: 'Activo' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([
      { label: 'Nombre', value: 'Juan Perez' },
      { label: 'Total USD', value: 125.5 },
      { label: 'Estado', value: 'Activo' },
    ])
  })

  it('omite columnas cuyo header no es un string (ej. render function o undefined)', () => {
    const renderFn = () => 'Acciones'
    const columnas: MobileCardColumn[] = [
      { header: 'Cliente', value: 'ACME' },
      { header: renderFn, value: 'boton' },
      { header: undefined, value: 'sin-header' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([{ label: 'Cliente', value: 'ACME' }])
  })

  it('omite columnas cuyo header es un string vacio o solo espacios', () => {
    const columnas: MobileCardColumn[] = [
      { header: '', value: 'vacio' },
      { header: '   ', value: 'solo-espacios' },
      { header: 'Fecha', value: '2026-01-01' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([{ label: 'Fecha', value: '2026-01-01' }])
  })

  it('retorna un array vacio cuando no hay columnas visibles', () => {
    expect(derivarCamposMobile([])).toEqual([])
  })

  it('preserva el orden original de las columnas visibles', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'B', value: 2 },
      { header: 'A', value: 1 },
      { header: 'C', value: 3 },
    ]

    expect(derivarCamposMobile(columnas).map((campo) => campo.label)).toEqual(['B', 'A', 'C'])
  })

  it('omite columnas con value undefined (ej. columnas `id:` sin accessorKey, cell.getValue() no resuelve nada)', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'Cliente', value: undefined },
      { header: 'Total USD', value: 125.5 },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([{ label: 'Total USD', value: 125.5 }])
  })

  it('omite columnas con value null', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'Estado', value: null },
      { header: 'Fecha', value: '2026-01-01' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([{ label: 'Fecha', value: '2026-01-01' }])
  })

  it('omite columnas con value string vacio', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'Nota', value: '' },
      { header: 'Nombre', value: 'Juan Perez' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([{ label: 'Nombre', value: 'Juan Perez' }])
  })

  it('conserva valores validos no vacios, incluyendo 0 y false (falsy pero significativos)', () => {
    const columnas: MobileCardColumn[] = [
      { header: 'Cantidad', value: 0 },
      { header: 'Activo', value: false },
      { header: 'Nombre', value: 'Juan Perez' },
    ]

    expect(derivarCamposMobile(columnas)).toEqual([
      { label: 'Cantidad', value: 0 },
      { label: 'Activo', value: false },
      { label: 'Nombre', value: 'Juan Perez' },
    ])
  })
})
