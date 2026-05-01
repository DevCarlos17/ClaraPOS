import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

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
  ubicacion: string | null
  presentacion: string | null
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

export function useProductosTipo(tipo: 'P' | 'S' | 'C') {
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
  tipo_impuesto?: string
  ubicacion?: string
  unidad_base_id?: string
  maneja_lotes?: boolean
  presentacion?: string
}) {
  const id = uuidv4()
  const now = localNow()
  const isServicioOCombo = data.tipo === 'S' || data.tipo === 'C'

  await kysely
    .insertInto('productos')
    .values({
      id,
      codigo: data.codigo.toUpperCase(),
      tipo: data.tipo,
      nombre: data.nombre.toUpperCase(),
      departamento_id: data.departamento_id,
      costo_usd: isServicioOCombo && data.tipo === 'C' ? '0.00' : data.costo_usd.toFixed(2),
      precio_venta_usd: data.precio_venta_usd.toFixed(2),
      precio_mayor_usd: data.precio_mayor_usd?.toFixed(2) ?? null,
      stock: '0.000',
      stock_minimo: isServicioOCombo ? '0.000' : data.stock_minimo.toFixed(3),
      costo_promedio: '0.00',
      costo_ultimo: isServicioOCombo && data.tipo === 'C' ? '0.00' : data.costo_usd.toFixed(2),
      tipo_impuesto: data.tipo_impuesto ?? 'Exento',
      maneja_lotes: isServicioOCombo ? 0 : (data.maneja_lotes ? 1 : 0),
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
      ubicacion: data.ubicacion?.toUpperCase() || null,
      unidad_base_id: isServicioOCombo ? null : (data.unidad_base_id ?? null),
      presentacion: isServicioOCombo ? null : (data.presentacion?.toUpperCase() || null),
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
    ubicacion?: string | null
    unidad_base_id?: string | null
    maneja_lotes?: boolean
    presentacion?: string | null
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.departamento_id !== undefined) updates.departamento_id = data.departamento_id
  if (data.costo_usd !== undefined) updates.costo_usd = data.costo_usd.toFixed(2)
  if (data.precio_venta_usd !== undefined) updates.precio_venta_usd = data.precio_venta_usd.toFixed(2)
  if (data.precio_mayor_usd !== undefined) updates.precio_mayor_usd = data.precio_mayor_usd?.toFixed(2) ?? null
  if (data.stock_minimo !== undefined) updates.stock_minimo = data.stock_minimo.toFixed(3)
  if (data.tipo_impuesto !== undefined) updates.tipo_impuesto = data.tipo_impuesto
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.ubicacion !== undefined) updates.ubicacion = data.ubicacion ? data.ubicacion.toUpperCase() : null
  if (data.unidad_base_id !== undefined) updates.unidad_base_id = data.unidad_base_id ?? null
  if (data.maneja_lotes !== undefined) updates.maneja_lotes = data.maneja_lotes ? 1 : 0
  if (data.presentacion !== undefined) updates.presentacion = data.presentacion ? data.presentacion.toUpperCase() : null

  // Servicios y Combos no manejan stock ni presentacion fisica
  if (data.tipo === 'S' || data.tipo === 'C') {
    updates.stock = '0.000'
    updates.stock_minimo = '0.000'
    updates.maneja_lotes = 0
    updates.unidad_base_id = null
    updates.presentacion = null
  }

  await kysely.updateTable('productos').set(updates).where('id', '=', id).execute()
}

export async function actualizarCostoCombo(comboId: string, costoTotal: number) {
  const now = localNow()
  await kysely
    .updateTable('productos')
    .set({ costo_usd: costoTotal.toFixed(2), updated_at: now })
    .where('id', '=', comboId)
    .execute()
}
