import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { v4 as uuidv4 } from 'uuid'

export interface Cliente {
  id: string
  identificacion: string
  nombre_social: string
  direccion: string | null
  telefono: string | null
  limite_credito: string
  saldo_actual: string
  activo: number
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
}

export function useClientes() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes ORDER BY nombre_social ASC'
  )
  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useClientesActivos() {
  const { data, isLoading } = useQuery(
    'SELECT * FROM clientes WHERE activo = 1 ORDER BY nombre_social ASC'
  )
  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useBuscarClientes(query: string) {
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? 'SELECT * FROM clientes WHERE activo = 1 AND (identificacion LIKE ? OR nombre_social LIKE ?) ORDER BY nombre_social ASC LIMIT 10'
      : '',
    shouldSearch ? [pattern, pattern] : []
  )

  return { clientes: (data ?? []) as Cliente[], isLoading }
}

export function useMovimientosCliente(clienteId: string | undefined) {
  const { data, isLoading } = useQuery(
    clienteId
      ? 'SELECT * FROM movimientos_cuenta WHERE cliente_id = ? ORDER BY fecha DESC'
      : '',
    clienteId ? [clienteId] : []
  )
  return { movimientos: (data ?? []) as MovimientoCuenta[], isLoading }
}

export async function crearCliente(data: {
  identificacion: string
  nombre_social: string
  direccion?: string
  telefono?: string
  limite_credito: number
}) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('clientes')
    .values({
      id,
      identificacion: data.identificacion.toUpperCase(),
      nombre_social: data.nombre_social.toUpperCase(),
      direccion: data.direccion || null,
      telefono: data.telefono || null,
      limite_credito: data.limite_credito.toFixed(2),
      saldo_actual: '0.00',
      activo: 1,
      created_at: now,
      updated_at: now,
    })
    .execute()

  return id
}

export async function actualizarCliente(
  id: string,
  data: {
    nombre_social?: string
    direccion?: string | null
    telefono?: string | null
    limite_credito?: number
    activo?: boolean
  }
) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre_social !== undefined)
    updates.nombre_social = data.nombre_social.toUpperCase()
  if (data.direccion !== undefined) updates.direccion = data.direccion || null
  if (data.telefono !== undefined) updates.telefono = data.telefono || null
  if (data.limite_credito !== undefined)
    updates.limite_credito = data.limite_credito.toFixed(2)
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

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
