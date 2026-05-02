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
  const { metodo_cobro_id, origen, monto, concepto, sesion_caja_id, empresa_id, usuario_id } =
    params

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
    if (tipo === 'EGRESO' && saldoActual < monto) {
      throw new Error(
        `Saldo insuficiente. Disponible: USD ${saldoActual.toFixed(2)}, Solicitado: USD ${monto.toFixed(2)}`
      )
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
          doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?)`,
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

      if (tipo === 'EGRESO' && saldoActual < entrada.monto) {
        throw new Error(
          `Saldo insuficiente. Disponible: ${saldoActual.toFixed(2)}, Solicitado: ${entrada.monto.toFixed(2)}`
        )
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
