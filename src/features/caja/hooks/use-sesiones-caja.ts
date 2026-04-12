import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

// ─── Interfaces ─────────────────────────────────────────────

export interface SesionCaja {
  id: string
  empresa_id: string
  caja_id: string
  usuario_apertura_id: string
  fecha_apertura: string
  monto_apertura_usd: string
  usuario_cierre_id: string | null
  fecha_cierre: string | null
  monto_sistema_usd: string | null
  monto_fisico_usd: string | null
  diferencia_usd: string | null
  observaciones_cierre: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface AbrirSesionParams {
  caja_id: string
  monto_apertura_usd: number
  usuario_id: string
  empresa_id: string
}

export interface CerrarSesionParams {
  monto_fisico_usd: number
  observaciones_cierre?: string
  usuario_cierre_id: string
}

// ─── Hooks de lectura ────────────────────────────────────────

/**
 * Retorna las 20 sesiones mas recientes de la empresa actual.
 */
export function useSesionesCaja() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM sesiones_caja
     WHERE empresa_id = ?
     ORDER BY fecha_apertura DESC
     LIMIT 20`,
    [empresaId]
  )

  return { sesiones: (data ?? []) as SesionCaja[], isLoading }
}

/**
 * Retorna la sesion de caja actualmente abierta (status = 'ABIERTA') de la empresa actual.
 * Retorna null si no hay sesion activa.
 */
export function useSesionActiva() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM sesiones_caja
     WHERE empresa_id = ? AND status = 'ABIERTA'
     ORDER BY fecha_apertura DESC
     LIMIT 1`,
    [empresaId]
  )

  const sesion = ((data ?? []) as SesionCaja[])[0] ?? null

  return { sesion, isLoading }
}

// ─── Funcion: abrirSesionCaja ────────────────────────────────

/**
 * Abre una nueva sesion de caja con status 'ABIERTA'.
 * Retorna el id de la sesion creada.
 */
export async function abrirSesionCaja(params: AbrirSesionParams): Promise<string> {
  const { caja_id, monto_apertura_usd, usuario_id, empresa_id } = params

  if (monto_apertura_usd < 0) {
    throw new Error('El monto de apertura no puede ser negativo')
  }

  const id = uuidv4()
  const now = new Date().toISOString()

  await db.writeTransaction(async (tx) => {
    // Validar que no haya ya una sesion abierta para esta caja
    const existente = await tx.execute(
      `SELECT id FROM sesiones_caja
       WHERE empresa_id = ? AND caja_id = ? AND status = 'ABIERTA'
       LIMIT 1`,
      [empresa_id, caja_id]
    )

    if (existente.rows && existente.rows.length > 0) {
      throw new Error('Ya existe una sesion abierta para esta caja')
    }

    await tx.execute(
      `INSERT INTO sesiones_caja (
         id, empresa_id, caja_id, usuario_apertura_id, fecha_apertura,
         monto_apertura_usd, usuario_cierre_id, fecha_cierre,
         monto_sistema_usd, monto_fisico_usd, diferencia_usd,
         observaciones_cierre, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'ABIERTA', ?, ?)`,
      [id, empresa_id, caja_id, usuario_id, now, monto_apertura_usd.toFixed(2), now, now]
    )
  })

  return id
}

// ─── Funcion: cerrarSesionCaja ───────────────────────────────

/**
 * Cierra una sesion de caja activa.
 * Calcula la diferencia: monto_sistema_usd es derivado del sistema (se obtiene de la sesion actual).
 * diferencia_usd = monto_fisico_usd - monto_sistema_usd
 */
export async function cerrarSesionCaja(id: string, params: CerrarSesionParams): Promise<void> {
  const { monto_fisico_usd, observaciones_cierre, usuario_cierre_id } = params

  if (monto_fisico_usd < 0) {
    throw new Error('El monto fisico no puede ser negativo')
  }

  const now = new Date().toISOString()

  await db.writeTransaction(async (tx) => {
    // 1. Leer sesion y validar que este abierta
    const result = await tx.execute(
      `SELECT status, monto_apertura_usd FROM sesiones_caja WHERE id = ?`,
      [id]
    )

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Sesion de caja no encontrada')
    }

    const sesion = result.rows.item(0) as { status: string; monto_apertura_usd: string }

    if (sesion.status !== 'ABIERTA') {
      throw new Error('La sesion de caja ya fue cerrada')
    }

    // 2. monto_sistema_usd: en esta implementacion se usa el monto de apertura como base del sistema
    // (el calculo real del sistema puede extenderse con sumas de ventas del periodo)
    const montoSistemaUsd = parseFloat(sesion.monto_apertura_usd)
    const diferenciaUsd = monto_fisico_usd - montoSistemaUsd

    // 3. Actualizar la sesion a CERRADA
    await tx.execute(
      `UPDATE sesiones_caja SET
         status = 'CERRADA',
         usuario_cierre_id = ?,
         fecha_cierre = ?,
         monto_sistema_usd = ?,
         monto_fisico_usd = ?,
         diferencia_usd = ?,
         observaciones_cierre = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        usuario_cierre_id,
        now,
        montoSistemaUsd.toFixed(2),
        monto_fisico_usd.toFixed(2),
        diferenciaUsd.toFixed(2),
        observaciones_cierre ?? null,
        now,
        id,
      ]
    )
  })
}
