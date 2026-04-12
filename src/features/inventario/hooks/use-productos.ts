import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface Producto {
  id: string
  codigo: string
  tipo: string
  nombre: string
  departamento_id: string
  marca_id: string | null
  unidad_base_id: string | null
  costo_usd: string
  precio_venta_usd: string
  precio_mayor_usd: string | null
  costo_promedio: string
  costo_ultimo: string
  stock: string
  stock_minimo: string
  tipo_impuesto: string
  maneja_lotes: number
  is_active: number
  created_at: string
  updated_at: string
}

export function useProductos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM productos WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useProductosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM productos WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useProductosTipo(tipo: 'P' | 'S') {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM productos WHERE empresa_id = ? AND tipo = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId, tipo]
  )
  return { productos: (data ?? []) as Producto[], isLoading }
}

export function useResumenInventario() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: productos } = useQuery(
    'SELECT costo_usd, stock, stock_minimo, tipo FROM productos WHERE empresa_id = ? AND is_active = 1',
    [empresaId]
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
  empresa_id: string
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
      costo_promedio: '0.00',
      costo_ultimo: data.costo_usd.toFixed(2),
      tipo_impuesto: 'Exento',
      maneja_lotes: 0,
      is_active: 1,
      empresa_id: data.empresa_id,
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
    tipo_impuesto?: string
    is_active?: boolean
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
  if (data.tipo_impuesto !== undefined) updates.tipo_impuesto = data.tipo_impuesto
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  // Si cambia a servicio, limpiar stock
  if (data.tipo === 'S') {
    updates.stock = '0.000'
    updates.stock_minimo = '0.000'
  }

  await kysely.updateTable('productos').set(updates).where('id', '=', id).execute()
}
