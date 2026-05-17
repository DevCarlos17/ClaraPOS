import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

export interface HorarioDescanso {
  id: string
  empresa_id: string
  horario_staff_id: string
  hora_inicio: string
  hora_fin: string
  tipo: string
  created_at: string
}

export function useDescansosDeHorario(horarioStaffId: string) {
  const { data, isLoading } = useQuery(
    horarioStaffId
      ? 'SELECT * FROM horarios_descansos WHERE horario_staff_id = ? ORDER BY hora_inicio'
      : '',
    horarioStaffId ? [horarioStaffId] : []
  )
  return { descansos: (data ?? []) as HorarioDescanso[], isLoading }
}

export async function agregarDescanso(data: {
  horarioStaffId: string
  empresaId: string
  horaInicio: string
  horaFin: string
  tipo: string
}) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO horarios_descansos (id, empresa_id, horario_staff_id, hora_inicio, hora_fin, tipo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        data.empresaId,
        data.horarioStaffId,
        data.horaInicio,
        data.horaFin,
        data.tipo,
        localNow(),
      ]
    )
  })
}

export async function eliminarDescanso(descansoId: string) {
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM horarios_descansos WHERE id = ?', [descansoId])
  })
}

export async function actualizarDescanso(
  descansoId: string,
  horaInicio: string,
  horaFin: string,
  tipo: string
) {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE horarios_descansos SET hora_inicio = ?, hora_fin = ?, tipo = ? WHERE id = ?',
      [horaInicio, horaFin, tipo, descansoId]
    )
  })
}
