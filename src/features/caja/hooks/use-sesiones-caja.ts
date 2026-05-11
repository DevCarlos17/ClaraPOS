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
  // 0041: saldos VES independientes del USD
  monto_sistema_bs: string | null
  monto_fisico_bs: string | null
  diferencia_bs: string | null
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
  /** Conteo fisico de efectivo en Bs declarado por el cajero */
  monto_fisico_bs?: number
  observaciones_cierre?: string
  usuario_cierre_id: string
  /** Conteo fisico por metodo: keyed por metodo_cobro_id, valor en moneda nativa del metodo */
  conteoFisicoPorMetodo?: Record<string, number>
  /** Tasa del dia para convertir Bs → USD en el calculo de diferencia */
  tasaDelDia?: number
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
 * Retorna las sesiones CERRADAS mas recientes de la empresa actual.
 * Las sesiones activas se consultan por separado con useSesionesActivas.
 */
export function useSesionesCaja(limite: number = 10) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    empresaId
      ? `SELECT * FROM sesiones_caja
         WHERE empresa_id = ? AND status = 'CERRADA'
         ORDER BY fecha_apertura DESC
         LIMIT ?`
      : '',
    empresaId ? [empresaId, limite] : []
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

// ─── Hook: useSaldoSesionCaja ────────────────────────────────

/**
 * Calcula el saldo de efectivo disponible en la sesion activa.
 * Formula: apertura + pagos_efectivo + ingresos_manual - egresos_manual - avances - prestamos
 * Esto refleja el dinero fisico real en caja en tiempo real.
 */
export function useSaldoSesionCaja(sesionCajaId: string | undefined) {
  const id = sesionCajaId ?? ''

  const { data: sesionData, isLoading: l1 } = useQuery(
    id ? 'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?' : '',
    id ? [id] : []
  )

  const { data: pagosData, isLoading: l2 } = useQuery(
    id
      ? `SELECT
           COALESCE(SUM(CASE WHEN mc.moneda = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE 0 END), 0) AS ventas_usd,
           COALESCE(SUM(CASE WHEN mc.moneda != 'USD' THEN CAST(p.monto_bs  AS REAL) ELSE 0 END), 0) AS ventas_bs
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND p.is_reversed = 0`
      : '',
    id ? [id] : []
  )

  const { data: movsData, isLoading: l3 } = useQuery(
    id
      ? `SELECT
           mmc.origen,
           COALESCE(SUM(CASE WHEN mc.moneda = 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_usd,
           COALESCE(SUM(CASE WHEN mc.moneda != 'USD' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS total_bs
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         WHERE mmc.sesion_caja_id = ?
           AND mc.tipo = 'EFECTIVO'
           AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO')
         GROUP BY mmc.origen`
      : '',
    id ? [id] : []
  )

  const sesion = (sesionData ?? [])[0] as
    | { monto_apertura_usd: string; monto_apertura_bs: string }
    | undefined
  const aperturaUsd = parseFloat(sesion?.monto_apertura_usd ?? '0') || 0
  const aperturaBs  = parseFloat(sesion?.monto_apertura_bs  ?? '0') || 0

  const pagosRow = (pagosData ?? [])[0] as
    | { ventas_usd: number; ventas_bs: number }
    | undefined
  const ventasUsd = pagosRow?.ventas_usd ?? 0
  const ventasBs  = pagosRow?.ventas_bs  ?? 0

  type MovRow = { origen: string; total_usd: number; total_bs: number }
  const movsMap = new Map<string, { usd: number; bs: number }>()
  for (const row of (movsData ?? []) as MovRow[]) {
    movsMap.set(row.origen, { usd: row.total_usd, bs: row.total_bs })
  }

  const ingManualUsd = movsMap.get('INGRESO_MANUAL')?.usd ?? 0
  const ingManualBs  = movsMap.get('INGRESO_MANUAL')?.bs  ?? 0
  const egrManualUsd = movsMap.get('EGRESO_MANUAL')?.usd  ?? 0
  const egrManualBs  = movsMap.get('EGRESO_MANUAL')?.bs   ?? 0
  const avancesUsd   = movsMap.get('AVANCE')?.usd ?? 0
  const avancesBs    = movsMap.get('AVANCE')?.bs  ?? 0
  const prestamosUsd = movsMap.get('PRESTAMO')?.usd ?? 0
  const prestamosBs  = movsMap.get('PRESTAMO')?.bs  ?? 0

  const saldoUsd = Math.max(0, Number((
    aperturaUsd + ventasUsd + ingManualUsd - egrManualUsd - avancesUsd - prestamosUsd
  ).toFixed(2)))

  const saldoBs = Math.max(0, Number((
    aperturaBs + ventasBs + ingManualBs - egrManualBs - avancesBs - prestamosBs
  ).toFixed(2)))

  return { saldoUsd, saldoBs, isLoading: l1 || l2 || l3 }
}

// ─── Hook: useSesionEstadisticas ─────────────────────────────

/**
 * Estadisticas de rendimiento de una sesion en tiempo real.
 * Cuenta facturas, total facturado en USD y total de articulos procesados.
 * Solo incluye ventas no anuladas.
 */
export function useSesionEstadisticas(sesionCajaId: string | undefined) {
  const id = sesionCajaId ?? ''

  const { data: ventasData, isLoading: l1 } = useQuery(
    id
      ? `SELECT
           COUNT(*) as total_facturas,
           COALESCE(SUM(CAST(total_usd AS REAL)), 0) as total_facturado_usd
         FROM ventas
         WHERE sesion_caja_id = ? AND status != 'ANULADA'`
      : '',
    id ? [id] : []
  )

  const { data: artsData, isLoading: l2 } = useQuery(
    id
      ? `SELECT COALESCE(SUM(CAST(vd.cantidad AS REAL)), 0) as total_articulos
         FROM ventas v
         JOIN ventas_det vd ON vd.venta_id = v.id
         WHERE v.sesion_caja_id = ? AND v.status != 'ANULADA'`
      : '',
    id ? [id] : []
  )

  const row = (ventasData ?? [])[0] as
    | { total_facturas: number; total_facturado_usd: number }
    | undefined
  const artsRow = (artsData ?? [])[0] as { total_articulos: number } | undefined

  return {
    totalFacturas: row?.total_facturas ?? 0,
    totalFacturadoUsd: row?.total_facturado_usd ?? 0,
    totalArticulos: Math.round(artsRow?.total_articulos ?? 0),
    isLoading: l1 || l2,
  }
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
 *
 * Calcula saldos esperados por divisa de forma independiente (USD y VES):
 *   monto_sistema_X = apertura_X + pagos_efectivo_X + ingresos_manuales_X
 *                     - egresos_manuales_X - vueltos_X
 *   diferencia_X    = monto_fisico_X - monto_sistema_X
 *
 * Tambien genera sesiones_caja_detalle con el desglose por metodo de cobro.
 */
export async function cerrarSesionCaja(id: string, params: CerrarSesionParams): Promise<void> {
  const {
    monto_fisico_usd,
    monto_fisico_bs = 0,
    observaciones_cierre,
    usuario_cierre_id,
    conteoFisicoPorMetodo,
    tasaDelDia,
  } = params

  if (monto_fisico_usd < 0) throw new Error('El monto fisico USD no puede ser negativo')
  if (monto_fisico_bs < 0) throw new Error('El monto fisico Bs no puede ser negativo')

  const now = localNow()

  await db.writeTransaction(async (tx) => {
    // 1. Leer sesion y validar que este abierta
    const result = await tx.execute(
      `SELECT status, monto_apertura_usd, monto_apertura_bs, empresa_id
       FROM sesiones_caja WHERE id = ?`,
      [id]
    )

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Sesion de caja no encontrada')
    }

    const sesion = result.rows.item(0) as {
      status: string
      monto_apertura_usd: string
      monto_apertura_bs: string
      empresa_id: string
    }

    if (sesion.status !== 'ABIERTA') {
      throw new Error('La sesion de caja ya fue cerrada')
    }

    const aperturaUsd = parseFloat(sesion.monto_apertura_usd)
    const aperturaBs  = parseFloat(sesion.monto_apertura_bs ?? '0')
    const empresaId   = sesion.empresa_id

    // 2a. Pagos en EFECTIVO cobrados en USD (monto nativo = USD)
    const pagosEfectivoUsdResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       JOIN monedas mo ON p.moneda_id = mo.id
       WHERE p.sesion_caja_id = ?
         AND mc.tipo = 'EFECTIVO'
         AND mo.codigo_iso = 'USD'
         AND p.is_reversed = 0`,
      [id]
    )
    const pagosEfectivoUsd = Number(
      (pagosEfectivoUsdResult.rows?.item(0) as { total: number } | undefined)?.total ?? 0
    )

    // 2b. Pagos en EFECTIVO cobrados en VES (monto nativo = Bs)
    const pagosEfectivoBsResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(p.monto AS REAL)), 0) as total
       FROM pagos p
       JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
       JOIN monedas mo ON p.moneda_id = mo.id
       WHERE p.sesion_caja_id = ?
         AND mc.tipo = 'EFECTIVO'
         AND mo.codigo_iso = 'VES'
         AND p.is_reversed = 0`,
      [id]
    )
    const pagosEfectivoBs = Number(
      (pagosEfectivoBsResult.rows?.item(0) as { total: number } | undefined)?.total ?? 0
    )

    // 3a. Movimientos manuales en USD (INGRESO_MANUAL, EGRESO_MANUAL, AVANCE, PRESTAMO, VUELTO)
    const movsManualUsdResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
         AND mo.codigo_iso = 'USD'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualUsd = 0
    let egresosManualUsd  = 0
    if (movsManualUsdResult.rows) {
      for (let i = 0; i < movsManualUsdResult.rows.length; i++) {
        const row = movsManualUsdResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL') {
          ingresosManualUsd += row.total
        } else {
          // EGRESO_MANUAL, AVANCE, PRESTAMO y VUELTO son salidas de efectivo
          egresosManualUsd += row.total
        }
      }
    }

    // 3b. Movimientos manuales en VES
    const movsManualBsResult = await tx.execute(
      `SELECT mmc.origen, COALESCE(SUM(CAST(mmc.monto AS REAL)), 0) as total
       FROM movimientos_metodo_cobro mmc
       JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
       JOIN monedas mo ON mc.moneda_id = mo.id
       WHERE mmc.sesion_caja_id = ?
         AND mmc.origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
         AND mo.codigo_iso = 'VES'
       GROUP BY mmc.origen`,
      [id]
    )

    let ingresosManualBs = 0
    let egresosManualBs  = 0
    if (movsManualBsResult.rows) {
      for (let i = 0; i < movsManualBsResult.rows.length; i++) {
        const row = movsManualBsResult.rows.item(i) as { origen: string; total: number }
        if (row.origen === 'INGRESO_MANUAL') {
          ingresosManualBs += row.total
        } else {
          egresosManualBs += row.total
        }
      }
    }

    // 4. Calcular saldos esperados por divisa
    //    Formula: Apertura + Pagos_Efectivo + Ingresos_Manual - Egresos_Manual - Vueltos
    //    (Los vueltos ya estan en egresosManual porque su tipo es EGRESO)
    const montoSistemaUsd = Number(
      (aperturaUsd + pagosEfectivoUsd + ingresosManualUsd - egresosManualUsd).toFixed(2)
    )
    const montoSistemaBs = Number(
      (aperturaBs + pagosEfectivoBs + ingresosManualBs - egresosManualBs).toFixed(2)
    )

    const diferenciaUsd = Number((monto_fisico_usd - montoSistemaUsd).toFixed(2))
    const diferenciaBs  = Number((monto_fisico_bs  - montoSistemaBs).toFixed(2))

    // 5. Actualizar la sesion a CERRADA con saldos por divisa
    await tx.execute(
      `UPDATE sesiones_caja SET
         status = 'CERRADA',
         usuario_cierre_id = ?,
         fecha_cierre = ?,
         monto_sistema_usd = ?,
         monto_fisico_usd = ?,
         diferencia_usd = ?,
         monto_sistema_bs = ?,
         monto_fisico_bs = ?,
         diferencia_bs = ?,
         observaciones_cierre = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        usuario_cierre_id,
        now,
        montoSistemaUsd.toFixed(2),
        monto_fisico_usd.toFixed(2),
        diferenciaUsd.toFixed(2),
        montoSistemaBs.toFixed(2),
        monto_fisico_bs.toFixed(2),
        diferenciaBs.toFixed(2),
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

    // Movimientos manuales (incluyendo VUELTO) agrupados por metodo de cobro
    const movsManualPorMetodoResult = await tx.execute(
      `SELECT metodo_cobro_id,
              SUM(CASE WHEN tipo = 'INGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_ingreso,
              SUM(CASE WHEN tipo = 'EGRESO' THEN CAST(monto AS REAL) ELSE 0 END) as total_egreso
       FROM movimientos_metodo_cobro
       WHERE sesion_caja_id = ?
         AND origen IN ('INGRESO_MANUAL', 'EGRESO_MANUAL', 'AVANCE', 'PRESTAMO', 'VUELTO')
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

        // Calcular total_fisico y diferencia si se recibio conteo del usuario
        let totalFisicoNativo: number | null = null
        let diferenciaValor: number | null = null
        if (conteoFisicoPorMetodo && row.metodo_cobro_id in conteoFisicoPorMetodo) {
          totalFisicoNativo = conteoFisicoPorMetodo[row.metodo_cobro_id]
          // Convertir a USD para calcular diferencia homogenea
          const fisicoUsd =
            row.moneda_id !== 'USD' && (tasaDelDia ?? 0) > 0
              ? totalFisicoNativo / tasaDelDia!
              : totalFisicoNativo
          diferenciaValor = Number((fisicoUsd - totalSistema).toFixed(2))
        }

        const detalleId = uuidv4()
        await tx.execute(
          `INSERT OR IGNORE INTO sesiones_caja_detalle
             (id, sesion_caja_id, metodo_cobro_id, moneda_id, total_sistema, total_fisico, diferencia, num_transacciones, empresa_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            detalleId,
            id,
            row.metodo_cobro_id,
            row.moneda_id,
            totalSistema.toFixed(2),
            totalFisicoNativo !== null ? totalFisicoNativo.toFixed(2) : null,
            diferenciaValor !== null ? diferenciaValor.toFixed(2) : null,
            row.num_transacciones,
            empresaId,
            now,
          ]
        )
      }
    }
  })
}
