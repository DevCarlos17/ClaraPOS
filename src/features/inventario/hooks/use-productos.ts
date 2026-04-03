import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { v4 as uuidv4 } from 'uuid'

export interface Producto {
  id: string
  codigo: string
  tipo: string
  nombre: string
  departamento_id: string
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string | null
  stock: string
  stock_minimo: string
  medida: string
  activo: number
  created_at: string
  updated_at: string
}

export function useProductos() {
  const { data, isLoading } = useQuery('SELECT * FROM productos ORDER BY nombre ASC')
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useProductosActivos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM productos WHERE activo = 1 ORDER BY nombre ASC'
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useProductosTipo(tipo: 'P' | 'S') {
  const { data, isLoading } = useQuery(
    'SELECT * FROM productos WHERE tipo = ? AND activo = 1 ORDER BY nombre ASC',
    [tipo]
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useResumenInventario() {
  const { data: productos } = useQuery(
    'SELECT costo_usd, stock, stock_minimo, tipo FROM productos WHERE activo = 1'
  )

  const items = (productos ?? []) as { costo_usd: string; stock: string; stock_minimo: string; tipo: string }[]

  const valorTotal = items
    .filter((p) => p.tipo === 'P')
    .reduce((sum, p) => sum + parseFloat(p.stock) * parseFloat(p.costo_usd), 0)

  const stockCritico = items.filter(
    (p) => p.tipo === 'P' && parseFloat(p.stock) < parseFloat(p.stock_minimo) && parseFloat(p.stock_minimo) > 0
  ).length

  return { valorTotal, stockCritico }
}

export async function crearProducto(data: {
  codigo: string
  tipo: string
  nombre: string
  departamento_id: string
  costo_usd: number
  precio_venta_usd: number
  precio_mayor_usd: number | null
  stock_minimo: number
  medida: string
}) {
  const id = uuidv4()
  const now = new Date().toISOString()
  const isServicio = data.tipo === 'S'

  await kysely
    .insertInto('productos')
    .values({
      id,
      codigo: data.codigo.toUpperCase(),
      tipo: data.tipo,
      nombre: data.nombre.toUpperCase(),
      departamento_id: data.departamento_id,
      costo_usd: data.costo_usd.toFixed(2),
      precio_venta_usd: data.precio_venta_usd.toFixed(2),
      precio_mayor_usd: data.precio_mayor_usd?.toFixed(2) ?? null,
      stock: '0.000',
      stock_minimo: isServicio ? '0.000' : data.stock_minimo.toFixed(3),
      medida: data.medida,
      activo: 1,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarProducto(
  id: string,
  data: {
    nombre?: string
    departamento_id?: string
    costo_usd?: number
    precio_venta_usd?: number
    precio_mayor_usd?: number | null
    stock_minimo?: number
    medida?: string
    activo?: boolean
    tipo?: string
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.departamento_id !== undefined) updates.departamento_id = data.departamento_id
  if (data.costo_usd !== undefined) updates.costo_usd = data.costo_usd.toFixed(2)
  if (data.precio_venta_usd !== undefined) updates.precio_venta_usd = data.precio_venta_usd.toFixed(2)
  if (data.precio_mayor_usd !== undefined) updates.precio_mayor_usd = data.precio_mayor_usd?.toFixed(2) ?? null
  if (data.stock_minimo !== undefined) updates.stock_minimo = data.stock_minimo.toFixed(3)
  if (data.medida !== undefined) updates.medida = data.medida
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  // Si cambia a servicio, limpiar stock
  if (data.tipo === 'S') {
    updates.stock = '0.000'
    updates.stock_minimo = '0.000'
  }

  await kysely.updateTable('productos').set(updates).where('id', '=', id).execute()
}
