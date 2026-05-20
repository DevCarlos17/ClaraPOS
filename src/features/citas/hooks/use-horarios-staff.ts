import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { Cita } from './use-citas'
import { useExcepcionesPorUsuario } from './use-horarios-excepciones'
import type { HorarioDescanso } from './use-horarios-descansos'
import { useAgendaConfig } from './use-agenda-config'

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

function timeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Calcula los slots disponibles para un profesional en una fecha dada,
// cruzando horarios_staff, citas existentes, excepciones de horario y descansos.
export function useSlotsDisponibles(
  profesionalId: string,
  fecha: string,
  citasExistentes: Cita[],
  duracionSlotMin = 30
): SlotDisponible[] {
  const { config } = useAgendaConfig()
  const { horarios } = useHorariosProfesional(profesionalId)

  // Excepciones del profesional para el mes de la fecha
  const mes = fecha ? fecha.substring(0, 7) : ''
  const { excepciones } = useExcepcionesPorUsuario(profesionalId, mes || undefined)

  // Descansos de todos los horarios del profesional (filtramos por dia despues)
  const { data: descansosRaw } = useQuery(
    profesionalId
      ? `SELECT hd.* FROM horarios_descansos hd
         INNER JOIN horarios_staff hs ON hd.horario_staff_id = hs.id
         WHERE hs.usuario_id = ? ORDER BY hd.hora_inicio`
      : '',
    profesionalId ? [profesionalId] : []
  )
  const todosDescansos = (descansosRaw ?? []) as HorarioDescanso[]

  if (!fecha || !profesionalId) return []

  const diaSemana = new Date(fecha + 'T12:00:00').getDay()
  const horarioDia = horarios.find(
    (h) => h.dia_semana === diaSemana && h.is_active === 1
  )

  if (!horarioDia) return []

  // Verificar excepcion para esta fecha exacta
  const excepcionDia = excepciones.find((e) => e.fecha === fecha)

  // DIA_LIBRE o BLOQUEO_EMERGENCIA → sin slots disponibles
  if (
    excepcionDia &&
    (excepcionDia.tipo === 'DIA_LIBRE' || excepcionDia.tipo === 'BLOQUEO_EMERGENCIA')
  ) {
    return []
  }

  // HORARIO_MODIFICADO → usar horas de la excepcion
  let horaInicioEfectiva = horarioDia.hora_inicio
  let horaFinEfectiva = horarioDia.hora_fin
  if (
    excepcionDia?.tipo === 'HORARIO_MODIFICADO' &&
    excepcionDia.hora_inicio &&
    excepcionDia.hora_fin
  ) {
    horaInicioEfectiva = excepcionDia.hora_inicio
    horaFinEfectiva = excepcionDia.hora_fin
  }

  const descansosDelDia = todosDescansos.filter(
    (d) => d.horario_staff_id === horarioDia.id
  )

  let minutosActual = timeToMin(horaInicioEfectiva)
  const minutosFin = timeToMin(horaFinEfectiva)

  // Citas del profesional en la fecha
  const citasDelDia = citasExistentes.filter((c) => {
    if (c.profesional_id !== profesionalId) return false
    return c.fecha_inicio.startsWith(fecha)
  })

  const slots: SlotDisponible[] = []

  while (minutosActual + duracionSlotMin <= minutosFin) {
    const horaInicio = minToTime(minutosActual)
    const horaFin = minToTime(minutosActual + duracionSlotMin)

    const slotInicioMs = new Date(`${fecha}T${horaInicio}:00`).getTime()
    const slotFinMs = new Date(`${fecha}T${horaFin}:00`).getTime()

    const ocupado = citasDelDia.some((c) => {
      if (c.cita_status === 'CANCELADA') return false
      const citaIni = new Date(c.fecha_inicio).getTime()
      const citaFin = new Date(c.fecha_fin).getTime()
      return slotInicioMs < citaFin && slotFinMs > citaIni
    })

    const enDescanso =
      !config.permitir_solapamiento_descanso &&
      descansosDelDia.some((d) => {
        const dIni = timeToMin(d.hora_inicio)
        const dFin = timeToMin(d.hora_fin)
        return minutosActual < dFin && minutosActual + duracionSlotMin > dIni
      })

    slots.push({ horaInicio, horaFin, disponible: !ocupado && !enDescanso })
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

  console.group('💾 [guardarHorarios] Iniciando guardado')
  console.log('  profesionalId:', profesionalId)
  console.log('  empresaId:', empresaId)
  console.log('  dias a guardar:', horarios.map(h => `dia${h.diaSemana}:${h.isActive?'✓':'✗'} ${h.horaInicio}-${h.horaFin}`))

  // Leer registros existentes FUERA de la write transaction.
  // Ordenar por created_at ASC: el mas antiguo es el de Supabase (UUID canonico);
  // los mas nuevos son UUIDs locales huerfanos generados en ciclos previos.
  const existingRows = await db.getAll<{ id: string; dia_semana: number }>(
    'SELECT id, dia_semana FROM horarios_staff WHERE empresa_id = ? AND usuario_id = ? ORDER BY created_at ASC',
    [empresaId, profesionalId]
  )
  console.log('  filas existentes en SQLite local:', existingRows.length, existingRows)

  // Deduplicar: por cada dia_semana conservar solo el primero (mas antiguo = Supabase),
  // marcar los duplicados para borrar en la misma transaccion.
  const existingMap = new Map<number, string>()
  const orphanIds: string[] = []
  for (const row of existingRows) {
    if (!existingMap.has(row.dia_semana)) {
      existingMap.set(row.dia_semana, row.id)
    } else {
      orphanIds.push(row.id)
    }
  }
  if (orphanIds.length > 0) {
    console.warn('  ⚠️ UUIDs locales huerfanos a eliminar:', orphanIds)
  }

  // Escribir en writeTransaction para que PowerSync registre las operaciones CRUD
  await db.writeTransaction(async (tx) => {
    // Eliminar filas duplicadas (UUIDs locales que no existen en Supabase)
    for (const id of orphanIds) {
      console.log(`  DELETE huerfano id=${id}`)
      await tx.execute('DELETE FROM horarios_staff WHERE id = ?', [id])
    }

    for (const h of horarios) {
      const existingId = existingMap.get(h.diaSemana)

      if (existingId) {
        console.log(`  UPDATE dia_semana=${h.diaSemana} id=${existingId}`)
        await tx.execute(
          `UPDATE horarios_staff
           SET hora_inicio = ?, hora_fin = ?, is_active = ?, tiempo_preparacion_min = ?, updated_at = ?
           WHERE id = ?`,
          [h.horaInicio, h.horaFin, h.isActive ? 1 : 0, h.tiempoPreparacionMin ?? 0, now, existingId]
        )
      } else {
        const newId = uuidv4()
        console.log(`  INSERT dia_semana=${h.diaSemana} nuevo id=${newId}`)
        await tx.execute(
          `INSERT INTO horarios_staff
             (id, empresa_id, usuario_id, dia_semana, hora_inicio, hora_fin, is_active, tiempo_preparacion_min, cruza_medianoche, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [newId, empresaId, profesionalId, h.diaSemana, h.horaInicio, h.horaFin, h.isActive ? 1 : 0, h.tiempoPreparacionMin ?? 0, now, now]
        )
      }
    }
  })

  console.log('  ✅ writeTransaction completada')

  // VERIFICACION POST-ESCRITURA: confirma que el dato quedo en SQLite local
  const verificacion = await db.getAll<{
    id: string
    dia_semana: number
    hora_inicio: string
    hora_fin: string
    is_active: number
    tiempo_preparacion_min: number
  }>(
    'SELECT id, dia_semana, hora_inicio, hora_fin, is_active, tiempo_preparacion_min FROM horarios_staff WHERE empresa_id = ? AND usuario_id = ? ORDER BY dia_semana',
    [empresaId, profesionalId]
  )
  if (verificacion.length === 0) {
    console.error('  ❌ [VERIFICACION] CRITICO: SQLite local NO tiene filas tras writeTransaction!')
  } else {
    console.log('  📖 [VERIFICACION] SQLite local post-escritura:')
    console.table(verificacion.map(r => ({
      dia: r.dia_semana,
      activo: r.is_active === 1 ? '✓' : '✗',
      entrada: r.hora_inicio,
      salida: r.hora_fin,
      prep_min: r.tiempo_preparacion_min,
      uuid_corto: r.id.slice(0, 8) + '...',
    })))
  }

  console.groupEnd()
}

export async function actualizarHorario(
  horarioId: string,
  data: { horaInicio?: string; horaFin?: string; isActive?: boolean }
) {
  const sets: string[] = ['updated_at = ?']
  const params: unknown[] = [localNow()]

  if (data.horaInicio !== undefined) { sets.push('hora_inicio = ?'); params.push(data.horaInicio) }
  if (data.horaFin !== undefined) { sets.push('hora_fin = ?'); params.push(data.horaFin) }
  if (data.isActive !== undefined) { sets.push('is_active = ?'); params.push(data.isActive ? 1 : 0) }

  params.push(horarioId)

  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `UPDATE horarios_staff SET ${sets.join(', ')} WHERE id = ?`,
      params
    )
  })
}
