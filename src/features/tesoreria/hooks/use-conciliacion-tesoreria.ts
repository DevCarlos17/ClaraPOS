import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow, todayStr } from '@/lib/dates'

// ─── Tipos ────────────────────────────────────────────────────

export interface ReversarMovParams {
  movId: string
  motivo: string
  userId: string
  empresaId: string
}

export interface ReversarResult {
  /** Si true, el movimiento original afectaba una factura de venta
   * pero no se pudo determinar el pago exacto. El usuario debe
   * gestionar CxC manualmente. */
  needsManualCxc: boolean
}

// ─── Validar movimiento bancario ─────────────────────────────

export async function validarMovBancario(
  movimientoId: string,
  validadoPor: string
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT validado, reversado FROM movimientos_bancarios WHERE id = ?',
      [movimientoId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')
    const mov = result.rows.item(0) as { validado: number; reversado: number }
    if (mov.validado === 1) throw new Error('Este movimiento ya fue validado')
    if (mov.reversado === 1) throw new Error('No se puede validar un movimiento reversado')

    const now = localNow()
    await tx.execute(
      'UPDATE movimientos_bancarios SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?',
      [validadoPor, now, movimientoId]
    )
  })
}

// ─── Validar movimiento caja fuerte ─────────────────────────

export async function validarMovCajaFuerte(
  movimientoId: string,
  validadoPor: string
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT validado, reversado FROM mov_caja_fuerte WHERE id = ?',
      [movimientoId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')
    const mov = result.rows.item(0) as { validado: number; reversado: number }
    if (mov.validado === 1) throw new Error('Este movimiento ya fue validado')
    if (mov.reversado === 1) throw new Error('No se puede validar un movimiento reversado')

    const now = localNow()
    await tx.execute(
      'UPDATE mov_caja_fuerte SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?',
      [validadoPor, now, movimientoId]
    )
  })
}

// ─── Reversar movimiento bancario ────────────────────────────

export async function reversarMovBancario(params: ReversarMovParams): Promise<ReversarResult> {
  let needsManualCxc = false

  await db.writeTransaction(async (tx) => {
    // Leer movimiento original
    const result = await tx.execute(
      'SELECT * FROM movimientos_bancarios WHERE id = ?',
      [params.movId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')

    const mov = result.rows.item(0) as {
      id: string
      empresa_id: string
      banco_empresa_id: string
      tipo: string
      origen: string
      monto: string
      doc_origen_id: string | null
      doc_origen_tipo: string | null
      reversado: number
    }

    if (mov.reversado === 1) throw new Error('Este movimiento ya fue reversado')

    // Contra-movimiento: tipo invertido
    const tipoContrap = mov.tipo === 'INGRESO' ? 'EGRESO' : 'INGRESO'
    const monto = parseFloat(mov.monto)

    // Leer saldo actual del banco
    const bancoResult = await tx.execute(
      'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
      [mov.banco_empresa_id]
    )
    const saldoAnterior = parseFloat(
      (bancoResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
    )
    const saldoNuevo = tipoContrap === 'INGRESO' ? saldoAnterior + monto : saldoAnterior - monto

    const now = localNow()
    const contrapId = uuidv4()

    // Insertar contra-movimiento
    await tx.execute(
      `INSERT INTO movimientos_bancarios
         (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, referencia, descripcion, validado, reversado, reverso_de, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contrapId,
        params.empresaId,
        mov.banco_empresa_id,
        tipoContrap,
        'REVERSO',
        mov.monto,
        saldoAnterior.toFixed(4),
        saldoNuevo.toFixed(4),
        mov.doc_origen_id,
        mov.doc_origen_tipo,
        null,
        params.motivo,
        0,
        0,
        params.movId,
        todayStr(),
        now,
        params.userId,
      ]
    )

    // Actualizar saldo del banco
    await tx.execute(
      'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoNuevo.toFixed(4), now, mov.banco_empresa_id]
    )

    // Marcar original como reversado
    await tx.execute(
      'UPDATE movimientos_bancarios SET reversado = 1 WHERE id = ?',
      [params.movId]
    )

    // Determinar si necesita ajuste manual de CxC
    if (
      mov.origen !== 'TRANSFERENCIA_CLIENTE' ||
      !mov.doc_origen_id ||
      mov.doc_origen_tipo !== 'PAGO'
    ) {
      needsManualCxc = false
    } else {
      needsManualCxc = true
    }
  })

  return { needsManualCxc }
}

// ─── Reversar movimiento caja fuerte ────────────────────────

export async function reversarMovCajaFuerte(params: ReversarMovParams): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT * FROM mov_caja_fuerte WHERE id = ?',
      [params.movId]
    )
    if (!result.rows?.length) throw new Error('Movimiento no encontrado')

    const mov = result.rows.item(0) as {
      empresa_id: string
      caja_fuerte_id: string
      tipo: string
      monto: string
      doc_origen_id: string | null
      doc_origen_tipo: string | null
      reversado: number
    }

    if (mov.reversado === 1) throw new Error('Este movimiento ya fue reversado')

    const tipoContrap = mov.tipo === 'INGRESO' ? 'EGRESO' : 'INGRESO'
    const monto = parseFloat(mov.monto)

    // Leer saldo actual de caja_fuerte
    const cajaResult = await tx.execute(
      'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
      [mov.caja_fuerte_id]
    )
    const saldoAnterior = parseFloat(
      (cajaResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
    )
    const saldoNuevo = tipoContrap === 'INGRESO' ? saldoAnterior + monto : saldoAnterior - monto

    const now = localNow()
    const contrapId = uuidv4()

    await tx.execute(
      `INSERT INTO mov_caja_fuerte
         (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, descripcion, validado, reversado, reverso_de, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contrapId,
        params.empresaId,
        mov.caja_fuerte_id,
        tipoContrap,
        'REVERSO',
        mov.monto,
        saldoAnterior.toFixed(4),
        saldoNuevo.toFixed(4),
        mov.doc_origen_id,
        mov.doc_origen_tipo,
        params.motivo,
        0,
        0,
        params.movId,
        todayStr(),
        now,
        params.userId,
      ]
    )

    await tx.execute(
      'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoNuevo.toFixed(4), now, mov.caja_fuerte_id]
    )

    await tx.execute(
      'UPDATE mov_caja_fuerte SET reversado = 1 WHERE id = ?',
      [params.movId]
    )
  })
}

// ─── Movimiento manual en banco ──────────────────────────────

export async function crearMovManualBanco(params: {
  banco_id: string
  tipo: 'INGRESO' | 'EGRESO'
  monto: number
  descripcion: string
  gasto_id?: string
  fecha: string
  empresa_id: string
  usuario_id: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const bancoResult = await tx.execute(
      'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
      [params.banco_id]
    )
    const saldoAnterior = parseFloat(
      (bancoResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
    )
    const saldoNuevo =
      params.tipo === 'INGRESO'
        ? saldoAnterior + params.monto
        : saldoAnterior - params.monto

    const now = localNow()
    const movId = uuidv4()

    await tx.execute(
      `INSERT INTO movimientos_bancarios
         (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, descripcion, validado, reversado, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        params.empresa_id,
        params.banco_id,
        params.tipo,
        'MANUAL',
        params.monto.toFixed(4),
        saldoAnterior.toFixed(4),
        saldoNuevo.toFixed(4),
        params.gasto_id ?? null,
        params.gasto_id ? 'GASTO' : null,
        params.descripcion,
        0,
        0,
        params.fecha,
        now,
        params.usuario_id,
      ]
    )

    await tx.execute(
      'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoNuevo.toFixed(4), now, params.banco_id]
    )
  })
}

// ─── Movimiento manual en caja fuerte ───────────────────────

export async function crearMovManualCajaFuerte(params: {
  caja_fuerte_id: string
  tipo: 'INGRESO' | 'EGRESO'
  monto: number
  descripcion: string
  gasto_id?: string
  fecha: string
  empresa_id: string
  usuario_id: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const cajaResult = await tx.execute(
      'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
      [params.caja_fuerte_id]
    )
    const saldoAnterior = parseFloat(
      (cajaResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
    )
    const saldoNuevo =
      params.tipo === 'INGRESO'
        ? saldoAnterior + params.monto
        : saldoAnterior - params.monto

    const now = localNow()
    const movId = uuidv4()

    await tx.execute(
      `INSERT INTO mov_caja_fuerte
         (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, descripcion, validado, reversado, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        params.empresa_id,
        params.caja_fuerte_id,
        params.tipo,
        'MANUAL',
        params.monto.toFixed(4),
        saldoAnterior.toFixed(4),
        saldoNuevo.toFixed(4),
        params.gasto_id ?? null,
        params.gasto_id ? 'GASTO' : null,
        params.descripcion,
        0,
        0,
        params.fecha,
        now,
        params.usuario_id,
      ]
    )

    await tx.execute(
      'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoNuevo.toFixed(4), now, params.caja_fuerte_id]
    )
  })
}
