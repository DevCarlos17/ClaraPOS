import * as XLSX from 'xlsx'
import { todayStr } from '@/lib/dates'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Receta } from '@/features/inventario/hooks/use-recetas'
import type { Deposito } from '@/features/inventario/hooks/use-depositos'
import type { Unidad } from '@/features/inventario/hooks/use-unidades'
import type { ExistenciaRow } from '@/features/inventario/hooks/use-inventario-stock'
import { ordenarDepositosColumnas } from '@/features/inventario/lib/existencias-pivot'

// Columnas del formato de exportacion. `stock_inicial` NO aparece aqui (es
// solo-import, no tiene sentido re-exportar un stock de apertura); el resto
// de columnas es identico al formato de importacion para facilitar
// re-importacion (Fase A commit 2 — alineacion con el formulario de producto).
const COLUMNAS = [
  'codigo',
  'tipo',
  'nombre',
  'departamento',
  'costo_usd',
  'precio_venta_usd',
  'precio_mayor_usd',
  'precio_especial_usd',
  'stock_minimo',
  'unidad',
  'tipo_impuesto',
  'codigo_barras',
  'presentacion',
  'ubicacion',
  'maneja_lotes',
  'deposito',
] as const

interface ExportRow {
  codigo: string
  tipo: string
  nombre: string
  departamento: string
  costo_usd: number
  precio_venta_usd: number
  precio_mayor_usd: number | null
  precio_especial_usd: number | null
  stock_minimo: number
  unidad: string
  tipo_impuesto: string
  codigo_barras: string
  presentacion: string
  ubicacion: string
  maneja_lotes: string
  deposito: string
}

interface ComponenteRow {
  combo_codigo: string
  combo_nombre: string
  componente_codigo: string
  componente_nombre: string
  cantidad: number
}

/**
 * Construye las filas de la hoja/CSV "Inventario". `depositos` MUST ser la
 * lista COMPLETA de depositos de la empresa (`useDepositos()`, no
 * `useDepositosActivos()`) para que un `producto.deposito_id` apuntando a un
 * deposito hoy inactivo siga resolviendo su nombre — mismo criterio que
 * `depMap` con departamentos (spec-pr2 R1).
 */
export function buildRows(
  productos: Producto[],
  departamentos: Departamento[],
  depositos: Deposito[],
  unidades: Unidad[] = []
): ExportRow[] {
  const depMap = new Map<string, string>()
  for (const d of departamentos) depMap.set(d.id, d.nombre)

  const depositoMap = new Map<string, string>()
  for (const d of depositos) depositoMap.set(d.id, d.nombre)

  const unidadMap = new Map<string, string>()
  for (const u of unidades) unidadMap.set(u.id, u.abreviatura)

  // Exportar P, S y C — todos incluidos en la hoja principal
  return productos.map((p) => ({
      codigo: p.codigo,
      tipo: p.tipo, // P, S o C (valor raw, igual al formato de importacion)
      nombre: p.nombre,
      departamento: depMap.get(p.departamento_id) ?? '',
      costo_usd: parseFloat(p.costo_usd),
      precio_venta_usd: parseFloat(p.precio_venta_usd),
      precio_mayor_usd: p.precio_mayor_usd ? parseFloat(p.precio_mayor_usd) : null,
      precio_especial_usd: p.precio_especial_usd ? parseFloat(p.precio_especial_usd) : null,
      stock_minimo: parseFloat(p.stock_minimo),
      unidad: unidadMap.get(p.unidad_base_id ?? '') ?? '',
      tipo_impuesto: p.tipo_impuesto,
      codigo_barras: p.codigo_barras ?? '',
      // presentacion y ubicacion solo tienen sentido para productos fisicos
      // (tipo P) — S y C los dejan en null en BD (use-productos.ts), vacios aqui.
      presentacion: p.tipo === 'S' || p.tipo === 'C' ? '' : (p.presentacion ?? ''),
      ubicacion: p.tipo !== 'P' ? '' : (p.ubicacion ?? ''),
      maneja_lotes: p.tipo !== 'P' ? '' : (p.maneja_lotes === 1 ? 'SI' : 'NO'),
      deposito: depositoMap.get(p.deposito_id ?? '') ?? '',
    }))
}

function buildComponenteRows(
  productos: Producto[],
  recetas: Receta[],
  productosMap: Map<string, Producto>
): ComponenteRow[] {
  const combos = productos.filter((p) => p.tipo === 'C')
  const rows: ComponenteRow[] = []

  for (const combo of combos) {
    const ingredientes = recetas.filter((r) => r.servicio_id === combo.id)
    for (const ing of ingredientes) {
      const componente = productosMap.get(ing.producto_id)
      if (!componente) continue
      rows.push({
        combo_codigo: combo.codigo,
        combo_nombre: combo.nombre,
        componente_codigo: componente.codigo,
        componente_nombre: componente.nombre,
        cantidad: parseFloat(ing.cantidad),
      })
    }
  }

  return rows
}

/**
 * Matriz producto x deposito para la hoja/seccion informativa "Existencias
 * por Deposito" (spec-pr2 R3, R4). Funcion pura: no ejecuta queries ni
 * resuelve `empresa_id` — consume `rows` (ya pivotadas por
 * `useExistenciasPorDeposito`) y `depositosOrdenados` (ya ordenados por
 * `ordenarDepositosColumnas` sobre depositos ACTIVOS, reutilizada de
 * `existencias-pivot.ts` sin reimplementar el criterio principal-primero).
 * Ausencia de la clave en `cantidadPorDeposito` -> `'0.000'`.
 */
export function buildExistenciasSheet(
  rows: ExistenciaRow[],
  depositosOrdenados: { id: string; nombre: string }[]
): string[][] {
  const header = ['codigo', 'nombre', ...depositosOrdenados.map((d) => d.nombre)]
  const dataRows = rows.map((r) => [
    r.codigo,
    r.nombre,
    ...depositosOrdenados.map((d) => r.cantidadPorDeposito[d.id] ?? '0.000'),
  ])
  return [header, ...dataRows]
}

/**
 * Construye el `XLSX.WorkBook` completo del export de inventario (mismo
 * patron de extraccion pura y testeable que `buildPlantillaWorkbook` de
 * PR1). Las hojas 'Componentes Combos' y 'Existencias por Deposito' se
 * agregan SIEMPRE (aunque vacias, con solo header) para mantener el
 * `SheetNames` en el orden fijo `['Inventario', 'Componentes Combos',
 * 'Existencias por Deposito']` — invariante critica de round-trip (spec-pr2
 * R6): el import lee `workbook.SheetNames[1]` por INDICE asumiendo
 * ciegamente que es 'Componentes Combos', sin verificar el nombre de la
 * hoja. Si 'Existencias por Deposito' ocupara el indice 1 por ausencia de
 * combos, una reimportacion del propio export generaria filas de
 * "componentes" fantasma con `combo_codigo` vacio.
 */
export function buildInventarioWorkbook(
  rows: ExportRow[],
  componenteRows: ComponenteRow[],
  existenciasSheetData: string[][]
): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new()

  // Hoja 1: Inventario (P, S y C) - formato identico al de importacion
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNAS] })
  worksheet['!cols'] = [
    { wch: 14 }, // codigo
    { wch: 6 },  // tipo
    { wch: 32 }, // nombre
    { wch: 14 }, // departamento
    { wch: 12 }, // costo
    { wch: 14 }, // precio_venta
    { wch: 14 }, // precio_mayor
    { wch: 14 }, // precio_especial
    { wch: 14 }, // stock_minimo
    { wch: 10 }, // unidad
    { wch: 14 }, // tipo_impuesto
    { wch: 16 }, // codigo_barras
    { wch: 18 }, // presentacion
    { wch: 14 }, // ubicacion
    { wch: 12 }, // maneja_lotes
    { wch: 16 }, // deposito
  ]
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario')

  // Hoja 2: Componentes de combos — SIEMPRE se agrega (aunque vacia) para
  // preservar el indice 1 (ver docstring de la funcion).
  const wsComponentes = XLSX.utils.json_to_sheet(componenteRows, {
    header: ['combo_codigo', 'combo_nombre', 'componente_codigo', 'componente_nombre', 'cantidad'],
  })
  wsComponentes['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(workbook, wsComponentes, 'Componentes Combos')

  // Hoja 3: Existencias por Deposito — informativa, nunca leida por el
  // import (SIEMPRE se agrega, incluso con solo header).
  const wsExistencias = XLSX.utils.aoa_to_sheet(existenciasSheetData)
  XLSX.utils.book_append_sheet(workbook, wsExistencias, 'Existencias por Deposito')

  return workbook
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportarProductosCsv(
  productos: Producto[],
  departamentos: Departamento[],
  depositos: Deposito[] = [],
  recetas: Receta[] = [],
  productosMap: Map<string, Producto> = new Map(),
  existencias: { rows: ExistenciaRow[]; depositosActivos: Deposito[] } = {
    rows: [],
    depositosActivos: [],
  },
  unidades: Unidad[] = []
) {
  const rows = buildRows(productos, departamentos, depositos, unidades)
  const componenteRows = buildComponenteRows(productos, recetas, productosMap)

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvLines: string[] = [
    COLUMNAS.join(','),
    ...rows.map((r) => COLUMNAS.map((h) => escape(r[h as keyof ExportRow])).join(',')),
  ]

  // Seccion de componentes de combos al final del CSV
  if (componenteRows.length > 0) {
    csvLines.push('')
    csvLines.push('# COMPONENTES DE COMBOS (informativo - no importable)')
    csvLines.push('combo_codigo,combo_nombre,componente_codigo,componente_nombre,cantidad')
    for (const cr of componenteRows) {
      csvLines.push(
        [cr.combo_codigo, cr.combo_nombre, cr.componente_codigo, cr.componente_nombre, cr.cantidad]
          .map((v) => escape(v))
          .join(',')
      )
    }
  }

  // Seccion informativa de existencias por deposito, despues de combos
  // (spec-pr2 R7) — reutiliza buildExistenciasSheet, mismo patron de
  // marcador que combos.
  const existenciasSheetData = buildExistenciasSheet(
    existencias.rows,
    ordenarDepositosColumnas(existencias.depositosActivos)
  )
  csvLines.push('')
  csvLines.push('# EXISTENCIAS POR DEPOSITO (informativo - no importable)')
  for (const r of existenciasSheetData) {
    csvLines.push(r.map((v) => escape(v)).join(','))
  }

  const csv = '\uFEFF' + csvLines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `inventario_${todayStr()}.csv`)
}

export function exportarProductosExcel(
  productos: Producto[],
  departamentos: Departamento[],
  depositos: Deposito[] = [],
  recetas: Receta[] = [],
  productosMap: Map<string, Producto> = new Map(),
  existencias: { rows: ExistenciaRow[]; depositosActivos: Deposito[] } = {
    rows: [],
    depositosActivos: [],
  },
  unidades: Unidad[] = []
) {
  const rows = buildRows(productos, departamentos, depositos, unidades)
  const componenteRows = buildComponenteRows(productos, recetas, productosMap)
  const existenciasSheetData = buildExistenciasSheet(
    existencias.rows,
    ordenarDepositosColumnas(existencias.depositosActivos)
  )

  const workbook = buildInventarioWorkbook(rows, componenteRows, existenciasSheetData)

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  triggerDownload(blob, `inventario_${todayStr()}.xlsx`)
}
