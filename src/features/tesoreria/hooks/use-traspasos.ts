import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
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
  const monedaMap = new Map(
    ((monedasData ?? []) as { id: string; codigo_iso: string }[]).map((m) => [m.id, m.codigo_iso])
  )

  const traspasos: TraspasoEnriquecido[] = ((data ?? []) as Traspaso[]).map((t) => ({
    ...t,
    nombre_origen:
      t.cuenta_origen_tipo === 'BANCO'
        ? (bancoMap.get(t.cuenta_origen_id) ?? 'Banco')
        : (cajaMap.get(t.cuenta_origen_id) ?? 'Caja Fuerte'),
    nombre_destino:
      t.cuenta_destino_tipo === 'BANCO'
        ? (bancoMap.get(t.cuenta_destino_id) ?? 'Banco')
        : (cajaMap.get(t.cuenta_destino_id) ?? 'Caja Fuerte'),
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
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movOrigenId, params.empresa_id, params.origen.id,
          'EGRESO', 'TRASPASO',
          params.monto_origen.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
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
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movOrigenId, params.empresa_id, params.origen.id,
          'EGRESO', 'TRASPASO',
          params.monto_origen.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
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
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movDestinoId, params.empresa_id, params.destino.id,
          'INGRESO', 'TRASPASO',
          params.monto_destino.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
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
            descripcion, validado, reversado, fecha, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movDestinoId, params.empresa_id, params.destino.id,
          'INGRESO', 'TRASPASO',
          params.monto_destino.toFixed(4),
          saldoAnt.toFixed(4), saldoNuevo.toFixed(4),
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
    if (traspaso.mov_origen_id) {
      const table =
        traspaso.cuenta_origen_tipo === 'BANCO' ? 'movimientos_bancarios' : 'mov_caja_fuerte'
      await tx.execute(`UPDATE ${table} SET reversado = 1 WHERE id = ?`, [traspaso.mov_origen_id])
    }
    if (traspaso.mov_destino_id) {
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
