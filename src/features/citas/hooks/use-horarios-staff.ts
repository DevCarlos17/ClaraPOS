import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { Cita } from './use-citas'

export interface HorarioStaff {
  id: string
  empresa_id: string
  usuario_id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  is_active: number
  created_at: string
  updated_at: string
}

export interface SlotDisponible {
  horaInicio: string
  horaFin: string
  disponible: boolean
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

export function getNombreDia(diaSemana: number): string {
  return DIAS[diaSemana] ?? ''
}

// ============================================================
// QUERIES
// ============================================================

export function useHorariosStaff() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM horarios_staff WHERE empresa_id = ? ORDER BY usuario_id, dia_semana',
    [empresaId]
  )
  return { horarios: (data ?? []) as HorarioStaff[], isLoading }
}

export function useHorariosProfesional(usuarioId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    usuarioId
      ? 'SELECT * FROM horarios_staff WHERE empresa_id = ? AND usuario_id = ? ORDER BY dia_semana'
      : '',
    usuarioId ? [empresaId, usuarioId] : []
  )
  return { horarios: (data ?? []) as HorarioStaff[], isLoading }
}

// Calcula los slots disponibles para un profesional en una fecha dada
// cruzando horarios_staff con citas existentes
export function useSlotsDisponibles(
  profesionalId: string,
  fecha: string,
  citasExistentes: Cita[],
  duracionSlotMin = 30
): SlotDisponible[] {
  const { horarios } = useHorariosProfesional(profesionalId)

  if (!fecha || !profesionalId) return []

  const diaSemana = new Date(fecha + 'T12:00:00').getDay()
  const horarioDia = horarios.find(
    (h) => h.dia_semana === diaSemana && h.is_active === 1
  )

  if (!horarioDia) return []

  const slots: SlotDisponible[] = []
  const [hIni, mIni] = horarioDia.hora_inicio.split(':').map(Number)
  const [hFin, mFin] = horarioDia.hora_fin.split(':').map(Number)

  let minutosActual = hIni * 60 + mIni
  const minutosFin = hFin * 60 + mFin

  // Citas del profesional en la fecha
  const citasDelDia = citasExistentes.filter((c) => {
    if (c.profesional_id !== profesionalId) return false
    return c.fecha_inicio.startsWith(fecha)
  })

  while (minutosActual + duracionSlotMin <= minutosFin) {
    const hSlot = Math.floor(minutosActual / 60)
    const mSlot = minutosActual % 60
    const hSlotFin = Math.floor((minutosActual + duracionSlotMin) / 60)
    const mSlotFin = (minutosActual + duracionSlotMin) % 60

    const horaInicio = `${String(hSlot).padStart(2, '0')}:${String(mSlot).padStart(2, '0')}`
    const horaFin = `${String(hSlotFin).padStart(2, '0')}:${String(mSlotFin).padStart(2, '0')}`

    // Verificar si el slot esta ocupado
    const slotInicioMs = new Date(`${fecha}T${horaInicio}:00`).getTime()
    const slotFinMs = new Date(`${fecha}T${horaFin}:00`).getTime()

    const ocupado = citasDelDia.some((c) => {
      if (c.cita_status === 'CANCELADA') return false
      const citaIni = new Date(c.fecha_inicio).getTime()
      const citaFin = new Date(c.fecha_fin).getTime()
      return slotInicioMs < citaFin && slotFinMs > citaIni
    })

    slots.push({ horaInicio, horaFin, disponible: !ocupado })
    minutosActual += duracionSlotMin
  }

  return slots
}

// ============================================================
// MUTACIONES
// ============================================================

export async function guardarHorariosProfesional(
  profesionalId: string,
  empresaId: string,
  horarios: Array<{
    diaSemana: number
    horaInicio: string
    horaFin: string
    isActive: boolean
    tiempoPreparacionMin?: number
  }>
) {
  const now = localNow()

  await kysely.transaction().execute(async (trx) => {
    for (const h of horarios) {
      // Upsert: update si existe, insert si no (preserva el id y los descansos)
      const existing = await trx
        .selectFrom('horarios_staff')
        .select('id')
        .where('empresa_id', '=', empresaId)
        .where('usuario_id', '=', profesionalId)
        .where('dia_semana', '=', h.diaSemana)
        .executeTakeFirst()

      if (existing) {
        await trx
          .updateTable('horarios_staff')
          .set({
            hora_inicio: h.horaInicio,
            hora_fin: h.horaFin,
            is_active: h.isActive ? 1 : 0,
            tiempo_preparacion_min: h.tiempoPreparacionMin ?? 0,
            updated_at: now,
          })
          .where('id', '=', existing.id)
          .execute()
      } else {
        await trx
          .insertInto('horarios_staff')
          .values({
            id: uuidv4(),
            empresa_id: empresaId,
            usuario_id: profesionalId,
            dia_semana: h.diaSemana,
            hora_inicio: h.horaInicio,
            hora_fin: h.horaFin,
            is_active: h.isActive ? 1 : 0,
            tiempo_preparacion_min: h.tiempoPreparacionMin ?? 0,
            cruza_medianoche: 0,
            created_at: now,
            updated_at: now,
          })
          .execute()
      }
    }
  })
}

export async function actualizarHorario(
  horarioId: string,
  data: { horaInicio?: string; horaFin?: string; isActive?: boolean }
) {
  const updates: Record<string, unknown> = { updated_at: localNow() }
  if (data.horaInicio !== undefined) updates.hora_inicio = data.horaInicio
  if (data.horaFin !== undefined) updates.hora_fin = data.horaFin
  if (data.isActive !== undefined) updates.is_active = data.isActive ? 1 : 0

  await kysely
    .updateTable('horarios_staff')
    .set(updates)
    .where('id', '=', horarioId)
    .execute()
}
