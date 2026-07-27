import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface LotePos {
  id: string
  metodo_cobro_id: string
  nro_lote: string
  monto: string
}

// ─── Hook de lectura + agrupacion (live, pre-cierre) ─────────

/**
 * Retorna los lotes POS cargados para una sesion de caja, agrupados por
 * metodo_cobro_id. READ/WRITE: dato de trabajo pre-cierre (no inmutable),
 * se persiste en vivo via agregarLote/actualizarLote/eliminarLote.
 */
export function useLotesPos(sesionCajaId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = sesionCajaId !== '' && empresaId !== ''

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT id, metodo_cobro_id, nro_lote, monto FROM lotes_pos_cuadre
         WHERE empresa_id = ? AND sesion_caja_id = ?
         ORDER BY created_at ASC`
      : '',
    enabled ? [empresaId, sesionCajaId] : []
  )

  // Memoizado por `data`: sin esto se genera una referencia nueva en cada render,
  // lo que dispara un loop infinito en los consumidores que lo usan como dep de
  // useEffect (ej. cuadre-conteo-fisico sincronizando el fisico de metodos POS).
  const lotesPorMetodo = useMemo(
    () =>
      ((data ?? []) as LotePos[]).reduce<Record<string, LotePos[]>>((acc, lote) => {
        if (!acc[lote.metodo_cobro_id]) acc[lote.metodo_cobro_id] = []
        acc[lote.metodo_cobro_id].push(lote)
        return acc
      }, {}),
    [data]
  )

  return { lotesPorMetodo, isLoading }
}

// ─── CRUD (live writes, no bufferizado) ───────────────────────

export async function agregarLote(p: {
  sesionCajaId: string
  metodoCobroId: string
  monedaId: string
  nroLote: string
  monto: number
  empresaId: string
  userId: string
}): Promise<{ id: string }> {
  const id = uuidv4()
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO lotes_pos_cuadre
         (id, empresa_id, sesion_caja_id, metodo_cobro_id, moneda_id, nro_lote, monto,
          created_at, created_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        p.empresaId,
        p.sesionCajaId,
        p.metodoCobroId,
        p.monedaId,
        p.nroLote,
        p.monto.toFixed(4),
        now,
        p.userId,
        now,
      ]
    )
  })

  return { id }
}

export async function actualizarLote(
  id: string,
  p: { nroLote?: string; monto?: number }
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (p.nroLote !== undefined) {
    sets.push('nro_lote = ?')
    values.push(p.nroLote)
  }
  if (p.monto !== undefined) {
    sets.push('monto = ?')
    values.push(p.monto.toFixed(4))
  }
  if (sets.length === 0) return

  sets.push('updated_at = ?')
  values.push(localNow())
  values.push(id)

  await db.writeTransaction(async (tx) => {
    await tx.execute(`UPDATE lotes_pos_cuadre SET ${sets.join(', ')} WHERE id = ?`, values)
  })
}

export async function eliminarLote(id: string): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM lotes_pos_cuadre WHERE id = ?', [id])
  })
}
