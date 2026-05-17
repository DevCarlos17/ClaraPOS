import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface CitaLogEntry {
  id: string
  cita_id: string
  usuario_id: string
  accion: string
  datos_anteriores: string | null
  datos_nuevos: string | null
  created_at: string
}

export type CitaLogAccion =
  | 'STATUS_CHANGE'
  | 'DRAG_AND_DROP'
  | 'MODAL_REPROGRAMAR'
  | 'MINI_POS_ADD'
  | 'FINANCE_STATUS_CHANGE'
  | 'CANCELAR'

export function useCitaLog(citaId: string) {
  const { data, isLoading } = useQuery(
    citaId
      ? 'SELECT * FROM cita_log WHERE cita_id = ? ORDER BY created_at DESC'
      : '',
    citaId ? [citaId] : []
  )
  return { log: (data ?? []) as CitaLogEntry[], isLoading }
}

export async function registrarCitaLog(data: {
  empresaId: string
  citaId: string
  usuarioId: string
  accion: CitaLogAccion
  datosAnteriores?: Record<string, unknown>
  datosNuevos?: Record<string, unknown>
}) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO cita_log (id, empresa_id, cita_id, usuario_id, accion, datos_anteriores, datos_nuevos, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        data.empresaId,
        data.citaId,
        data.usuarioId,
        data.accion,
        data.datosAnteriores ? JSON.stringify(data.datosAnteriores) : null,
        data.datosNuevos ? JSON.stringify(data.datosNuevos) : null,
        localNow(),
      ]
    )
  })
}
