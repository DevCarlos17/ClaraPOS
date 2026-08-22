import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import {
  buildUnsetOtrosPrincipalesQuery,
  debeBloquearQuitarUltimoPrincipal,
  debeForzarPrincipalUnico,
} from '@/features/inventario/lib/deposito-principal'

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
 *
 * Ademas aplica "deposito activo unico debe ser principal": si `es_principal`
 * viene en `false` Y no existe NINGUN otro deposito activo de la empresa
 * (este seria el unico), se RECHAZA fail-fast, antes de abrir la transaccion,
 * sin escribir nada. Si `es_principal=true`, esta condicion nunca puede
 * bloquear, por lo que ni siquiera se consulta el conteo. Ver
 * `debeForzarPrincipalUnico` para el detalle de la decision.
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

  if (!data.es_principal) {
    const otrosRows = await db.getAll<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM depositos WHERE empresa_id = ? AND is_active = 1',
      [data.empresa_id]
    )
    const otrosActivosCount = Number(otrosRows[0]?.cnt ?? 0)

    if (
      debeForzarPrincipalUnico({
        otrosActivosCount,
        quedaraActivo: true,
        esPrincipalFalse: true,
      })
    ) {
      throw new Error('El único depósito activo de la empresa debe ser principal.')
    }
  }

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
 * Ademas aplica "al menos uno" (at-least-one): si esta actualizacion le
 * quitaria a este deposito su estado de principal activo (es_principal->false,
 * o is_active->false mientras sigue siendo es_principal=1) Y es actualmente
 * el UNICO deposito principal activo de la empresa, se RECHAZA — fail-fast,
 * antes de abrir la transaccion, sin escribir nada. Ver
 * `debeBloquearQuitarUltimoPrincipal` para el detalle de la decision.
 *
 * Tambien aplica "deposito activo unico debe ser principal" como defensa en
 * profundidad: si el deposito NO es actualmente el principal activo pero
 * queda activo y se reconfirma/establece `es_principal=false` sin que exista
 * ningun otro deposito activo de la empresa, tambien se RECHAZA fail-fast.
 * Ver `debeForzarPrincipalUnico`.
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

  // Pre-check fuera de la tx (fail-fast, mismo patron que el dup-check de
  // `crearCompra`): solo consultamos el estado actual cuando la actualizacion
  // PODRIA quitarle a este deposito su estado de principal activo.
  const podriaQuitarPrincipal = data.es_principal === false || data.is_active === false
  if (podriaQuitarPrincipal) {
    const actualRows = await db.getAll<{
      empresa_id: string
      es_principal: number
      is_active: number
    }>('SELECT empresa_id, es_principal, is_active FROM depositos WHERE id = ?', [id])
    const actual = actualRows[0]

    if (actual) {
      empresaId = actual.empresa_id
      const esPrincipalActivoActual = actual.es_principal === 1 && actual.is_active === 1
      const seEstaQuitando =
        data.es_principal === false || (data.is_active === false && actual.es_principal === 1)
      const podriaDejarActivoSinPrincipal =
        data.es_principal === false && data.is_active !== false && actual.is_active === 1

      if (esPrincipalActivoActual && seEstaQuitando) {
        const otrosRows = await db.getAll<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 AND id != ?',
          [empresaId, id]
        )
        const existeOtroPrincipalActivo = Number(otrosRows[0]?.cnt ?? 0) > 0

        if (
          debeBloquearQuitarUltimoPrincipal({
            esPrincipalActivoActual,
            seEstaQuitando,
            existeOtroPrincipalActivo,
          })
        ) {
          throw new Error(
            'Debe existir al menos un deposito principal. Marca otro deposito como principal antes de quitar este.'
          )
        }
      } else if (podriaDejarActivoSinPrincipal) {
        const otrosRows = await db.getAll<{ cnt: number }>(
          'SELECT COUNT(*) as cnt FROM depositos WHERE empresa_id = ? AND is_active = 1 AND id != ?',
          [empresaId, id]
        )
        const otrosActivosCount = Number(otrosRows[0]?.cnt ?? 0)

        if (
          debeForzarPrincipalUnico({
            otrosActivosCount,
            quedaraActivo: true,
            esPrincipalFalse: true,
          })
        ) {
          throw new Error('El único depósito activo de la empresa debe ser principal.')
        }
      }
    }
  }

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
