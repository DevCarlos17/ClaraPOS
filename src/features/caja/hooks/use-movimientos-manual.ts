import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { OrigenManual } from '@/features/caja/schemas/movimiento-manual-schema'
import { tipoDeOrigen } from '@/features/caja/schemas/movimiento-manual-schema'

// ─── Params ──────────────────────────────────────────────────

export interface MovimientoManualParams {
  metodo_cobro_id: string
  origen: OrigenManual
  monto: number
  concepto: string
  sesion_caja_id: string
  empresa_id: string
  usuario_id: string
  /** Obligatorio cuando origen = 'PRESTAMO' */
  autorizado_por_id?: string
  /** Obligatorio cuando origen = 'PRESTAMO' */
  destinatario_id?: string
  /** Obligatorio cuando origen = 'AVANCE' */
  referencia_pago_digital_id?: string
}

export interface MovimientoManualMultiParams {
  entradas: Array<{ metodo_cobro_id: string; monto: number }>
  origen: OrigenManual
  concepto: string
  sesion_caja_id: string
  empresa_id: string
  usuario_id: string
}

// ─── Funcion principal ────────────────────────────────────────

/**
 * Registra un movimiento manual de efectivo (ingreso, egreso, avance o prestamo).
 * Inserta en movimientos_metodo_cobro y actualiza saldo del metodo de cobro localmente.
 * El trigger de PostgreSQL recalculara el saldo exacto al sincronizar.
 */
export async function createMovimientoManual(params: MovimientoManualParams): Promise<void> {
  const {
    metodo_cobro_id, origen, monto, concepto, sesion_caja_id, empresa_id, usuario_id,
    autorizado_por_id, destinatario_id, referencia_pago_digital_id,
  } = params

  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')
  if (!concepto.trim()) throw new Error('El concepto es requerido')
  if (!sesion_caja_id) throw new Error('No hay sesion de caja activa')

  const tipo = tipoDeOrigen(origen)
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    // 1. Leer saldo actual del metodo de cobro
    const metodoResult = await tx.execute(
      'SELECT saldo_actual FROM metodos_cobro WHERE id = ? AND empresa_id = ?',
      [metodo_cobro_id, empresa_id]
    )

    if (!metodoResult.rows || metodoResult.rows.length === 0) {
      throw new Error('Metodo de cobro no encontrado')
    }

    const saldoActual = parseFloat(
      (metodoResult.rows.item(0) as { saldo_actual: string }).saldo_actual
    )

    // 2. Validar que no quede saldo negativo en egresos
    if (tipo === 'EGRESO') {
      // Computar saldo real de la sesion (incluye apertura + pagos + movimientos)
      const metodoMonedaResult = await tx.execute(
        `SELECT CASE WHEN mo.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mo.codigo_iso, 'USD') END AS moneda
         FROM metodos_cobro mc
         LEFT JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mc.id = ?`,
        [metodo_cobro_id]
      )
      const monedaMetodo = (metodoMonedaResult.rows?.item(0) as { moneda: string } | undefined)?.moneda ?? 'USD'
      const monedaIso = monedaMetodo === 'USD' ? 'USD' : 'VES'

      const sesionResult = await tx.execute(
        'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?',
        [sesion_caja_id]
      )
      const sesionRow = sesionResult.rows?.item(0) as
        | { monto_apertura_usd: string; monto_apertura_bs: string }
        | undefined
      const apertura = parseFloat(
        monedaMetodo === 'USD' ? sesionRow?.monto_apertura_usd ?? '0' : sesionRow?.monto_apertura_bs ?? '0'
      ) || 0

      const movsResult = await tx.execute(
        `SELECT
           COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS ingresos,
           COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO'  THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS egresos
         FROM movimientos_metodo_cobro mmc
         JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
         JOIN monedas mo ON mc.moneda_id = mo.id
         WHERE mmc.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = ?`,
        [sesion_caja_id, monedaIso]
      )
      const movsRow = movsResult.rows?.item(0) as { ingresos: number; egresos: number } | undefined
      const ingresosSesion = movsRow?.ingresos ?? 0
      const egresosSesion  = movsRow?.egresos  ?? 0

      const pagosResult = await tx.execute(
        `SELECT COALESCE(SUM(
           CASE WHEN mo.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE CAST(p.monto AS REAL) END
         ), 0) AS total
         FROM pagos p
         JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
         JOIN monedas mo ON p.moneda_id = mo.id
         WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = ? AND p.is_reversed = 0`,
        [sesion_caja_id, monedaIso]
      )
      const pagosSesion = ((pagosResult.rows?.item(0) as { total: number } | undefined)?.total) ?? 0

      const disponible = apertura + ingresosSesion - egresosSesion + pagosSesion
      if (disponible < monto - 0.01) {
        const currency = monedaMetodo === 'USD' ? 'USD' : 'Bs'
        throw new Error(
          `Saldo insuficiente en ${currency}. Disponible: ${disponible.toFixed(2)}, Solicitado: ${monto.toFixed(2)}`
        )
      }
    }

    // 3. Calcular nuevo saldo
    const saldoNuevo =
      tipo === 'INGRESO'
        ? Number((saldoActual + monto).toFixed(2))
        : Number((saldoActual - monto).toFixed(2))

    // 4. Insertar movimiento_metodo_cobro
    const movId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_metodo_cobro
         (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_ref, concepto, sesion_caja_id,
          autorizado_por_id, destinatario_id, referencia_pago_digital_id,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        empresa_id,
        metodo_cobro_id,
        tipo,
        origen,
        monto.toFixed(2),
        saldoActual.toFixed(2),
        saldoNuevo.toFixed(2),
        concepto.trim(),
        sesion_caja_id,
        autorizado_por_id ?? null,
        destinatario_id ?? null,
        referencia_pago_digital_id ?? null,
        now,
        now,
        usuario_id,
      ]
    )

    // 5. Actualizar saldo local del metodo de cobro (UX inmediato, trigger lo sobreescribira en sync)
    await tx.execute(
      'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoNuevo.toFixed(2), now, metodo_cobro_id]
    )
  })
}

/**
 * Registra multiples movimientos manuales en una sola transaccion atomica.
 * Util para operaciones multimoneda (ej: ingreso/retiro en USD y Bs simultaneamente).
 * Retorna los IDs de los movimientos creados.
 */
export async function createMovimientoManualMulti(params: MovimientoManualMultiParams): Promise<string[]> {
  const { entradas, origen, concepto, sesion_caja_id, empresa_id, usuario_id } = params

  if (entradas.length === 0) throw new Error('No hay entradas para registrar')
  if (!concepto.trim()) throw new Error('El concepto es requerido')
  if (!sesion_caja_id) throw new Error('No hay sesion de caja activa')

  const tipo = tipoDeOrigen(origen)
  const now = localNow()
  const movIds: string[] = []

  await db.writeTransaction(async (tx) => {
    for (const entrada of entradas) {
      if (entrada.monto <= 0) throw new Error('El monto debe ser mayor a 0')

      const metodoResult = await tx.execute(
        'SELECT saldo_actual FROM metodos_cobro WHERE id = ? AND empresa_id = ?',
        [entrada.metodo_cobro_id, empresa_id]
      )

      if (!metodoResult.rows || metodoResult.rows.length === 0) {
        throw new Error('Metodo de cobro no encontrado')
      }

      const saldoActual = parseFloat(
        (metodoResult.rows.item(0) as { saldo_actual: string }).saldo_actual
      )

      if (tipo === 'EGRESO') {
        // Computar saldo real de la sesion (incluye apertura + pagos + movimientos)
        const metodoMonedaResult = await tx.execute(
          `SELECT CASE WHEN mo.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mo.codigo_iso, 'USD') END AS moneda
           FROM metodos_cobro mc
           LEFT JOIN monedas mo ON mc.moneda_id = mo.id
           WHERE mc.id = ?`,
          [entrada.metodo_cobro_id]
        )
        const monedaMetodo = (metodoMonedaResult.rows?.item(0) as { moneda: string } | undefined)?.moneda ?? 'USD'
        const monedaIso = monedaMetodo === 'USD' ? 'USD' : 'VES'

        const sesionResult = await tx.execute(
          'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?',
          [sesion_caja_id]
        )
        const sesionRow = sesionResult.rows?.item(0) as
          | { monto_apertura_usd: string; monto_apertura_bs: string }
          | undefined
        const apertura = parseFloat(
          monedaMetodo === 'USD' ? sesionRow?.monto_apertura_usd ?? '0' : sesionRow?.monto_apertura_bs ?? '0'
        ) || 0

        const movsResult = await tx.execute(
          `SELECT
             COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS ingresos,
             COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO'  THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS egresos
           FROM movimientos_metodo_cobro mmc
           JOIN metodos_cobro mc ON mmc.metodo_cobro_id = mc.id
           JOIN monedas mo ON mc.moneda_id = mo.id
           WHERE mmc.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = ?`,
          [sesion_caja_id, monedaIso]
        )
        const movsRow = movsResult.rows?.item(0) as { ingresos: number; egresos: number } | undefined
        const ingresosSesion = movsRow?.ingresos ?? 0
        const egresosSesion  = movsRow?.egresos  ?? 0

        const pagosResult = await tx.execute(
          `SELECT COALESCE(SUM(
             CASE WHEN mo.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE CAST(p.monto AS REAL) END
           ), 0) AS total
           FROM pagos p
           JOIN metodos_cobro mc ON p.metodo_cobro_id = mc.id
           JOIN monedas mo ON p.moneda_id = mo.id
           WHERE p.sesion_caja_id = ? AND mc.tipo = 'EFECTIVO' AND mo.codigo_iso = ? AND p.is_reversed = 0`,
          [sesion_caja_id, monedaIso]
        )
        const pagosSesion = ((pagosResult.rows?.item(0) as { total: number } | undefined)?.total) ?? 0

        const disponible = apertura + ingresosSesion - egresosSesion + pagosSesion
        if (disponible < entrada.monto - 0.01) {
          const currency = monedaMetodo === 'USD' ? 'USD' : 'Bs'
          throw new Error(
            `Saldo insuficiente en ${currency}. Disponible: ${disponible.toFixed(2)}, Solicitado: ${entrada.monto.toFixed(2)}`
          )
        }
      }

      const saldoNuevo =
        tipo === 'INGRESO'
          ? Number((saldoActual + entrada.monto).toFixed(2))
          : Number((saldoActual - entrada.monto).toFixed(2))

      const movId = uuidv4()
      movIds.push(movId)
      await tx.execute(
        `INSERT INTO movimientos_metodo_cobro
           (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
        [
          movId,
          empresa_id,
          entrada.metodo_cobro_id,
          tipo,
          origen,
          entrada.monto.toFixed(2),
          saldoActual.toFixed(2),
          saldoNuevo.toFixed(2),
          concepto.trim(),
          sesion_caja_id,
          now,
          now,
          usuario_id,
        ]
      )

      await tx.execute(
        'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(2), now, entrada.metodo_cobro_id]
      )
    }
  })

  return movIds
}
