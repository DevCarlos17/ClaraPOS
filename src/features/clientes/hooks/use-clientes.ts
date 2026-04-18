import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface Cliente {
  id: string
  identificacion: string
  nombre: string
  direccion: string | null
  telefono: string | null
  limite_credito_usd: string
  saldo_actual: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface MovimientoCuenta {
  id: string
  cliente_id: string
  tipo: string
  referencia: string
  monto: string
  saldo_anterior: string
  saldo_nuevo: string
  observacion: string | null
  venta_id: string | null
  fecha: string
  created_at: string
  created_by: string | null
}

export function useClientes() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useClientesActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useBuscarClientes(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? 'SELECT * FROM clientes WHERE empresa_id = ? AND is_active = 1 AND (identificacion LIKE ? OR nombre LIKE ?) ORDER BY nombre ASC LIMIT 10'
      : '',
    shouldSearch ? [empresaId, pattern, pattern] : []
  )

  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useMovimientosCliente(clienteId: string | undefined) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    clienteId
      ? 'SELECT * FROM movimientos_cuenta WHERE empresa_id = ? AND cliente_id = ? ORDER BY fecha DESC'
      : '',
    clienteId ? [empresaId, clienteId] : []
  )
  return { movimientos: (data ?? []) as MovimientoCuenta[], isLoading }
}

/**
 * Movimientos con filtro de fechas opcional.
 * Sin filtros: devuelve los ultimos 5.
 * Con al menos un filtro de fecha: devuelve todos en el rango (sin limite).
 */
export function useMovimientosClienteFiltrados(
  clienteId: string | undefined,
  opts: { fechaDesde?: string; fechaHasta?: string }
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { fechaDesde, fechaHasta } = opts
  const hasFilter = !!fechaDesde || !!fechaHasta

  // Build SQL and params
  const base = 'SELECT * FROM movimientos_cuenta WHERE empresa_id = ? AND cliente_id = ?'
  let sql = ''
  let params: unknown[] = []

  if (clienteId) {
    sql = base
    params = [empresaId, clienteId]
    if (fechaDesde) {
      sql += ' AND fecha >= ?'
      params.push(fechaDesde)
    }
    if (fechaHasta) {
      sql += ' AND fecha <= ?'
      params.push(`${fechaHasta}T23:59:59`)
    }
    sql += ' ORDER BY fecha DESC'
    if (!hasFilter) sql += ' LIMIT 5'
  }

  const { data, isLoading } = useQuery(sql, params)
  return { movimientos: (data ?? []) as MovimientoCuenta[], isLoading }
}

export function useCountMovimientosCliente(clienteId: string | undefined) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data } = useQuery(
    clienteId
      ? 'SELECT COUNT(*) as total FROM movimientos_cuenta WHERE empresa_id = ? AND cliente_id = ?'
      : '',
    clienteId ? [empresaId, clienteId] : []
  )
  const total = (data?.[0] as { total: number } | undefined)?.total ?? 0
  return { total }
}

export async function crearCliente(data: {
  identificacion: string
  nombre: string
  direccion?: string
  telefono?: string
  limite_credito_usd: number
  empresa_id: string
}) {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('clientes')
    .values({
      id,
      identificacion: data.identificacion.toUpperCase(),
      nombre: data.nombre.toUpperCase(),
      direccion: data.direccion || null,
      telefono: data.telefono || null,
      limite_credito_usd: data.limite_credito_usd.toFixed(2),
      saldo_actual: '0.00',
      es_contribuyente_especial: 0,
      es_agente_retencion_iva: 0,
      es_agente_retencion_islr: 0,
      is_active: 1,
      empresa_id: data.empresa_id,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarCliente(
  id: string,
  data: {
    nombre?: string
    direccion?: string | null
    telefono?: string | null
    limite_credito_usd?: number
    is_active?: boolean
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined)
    updates.nombre = data.nombre.toUpperCase()
  if (data.direccion !== undefined) updates.direccion = data.direccion || null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.limite_credito_usd !== undefined)
    updates.limite_credito_usd = data.limite_credito_usd.toFixed(2)
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0

  await kysely
    .updateTable('clientes')
    .set(updates)
    .where('id', '=', id)
    .execute()
}

export async function tieneMovimientos(clienteId: string): Promise<boolean> {
  const result = await kysely
    .selectFrom('movimientos_cuenta')
    .select(kysely.fn.count('id').as('count'))
    .where('cliente_id', '=', clienteId)
    .executeTakeFirst()

  return Number(result?.count ?? 0) > 0
}
