import * as XLSX from 'xlsx'
import type { Producto } from '@/features/inventario/hooks/use-productos'
import type { Departamento } from '@/features/inventario/hooks/use-departamentos'

interface ExportRow {
  codigo: string
  tipo: string
  nombre: string
  departamento: string
  costo_usd: number
  precio_venta_usd: number
  precio_mayor_usd: number | null
  stock: number
  stock_minimo: number
  medida: string
  activo: string
}

function buildRows(productos: Producto[], departamentos: Departamento[]): ExportRow[] {
  const depMap = new Map<string, string>()
  for (const d of departamentos) depMap.set(d.id, d.codigo)

  return productos.map((p) => ({
    codigo: p.codigo,
    tipo: p.tipo === 'P' ? 'Producto' : 'Servicio',
    nombre: p.nombre,
    departamento: depMap.get(p.departamento_id) ?? '',
    costo_usd: parseFloat(p.costo_usd),
    precio_venta_usd: parseFloat(p.precio_venta_usd),
    precio_mayor_usd: p.precio_mayor_usd ? parseFloat(p.precio_mayor_usd) : null,
    stock: parseFloat(p.stock),
    stock_minimo: parseFloat(p.stock_minimo),
    medida: p.medida,
    activo: p.activo === 1 ? 'Si' : 'No',
  }))
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
  departamentos: Departamento[]
) {
  const rows = buildRows(productos, departamentos)
  const headers = [
    'codigo',
    'tipo',
    'nombre',
    'departamento',
    'costo_usd',
    'precio_venta_usd',
    'precio_mayor_usd',
    'stock',
    'stock_minimo',
    'medida',
    'activo',
  ]

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => escape(r[h as keyof ExportRow])).join(',')
    ),
  ]

  // BOM para compatibilidad con Excel (caracteres especiales)
  const csv = '\uFEFF' + csvLines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const fecha = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `inventario_${fecha}.csv`)
}

export function exportarProductosExcel(
  productos: Producto[],
  departamentos: Departamento[]
) {
  const rows = buildRows(productos, departamentos)

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'codigo',
      'tipo',
      'nombre',
      'departamento',
      'costo_usd',
      'precio_venta_usd',
      'precio_mayor_usd',
      'stock',
      'stock_minimo',
      'medida',
      'activo',
    ],
  })

  // Anchos de columnas
  worksheet['!cols'] = [
    { wch: 14 }, // codigo
    { wch: 10 }, // tipo
    { wch: 32 }, // nombre
    { wch: 14 }, // departamento
    { wch: 12 }, // costo
    { wch: 14 }, // precio_venta
    { wch: 14 }, // precio_mayor
    { wch: 10 }, // stock
    { wch: 14 }, // stock_minimo
    { wch: 8 }, // medida
    { wch: 8 }, // activo
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario')

  const excelBuffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  })
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fecha = new Date().toISOString().slice(0, 10)
  triggerDownload(blob, `inventario_${fecha}.xlsx`)
}
