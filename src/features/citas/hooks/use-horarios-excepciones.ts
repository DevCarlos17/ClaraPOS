import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export type TipoExcepcion = 'DIA_LIBRE' | 'HORARIO_MODIFICADO' | 'BLOQUEO_EMERGENCIA'

export interface HorarioExcepcion {
  id: string
  empresa_id: string
  usuario_id: string
  fecha: string
  tipo: TipoExcepcion
  hora_inicio: string | null
  hora_fin: string | null
  motivo: string | null
  created_at: string
  created_by: string | null
}

export function useExcepcionesPorUsuario(usuarioId: string, mes?: string) {
  const { data, isLoading } = useQuery(
    usuarioId && mes
      ? 'SELECT * FROM horarios_excepciones WHERE usuario_id = ? AND fecha LIKE ? ORDER BY fecha'
      : usuarioId
      ? 'SELECT * FROM horarios_excepciones WHERE usuario_id = ? ORDER BY fecha DESC'
      : '',
    usuarioId && mes ? [usuarioId, `${mes}%`] : usuarioId ? [usuarioId] : []
  )
  return { excepciones: (data ?? []) as HorarioExcepcion[], isLoading }
}

export async function crearExcepcion(data: {
  usuarioId: string
  empresaId: string
  fecha: string
  tipo: TipoExcepcion
  horaInicio?: string
  horaFin?: string
  motivo?: string
  creadoPor: string
}) {
  await db.writeTransaction(async (tx) => {
    // Eliminar excepcion preexistente para ese dia
    await tx.execute(
      'DELETE FROM horarios_excepciones WHERE usuario_id = ? AND empresa_id = ? AND fecha = ?',
      [data.usuarioId, data.empresaId, data.fecha]
    )
    await tx.execute(
      `INSERT INTO horarios_excepciones (id, empresa_id, usuario_id, fecha, tipo, hora_inicio, hora_fin, motivo, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        data.empresaId,
        data.usuarioId,
        data.fecha,
        data.tipo,
        data.horaInicio ?? null,
        data.horaFin ?? null,
        data.motivo ?? null,
        localNow(),
        data.creadoPor,
      ]
    )
  })
}

export async function eliminarExcepcion(excepcionId: string) {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM horarios_excepciones WHERE id = ?', [excepcionId])
  })
}
