import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { useCurrentUser } from '@/core/hooks/use-current-user'

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
  | 'AGENDADA'
  | 'REPROGRAMADA'
  | 'STATUS_CHANGE'
  | 'CANCELADA'
  | 'PAGADA'
  | 'NO_SHOW'
  | 'MINI_POS_ADD'
  | 'SOBRETURNO_AUTORIZADO'
  | 'BLOQUEO_ADMIN'
  | 'INVASION_DESCANSO'
  | 'REUBICACION_POR_BLOQUEO'

export function useCitaLog(citaId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    citaId && empresaId
      ? 'SELECT * FROM cita_log WHERE cita_id = ? AND empresa_id = ? ORDER BY created_at DESC'
      : '',
    citaId && empresaId ? [citaId, empresaId] : []
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
