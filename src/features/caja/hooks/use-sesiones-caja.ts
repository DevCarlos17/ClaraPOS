import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface SesionCaja {
  id: string
  empresa_id: string
  caja_id: string
  usuario_apertura_id: string
  fecha_apertura: string
  monto_apertura_usd: string
  monto_apertura_bs: string
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
  monto_apertura_bs?: number
  usuario_id: string
  empresa_id: string
}

export interface CerrarSesionParams {
  monto_fisico_usd: number
  observaciones_cierre?: string
  usuario_cierre_id: string
}

// ─── Interfaces extendidas ───────────────────────────────────

export interface SesionCajaConNombre extends SesionCaja {
  caja_nombre: string | null
}

// ─── Hooks de lectura ────────────────────────────────────────

/**
 * Retorna todas las sesiones con status ABIERTA de la empresa actual,
 * enriquecidas con el nombre de la caja.
 */
export function useSesionesActivas() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data: sesionesData, isLoading } = useQuery(
    `SELECT * FROM sesiones_caja WHERE empresa_id = ? AND status = 'ABIERTA' ORDER BY fecha_apertura ASC`,
    [empresaId]
  )

  const { data: cajasData } = useQuery(
    `SELECT id, nombre FROM cajas WHERE empresa_id = ?`,
    [empresaId]
  )

  const cajaMap = new Map(
    ((cajasData ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre])
  )

  const sesiones: SesionCajaConNombre[] = ((sesionesData ?? []) as SesionCaja[]).map((s) => ({
    ...s,
    caja_nombre: cajaMap.get(s.caja_id) ?? null,
  }))

  return { sesiones, isLoading }
}

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
  const { caja_id, monto_apertura_usd, monto_apertura_bs = 0, usuario_id, empresa_id } = params

  if (monto_apertura_usd < 0) {
    throw new Error('El monto de apertura no puede ser negativo')
  }
  if (monto_apertura_bs < 0) {
    throw new Error('El monto de apertura en Bs no puede ser negativo')
  }

  const id = uuidv4()
  const now = localNow()

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
         monto_apertura_usd, monto_apertura_bs, usuario_cierre_id, fecha_cierre,
         monto_sistema_usd, monto_fisico_usd, diferencia_usd,
         observaciones_cierre, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'ABIERTA', ?, ?)`,
      [id, empresa_id, caja_id, usuario_id, now, monto_apertura_usd.toFixed(2), monto_apertura_bs.toFixed(2), now, now]
    )
  })

  return id
}

// ─── Funcion: cerrarSesionCaja ───────────────────────────────

/**
 * Cierra una sesion de caja activa.
 * monto_sistema_usd = monto_apertura + pagos_efectivo_sesion + ingresos_manuales - egresos_manuales
 * diferencia_usd = monto_fisico_usd - monto_sistema_usd
 * Tambien genera sesiones_caja_detalle con el desglose por metodo de cobro.
 */
export async function cerrarSesionCaja(id: string, params: CerrarSesionParams): Promise<void> {
  const { monto_fisico_usd, observaciones_cierre, usuario_cierre_id } = params

  if (monto_fisico_usd < 0) {
    throw new Error('El monto fisico no puede ser negativo')
  }

  const now = localNow()

  await db.writeTransaction(async (tx) => {
    // 1. Leer sesion y validar que este abierta
    const result = await tx.execute(
      `SELECT status, monto_apertura_usd, empresa_id FROM sesiones_caja WHERE id = ?`,
      [id]
    )

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Sesion de caja no encontrada')
    }

    const sesion = result.rows.item(0) as {
      status: string
      monto_apertura_usd: string
      empresa_id: string
    }

    if (sesion.status !== 'ABIERTA') {
      throw new Error('La sesion de caja ya fue cerrada')
    }

    const montoApertura = parseFloat(sesion.monto_apertura_usd)
    const empresaId = sesion.empresa_id

    // 2. Calcular total de pagos en EFECTIVO de esta sesion
    const pagosEfectivoResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(p.monto_usd AS REAL)), 0) as total
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND p.is_reversed = 0`,
      [id]
    )
    const pagosEfectivo = Number(
      (pagosEfectivoResult.rows?.item(0) as { total: number } | undefined)?.total ?? 0
    )

    // 3. Calcular movimientos manuales de esta sesion
    const movsManualResult = await tx.execute(
      `SELECT origen, COALESCE(SUM(CAST(monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro
       WHERE sesion_caja_id = ?
         AND origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
       GROUP BY origen`,
      [id]
    )

    let ingresosManual = 0
    let egresosManual = 0
    if (movsManualResult.rows) {
      for (let i = 0; i < movsManualResult.rows.length; i++) {
        const row = movsManualResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL' || row.origen === 'AVANCE' || row.origen === 'PRESTAMO') {
          ingresosManual += row.total
        } else if (row.origen === 'EGRESO_MANUAL') {
          egresosManual += row.total
        }
      }
    }

    // 4. monto_sistema_usd = apertura + pagos_efectivo + ingresos_manual - egresos_manual
    const montoSistemaUsd = Number(
      (montoApertura + pagosEfectivo + ingresosManual - egresosManual).toFixed(2)
    )
    const diferenciaUsd = Number((monto_fisico_usd - montoSistemaUsd).toFixed(2))

    // 5. Actualizar la sesion a CERRADA
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

    // 6. Poblar sesiones_caja_detalle con desglose por metodo de cobro
    // Obtener todos los metodos usados en pagos de esta sesion
    const metodosUsadosResult = await tx.execute(
      `SELECT p.metodo_cobro_id, mc.moneda_id,
              COALESCE(SUM(CAST(p.monto_usd AS REAL)), 0) as total_pagos,
              COUNT(*) as num_transacciones
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       WHERE p.sesion_caja_id = ? AND p.is_reversed = 0
       GROUP BY p.metodo_cobro_id, mc.moneda_id`,
      [id]
    )

    // Obtener movimientos manuales agrupados por metodo de cobro
    const movsManualPorMetodoResult = await tx.execute(
      `SELECT metodo_cobro_id,
              SUM(CASE WHEN tipo = 'INGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_ingreso,
              SUM(CASE WHEN tipo = 'EGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_egreso
       FROM movimientos_metodo_cobro
       WHERE sesion_caja_id = ?
         AND origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
       GROUP BY metodo_cobro_id`,
      [id]
    )

    const movsManualPorMetodo = new Map<string, { ingreso: number; egreso: number }>()
    if (movsManualPorMetodoResult.rows) {
      for (let i = 0; i < movsManualPorMetodoResult.rows.length; i++) {
        const row = movsManualPorMetodoResult.rows.item(i) as {
          metodo_cobro_id: string
          total_ingreso: number
          total_egreso: number
        }
        movsManualPorMetodo.set(row.metodo_cobro_id, {
          ingreso: row.total_ingreso,
          egreso: row.total_egreso,
        })
      }
    }

    if (metodosUsadosResult.rows) {
      for (let i = 0; i < metodosUsadosResult.rows.length; i++) {
        const row = metodosUsadosResult.rows.item(i) as {
          metodo_cobro_id: string
          moneda_id: string
          total_pagos: number
          num_transacciones: number
        }

        const manual = movsManualPorMetodo.get(row.metodo_cobro_id) ?? { ingreso: 0, egreso: 0 }
        const totalSistema = Number(
          (row.total_pagos + manual.ingreso - manual.egreso).toFixed(2)
        )

        const detalleId = uuidv4()
        await tx.execute(
          `INSERT OR IGNORE INTO sesiones_caja_detalle
             (id, sesion_caja_id, metodo_cobro_id, moneda_id, total_sistema, total_fisico, diferencia, num_transacciones, empresa_id, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          [
            detalleId,
            id,
            row.metodo_cobro_id,
            row.moneda_id,
            totalSistema.toFixed(2),
            row.num_transacciones,
            empresaId,
            now,
          ]
        )
      }
    }
  })
}
