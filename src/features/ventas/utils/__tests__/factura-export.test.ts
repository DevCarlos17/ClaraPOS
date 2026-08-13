import {
  buildReciboData,
  buildReciboTextoPlano,
  buildReciboImagenBlob,
  descargarReciboPdf,
  compartirReciboImagen,
  nombreArchivoRecibo,
  type BuildReciboDataInput,
  type ReciboData,
} from '../factura-export'
import type { ReciboPagoInput } from '../recibo-pagos'

function baseInput(overrides: Partial<BuildReciboDataInput> = {}): BuildReciboDataInput {
  return {
    nroFactura: 'FAC-000123',
    fecha: '2026-08-13T10:30:00.000-04:00',
    emisor: { nombre: 'ClaraPOS Estetica C.A.', rif: 'J-12345678-9', direccion: 'Av. Principal, Caracas' },
    cliente: { nombre: 'Maria Perez', identificacion: 'V-12345678', direccion: 'Calle 5, Valencia' },
    lineas: [],
    tasa: '40.5000',
    igtfUsd: null,
    pagos: [],
    discrepancy: null,
    saldoPendUsd: 0,
    ...overrides,
  }
}

describe('buildReciboData', () => {
  it('single alicuota: una linea Gravable al 16% calcula base, iva y total general', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '2',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
      })
    )

    expect(recibo.totales.baseImponibleUsd).toBe(20)
    expect(recibo.totales.montoExentoUsd).toBe(0)
    expect(recibo.totales.alicuotas).toEqual([{ pct: 16, baseUsd: 20, ivaUsd: 3.2 }])
    expect(recibo.totales.totalGeneralUsd).toBe(23.2)
    expect(recibo.totales.totalGeneralBs).toBeCloseTo(23.2 * 40.5, 5)
  })

  it('mixed alicuotas: lineas al 16% y al 8% generan dos buckets separados', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Vitamina C',
            cantidad: '1',
            precioUnitarioUsd: '50.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
        ],
      })
    )

    expect(recibo.totales.baseImponibleUsd).toBe(150)
    expect(recibo.totales.alicuotas).toEqual([
      { pct: 8, baseUsd: 50, ivaUsd: 4 },
      { pct: 16, baseUsd: 100, ivaUsd: 16 },
    ])
    expect(recibo.totales.totalGeneralUsd).toBe(170)
  })

  it('fully exento/exonerado: ambos tipos van al bucket montoExentoUsd, sin alicuotas', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-003',
            nombre: 'Servicio Medico',
            cantidad: '1',
            precioUnitarioUsd: '30.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
          {
            codigo: 'PROD-004',
            nombre: 'Consulta Exonerada',
            cantidad: '1',
            precioUnitarioUsd: '20.00',
            tipoImpuesto: 'Exonerado',
            impuestoPct: '0',
          },
        ],
      })
    )

    expect(recibo.totales.montoExentoUsd).toBe(50)
    expect(recibo.totales.baseImponibleUsd).toBe(0)
    expect(recibo.totales.alicuotas).toEqual([])
    expect(recibo.totales.totalGeneralUsd).toBe(50)
    expect(recibo.lineas.every((l) => l.esExento)).toBe(true)
  })

  it('igtf presente: se suma al total general y queda expuesto en totales.igtfUsd', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: 3.48,
      })
    )

    expect(recibo.totales.igtfUsd).toBe(3.48)
    expect(recibo.totales.totalGeneralUsd).toBe(119.48)
  })

  it('igtf ausente: totales.igtfUsd es null y no se suma nada al total general', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        igtfUsd: null,
      })
    )

    expect(recibo.totales.igtfUsd).toBeNull()
    expect(recibo.totales.totalGeneralUsd).toBe(116)
  })

  it('propaga nroFactura, fecha, emisor y cliente sin transformarlos', () => {
    const recibo = buildReciboData(baseInput())

    expect(recibo.nroFactura).toBe('FAC-000123')
    expect(recibo.fecha).toBe('2026-08-13T10:30:00.000-04:00')
    expect(recibo.emisor).toEqual({
      nombre: 'ClaraPOS Estetica C.A.',
      rif: 'J-12345678-9',
      direccion: 'Av. Principal, Caracas',
    })
    expect(recibo.cliente).toEqual({
      nombre: 'Maria Perez',
      identificacion: 'V-12345678',
      direccion: 'Calle 5, Valencia',
    })
  })

  it('agrupa los pagos por metodo usando agruparPagosPorMetodo', () => {
    const pagos: ReciboPagoInput[] = [
      { metodo_cobro_id: 'pm-1', metodo_nombre: 'Pago Movil Mercantil', moneda: 'BS', monto: 100 },
      { metodo_cobro_id: 'pm-1', metodo_nombre: 'Pago Movil Mercantil', moneda: 'BS', monto: 100 },
      { metodo_cobro_id: 'ef-usd', metodo_nombre: 'Efectivo Dolares', moneda: 'USD', monto: 1 },
    ]
    const recibo = buildReciboData(baseInput({ tasa: '500', pagos }))

    expect(recibo.pagos).toHaveLength(2)
    const pagoMovil = recibo.pagos.find((p) => p.metodoCobroId === 'pm-1')
    expect(pagoMovil?.montoBs).toBe(200)
    const efectivo = recibo.pagos.find((p) => p.metodoCobroId === 'ef-usd')
    expect(efectivo?.montoUsd).toBe(1)
    expect(efectivo?.montoBs).toBe(500)
  })

  it('sin discrepancia ni saldo pendiente, cierre es null', () => {
    const recibo = buildReciboData(baseInput())
    expect(recibo.cierre).toBeNull()
  })

  it('con saldo_pend_usd > 0, cierre es CREDITO calculado con la tasa', () => {
    const recibo = buildReciboData(baseInput({ tasa: '100', saldoPendUsd: 5 }))
    expect(recibo.cierre).toEqual({ tipo: 'CREDITO', montoUsd: 5, montoBs: 500 })
  })

  it('con discrepancy VUELTO, cierre refleja el modo y montos de la discrepancia', () => {
    const recibo = buildReciboData(
      baseInput({
        discrepancy: { mode: 'VUELTO', montoUsd: 2, montoBs: 100 },
      })
    )
    expect(recibo.cierre).toEqual({ tipo: 'VUELTO', montoUsd: 2, montoBs: 100 })
  })
})

describe('buildReciboTextoPlano', () => {
  function reciboConLineas(): ReciboData {
    return buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Vitamina C',
            cantidad: '1',
            precioUnitarioUsd: '50.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '8',
          },
          {
            codigo: 'PROD-003',
            nombre: 'Servicio Medico',
            cantidad: '1',
            precioUnitarioUsd: '30.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
        ],
        igtfUsd: 5.4,
      })
    )
  }

  it('usa la palabra RECIBO y nunca la palabra Factura', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('RECIBO')
    expect(texto).not.toContain('Factura')
  })

  it('marca las lineas exentas con (E)', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('Servicio Medico (E)')
  })

  it('incluye una linea por cada alicuota agrupada', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    expect(texto).toContain('IVA 16%')
    expect(texto).toContain('IVA 8%')
  })

  it('incluye la linea de IGTF solo cuando igtfUsd no es null', () => {
    const conIgtf = buildReciboTextoPlano(reciboConLineas())
    expect(conIgtf).toContain('IGTF')

    const sinIgtf = buildReciboTextoPlano(
      buildReciboData(
        baseInput({
          lineas: [
            {
              codigo: 'PROD-001',
              nombre: 'Crema Facial',
              cantidad: '1',
              precioUnitarioUsd: '100.00',
              tipoImpuesto: 'Gravable',
              impuestoPct: '16',
            },
          ],
          igtfUsd: null,
        })
      )
    )
    expect(sinIgtf).not.toContain('IGTF')
  })

  it('el emisor aparece antes que el numero/fecha de recibo (orden de secciones)', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())

    const idxEmisor = texto.indexOf('ClaraPOS Estetica C.A.')
    const idxNroFecha = texto.indexOf('RECIBO\nNro:')
    expect(idxEmisor).toBeGreaterThanOrEqual(0)
    expect(idxNroFecha).toBeGreaterThan(idxEmisor)
  })

  it('sin pagos, no incluye la seccion Metodos de pago', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())
    expect(texto).not.toContain('Metodos de pago')
  })

  it('con pagos agrupados, incluye la seccion Metodos de pago con cada linea', () => {
    const recibo = buildReciboData(
      baseInput({
        tasa: '40.5000',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        pagos: [
          { metodo_cobro_id: 'pv-1', metodo_nombre: 'Punto de Venta Banesco', moneda: 'BS', monto: 300 },
        ],
      })
    )
    const texto = buildReciboTextoPlano(recibo)

    expect(texto).toContain('Metodos de pago')
    expect(texto).toContain('Punto de Venta Banesco')
    expect(texto).toContain('Bs. 300,00')
  })

  it('sin cierre (sin discrepancia ni credito), no incluye linea de credito/vuelto', () => {
    const texto = buildReciboTextoPlano(reciboConLineas())
    expect(texto).not.toContain('Quedo a credito')
  })

  it('con saldo a credito, la ultima linea muestra "Quedo a credito"', () => {
    const recibo = buildReciboData(
      baseInput({
        tasa: '100',
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '100.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
        saldoPendUsd: 10,
      })
    )
    const texto = buildReciboTextoPlano(recibo)
    const lineas = texto.split('\n').filter((l) => l.trim() !== '')

    expect(lineas[lineas.length - 1]).toContain('Quedo a credito')
    expect(lineas[lineas.length - 1]).toContain('Bs. 1.000,00')
    expect(lineas[lineas.length - 1]).toContain('$10.00')
  })
})

describe('contrato v1: recibo sin descuento comercial (decision #1470)', () => {
  it('totalGeneralUsd = exento + base imponible + suma(iva) + igtf, sin restar ningun descuento', () => {
    const recibo = buildReciboData(
      baseInput({
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '2',
            precioUnitarioUsd: '25.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
          {
            codigo: 'PROD-002',
            nombre: 'Consulta',
            cantidad: '1',
            precioUnitarioUsd: '15.00',
            tipoImpuesto: 'Exento',
            impuestoPct: '0',
          },
        ],
        igtfUsd: 2.5,
      })
    )

    const sumaComponentes =
      recibo.totales.montoExentoUsd +
      recibo.totales.baseImponibleUsd +
      recibo.totales.alicuotas.reduce((sum, a) => sum + a.ivaUsd, 0) +
      (recibo.totales.igtfUsd ?? 0)

    expect(recibo.totales.totalGeneralUsd).toBeCloseTo(sumaComponentes, 8)
    // Los descuentos comerciales estan pausados (decision #1470): el contrato de
    // ReciboTotales no expone ningun campo de descuento, por lo que no existe
    // forma de que un descuento reduzca el total del recibo.
    expect('descuento' in recibo.totales).toBe(false)
    expect('descuentoUsd' in recibo.totales).toBe(false)
  })
})

function reciboMinimo(): ReciboData {
  return buildReciboData(
    baseInput({
      lineas: [
        {
          codigo: 'PROD-001',
          nombre: 'Crema Facial',
          cantidad: '1',
          precioUnitarioUsd: '10.00',
          tipoImpuesto: 'Gravable',
          impuestoPct: '16',
        },
      ],
    })
  )
}

describe('nombreArchivoRecibo', () => {
  function reciboCon(nroFactura: string, clienteNombre: string): ReciboData {
    return buildReciboData(
      baseInput({
        nroFactura,
        cliente: { nombre: clienteNombre, identificacion: 'V-1', direccion: null },
        lineas: [
          {
            codigo: 'PROD-001',
            nombre: 'Crema Facial',
            cantidad: '1',
            precioUnitarioUsd: '10.00',
            tipoImpuesto: 'Gravable',
            impuestoPct: '16',
          },
        ],
      })
    )
  }

  it('nombre normal: mayusculas, espacios a guiones, extension correcta', () => {
    const recibo = reciboCon('C01-000276', 'Francisco Palmar')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000276_FRANCISCO-PALMAR.pdf')
    expect(nombreArchivoRecibo(recibo, 'png')).toBe('RECIBO_C01-000276_FRANCISCO-PALMAR.png')
  })

  it('nombre con acentos y ene: normaliza sin diacriticos', () => {
    const recibo = reciboCon('C01-000300', 'José Ñoño')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000300_JOSE-NONO.pdf')
  })

  it('nombre con caracteres invalidos para sistema de archivos: los elimina', () => {
    const recibo = reciboCon('C01-000400', 'A/B:C')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000400_ABC.pdf')
  })

  it('nombre vacio o solo espacios: cae a solo el nro, sin segmento de cliente ni guion bajo colgante', () => {
    const recibo = reciboCon('C01-000500', '   ')

    expect(nombreArchivoRecibo(recibo, 'pdf')).toBe('RECIBO_C01-000500.pdf')
  })
})

describe('descargarReciboPdf', () => {
  it('genera el PDF y dispara la descarga via blob + anchor con el nombre de archivo sanitizado', () => {
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-pdf')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const recibo = reciboMinimo()
    descargarReciboPdf(recibo)

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
    expect(createObjectURLSpy.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-pdf')

    clickSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
  })
})

describe('buildReciboImagenBlob', () => {
  it('cuando el entorno no soporta contexto 2D de canvas, rechaza con un error claro en vez de crashear', async () => {
    // happy-dom (entorno de test) no implementa render 2D real: HTMLCanvasElement.getContext()
    // siempre retorna null. Este test documenta la ruta de degradacion elegante ante esa
    // limitacion (o ante un fallo real de contexto 2D en un dispositivo de baja memoria).
    await expect(buildReciboImagenBlob(reciboMinimo())).rejects.toThrow(/contexto 2D/i)
  })
})

describe('compartirReciboImagen', () => {
  const fakePngBlob = async (): Promise<Blob> => new Blob(['fake-png-bytes'], { type: 'image/png' })

  it('cuando navigator.share no existe, rechaza con un error claro (el boton Compartir debe estar oculto en la UI)', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined })

    await expect(compartirReciboImagen(reciboMinimo())).rejects.toThrow(/no esta disponible/i)

    vi.unstubAllGlobals()
  })

  it('cuando navigator.canShare({files}) es true, comparte la imagen PNG como archivo', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: canShareMock })

    const recibo = reciboMinimo()
    await compartirReciboImagen(recibo, fakePngBlob)

    expect(canShareMock).toHaveBeenCalledTimes(1)
    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; title?: string; text?: string }
    expect(payload.files).toHaveLength(1)
    expect(payload.files?.[0]).toBeInstanceOf(File)
    expect(payload.files?.[0].name).toBe(nombreArchivoRecibo(recibo, 'png'))
    expect(payload.title).toContain(recibo.nroFactura)
    expect(payload.text).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('cuando navigator.canShare({files}) es false, cae a compartir texto plano', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    const canShareMock = vi.fn().mockReturnValue(false)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock, canShare: canShareMock })

    await compartirReciboImagen(reciboMinimo(), fakePngBlob)

    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; text?: string }
    expect(payload.files).toBeUndefined()
    expect(payload.text).toContain('RECIBO')

    vi.unstubAllGlobals()
  })

  it('cuando la generacion de la imagen falla (ej. canvas no soportado), cae a compartir texto plano', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await compartirReciboImagen(reciboMinimo(), async () => {
      throw new Error('canvas no soportado')
    })

    expect(shareMock).toHaveBeenCalledTimes(1)
    const payload = shareMock.mock.calls[0][0] as { files?: File[]; text?: string }
    expect(payload.files).toBeUndefined()
    expect(payload.text).toContain('RECIBO')

    vi.unstubAllGlobals()
  })

  it('cuando navigator.share rechaza con AbortError, la promesa se resuelve sin lanzar', async () => {
    const shareMock = vi.fn().mockRejectedValue(new DOMException('AbortError', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await expect(compartirReciboImagen(reciboMinimo(), fakePngBlob)).resolves.toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('cuando navigator.share rechaza con un error generico, la promesa se rechaza', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('permission denied'))
    vi.stubGlobal('navigator', { ...navigator, share: shareMock })

    await expect(compartirReciboImagen(reciboMinimo(), fakePngBlob)).rejects.toThrow('permission denied')

    vi.unstubAllGlobals()
  })
})
