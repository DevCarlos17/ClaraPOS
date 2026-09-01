import Decimal from 'decimal.js'
import {
  computeCorrelativoUsuario,
  buildTraspasoKardexPair,
  filtrarDepositosDisponibles,
  hayArticulosCargados,
  puedeProcesarTraspaso,
  evaluarGuardiaDepositosActivos,
  type EstadoTraspasoForm,
} from '../traspasos'

describe('computeCorrelativoUsuario (TRI/Correlativo incrementa por usuario)', () => {
  it('usuario sin traspasos previos (count=0): el primer traspaso es correlativo 1', () => {
    expect(computeCorrelativoUsuario(0)).toBe(1)
  })

  it('usuario con 5 traspasos previos: el siguiente es correlativo 6', () => {
    expect(computeCorrelativoUsuario(5)).toBe(6)
  })
})

describe('buildTraspasoKardexPair (TRI/Traspaso individual mueve stock A→B atomicamente)', () => {
  const baseParams = {
    movSalidaId: 'mov-salida-1',
    movEntradaId: 'mov-entrada-1',
    empresa_id: 'empresa-1',
    producto_id: 'producto-1',
    depositoOrigenId: 'deposito-A',
    depositoDestinoId: 'deposito-B',
    cantidad: new Decimal('4.000'),
    usuario_id: 'usuario-1',
    fecha: '2026-08-20T10:00:00.000Z',
    traspasoId: 'traspaso-1',
  }

  it('salida sale del deposito origen con tipo S y origen TRA', () => {
    const { salida } = buildTraspasoKardexPair(baseParams)
    expect(salida.tipo).toBe('S')
    expect(salida.origen).toBe('TRA')
    expect(salida.deposito_id).toBe('deposito-A')
    expect(salida.cantidad).toBe('4.000')
  })

  it('entrada entra al deposito destino con tipo E y origen TRA', () => {
    const { entrada } = buildTraspasoKardexPair(baseParams)
    expect(entrada.tipo).toBe('E')
    expect(entrada.origen).toBe('TRA')
    expect(entrada.deposito_id).toBe('deposito-B')
    expect(entrada.cantidad).toBe('4.000')
  })

  it('salida y entrada comparten doc_origen_id (el id del traspaso), quedan enlazadas', () => {
    const { salida, entrada } = buildTraspasoKardexPair(baseParams)
    expect(salida.doc_origen_id).toBe('traspaso-1')
    expect(entrada.doc_origen_id).toBe('traspaso-1')
  })

  it('cantidad con distinto valor decimal: preserva 3 decimales sin drift', () => {
    const { salida, entrada } = buildTraspasoKardexPair({
      ...baseParams,
      cantidad: new Decimal('0.125'),
    })
    expect(salida.cantidad).toBe('0.125')
    expect(entrada.cantidad).toBe('0.125')
  })

  it('usa los ids de movimiento provistos por el llamador (pre-generados, no ejecuta SQL)', () => {
    const { salida, entrada } = buildTraspasoKardexPair(baseParams)
    expect(salida.id).toBe('mov-salida-1')
    expect(entrada.id).toBe('mov-entrada-1')
  })
})

describe('filtrarDepositosDisponibles (REQ Exclusión Mutua entre Depósito Origen y Destino)', () => {
  const depositos = [
    { id: 'dep-A', nombre: 'Deposito A' },
    { id: 'dep-B', nombre: 'Deposito B' },
    { id: 'dep-C', nombre: 'Deposito C' },
  ]

  it('excluye el depósito cuyo id coincide con idExcluido', () => {
    const result = filtrarDepositosDisponibles(depositos, 'dep-B')
    expect(result.map((d) => d.id)).toEqual(['dep-A', 'dep-C'])
  })

  it('idExcluido vacío (nada seleccionado del otro lado): no-op, retorna todos', () => {
    const result = filtrarDepositosDisponibles(depositos, '')
    expect(result).toHaveLength(3)
    expect(result.map((d) => d.id)).toEqual(['dep-A', 'dep-B', 'dep-C'])
  })

  it('idExcluido que no coincide con ningún depósito: retorna la lista completa sin cambios', () => {
    const result = filtrarDepositosDisponibles(depositos, 'dep-inexistente')
    expect(result).toHaveLength(3)
  })
})

describe('hayArticulosCargados (REQ Búsqueda de Productos Limitada al Origen y Bloqueo de Selección)', () => {
  it('única línea vacía (producto_id === ""): no hay artículos cargados', () => {
    expect(hayArticulosCargados([{ producto_id: '' }])).toBe(false)
  })

  it('array de líneas vacío: no hay artículos cargados', () => {
    expect(hayArticulosCargados([])).toBe(false)
  })

  it('al menos una línea con producto_id no vacío: hay artículos cargados (bloquea el select de origen)', () => {
    expect(hayArticulosCargados([{ producto_id: 'prod-1' }])).toBe(true)
  })

  it('carga de plantilla con múltiples líneas con producto: hay artículos cargados', () => {
    expect(hayArticulosCargados([{ producto_id: 'prod-1' }, { producto_id: 'prod-2' }])).toBe(true)
  })

  it('tras vaciar la tabla (vuelve a una única línea con producto_id vacío): ya no hay artículos cargados', () => {
    expect(hayArticulosCargados([{ producto_id: '' }])).toBe(false)
  })
})

describe('puedeProcesarTraspaso (REQ Límite de Cantidad Disponible y Habilitación Condicional del Botón)', () => {
  function estadoBase(overrides: Partial<EstadoTraspasoForm> = {}): EstadoTraspasoForm {
    return {
      depositoOrigenId: 'dep-A',
      depositoDestinoId: 'dep-B',
      lineas: [{ producto_id: 'prod-1', cantidad: '4' }],
      stockDisponiblePorProducto: new Map([['prod-1', '10.000']]),
      productosValidosIds: new Set(['prod-1']),
      ...overrides,
    }
  }

  it('sin líneas: deshabilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase({ lineas: [] }))
    expect(result.habilitado).toBe(false)
    expect(result.motivo).toBeDefined()
  })

  it('falta depósito origen: deshabilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase({ depositoOrigenId: '' }))
    expect(result.habilitado).toBe(false)
  })

  it('falta depósito destino: deshabilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase({ depositoDestinoId: '' }))
    expect(result.habilitado).toBe(false)
  })

  it('origen === destino: deshabilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase({ depositoOrigenId: 'dep-A', depositoDestinoId: 'dep-A' }))
    expect(result.habilitado).toBe(false)
    expect(result.motivo).toMatch(/diferentes/i)
  })

  it('línea con producto_id vacío: deshabilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase({ lineas: [{ producto_id: '', cantidad: '1' }] }))
    expect(result.habilitado).toBe(false)
  })

  it('producto_id ausente de productosValidosIds (inexistente/inactivo en BD): deshabilitado', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({
        lineas: [{ producto_id: 'prod-fantasma', cantidad: '1' }],
        productosValidosIds: new Set(['prod-1']),
      })
    )
    expect(result.habilitado).toBe(false)
  })

  it('BUG 1 — linea con cantidad vacia (""): deshabilitado (no puede procesarse sin cantidad)', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({ lineas: [{ producto_id: 'prod-1', cantidad: '' }] })
    )
    expect(result.habilitado).toBe(false)
    expect(result.motivo).toBeDefined()
  })

  it('BUG 1 — linea con cantidad "0": deshabilitado (cantidad debe ser > 0)', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({ lineas: [{ producto_id: 'prod-1', cantidad: '0' }] })
    )
    expect(result.habilitado).toBe(false)
    expect(result.motivo).toBeDefined()
  })

  it('BUG 1 — linea con cantidad negativa: deshabilitado', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({ lineas: [{ producto_id: 'prod-1', cantidad: '-1' }] })
    )
    expect(result.habilitado).toBe(false)
  })

  it('BUG 1 — multiples lineas, una con cantidad vacia: deshabilitado aunque las demas sean validas', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({
        lineas: [
          { producto_id: 'prod-1', cantidad: '4' },
          { producto_id: 'prod-2', cantidad: '' },
        ],
        stockDisponiblePorProducto: new Map([
          ['prod-1', '10.000'],
          ['prod-2', '5.000'],
        ]),
        productosValidosIds: new Set(['prod-1', 'prod-2']),
      })
    )
    expect(result.habilitado).toBe(false)
  })

  it('producto ausente en stockDisponiblePorProducto (sin stock en origen): deshabilitado', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({
        lineas: [{ producto_id: 'prod-2', cantidad: '1' }],
        productosValidosIds: new Set(['prod-1', 'prod-2']),
        stockDisponiblePorProducto: new Map([['prod-1', '10.000']]),
      })
    )
    expect(result.habilitado).toBe(false)
  })

  it('cantidad excede el disponible en origen: deshabilitado', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({
        lineas: [{ producto_id: 'prod-1', cantidad: '8' }],
        stockDisponiblePorProducto: new Map([['prod-1', '5.000']]),
      })
    )
    expect(result.habilitado).toBe(false)
  })

  it('todo válido (origen y destino distintos, producto conocido con stock suficiente): habilitado', () => {
    const result = puedeProcesarTraspaso(estadoBase())
    expect(result.habilitado).toBe(true)
    expect(result.motivo).toBeUndefined()
  })

  it('múltiples líneas todas válidas: habilitado', () => {
    const result = puedeProcesarTraspaso(
      estadoBase({
        lineas: [
          { producto_id: 'prod-1', cantidad: '4' },
          { producto_id: 'prod-2', cantidad: '2' },
        ],
        stockDisponiblePorProducto: new Map([
          ['prod-1', '10.000'],
          ['prod-2', '5.000'],
        ]),
        productosValidosIds: new Set(['prod-1', 'prod-2']),
      })
    )
    expect(result.habilitado).toBe(true)
  })
})

describe('evaluarGuardiaDepositosActivos (Guardia is_active en Traspaso)', () => {
  it('origen inactivo (is_active=0): bloqueado con lado origen', () => {
    const result = evaluarGuardiaDepositosActivos(0, 1)
    expect(result).toEqual({ bloqueado: true, lado: 'origen' })
  })

  it('destino inactivo (is_active=0): bloqueado con lado destino', () => {
    const result = evaluarGuardiaDepositosActivos(1, 0)
    expect(result).toEqual({ bloqueado: true, lado: 'destino' })
  })

  it('ambos activos (is_active=1): no bloqueado', () => {
    const result = evaluarGuardiaDepositosActivos(1, 1)
    expect(result).toEqual({ bloqueado: false })
  })
})
