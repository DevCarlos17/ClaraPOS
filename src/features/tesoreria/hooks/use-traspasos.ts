import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import type { Transaction } from '@powersync/common'
import { localNow, todayStr } from '@/lib/dates'
import type { CuentaTesoreria } from './use-cuentas-tesoreria'

// ─── Interfaces ─────────────────────────────────────────────

export interface Traspaso {
  id: string
  empresa_id: string
  cuenta_origen_tipo: string
  cuenta_origen_id: string
  mov_origen_id: string | null
  cuenta_destino_tipo: string
  cuenta_destino_id: string
  mov_destino_id: string | null
  monto_origen: string
  moneda_origen_id: string
  monto_destino: string
  moneda_destino_id: string
  tasa_cambio: string | null
  reversado: number
  reversado_at: string | null
  reversado_por: string | null
  observacion: string | null
  fecha: string
  created_at: string
  created_by: string | null
  // pos-tesoreria-integration
  sesion_caja_id: string | null
}

export interface TraspasoEnriquecido extends Traspaso {
  nombre_origen: string
  nombre_destino: string
  moneda_origen_codigo: string
  moneda_destino_codigo: string
}

// ─── Hook de lectura ─────────────────────────────────────────

export function useTraspasos(
  fechaDesde?: string,
  fechaHasta?: string
) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const hayFiltroFechas = fechaDesde !== undefined || fechaHasta !== undefined

  const query = (() => {
    if (hayFiltroFechas && fechaDesde && fechaHasta) {
      return `SELECT * FROM traspasos_tesoreria
              WHERE empresa_id = ?
                AND SUBSTR(fecha, 1, 10) >= ? AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 200`
    }
    if (hayFiltroFechas && fechaDesde) {
      return `SELECT * FROM traspasos_tesoreria
              WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) >= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 200`
    }
    if (hayFiltroFechas && fechaHasta) {
      return `SELECT * FROM traspasos_tesoreria
              WHERE empresa_id = ? AND SUBSTR(fecha, 1, 10) <= ?
              ORDER BY fecha DESC, created_at DESC
              LIMIT 200`
    }
    return `SELECT * FROM traspasos_tesoreria
            WHERE empresa_id = ?
            ORDER BY fecha DESC, created_at DESC
            LIMIT 200`
  })()

  const params = (() => {
    if (hayFiltroFechas && fechaDesde && fechaHasta) return [empresaId, fechaDesde, fechaHasta]
    if (hayFiltroFechas && fechaDesde) return [empresaId, fechaDesde]
    if (hayFiltroFechas && fechaHasta) return [empresaId, fechaHasta]
    return [empresaId]
  })()

  const { data: bancosData } = useQuery(
    'SELECT id, nombre_banco FROM bancos_empresa WHERE empresa_id = ?',
    [empresaId]
  )
  const { data: cajasData } = useQuery(
    'SELECT id, nombre FROM caja_fuerte WHERE empresa_id = ?',
    [empresaId]
  )
  const { data: sesionesData } = useQuery(
    `SELECT s.id, COALESCE(c.nombre, 'Sesion') AS nombre
     FROM sesiones_caja s
     LEFT JOIN cajas c ON c.id = s.caja_id
     WHERE s.empresa_id = ?`,
    [empresaId]
  )
  const { data: monedasData } = useQuery(
    'SELECT id, codigo_iso FROM monedas WHERE is_active = 1',
    []
  )
  const { data, isLoading } = useQuery(query, params)

  const bancoMap = new Map(
    ((bancosData ?? []) as { id: string; nombre_banco: string }[]).map((b) => [b.id, b.nombre_banco])
  )
  const cajaMap = new Map(
    ((cajasData ?? []) as { id: string; nombre: string }[]).map((c) => [c.id, c.nombre])
  )
  const sesionMap = new Map(
    ((sesionesData ?? []) as { id: string; nombre: string }[]).map((s) => [s.id, s.nombre])
  )
  const monedaMap = new Map(
    ((monedasData ?? []) as { id: string; codigo_iso: string }[]).map((m) => [m.id, m.codigo_iso])
  )

  function resolveCuentaNombre(tipo: string, id: string): string {
    if (tipo === 'BANCO') return bancoMap.get(id) ?? 'Banco'
    if (tipo === 'SESION_CAJA') return sesionMap.get(id) ?? 'Sesion POS'
    return cajaMap.get(id) ?? 'Caja Fuerte'
  }

  const traspasos: TraspasoEnriquecido[] = ((data ?? []) as Traspaso[]).map((t) => ({
    ...t,
    nombre_origen: resolveCuentaNombre(t.cuenta_origen_tipo, t.cuenta_origen_id),
    nombre_destino: resolveCuentaNombre(t.cuenta_destino_tipo, t.cuenta_destino_id),
    moneda_origen_codigo: monedaMap.get(t.moneda_origen_id) ?? '',
    moneda_destino_codigo: monedaMap.get(t.moneda_destino_id) ?? '',
  }))

  return { traspasos, isLoading }
}

// ─── Crear traspaso ──────────────────────────────────────────

export async function crearTraspaso(params: {
  origen: CuentaTesoreria
  destino: CuentaTesoreria
  monto_origen: number
  monto_destino: number
  tasa_cambio?: number
  fecha: string
  observacion?: string
  referencia?: string
  empresa_id: string
  usuario_id: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const now = localNow()
    const traspasoId = uuidv4()
    const movOrigenId = uuidv4()
    const movDestinoId = uuidv4()

    // ── Movimiento EGRESO en cuenta origen ──
    if (params.origen.tipo === 'BANCO') {
      const res = await tx.execute(
        'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
        [params.origen.id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt - params.monto_origen

      await tx.execute(
        `INSERT INTO movimientos_bancarios
           (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            referencia, descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movOrigenId, params.empresa_id, params.origen.id,
          'EGRESO', 'TRASPASO',
          params.monto_origen.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.referencia ?? null,
          params.observacion ?? 'Traspaso',
          0, 0, params.fecha, now, params.usuario_id,
        ]
      )
      await tx.execute(
        'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, params.origen.id]
      )
    } else {
      const res = await tx.execute(
        'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
        [params.origen.id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt - params.monto_origen

      await tx.execute(
        `INSERT INTO mov_caja_fuerte
           (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            referencia, descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movOrigenId, params.empresa_id, params.origen.id,
          'EGRESO', 'TRASPASO',
          params.monto_origen.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.referencia ?? null,
          params.observacion ?? 'Traspaso',
          0, 0, params.fecha, now, params.usuario_id,
        ]
      )
      await tx.execute(
        'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, params.origen.id]
      )
    }

    // ── Movimiento INGRESO en cuenta destino ──
    if (params.destino.tipo === 'BANCO') {
      const res = await tx.execute(
        'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
        [params.destino.id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt + params.monto_destino

      await tx.execute(
        `INSERT INTO movimientos_bancarios
           (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            referencia, descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movDestinoId, params.empresa_id, params.destino.id,
          'INGRESO', 'TRASPASO',
          params.monto_destino.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.referencia ?? null,
          params.observacion ?? 'Traspaso',
          0, 0, params.fecha, now, params.usuario_id,
        ]
      )
      await tx.execute(
        'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, params.destino.id]
      )
    } else {
      const res = await tx.execute(
        'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
        [params.destino.id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt + params.monto_destino

      await tx.execute(
        `INSERT INTO mov_caja_fuerte
           (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            referencia, descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movDestinoId, params.empresa_id, params.destino.id,
          'INGRESO', 'TRASPASO',
          params.monto_destino.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.referencia ?? null,
          params.observacion ?? 'Traspaso',
          0, 0, params.fecha, now, params.usuario_id,
        ]
      )
      await tx.execute(
        'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, params.destino.id]
      )
    }

    // ── Insertar registro de traspaso ──
    await tx.execute(
      `INSERT INTO traspasos_tesoreria
         (id, empresa_id, cuenta_origen_tipo, cuenta_origen_id, mov_origen_id,
          cuenta_destino_tipo, cuenta_destino_id, mov_destino_id,
          monto_origen, moneda_origen_id, monto_destino, moneda_destino_id,
          tasa_cambio, reversado, observacion, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        traspasoId,
        params.empresa_id,
        params.origen.tipo,
        params.origen.id,
        movOrigenId,
        params.destino.tipo,
        params.destino.id,
        movDestinoId,
        params.monto_origen.toFixed(4),
        params.origen.moneda_id,
        params.monto_destino.toFixed(4),
        params.destino.moneda_id,
        params.tasa_cambio?.toFixed(4) ?? null,
        0,
        params.observacion ?? null,
        params.fecha,
        now,
        params.usuario_id,
      ]
    )
  })
}

// ─── Reversar traspaso ───────────────────────────────────────

export async function reversarTraspaso(params: {
  traspasoId: string
  motivo: string
  userId: string
  empresaId: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT * FROM traspasos_tesoreria WHERE id = ?',
      [params.traspasoId]
    )
    if (!result.rows?.length) throw new Error('Traspaso no encontrado')

    const traspaso = result.rows.item(0) as {
      cuenta_origen_tipo: string
      cuenta_origen_id: string
      mov_origen_id: string | null
      cuenta_destino_tipo: string
      cuenta_destino_id: string
      mov_destino_id: string | null
      monto_origen: string
      moneda_origen_id: string
      monto_destino: string
      moneda_destino_id: string
      reversado: number
      sesion_caja_id: string | null
    }

    if (traspaso.reversado === 1) throw new Error('Este traspaso ya fue reversado')

    const now = localNow()
    const fecha = todayStr()
    const revOrigenId = uuidv4()
    const revDestinoId = uuidv4()

    // Reverso: INGRESO en origen (devolver), EGRESO en destino (sacar)
    const montoOrigen = parseFloat(traspaso.monto_origen)
    const montoDestino = parseFloat(traspaso.monto_destino)

    // ── Reverso origen: INGRESO ──
    if (traspaso.cuenta_origen_tipo === 'BANCO') {
      const res = await tx.execute(
        'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
        [traspaso.cuenta_origen_id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt + montoOrigen

      await tx.execute(
        `INSERT INTO movimientos_bancarios
           (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revOrigenId, params.empresaId, traspaso.cuenta_origen_id,
          'INGRESO', 'REVERSO',
          traspaso.monto_origen,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.motivo, 0, 0, fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, traspaso.cuenta_origen_id]
      )
    } else if (traspaso.cuenta_origen_tipo === 'SESION_CAJA') {
      // Reversal of a POS→Tesorería traspaso: put money back into the session
      if (!traspaso.mov_origen_id) throw new Error('Traspaso SESION_CAJA sin mov_origen_id')

      const origMovRes = await tx.execute(
        'SELECT metodo_cobro_id, sesion_caja_id FROM movimientos_metodo_cobro WHERE id = ?',
        [traspaso.mov_origen_id]
      )
      const origMov = origMovRes.rows?.item(0) as
        | { metodo_cobro_id: string; sesion_caja_id: string }
        | undefined
      if (!origMov) throw new Error('Movimiento origen (SESION_CAJA) no encontrado')

      // Block reversal if session is already closed
      const sesionRes = await tx.execute(
        'SELECT status FROM sesiones_caja WHERE id = ?',
        [origMov.sesion_caja_id]
      )
      const sesionStatus = (sesionRes.rows?.item(0) as { status: string } | undefined)?.status
      if (sesionStatus === 'CERRADA') {
        throw new Error('No se puede reversar: la sesion de caja ya esta CERRADA')
      }

      const metodoRes = await tx.execute(
        'SELECT saldo_actual FROM metodos_cobro WHERE id = ?',
        [origMov.metodo_cobro_id]
      )
      const saldoAnt = parseFloat(
        (metodoRes.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt + montoOrigen

      await tx.execute(
        `INSERT INTO movimientos_metodo_cobro
           (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            doc_origen_id, doc_origen_ref, concepto, sesion_caja_id,
            autorizado_por_id, destinatario_id, referencia_pago_digital_id,
            fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        [
          revOrigenId, params.empresaId, origMov.metodo_cobro_id,
          'INGRESO', 'INGRESO_TESORERIA',
          traspaso.monto_origen,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.traspasoId,
          params.motivo,
          origMov.sesion_caja_id,
          fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, origMov.metodo_cobro_id]
      )
    } else {
      const res = await tx.execute(
        'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
        [traspaso.cuenta_origen_id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt + montoOrigen

      await tx.execute(
        `INSERT INTO mov_caja_fuerte
           (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revOrigenId, params.empresaId, traspaso.cuenta_origen_id,
          'INGRESO', 'REVERSO',
          traspaso.monto_origen,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.motivo, 0, 0, fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, traspaso.cuenta_origen_id]
      )
    }

    // ── Reverso destino: EGRESO ──
    if (traspaso.cuenta_destino_tipo === 'BANCO') {
      const res = await tx.execute(
        'SELECT saldo_actual FROM bancos_empresa WHERE id = ?',
        [traspaso.cuenta_destino_id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt - montoDestino

      await tx.execute(
        `INSERT INTO movimientos_bancarios
           (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revDestinoId, params.empresaId, traspaso.cuenta_destino_id,
          'EGRESO', 'REVERSO',
          traspaso.monto_destino,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.motivo, 0, 0, fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, traspaso.cuenta_destino_id]
      )
    } else if (traspaso.cuenta_destino_tipo === 'SESION_CAJA') {
      // Reversal of a Tesorería→POS traspaso: remove money from the session
      if (!traspaso.mov_destino_id) throw new Error('Traspaso SESION_CAJA sin mov_destino_id')

      const origMovRes = await tx.execute(
        'SELECT metodo_cobro_id, sesion_caja_id FROM movimientos_metodo_cobro WHERE id = ?',
        [traspaso.mov_destino_id]
      )
      const origMov = origMovRes.rows?.item(0) as
        | { metodo_cobro_id: string; sesion_caja_id: string }
        | undefined
      if (!origMov) throw new Error('Movimiento destino (SESION_CAJA) no encontrado')

      // Block reversal if session is already closed
      const sesionRes = await tx.execute(
        'SELECT status FROM sesiones_caja WHERE id = ?',
        [origMov.sesion_caja_id]
      )
      const sesionStatus = (sesionRes.rows?.item(0) as { status: string } | undefined)?.status
      if (sesionStatus === 'CERRADA') {
        throw new Error('No se puede reversar: la sesion de caja ya esta CERRADA')
      }

      const metodoRes = await tx.execute(
        'SELECT saldo_actual FROM metodos_cobro WHERE id = ?',
        [origMov.metodo_cobro_id]
      )
      const saldoAnt = parseFloat(
        (metodoRes.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt - montoDestino

      await tx.execute(
        `INSERT INTO movimientos_metodo_cobro
           (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            doc_origen_id, doc_origen_ref, concepto, sesion_caja_id,
            autorizado_por_id, destinatario_id, referencia_pago_digital_id,
            fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        [
          revDestinoId, params.empresaId, origMov.metodo_cobro_id,
          'EGRESO', 'EGRESO_TESORERIA',
          traspaso.monto_destino,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.traspasoId,
          params.motivo,
          origMov.sesion_caja_id,
          fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, origMov.metodo_cobro_id]
      )
    } else {
      const res = await tx.execute(
        'SELECT saldo_actual FROM caja_fuerte WHERE id = ?',
        [traspaso.cuenta_destino_id]
      )
      const saldoAnt = parseFloat(
        (res.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
      )
      const saldoNuevo = saldoAnt - montoDestino

      await tx.execute(
        `INSERT INTO mov_caja_fuerte
           (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          revDestinoId, params.empresaId, traspaso.cuenta_destino_id,
          'EGRESO', 'REVERSO',
          traspaso.monto_destino,
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
          params.motivo, 0, 0, fecha, now, params.userId,
        ]
      )
      await tx.execute(
        'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
        [saldoNuevo.toFixed(4), now, traspaso.cuenta_destino_id]
      )
    }

    // Marcar movimientos originales como reversados
    // Note: movimientos_metodo_cobro (SESION_CAJA) does not have a reversado column — skip.
    if (traspaso.mov_origen_id && traspaso.cuenta_origen_tipo !== 'SESION_CAJA') {
      const table =
        traspaso.cuenta_origen_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET reversado = 1 WHERE id = ?`, [traspaso.mov_origen_id])
    }
    if (traspaso.mov_destino_id && traspaso.cuenta_destino_tipo !== 'SESION_CAJA') {
      const table =
        traspaso.cuenta_destino_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET reversado = 1 WHERE id = ?`, [traspaso.mov_destino_id])
    }

    // Marcar traspaso como reversado
    await tx.execute(
      'UPDATE traspasos_tesoreria SET reversado = 1, reversado_at = ?, reversado_por = ? WHERE id = ?',
      [now, params.userId, params.traspasoId]
    )
  })
}

// ─── Traspaso POS → Tesorería (TASK-005 / cierre-consolidacion-tesoreria) ───

/** Destino de una consolidacion desde sesion de caja hacia Tesoreria. */
export type DestinoConsolidacion =
  | { tipo: 'CAJA_FUERTE'; id: string }
  | { tipo: 'BANCO'; id: string }

/**
 * Consolida el saldo de un metodo de cobro de una sesion de caja hacia Tesoreria
 * (caja fuerte o banco), DENTRO de una transaccion existente provista por el
 * llamador. No abre su propia writeTransaction — PowerSync no permite anidarlas,
 * por lo que esta funcion es la unica forma segura de invocar esta logica desde
 * dentro de `cerrarSesionCaja` (cierre-consolidacion-tesoreria, PR2).
 *
 * Atomico: EGRESO en metodos_cobro (drena saldo_actual, origen='EGRESO_TESORERIA')
 * + INGRESO PENDIENTE (validado=0) en mov_caja_fuerte o movimientos_bancarios segun
 * `destino.tipo` + registro en traspasos_tesoreria (cuenta_origen_tipo='SESION_CAJA').
 *
 * `origenDestino` acepta 'TRASPASO' ademas de los origenes propios del cierre
 * automatico para preservar el comportamiento exacto del traspaso manual POS→Tesoreria
 * (ver `crearTraspasoSesionATesoreria`, que delega aqui).
 */
export async function consolidarMetodoATesoreriaEnTx(
  tx: Transaction,
  p: {
    sesionCajaId: string
    metodoCobroId: string
    destino: DestinoConsolidacion
    monto: string
    monedaId: string
    empresaId: string
    userId: string
    origenDestino: 'DEPOSITO_CIERRE' | 'CIERRE_CONSOLIDACION' | 'TRASPASO'
    descripcion?: string
    /**
     * cierre-consolidacion-tesoreria (PR2): en el cierre, el monto a consolidar es el
     * total de la sesion (incluye ventas), pero `metodos_cobro.saldo_actual` NO incluye
     * ventas regulares (ver use-ventas.ts: los pagos origen='VENTA' insertan saldo 0/0 y
     * nunca actualizan saldo_actual). Por eso el guard de "saldo suficiente" es invalido
     * para este caller. Cuando `skipSaldoCheck` es true, no se valida ni se actualiza
     * saldo_actual desde este path (restarle el total lo dejaria negativo/inconsistente);
     * el EGRESO se registra con saldo_anterior=saldo_nuevo=saldo_actual (sin mutarlo).
     * Los callers manuales (traspaso POS→Tesoreria) NO pasan este flag y conservan el
     * comportamiento original: validan y drenan saldo_actual como siempre.
     */
    skipSaldoCheck?: boolean
  }
): Promise<{ traspasoId: string }> {
  const montoNum = parseFloat(p.monto)
  if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a 0')

  const now = localNow()
  const fecha = todayStr()

  // 1. Saldo actual del metodo de cobro en la sesion
  const metodoRes = await tx.execute(
    'SELECT saldo_actual FROM metodos_cobro WHERE id = ? AND empresa_id = ?',
    [p.metodoCobroId, p.empresaId]
  )
  if (!metodoRes.rows?.length) throw new Error('Metodo de cobro no encontrado')
  const saldoMetodoAnt = parseFloat(
    (metodoRes.rows.item(0) as { saldo_actual: string }).saldo_actual
  )

  // 2. Validar saldo suficiente (solo callers manuales; ver skipSaldoCheck)
  if (!p.skipSaldoCheck && montoNum > saldoMetodoAnt + 0.001) {
    throw new Error(
      `Saldo insuficiente. Disponible: ${saldoMetodoAnt.toFixed(2)}, Solicitado: ${p.monto}`
    )
  }

  // Cuando se salta el check (cierre), no se muta saldo_actual: el EGRESO se registra
  // con saldo_anterior == saldo_nuevo para no dejar saldo_actual negativo/inconsistente.
  const saldoMetodoNuevo = p.skipSaldoCheck ? saldoMetodoAnt : saldoMetodoAnt - montoNum

  // 3. Crear movimiento de EGRESO en metodo de cobro (sale de POS)
  const movMetodoId = uuidv4()
  await tx.execute(
    `INSERT INTO movimientos_metodo_cobro
       (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
        doc_origen_id, doc_origen_ref, concepto, sesion_caja_id,
        autorizado_por_id, destinatario_id, referencia_pago_digital_id,
        fecha, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
    [
      movMetodoId, p.empresaId, p.metodoCobroId,
      'EGRESO', 'EGRESO_TESORERIA',
      montoNum.toFixed(4),
      saldoMetodoAnt.toFixed(4), saldoMetodoNuevo.toFixed(4),
      p.descripcion ?? 'Traspaso a Tesoreria',
      p.sesionCajaId,
      fecha, now, p.userId,
    ]
  )

  // 4. Actualizar saldo del metodo de cobro (solo callers manuales)
  if (!p.skipSaldoCheck) {
    await tx.execute(
      'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoMetodoNuevo.toFixed(4), now, p.metodoCobroId]
    )
  }

  // 5. Crear movimiento INGRESO PENDIENTE (validado=0) en el destino
  const movDestinoId = uuidv4()
  if (p.destino.tipo === 'CAJA_FUERTE') {
    const cajaRes = await tx.execute(
      'SELECT saldo_actual FROM caja_fuerte WHERE id = ? AND empresa_id = ?',
      [p.destino.id, p.empresaId]
    )
    if (!cajaRes.rows?.length) throw new Error('Caja fuerte no encontrada')
    const saldoCajaAnt = parseFloat(
      (cajaRes.rows.item(0) as { saldo_actual: string }).saldo_actual
    )
    const saldoCajaNuevo = saldoCajaAnt + montoNum

    await tx.execute(
      `INSERT INTO mov_caja_fuerte
         (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, referencia, descripcion,
          validado, validado_por, validado_at, reversado, reverso_de,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
      [
        movDestinoId, p.empresaId, p.destino.id,
        'INGRESO', p.origenDestino,
        montoNum.toFixed(4),
        saldoCajaAnt.toFixed(4), saldoCajaNuevo.toFixed(4),
        movMetodoId, 'MOVIMIENTO_METODO_COBRO',
        p.descripcion ?? 'Traspaso desde Sesion POS',
        0, // validado=0 (PENDIENTE)
        0, // reversado=0
        fecha, now, p.userId,
      ]
    )

    await tx.execute(
      'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoCajaNuevo.toFixed(4), now, p.destino.id]
    )
  } else {
    const bancoRes = await tx.execute(
      'SELECT saldo_actual FROM bancos_empresa WHERE id = ? AND empresa_id = ?',
      [p.destino.id, p.empresaId]
    )
    if (!bancoRes.rows?.length) throw new Error('Banco no encontrado')
    const saldoBancoAnt = parseFloat(
      (bancoRes.rows.item(0) as { saldo_actual: string }).saldo_actual
    )
    const saldoBancoNuevo = saldoBancoAnt + montoNum

    await tx.execute(
      `INSERT INTO movimientos_bancarios
         (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, referencia, descripcion,
          validado, validado_por, validado_at, reversado, reverso_de,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
      [
        movDestinoId, p.empresaId, p.destino.id,
        'INGRESO', p.origenDestino,
        montoNum.toFixed(4),
        saldoBancoAnt.toFixed(4), saldoBancoNuevo.toFixed(4),
        movMetodoId, 'MOVIMIENTO_METODO_COBRO',
        p.descripcion ?? 'Traspaso desde Sesion POS',
        0, // validado=0 (PENDIENTE)
        0, // reversado=0
        fecha, now, p.userId,
      ]
    )

    await tx.execute(
      'UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoBancoNuevo.toFixed(4), now, p.destino.id]
    )
  }

  // 6. Crear registro de traspaso
  const traspasoId = uuidv4()
  await tx.execute(
    `INSERT INTO traspasos_tesoreria
       (id, empresa_id,
        cuenta_origen_tipo, cuenta_origen_id, mov_origen_id,
        cuenta_destino_tipo, cuenta_destino_id, mov_destino_id,
        monto_origen, moneda_origen_id, monto_destino, moneda_destino_id,
        tasa_cambio, reversado, observacion, sesion_caja_id,
        fecha, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      traspasoId, p.empresaId,
      'SESION_CAJA', p.sesionCajaId, movMetodoId,
      p.destino.tipo, p.destino.id, movDestinoId,
      montoNum.toFixed(4), p.monedaId,
      montoNum.toFixed(4), p.monedaId,
      '1', // tasa_cambio=1 (misma moneda)
      0,
      p.descripcion ?? null,
      p.sesionCajaId,
      fecha, now, p.userId,
    ]
  )

  return { traspasoId }
}

/**
 * Retira efectivo de una sesion de caja activa hacia una caja fuerte.
 * Wrapper delgado sobre `consolidarMetodoATesoreriaEnTx`: abre su propia
 * writeTransaction y preserva el comportamiento original (origen='TRASPASO',
 * destino siempre CAJA_FUERTE). El mov_caja_fuerte queda PENDIENTE (validado=0)
 * hasta que Tesoreria valide la recepcion.
 */
export async function crearTraspasoSesionATesoreria(params: {
  sesionCajaId: string
  metodoCobroid: string
  cajaFuerteId: string
  monto: string
  monedaId: string
  empresaId: string
  userId: string
  descripcion?: string
}): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await consolidarMetodoATesoreriaEnTx(tx, {
      sesionCajaId: params.sesionCajaId,
      metodoCobroId: params.metodoCobroid,
      destino: { tipo: 'CAJA_FUERTE', id: params.cajaFuerteId },
      monto: params.monto,
      monedaId: params.monedaId,
      empresaId: params.empresaId,
      userId: params.userId,
      origenDestino: 'TRASPASO',
      descripcion: params.descripcion,
    })
  })
}

// ─── Traspaso Tesorería → POS (TASK-006) ────────────────────

/**
 * Envia efectivo desde una caja fuerte hacia una sesion de caja activa.
 * Atomico: mov_caja_fuerte + movimientos_metodo_cobro + traspasos_tesoreria.
 * El mov_caja_fuerte queda VALIDADO (validado=1) — Tesoreria confirma el envio.
 */
export async function crearTraspasoTesoreriaASesion(params: {
  cajaFuerteId: string
  sesionCajaId: string
  metodoCobroid: string
  monto: string
  monedaId: string
  empresaId: string
  userId: string
  descripcion?: string
}): Promise<void> {
  const montoNum = parseFloat(params.monto)
  if (isNaN(montoNum) || montoNum <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    const fecha = todayStr()

    // 1. Saldo actual de la caja fuerte
    const cajaRes = await tx.execute(
      'SELECT saldo_actual FROM caja_fuerte WHERE id = ? AND empresa_id = ?',
      [params.cajaFuerteId, params.empresaId]
    )
    if (!cajaRes.rows?.length) throw new Error('Caja fuerte no encontrada')
    const saldoCajaAnt = parseFloat(
      (cajaRes.rows.item(0) as { saldo_actual: string }).saldo_actual
    )

    if (montoNum > saldoCajaAnt + 0.001) {
      throw new Error(
        `Saldo insuficiente en Tesoreria. Disponible: ${saldoCajaAnt.toFixed(2)}, Solicitado: ${params.monto}`
      )
    }

    // 2. Saldo actual del metodo de cobro en la sesion destino
    const metodoRes = await tx.execute(
      'SELECT saldo_actual FROM metodos_cobro WHERE id = ? AND empresa_id = ?',
      [params.metodoCobroid, params.empresaId]
    )
    if (!metodoRes.rows?.length) throw new Error('Metodo de cobro no encontrado')
    const saldoMetodoAnt = parseFloat(
      (metodoRes.rows.item(0) as { saldo_actual: string }).saldo_actual
    )

    const saldoCajaNuevo   = saldoCajaAnt  - montoNum
    const saldoMetodoNuevo = saldoMetodoAnt + montoNum

    // 3. Crear movimiento EGRESO en caja fuerte (ya validado — personal confirma el envio)
    const movCajaId = uuidv4()
    await tx.execute(
      `INSERT INTO mov_caja_fuerte
         (id, empresa_id, caja_fuerte_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, referencia, descripcion,
          validado, validado_por, validado_at, reversado, reverso_de,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [
        movCajaId, params.empresaId, params.cajaFuerteId,
        'EGRESO', 'TRASPASO',
        montoNum.toFixed(4),
        saldoCajaAnt.toFixed(4), saldoCajaNuevo.toFixed(4),
        params.descripcion ?? 'Envio a Sesion POS',
        1, // validado=1 (personal confirma el envio)
        params.userId, // validado_por
        now,           // validado_at
        0,             // reversado=0
        fecha, now, params.userId,
      ]
    )

    // 4. Actualizar saldo de la caja fuerte
    await tx.execute(
      'UPDATE caja_fuerte SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoCajaNuevo.toFixed(4), now, params.cajaFuerteId]
    )

    // 5. Crear movimiento INGRESO en metodo de cobro de la sesion destino
    const movMetodoId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_metodo_cobro
         (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_ref, concepto, sesion_caja_id,
          autorizado_por_id, destinatario_id, referencia_pago_digital_id,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
      [
        movMetodoId, params.empresaId, params.metodoCobroid,
        'INGRESO', 'INGRESO_TESORERIA',
        montoNum.toFixed(4),
        saldoMetodoAnt.toFixed(4), saldoMetodoNuevo.toFixed(4),
        movCajaId,
        params.descripcion ?? 'Ingreso desde Tesoreria',
        params.sesionCajaId,
        fecha, now, params.userId,
      ]
    )

    // 6. Actualizar saldo del metodo de cobro
    await tx.execute(
      'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [saldoMetodoNuevo.toFixed(4), now, params.metodoCobroid]
    )

    // 7. Crear registro de traspaso
    const traspasoId = uuidv4()
    await tx.execute(
      `INSERT INTO traspasos_tesoreria
         (id, empresa_id,
          cuenta_origen_tipo, cuenta_origen_id, mov_origen_id,
          cuenta_destino_tipo, cuenta_destino_id, mov_destino_id,
          monto_origen, moneda_origen_id, monto_destino, moneda_destino_id,
          tasa_cambio, reversado, observacion, sesion_caja_id,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        traspasoId, params.empresaId,
        'CAJA_FUERTE', params.cajaFuerteId, movCajaId,
        'SESION_CAJA', params.sesionCajaId, movMetodoId,
        montoNum.toFixed(4), params.monedaId,
        montoNum.toFixed(4), params.monedaId,
        '1', // tasa_cambio=1 (misma moneda)
        0,
        params.descripcion ?? null,
        params.sesionCajaId,
        fecha, now, params.userId,
      ]
    )
  })
}

// ─── Buscar traspaso por movimiento ─────────────────────────

export async function findTraspasoByMovId(
  movId: string,
  empresaId: string
): Promise<string | null> {
  const result = await db.execute(
    `SELECT id FROM traspasos_tesoreria
     WHERE (mov_origen_id = ? OR mov_destino_id = ?)
       AND empresa_id = ? LIMIT 1`,
    [movId, movId, empresaId]
  )
  return (result.rows?.item(0) as { id: string } | undefined)?.id ?? null
}

// ─── Validar traspaso (ambos lados) ─────────────────────────

export async function validarTraspaso(
  traspasoId: string,
  userId: string,
  empresaId: string
): Promise<void> {
  const now = localNow()

  await db.writeTransaction(async (tx) => {
    const result = await tx.execute(
      'SELECT * FROM traspasos_tesoreria WHERE id = ? AND empresa_id = ? LIMIT 1',
      [traspasoId, empresaId]
    )
    if (!result.rows?.length) throw new Error('Traspaso no encontrado')

    const t = result.rows.item(0) as {
      cuenta_origen_tipo: string
      mov_origen_id: string | null
      cuenta_destino_tipo: string
      mov_destino_id: string | null
      reversado: number
    }

    if (t.reversado === 1) throw new Error('Este traspaso ya fue reversado')

    // Validate origin movement
    // Note: movimientos_metodo_cobro (SESION_CAJA) has no validado column — skip.
    if (t.mov_origen_id && t.cuenta_origen_tipo !== 'SESION_CAJA') {
      const table =
        t.cuenta_origen_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(
        `UPDATE ${table} SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?`,
        [userId, now, t.mov_origen_id]
      )
    }

    // Validate destination movement
    // Note: movimientos_metodo_cobro (SESION_CAJA) has no validado column — skip.
    if (t.mov_destino_id && t.cuenta_destino_tipo !== 'SESION_CAJA') {
      const table =
        t.cuenta_destino_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(
        `UPDATE ${table} SET validado = 1, validado_por = ?, validado_at = ? WHERE id = ?`,
        [userId, now, t.mov_destino_id]
      )
    }
  })
}
