import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type {
  ServicioWizardEnhanced,
  PagoWizard,
  CheckoutTipo,
  PrioridadFiltro,
  AsignacionPersonal,
} from '@/stores/cita-wizard-store'
import { crearVenta, type LineaVenta, type PagoEntry } from '@/features/ventas/hooks/use-ventas'
import { registrarCitaLog } from './use-cita-log'

export type CitaOperStatus = 'RESERVADA' | 'EN_PROCESO' | 'REALIZADA' | 'CANCELADA' | 'NO_SHOW'
export type CitaFinanceStatus = 'PENDIENTE' | 'ABONADO' | 'PAGADO' | 'NULO'

export interface Cita {
  id: string
  empresa_id: string
  cliente_id: string
  profesional_id: string
  fecha_inicio: string
  fecha_fin: string
  duracion_min: number
  cita_status: CitaOperStatus
  finance_status: CitaFinanceStatus
  checkout_tipo: CheckoutTipo
  total_usd: string
  tasa: string
  total_bs: string
  venta_id: string | null
  notas: string | null
  observaciones: string | null
  color: string | null
  google_event_id: string | null
  timestamp_inicio: string | null
  timestamp_fin: string | null
  duracion_real_min: number | null
  desviacion_min: number | null
  ejecucion_paralela: number
  prioridad_filtro: string | null
  snapshot_en_progreso: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export interface CitaServicio {
  id: string
  cita_id: string
  producto_id: string
  precio_usd: string
  cantidad: string
  duracion_min: number | null
  trabajador_id: string | null
}

export interface CitaTrabajador {
  id: string
  cita_id: string
  cita_servicio_id: string | null
  usuario_id: string
  rol_en_cita: string
  created_at: string
}

// ============================================================
// QUERIES
// ============================================================

export function useCitas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM citas WHERE empresa_id = ? ORDER BY fecha_inicio DESC',
    [empresaId]
  )
  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasDelDia(fecha: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const diaInicio = `${fecha}T00:00:00.000Z`
  const diaFin = `${fecha}T23:59:59.999Z`

  const { data, isLoading } = useQuery(
    fecha
      ? 'SELECT * FROM citas WHERE empresa_id = ? AND fecha_inicio >= ? AND fecha_inicio <= ? ORDER BY fecha_inicio ASC'
      : '',
    fecha ? [empresaId, diaInicio, diaFin] : []
  )
  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasRango(inicio: string, fin: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const enabled = !!(inicio && fin)

  const { data, isLoading } = useQuery(
    enabled
      ? `SELECT * FROM citas WHERE empresa_id = ?
         AND REPLACE(fecha_inicio, ' ', 'T') >= ?
         AND REPLACE(fecha_inicio, ' ', 'T') <= ?
         ORDER BY fecha_inicio ASC`
      : '',
    enabled ? [empresaId, inicio, fin] : []
  )

  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasPorProfesional(profesionalId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    profesionalId
      ? 'SELECT * FROM citas WHERE empresa_id = ? AND profesional_id = ? ORDER BY fecha_inicio DESC'
      : '',
    profesionalId ? [empresaId, profesionalId] : []
  )
  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasPorCitaStatus(status: CitaOperStatus | CitaOperStatus[]) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const statuses = Array.isArray(status) ? status : [status]
  const placeholders = statuses.map(() => '?').join(',')

  const { data, isLoading } = useQuery(
    `SELECT * FROM citas WHERE empresa_id = ? AND cita_status IN (${placeholders}) ORDER BY fecha_inicio ASC`,
    [empresaId, ...statuses]
  )
  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasHoy() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const hoy = new Date()
  const diaInicio = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}T00:00:00.000Z`
  const diaFin = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}T23:59:59.999Z`

  const { data, isLoading } = useQuery(
    'SELECT * FROM citas WHERE empresa_id = ? AND fecha_inicio >= ? AND fecha_inicio <= ? ORDER BY fecha_inicio ASC',
    [empresaId, diaInicio, diaFin]
  )
  return { citas: (data ?? []) as Cita[], isLoading }
}

export function useCitasServicios(citaId: string) {
  const { data, isLoading } = useQuery(
    citaId ? 'SELECT * FROM citas_servicios WHERE cita_id = ?' : '',
    citaId ? [citaId] : []
  )
  return { servicios: (data ?? []) as CitaServicio[], isLoading }
}

export function useCitaTrabajadores(citaId: string) {
  const { data, isLoading } = useQuery(
    citaId ? 'SELECT * FROM cita_trabajadores WHERE cita_id = ?' : '',
    citaId ? [citaId] : []
  )
  return { trabajadores: (data ?? []) as CitaTrabajador[], isLoading }
}

// ============================================================
// MUTACIONES
// ============================================================

export async function crearCita(data: {
  clienteId: string
  profesionalId: string
  fechaInicio: string
  fechaFin: string
  duracionMin: number
  servicios: ServicioWizardEnhanced[]
  checkoutTipo: CheckoutTipo
  totalUsd: number
  tasa: string
  notas?: string
  observaciones?: string
  prioridadFiltro?: PrioridadFiltro
  ejecucionParalela?: boolean
  asignacionPersonal?: AsignacionPersonal[]
  empresaId: string
  userId: string
  pagoData?: PagoWizard
}) {
  const citaId = uuidv4()
  const now = localNow()
  const totalBs = (data.totalUsd * parseFloat(data.tasa)).toFixed(2)

  // --- Validación 1: solapamiento con citas existentes del profesional ---
  const citasSolapadas = await db.getAll<{ id: string }>(
    `SELECT id FROM citas
     WHERE empresa_id = ?
       AND profesional_id = ?
       AND cita_status NOT IN ('CANCELADA', 'NO_SHOW')
       AND fecha_inicio < ?
       AND fecha_fin > ?`,
    [data.empresaId, data.profesionalId, data.fechaFin, data.fechaInicio]
  )
  if (citasSolapadas.length > 0) {
    throw new Error('El profesional ya tiene una cita en ese horario.')
  }

  // --- Validación 2: hora dentro del horario del profesional ---
  const fechaDate = new Date(data.fechaInicio)
  const diaSemana = fechaDate.getDay()
  const horaInicio = data.fechaInicio.substring(11, 16) // HH:MM en UTC — consistente con cómo se guarda
  const horaFin = data.fechaFin.substring(11, 16)

  const horarioProfesional = await db.getAll<{ hora_inicio: string; hora_fin: string }>(
    `SELECT hora_inicio, hora_fin FROM horarios_staff
     WHERE empresa_id = ? AND usuario_id = ? AND dia_semana = ? AND is_active = 1
     LIMIT 1`,
    [data.empresaId, data.profesionalId, diaSemana]
  )
  if (horarioProfesional.length > 0) {
    const { hora_inicio, hora_fin } = horarioProfesional[0]
    if (horaInicio < hora_inicio || horaFin > hora_fin) {
      throw new Error(
        `La cita está fuera del horario del profesional (${hora_inicio} - ${hora_fin}).`
      )
    }
  }

  // Determinar finance_status segun tipo de checkout
  const financeStatus: CitaFinanceStatus =
    data.checkoutTipo === 'POS' ? 'PAGADO' : 'PENDIENTE'

  // 1. Para POS o CREDITO, crear la venta primero
  let ventaId: string | null = null
  if (data.checkoutTipo === 'POS' || data.checkoutTipo === 'CREDITO') {
    const lineas: LineaVenta[] = data.servicios.map((s) => ({
      producto_id: s.productoId,
      cantidad: 1,
      precio_unitario_usd: s.precioUsd,
    }))

    const pagos: PagoEntry[] =
      data.checkoutTipo === 'POS' && data.pagoData
        ? [
            {
              metodo_cobro_id: data.pagoData.metodoCobroId,
              moneda: 'USD' as const,
              monto: data.pagoData.monto,
              referencia: data.pagoData.referencia,
            },
          ]
        : []

    const result = await crearVenta({
      cliente_id: data.clienteId,
      tipo: data.checkoutTipo === 'POS' ? 'CONTADO' : 'CREDITO',
      tasa: parseFloat(data.tasa),
      lineas,
      pagos,
      usuario_id: data.userId,
      empresa_id: data.empresaId,
      sesion_caja_id: null,
    })
    ventaId = result.ventaId
  }

  // 2. Crear cita, citas_servicios y cita_trabajadores en transaccion atomica
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO citas (id, empresa_id, cliente_id, profesional_id, fecha_inicio, fecha_fin,
        duracion_min, cita_status, finance_status, checkout_tipo, total_usd, tasa, total_bs, venta_id,
        notas, observaciones, color, google_event_id, ejecucion_paralela, prioridad_filtro,
        created_at, updated_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        citaId,
        data.empresaId,
        data.clienteId,
        data.profesionalId,
        data.fechaInicio,
        data.fechaFin,
        data.duracionMin,
        'RESERVADA',
        financeStatus,
        data.checkoutTipo,
        data.totalUsd.toFixed(2),
        data.tasa,
        totalBs,
        ventaId,
        data.notas ?? null,
        data.observaciones ?? null,
        null,
        null,
        data.ejecucionParalela ? 1 : 0,
        data.prioridadFiltro ?? null,
        now,
        now,
        data.userId,
        null,
      ]
    )

    for (let i = 0; i < data.servicios.length; i++) {
      const servicio = data.servicios[i]
      const citaServicioId = uuidv4()
      const asignacion = data.asignacionPersonal?.find((a) => a.servicioIdx === i)
      const trabajadorId = asignacion?.trabajadorId ?? null

      await tx.execute(
        `INSERT INTO citas_servicios (id, empresa_id, cita_id, producto_id, precio_usd, cantidad, duracion_min, trabajador_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          citaServicioId,
          data.empresaId,
          citaId,
          servicio.productoId,
          servicio.precioUsd.toFixed(2),
          '1.000',
          servicio.duracionMin,
          trabajadorId,
          now,
        ]
      )

      if (trabajadorId) {
        await tx.execute(
          `INSERT INTO cita_trabajadores (id, empresa_id, cita_id, cita_servicio_id, usuario_id, rol_en_cita, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), data.empresaId, citaId, citaServicioId, trabajadorId, 'EJECUTOR', now]
        )
      }
    }

    // Si no hay asignaciones por servicio pero hay profesional principal, registrarlo
    if (!data.asignacionPersonal?.length && data.profesionalId) {
      await tx.execute(
        `INSERT INTO cita_trabajadores (id, empresa_id, cita_id, cita_servicio_id, usuario_id, rol_en_cita, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), data.empresaId, citaId, null, data.profesionalId, 'EJECUTOR', now]
      )
    }
  })

  void registrarCitaLog({
    empresaId: data.empresaId,
    citaId,
    usuarioId: data.userId,
    accion: 'AGENDADA',
    datosNuevos: {
      fecha_inicio: data.fechaInicio,
      fecha_fin: data.fechaFin,
      profesional_id: data.profesionalId,
      cliente_id: data.clienteId,
      checkout_tipo: data.checkoutTipo,
      finance_status: financeStatus,
    },
  })

  return citaId
}

export async function actualizarCitaStatus(
  citaId: string,
  citaStatus: CitaOperStatus,
  userId: string,
  extra?: {
    financeStatus?: CitaFinanceStatus
    timestampInicio?: string
    timestampFin?: string
    duracionRealMin?: number
    desviacionMin?: number
  }
) {
  const updates: Record<string, unknown> = {
    cita_status: citaStatus,
    updated_at: localNow(),
    updated_by: userId,
  }
  if (extra?.financeStatus !== undefined) updates.finance_status = extra.financeStatus
  if (extra?.timestampInicio !== undefined) updates.timestamp_inicio = extra.timestampInicio
  if (extra?.timestampFin !== undefined) updates.timestamp_fin = extra.timestampFin
  if (extra?.duracionRealMin !== undefined) updates.duracion_real_min = extra.duracionRealMin
  if (extra?.desviacionMin !== undefined) updates.desviacion_min = extra.desviacionMin

  await kysely.updateTable('citas').set(updates).where('id', '=', citaId).execute()
}

export async function actualizarFinanceStatus(
  citaId: string,
  financeStatus: CitaFinanceStatus,
  userId: string
) {
  await kysely
    .updateTable('citas')
    .set({ finance_status: financeStatus, updated_at: localNow(), updated_by: userId })
    .where('id', '=', citaId)
    .execute()
}

export async function cancelarCita(citaId: string, userId: string) {
  await kysely
    .updateTable('citas')
    .set({
      cita_status: 'CANCELADA',
      finance_status: 'NULO',
      updated_at: localNow(),
      updated_by: userId,
    })
    .where('id', '=', citaId)
    .execute()
}

export async function marcarNoShow(citaId: string, userId: string) {
  await kysely
    .updateTable('citas')
    .set({
      cita_status: 'NO_SHOW',
      updated_at: localNow(),
      updated_by: userId,
    })
    .where('id', '=', citaId)
    .execute()
}

export async function iniciarAtencion(citaId: string, userId: string) {
  const now = localNow()
  await kysely
    .updateTable('citas')
    .set({ cita_status: 'EN_PROCESO', timestamp_inicio: now, updated_at: now, updated_by: userId })
    .where('id', '=', citaId)
    .execute()
}

export async function finalizarCita(
  citaId: string,
  userId: string,
  fechaInicio: string,
  duracionEstimadaMin: number
) {
  const now = localNow()
  const inicioMs = new Date(fechaInicio).getTime()
  const finMs = new Date(now).getTime()
  const duracionRealMin = Math.round((finMs - inicioMs) / 60000)
  const desviacionMin = duracionRealMin - duracionEstimadaMin

  await kysely
    .updateTable('citas')
    .set({
      cita_status: 'REALIZADA',
      timestamp_fin: now,
      duracion_real_min: duracionRealMin,
      desviacion_min: desviacionMin,
      updated_at: now,
      updated_by: userId,
    })
    .where('id', '=', citaId)
    .execute()
}

export async function actualizarGoogleEventId(citaId: string, googleEventId: string) {
  await kysely
    .updateTable('citas')
    .set({ google_event_id: googleEventId, updated_at: localNow() })
    .where('id', '=', citaId)
    .execute()
}

export async function vincularVentaCita(
  citaId: string,
  ventaId: string,
  userId: string,
  empresaId: string
) {
  await kysely
    .updateTable('citas')
    .set({
      venta_id: ventaId,
      checkout_tipo: 'POS',
      finance_status: 'PAGADO',
      updated_at: localNow(),
      updated_by: userId,
    })
    .where('id', '=', citaId)
    .execute()

  void registrarCitaLog({
    empresaId,
    citaId,
    usuarioId: userId,
    accion: 'PAGADA',
    datosNuevos: {
      venta_id: ventaId,
      finance_status: 'PAGADO',
      checkout_tipo: 'POS',
    },
  })
}

export async function guardarSnapshot(citaId: string, snapshot: Record<string, unknown>) {
  await kysely
    .updateTable('citas')
    .set({ snapshot_en_progreso: JSON.stringify(snapshot), updated_at: localNow() })
    .where('id', '=', citaId)
    .execute()
}

export async function reprogramarCita(
  citaId: string,
  fechaInicio: string,
  fechaFin: string,
  userId: string,
  options?: { skipOverlapCheck?: boolean }
) {
  if (!options?.skipOverlapCheck) {
    const [citaActual] = await db.getAll<{ empresa_id: string; profesional_id: string }>(
      'SELECT empresa_id, profesional_id FROM citas WHERE id = ?',
      [citaId]
    )
    if (citaActual) {
      const solapadas = await db.getAll<{ id: string }>(
        `SELECT id FROM citas
         WHERE empresa_id = ? AND profesional_id = ? AND id != ?
           AND cita_status NOT IN ('CANCELADA', 'NO_SHOW')
           AND fecha_inicio < ? AND fecha_fin > ?`,
        [citaActual.empresa_id, citaActual.profesional_id, citaId, fechaFin, fechaInicio]
      )
      if (solapadas.length > 0) {
        throw new Error('El profesional ya tiene una cita en ese horario.')
      }
    }
  }

  // Al reprogramar siempre se reactiva a RESERVADA (cubre el caso NO_SHOW → reschedule)
  await db.execute(
    `UPDATE citas
     SET fecha_inicio = ?, fecha_fin = ?, cita_status = 'RESERVADA',
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
    [fechaInicio, fechaFin, localNow(), userId, citaId]
  )
}

export async function reprogramarCitaConProfesional(
  citaId: string,
  fechaInicio: string,
  fechaFin: string,
  profesionalId: string,
  userId: string,
  options?: { skipOverlapCheck?: boolean }
) {
  if (!options?.skipOverlapCheck) {
    const [citaActual] = await db.getAll<{ empresa_id: string }>(
      'SELECT empresa_id FROM citas WHERE id = ?',
      [citaId]
    )
    if (citaActual) {
      const solapadas = await db.getAll<{ id: string }>(
        `SELECT id FROM citas
         WHERE empresa_id = ? AND profesional_id = ? AND id != ?
           AND cita_status NOT IN ('CANCELADA', 'NO_SHOW')
           AND fecha_inicio < ? AND fecha_fin > ?`,
        [citaActual.empresa_id, profesionalId, citaId, fechaFin, fechaInicio]
      )
      if (solapadas.length > 0) {
        throw new Error('El profesional ya tiene una cita en ese horario.')
      }
    }
  }

  // Al reprogramar siempre se reactiva a RESERVADA (cubre el caso NO_SHOW → reschedule)
  await db.execute(
    `UPDATE citas
     SET fecha_inicio = ?, fecha_fin = ?, profesional_id = ?, cita_status = 'RESERVADA',
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
    [fechaInicio, fechaFin, profesionalId, localNow(), userId, citaId]
  )
}
