import * as XLSX from 'xlsx'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'
import type { Unidad } from '@/features/inventario/hooks/use-unidades'
import type { ExistenciaRow } from '@/features/inventario/hooks/use-inventario-stock'
import { ordenarDepositosColumnas } from '@/features/inventario/lib/existencias-pivot'
import {
  buildRows,
  buildExistenciasSheet,
  buildInventarioWorkbook,
  exportarProductosCsv,
} from '../productos-export'

function producto(overrides: Partial<Producto> = {}): Producto {
  return {
    id: 'prod-1',
    codigo: 'PROD-1',
    tipo: 'P',
    nombre: 'PRODUCTO EJEMPLO',
    departamento_id: 'dep-1',
    marca_id: null,
    unidad_base_id: null,
    costo_usd: '10.00',
    precio_venta_usd: '15.00',
    precio_mayor_usd: null,
    precio_especial_usd: null,
    costo_promedio: '10.00',
    costo_ultimo: '10.00',
    stock: '0.000',
    stock_minimo: '1.000',
    tipo_impuesto: 'Exento',
    impuesto_iva_id: null,
    maneja_lotes: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ubicacion: null,
    presentacion: null,
    codigo_barras: null,
    duracion_min: null,
    deposito_id: null,
    costo_factura_usd: null,
    tasa_paralela_ref: null,
    ...overrides,
  }
}

function departamento(overrides: Partial<Departamento> = {}): Departamento {
  return {
    id: 'dep-1',
    codigo: 'DEP-1',
    nombre: 'DEPARTAMENTO EJEMPLO',
    parent_id: null,
    descripcion: null,
    prioridad_visual: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function deposito(overrides: Partial<Deposito> = {}): Deposito {
  return {
    id: 'dep-x-1',
    empresa_id: 'emp-1',
    nombre: 'PRINCIPAL',
    direccion: null,
    es_principal: 1,
    permite_venta: 1,
    is_active: 1,
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
    ...overrides,
  }
}

function unidad(overrides: Partial<Unidad> = {}): Unidad {
  return {
    id: 'und-1',
    empresa_id: 'emp-1',
    nombre: 'UNIDAD',
    abreviatura: 'UND',
    es_decimal: 0,
    is_active: 1,
    created_at: '',
    updated_at: '',
    updated_by: null,
    ...overrides,
  }
}

function existenciaRow(overrides: Partial<ExistenciaRow> = {}): ExistenciaRow {
  return {
    producto_id: 'prod-1',
    codigo: 'PROD-1',
    nombre: 'PRODUCTO EJEMPLO',
    cantidadPorDeposito: {},
    ...overrides,
  }
}

describe('buildRows — columna deposito (spec-pr2 R1)', () => {
  it('SC1: producto con deposito_id apuntando a un deposito ACTIVO resuelve el nombre', () => {
    const depActivo = deposito({ id: 'dep-a', nombre: 'PRINCIPAL', is_active: 1 })
    const p = producto({ deposito_id: 'dep-a' })

    const rows = buildRows([p], [departamento()], [depActivo])

    expect(rows).toHaveLength(1)
    expect(rows[0]!.deposito).toBe('PRINCIPAL')
  })

  it('SC2: producto con deposito_id apuntando a un deposito INACTIVO igual resuelve el nombre (lista completa, no solo activos)', () => {
    const depInactivo = deposito({ id: 'dep-b', nombre: 'SUCURSAL VIEJA', is_active: 0 })
    const p = producto({ deposito_id: 'dep-b' })

    const rows = buildRows([p], [departamento()], [depInactivo])

    expect(rows[0]!.deposito).toBe('SUCURSAL VIEJA')
  })

  it('SC3: producto con deposito_id null produce deposito vacio', () => {
    const p = producto({ deposito_id: null })

    const rows = buildRows([p], [departamento()], [deposito()])

    expect(rows[0]!.deposito).toBe('')
  })

  it('deposito_id que no existe en el mapa (huerfano) tambien produce vacio', () => {
    const p = producto({ deposito_id: 'no-existe' })

    const rows = buildRows([p], [departamento()], [deposito({ id: 'otro-id' })])

    expect(rows[0]!.deposito).toBe('')
  })
})

describe('buildRows — campos nuevos (unidad, codigo_barras, presentacion, ubicacion, maneja_lotes, precio_especial_usd)', () => {
  it('producto tipo P con todos los campos nuevos presentes -> valores correctos en la fila', () => {
    const und = unidad({ id: 'und-kg', abreviatura: 'KG' })
    const p = producto({
      tipo: 'P',
      unidad_base_id: 'und-kg',
      codigo_barras: '7591234567890',
      presentacion: 'CAJA x 12',
      ubicacion: 'A-01-1',
      maneja_lotes: 1,
      precio_especial_usd: '12.50000000',
    })

    const rows = buildRows([p], [departamento()], [deposito()], [und])

    expect(rows[0]!.unidad).toBe('KG')
    expect(rows[0]!.codigo_barras).toBe('7591234567890')
    expect(rows[0]!.presentacion).toBe('CAJA x 12')
    expect(rows[0]!.ubicacion).toBe('A-01-1')
    expect(rows[0]!.maneja_lotes).toBe('SI')
    expect(rows[0]!.precio_especial_usd).toBe(12.5)
  })

  it('producto tipo S -> maneja_lotes, ubicacion y presentacion vacios (no aplican)', () => {
    const p = producto({ tipo: 'S', presentacion: 'ALGO', ubicacion: 'ALGO', maneja_lotes: 1 })

    const rows = buildRows([p], [departamento()], [deposito()], [])

    expect(rows[0]!.maneja_lotes).toBe('')
    expect(rows[0]!.ubicacion).toBe('')
    expect(rows[0]!.presentacion).toBe('')
  })

  it('producto tipo C -> maneja_lotes, ubicacion y presentacion vacios (no aplican)', () => {
    const p = producto({ tipo: 'C', presentacion: 'ALGO', ubicacion: 'ALGO', maneja_lotes: 1 })

    const rows = buildRows([p], [departamento()], [deposito()], [])

    expect(rows[0]!.maneja_lotes).toBe('')
    expect(rows[0]!.ubicacion).toBe('')
    expect(rows[0]!.presentacion).toBe('')
  })

  it('producto tipo P con maneja_lotes=0 -> "NO"; maneja_lotes=1 -> "SI"', () => {
    const pNo = producto({ tipo: 'P', maneja_lotes: 0 })
    const pSi = producto({ tipo: 'P', maneja_lotes: 1 })

    const rows = buildRows([pNo, pSi], [departamento()], [deposito()], [])

    expect(rows[0]!.maneja_lotes).toBe('NO')
    expect(rows[1]!.maneja_lotes).toBe('SI')
  })

  it('precio_especial_usd null -> null en la fila; unidad_base_id null -> cadena vacia', () => {
    const p = producto({ precio_especial_usd: null, unidad_base_id: null })

    const rows = buildRows([p], [departamento()], [deposito()], [])

    expect(rows[0]!.precio_especial_usd).toBeNull()
    expect(rows[0]!.unidad).toBe('')
  })
})

describe('buildExistenciasSheet (spec-pr2 R3, R4)', () => {
  it('SC5: header con nombres de deposito + fila con 0.000 en par ausente de cantidadPorDeposito', () => {
    const depA = { id: 'dep-a', nombre: 'A' }
    const depB = { id: 'dep-b', nombre: 'B' }
    const rowConAmbos = existenciaRow({
      producto_id: 'p1',
      codigo: 'P1',
      nombre: 'PRODUCTO UNO',
      cantidadPorDeposito: { 'dep-a': '5.000', 'dep-b': '3.000' },
    })
    const rowSinB = existenciaRow({
      producto_id: 'p2',
      codigo: 'P2',
      nombre: 'PRODUCTO DOS',
      cantidadPorDeposito: { 'dep-a': '7.000' },
    })

    const sheet = buildExistenciasSheet([rowConAmbos, rowSinB], [depA, depB])

    expect(sheet[0]).toEqual(['codigo', 'nombre', 'A', 'B'])
    expect(sheet[1]).toEqual(['P1', 'PRODUCTO UNO', '5.000', '3.000'])
    expect(sheet[2]).toEqual(['P2', 'PRODUCTO DOS', '7.000', '0.000'])
  })

  it('SC6: orden de columnas via ordenarDepositosColumnas real (principal primero, luego alfabetico)', () => {
    const depB = deposito({ id: 'dep-b', nombre: 'B', es_principal: 0 })
    const depPrincipal = deposito({ id: 'dep-p', nombre: 'PRINCIPAL', es_principal: 1 })
    const ordenados = ordenarDepositosColumnas([depB, depPrincipal])

    const sheet = buildExistenciasSheet([], ordenados)

    expect(sheet[0]).toEqual(['codigo', 'nombre', 'PRINCIPAL', 'B'])
  })

  it('sin productos produce solo la fila de header', () => {
    const sheet = buildExistenciasSheet([], [{ id: 'dep-a', nombre: 'A' }])
    expect(sheet).toHaveLength(1)
    expect(sheet[0]).toEqual(['codigo', 'nombre', 'A'])
  })
})

describe('buildInventarioWorkbook (spec-pr2 R6, R10 — invariante de 3 hojas)', () => {
  it('SC7: existenciasRows vacio -> hoja "Existencias por Deposito" existe con solo el header', () => {
    const rows = buildRows([producto()], [departamento()], [deposito()])
    const existenciasSheetData = buildExistenciasSheet([], [{ id: 'dep-a', nombre: 'A' }])

    const wb = buildInventarioWorkbook(rows, [], existenciasSheetData)

    const ws = wb.Sheets['Existencias por Deposito']
    expect(ws).toBeDefined()
    const parsed = XLSX.utils.sheet_to_json<unknown[]>(ws!, { header: 1 })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toEqual(['codigo', 'nombre', 'A'])
  })

  it('SC8: componenteRows vacio -> SheetNames en orden fijo de 3 hojas, hoja combos solo header', () => {
    const rows = buildRows([producto()], [departamento()], [deposito()])
    const existenciasSheetData = buildExistenciasSheet(
      [existenciaRow()],
      [{ id: 'dep-a', nombre: 'A' }]
    )

    const wb = buildInventarioWorkbook(rows, [], existenciasSheetData)

    expect(wb.SheetNames).toEqual(['Inventario', 'Componentes Combos', 'Existencias por Deposito'])

    const wsCombos = wb.Sheets['Componentes Combos']
    expect(wsCombos).toBeDefined()
    const parsedCombos = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsCombos!, { defval: '' })
    expect(parsedCombos).toHaveLength(0)
  })

  it('SC9 (regresion critica de round-trip): leer Sheets["Componentes Combos"] con sheet_to_json nunca trae datos de existencias', () => {
    const rows = buildRows([producto()], [departamento()], [deposito()])
    const existenciasSheetData = buildExistenciasSheet(
      [existenciaRow({ cantidadPorDeposito: { 'dep-a': '9.000' } })],
      [{ id: 'dep-a', nombre: 'A' }]
    )

    const wb = buildInventarioWorkbook(rows, [], existenciasSheetData)

    // Simula el acceso por indice que hace handleFileChange: SheetNames[1]
    const sheet1Name = wb.SheetNames[1]
    expect(sheet1Name).toBe('Componentes Combos')
    const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet1Name]!, {
      defval: '',
    })
    expect(parsed).toEqual([])
  })

  it('con combos reales, arma la hoja de combos con datos y mantiene el orden de 3 hojas', () => {
    const rows = buildRows([producto()], [departamento()], [deposito()])
    const componenteRows = [
      {
        combo_codigo: 'COMBO-1',
        combo_nombre: 'COMBO UNO',
        componente_codigo: 'PROD-1',
        componente_nombre: 'PRODUCTO EJEMPLO',
        cantidad: 2,
      },
    ]
    const existenciasSheetData = buildExistenciasSheet([], [{ id: 'dep-a', nombre: 'A' }])

    const wb = buildInventarioWorkbook(rows, componenteRows, existenciasSheetData)

    expect(wb.SheetNames).toEqual(['Inventario', 'Componentes Combos', 'Existencias por Deposito'])
    const parsedCombos = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['Componentes Combos']!,
      { defval: '' }
    )
    expect(parsedCombos).toHaveLength(1)
    expect(parsedCombos[0]!.combo_codigo).toBe('COMBO-1')
  })
})

describe('exportarProductosCsv — columna deposito + seccion existencias (SC4, SC10)', () => {
  const originalCreateObjectURL = URL.createObjectURL
  const originalRevokeObjectURL = URL.revokeObjectURL
  let capturedBlob: Blob | undefined

  beforeEach(() => {
    capturedBlob = undefined
    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
  })

  it('SC4: incluye "deposito" en el header del CSV con el valor resuelto por fila', async () => {
    const depActivo = deposito({ id: 'dep-a', nombre: 'PRINCIPAL' })
    const p = producto({ deposito_id: 'dep-a' })

    exportarProductosCsv([p], [departamento()], [depActivo])

    expect(capturedBlob).toBeDefined()
    const text = await capturedBlob!.text()
    const lines = text.replace(/^\uFEFF/, '').split('\n')
    expect(lines[0]).toContain('deposito')
    expect(lines[1]).toContain('PRINCIPAL')
  })

  it('SC10: agrega la seccion "# EXISTENCIAS POR DEPOSITO" al final, despues de combos, con las filas de buildExistenciasSheet', async () => {
    const depActivo = deposito({ id: 'dep-a', nombre: 'A' })
    const p = producto({ deposito_id: 'dep-a', codigo: 'PROD-1' })
    const recetaCombo = producto({ id: 'combo-1', codigo: 'COMBO-1', tipo: 'C' })
    const productosMap = new Map([[p.id, p]])
    const existenciasRows = [
      existenciaRow({ producto_id: p.id, codigo: 'PROD-1', nombre: p.nombre, cantidadPorDeposito: { 'dep-a': '4.000' } }),
    ]

    exportarProductosCsv(
      [p, recetaCombo],
      [departamento()],
      [depActivo],
      [{ id: 'r1', servicio_id: 'combo-1', producto_id: p.id, cantidad: '1.000', created_at: '' }],
      productosMap,
      { rows: existenciasRows, depositosActivos: [depActivo] }
    )

    const text = await capturedBlob!.text()
    const comboIdx = text.indexOf('# COMPONENTES DE COMBOS')
    const existenciasIdx = text.indexOf('# EXISTENCIAS POR DEPOSITO (informativo - no importable)')

    expect(comboIdx).toBeGreaterThan(-1)
    expect(existenciasIdx).toBeGreaterThan(comboIdx)
    expect(text).toContain('codigo,nombre,A')
    expect(text).toContain('PROD-1,PRODUCTO EJEMPLO,4.000')
  })
})
