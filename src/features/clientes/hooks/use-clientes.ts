import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow, VE_OFFSET } from '@/lib/dates'

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
  moneda_pago: string | null
  monto_moneda: string | null
  tasa_pago: string | null
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
      ? 'SELECT * FROM movimientos_cuenta WHERE empresa_id = ? AND cliente_id = ? ORDER BY fecha DESC, created_at DESC, rowid DESC'
      : '',
    clienteId ? [empresaId, clienteId] : []
  )
  return { movimientos: (data ?? []) as MovimientoCuenta[], isLoading }
}

export interface RangoFechaMovimientos {
  fechaDesde: string
  fechaHasta: string
}

/**
 * Normaliza `movimientos_cuenta.fecha` para que SQLite `datetime()` pueda
 * parsearla. Postgres/PowerSync guardan el timestamptz con offset UTC de 2
 * digitos SIN dos puntos (ej: `2026-09-10 15:06:42.788+00`). SQLite NO sabe
 * parsear el offset `+00` (espera `+00:00` o `Z`) y `datetime()` retorna
 * NULL — y toda comparacion contra NULL es `false`, devolviendo 0 filas
 * aunque el movimiento exista (bug real de QA: cliente con saldo pero "Sin
 * movimientos"). Reemplazar `+00` por `Z` lo vuelve parseable. Read-side
 * only: NO altera como se escribe `fecha` (localNow / write-sites intactos).
 */
const FECHA_NORMALIZADA = "replace(fecha, '+00', 'Z')"

/**
 * Constructor PURO del SQL de `useMovimientosClienteFiltrados` (Design
 * §Root Cause). Rango de fecha SIEMPRE requerido, comparado via
 * `datetime(replace(fecha,'+00','Z')) >= datetime(? || 'T00:00:00' || VE_OFFSET)`
 * — mismo patron que `kardex-sql.ts`/`notas-credito-admin-filters.ts` pero
 * normalizando el offset (ver `FECHA_NORMALIZADA`) — en vez de comparacion de
 * string directa, para que el bound sea correcto sin importar el offset
 * literal guardado en cada fila. NUNCA lleva `LIMIT`: el estado de cuenta
 * renderiza TODAS las filas del rango activo (Spec: "Renders all fetched
 * movements" — el conteo del header MUST igualar las filas renderizadas).
 */
export function buildMovimientosClienteFiltro(
  empresaId: string,
  clienteId: string,
  rango: RangoFechaMovimientos
): { sql: string; params: unknown[] } {
  const sql = `SELECT * FROM movimientos_cuenta
     WHERE empresa_id = ? AND cliente_id = ?
       AND datetime(${FECHA_NORMALIZADA}) >= datetime(? || 'T00:00:00${VE_OFFSET}')
       AND datetime(${FECHA_NORMALIZADA}) <= datetime(? || 'T23:59:59${VE_OFFSET}')
     ORDER BY fecha DESC, created_at DESC, rowid DESC`

  return { sql, params: [empresaId, clienteId, rango.fechaDesde, rango.fechaHasta] }
}

/**
 * Movimientos de un cliente en un rango de fecha (siempre requerido — el
 * llamador aplica el default de mes-actual, `startOfMonth()`/`todayStr()`).
 * Unica fuente de verdad para el estado de cuenta: el header del conteo debe
 * derivar de `movimientos.length` sobre este mismo array, nunca de una
 * segunda query independiente (Design §Root Cause).
 */
export function useMovimientosClienteFiltrados(
  clienteId: string | undefined,
  rango: RangoFechaMovimientos
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { sql, params } = clienteId
    ? buildMovimientosClienteFiltro(empresaId, clienteId, rango)
    : { sql: '', params: [] }

  const { data, isLoading } = useQuery(sql, params)
  return { movimientos: (data ?? []) as MovimientoCuenta[], isLoading }
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
