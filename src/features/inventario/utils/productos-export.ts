import * as XLSX from 'xlsx'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'
import type { Receta } from '@/features/inventario/hooks/use-recetas'

// Columnas del formato de importacion/exportacion (identicas para facilitar re-importacion)
const COLUMNAS = [
  'codigo',
  'tipo',
  'nombre',
  'departamento',
  'costo_usd',
  'precio_venta_usd',
  'precio_mayor_usd',
  'stock_minimo',
  'tipo_impuesto',
] as const

interface ExportRow {
  codigo: string
  tipo: string
  nombre: string
  departamento: string
  costo_usd: number
  precio_venta_usd: number
  precio_mayor_usd: number | null
  stock_minimo: number
  tipo_impuesto: string
}

interface ComponenteRow {
  combo_codigo: string
  combo_nombre: string
  componente_codigo: string
  componente_nombre: string
  cantidad: number
}

function buildRows(productos: Producto[], departamentos: Departamento[]): ExportRow[] {
  const depMap = new Map<string, string>()
  for (const d of departamentos) depMap.set(d.id, d.codigo)

  // Exportar P, S y C — todos incluidos en la hoja principal
  return productos.map((p) => ({
      codigo: p.codigo,
      tipo: p.tipo, // P o S (valor raw, igual al formato de importacion)
      nombre: p.nombre,
      departamento: depMap.get(p.departamento_id) ?? '',
      costo_usd: parseFloat(p.costo_usd),
      precio_venta_usd: parseFloat(p.precio_venta_usd),
      precio_mayor_usd: p.precio_mayor_usd ? parseFloat(p.precio_mayor_usd) : null,
      stock_minimo: parseFloat(p.stock_minimo),
      tipo_impuesto: p.tipo_impuesto,
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
  recetas: Receta[] = [],
  productosMap: Map<string, Producto> = new Map()
) {
  const rows = buildRows(productos, departamentos)
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

  const csv = '\uFEFF' + csvLines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const fecha = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `inventario_${fecha}.csv`)
}

export function exportarProductosExcel(
  productos: Producto[],
  departamentos: Departamento[],
  recetas: Receta[] = [],
  productosMap: Map<string, Producto> = new Map()
) {
  const rows = buildRows(productos, departamentos)
  const componenteRows = buildComponenteRows(productos, recetas, productosMap)

  const workbook = XLSX.utils.book_new()

  // Hoja 1: Inventario (P y S) - formato identico al de importacion
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNAS] })
  worksheet['!cols'] = [
    { wch: 14 }, // codigo
    { wch: 6 },  // tipo
    { wch: 32 }, // nombre
    { wch: 14 }, // departamento
    { wch: 12 }, // costo
    { wch: 14 }, // precio_venta
    { wch: 14 }, // precio_mayor
    { wch: 14 }, // stock_minimo
    { wch: 14 }, // tipo_impuesto
  ]
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario')

  // Hoja 2: Componentes de combos (si existen)
  if (componenteRows.length > 0) {
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
  }

  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fecha = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `inventario_${fecha}.xlsx`)
}
