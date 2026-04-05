import { useQuery } from '@powersync/react'
import { useEffect, useRef } from 'react'
import { kysely } from '@/core/db/kysely/kysely'
import { db } from '@/core/db/powersync/db'
import { connector } from '@/core/db/powersync/connector'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

export interface PaymentMethod {
  id: string
  nombre: string
  moneda: string
  activo: number
  empresa_id: string
  created_at: string
}

export function usePaymentMethods() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM metodos_pago WHERE empresa_id = ? ORDER BY nombre ASC',
    [empresaId]
  )
  return { methods: (data ?? []) as PaymentMethod[], isLoading }
}

export function useMetodosPagoActivos() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM metodos_pago WHERE empresa_id = ? AND activo = 1 ORDER BY nombre ASC',
    [empresaId]
  )
  const seeded = useRef(false)
  const metodos = (data ?? []) as PaymentMethod[]

  useEffect(() => {
    if (isLoading || metodos.length > 0 || seeded.current || !empresaId) return
    seeded.current = true

    Promise.resolve(
      connector.client
        .from('metodos_pago')
        .select('*')
        .eq('activo', true)
        .eq('empresa_id', empresaId)
        .order('nombre')
    )
      .then(async ({ data: remote }) => {
        if (!remote?.length) return
        try {
          await db.writeTransaction(async (tx) => {
            for (const m of remote) {
              await tx.execute(
                'INSERT INTO metodos_pago (id, nombre, moneda, activo, empresa_id, created_at) VALUES (?, ?, ?, 1, ?, ?)',
                [m.id, m.nombre, m.moneda, empresaId, m.created_at]
              )
            }
          })
        } catch (err) {
          console.warn('[metodos_pago] Error al insertar localmente:', err)
        }
      })
      .catch((err: unknown) => {
        console.warn('[metodos_pago] Error al cargar desde Supabase:', err)
        seeded.current = false
      })
  }, [isLoading, metodos.length, empresaId])

  return { metodos, isLoading }
}

export async function createPaymentMethod(
  name: string,
  currency: string,
  companyId: string
) {
  const id = uuidv4()
  const now = new Date().toISOString()

  await kysely
    .insertInto('metodos_pago')
    .values({
      id,
      nombre: name.toUpperCase(),
      moneda: currency,
      activo: 1,
      empresa_id: companyId,
      created_at: now,
    })
    .execute()

  return id
}

export async function updatePaymentMethod(
  id: string,
  data: { nombre?: string; activo?: boolean }
) {
  const updates: Record<string, unknown> = {}

  if (data.nombre !== undefined) updates.nombre = data.nombre.toUpperCase()
  if (data.activo !== undefined) updates.activo = data.activo ? 1 : 0

  await kysely.updateTable('metodos_pago').set(updates).where('id', '=', id).execute()
}
