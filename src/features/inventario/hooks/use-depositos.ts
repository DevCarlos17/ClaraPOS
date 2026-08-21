import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { buildUnsetOtrosPrincipalesQuery } from '@/features/inventario/lib/deposito-principal'

export interface Deposito {
  id: string
  empresa_id: string
  nombre: string
  direccion: string | null
  es_principal: number
  permite_venta: number
  is_active: number
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export function useDepositos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM depositos WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { depositos: (data ?? []) as Deposito[], isLoading }
}

export function useDepositosActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM depositos WHERE empresa_id = ? AND is_active = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { depositos: (data ?? []) as Deposito[], isLoading }
}

/**
 * Depositos activos que ademas permiten venta (permite_venta = 1).
 * Usar en formularios donde el deposito seleccionado debe habilitar ventas,
 * como la caja (Validacion 3: caja.deposito_id debe apuntar a un deposito
 * con permite_venta = true).
 */
export function useDepositosVentaActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM depositos WHERE empresa_id = ? AND is_active = 1 AND permite_venta = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  return { depositos: (data ?? []) as Deposito[], isLoading }
}

/**
 * Crea un deposito. Si `es_principal=true`, desmarca (dentro de la MISMA
 * `writeTransaction`) cualquier OTRO deposito principal de la empresa antes
 * de insertar, para garantizar la invariante "a lo sumo un es_principal por
 * empresa" de forma atomica (nunca hay una ventana con 0 o 2+ principales).
 * Ver `buildUnsetOtrosPrincipalesQuery` para el detalle de la query.
 */
export async function crearDeposito(data: {
  nombre: string
  direccion?: string
  es_principal: boolean
  permite_venta: boolean
  empresa_id: string
  created_by?: string
}) {
  const id = uuidv4()
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    if (data.es_principal) {
      const { sql, params } = buildUnsetOtrosPrincipalesQuery(data.empresa_id, now)
      await tx.execute(sql, params)
    }

    await tx.execute(
      `INSERT INTO depositos
         (id, nombre, direccion, es_principal, permite_venta, is_active, empresa_id, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        id,
        data.nombre.toUpperCase(),
        data.direccion ?? null,
        data.es_principal ? 1 : 0,
        data.permite_venta ? 1 : 0,
        data.empresa_id,
        now,
        now,
        data.created_by ?? null,
      ]
    )
  })

  return id
}

/**
 * Actualiza un deposito. Si `es_principal` pasa a `true`, desmarca (dentro
 * de la MISMA `writeTransaction`) los OTROS depositos principales de la
 * empresa antes de actualizar este, para preservar la misma invariante que
 * `crearDeposito`. El `empresa_id` se pre-lee fuera de la transaccion (mismo
 * patron que el resto del codebase — ver `crearCompra`) porque el caller solo
 * pasa el `id` del deposito, no su `empresa_id`.
 *
 * NOTA (flag para el usuario): esto implementa "a lo sumo uno" (at-most-one).
 * NO fuerza "al menos uno" — si el unico deposito principal de una empresa se
 * desmarca (es_principal=false), la empresa queda sin principal y el fallback
 * de `resolveDepositoIngreso`/`resolveDepositoEgresoVenta` deja de tener un
 * candidato via ese camino. Si se quiere esa garantia adicional, es una
 * decision de UX/negocio separada (bloquear el desmarcado del ultimo
 * principal, o auto-promover otro deposito) — no implementada aqui a proposito.
 */
export async function actualizarDeposito(
  id: string,
  data: {
    nombre?: string
    direccion?: string
    es_principal?: boolean
    permite_venta?: boolean
    is_active?: boolean
    updated_by?: string
  }
) {
  const now = localNow()
  const updates: Record<string, unknown> = { updated_at: now }

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.direccion !== undefined) updates.direccion = data.direccion
  if (data.es_principal !== undefined) updates.es_principal = data.es_principal ? 1 : 0
  if (data.permite_venta !== undefined) updates.permite_venta = data.permite_venta ? 1 : 0
  if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0
  if (data.updated_by !== undefined) updates.updated_by = data.updated_by

  let empresaId: string | undefined
  if (data.es_principal === true) {
    const rows = await db.getAll<{ empresa_id: string }>(
      'SELECT empresa_id FROM depositos WHERE id = ?',
      [id]
    )
    empresaId = rows[0]?.empresa_id
  }

  const setClauses = Object.keys(updates)
    .map((key) => `${key} = ?`)
    .join(', ')
  const setValues = Object.values(updates)

  await db.writeTransaction(async (tx) => {
    if (data.es_principal === true && empresaId) {
      const { sql, params } = buildUnsetOtrosPrincipalesQuery(empresaId, now, id)
      await tx.execute(sql, params)
    }

    await tx.execute(`UPDATE depositos SET ${setClauses} WHERE id = ?`, [...setValues, id])
  })
}
