import Decimal from 'decimal.js'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/core/db/powersync/db'
import { localNow, todayStr } from '@/lib/dates'
import { toStorageString } from '@/lib/currency'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'
import { reversarPagoEnTx } from '@/features/cxc/hooks/use-cxc'

export interface ReversarAbonoDirectoParams {
  ingresoId: string
  motivo: string
  userId: string
  reversedByNombre: string
  empresaId: string
}

interface MovimientoBancarioLectura {
  id: string
  banco_empresa_id: string
  tipo: string
  origen: string
  monto: string
  doc_origen_id: string | null
  doc_origen_tipo: string | null
  reversado: number
}

interface BridgeRow {
  pago_id: string
}

/**
 * Orquestador del reverso REAL de un abono directo bancario desde
 * tesoreria (slice 2b-i-a, `reverso-abono-directo-tesoreria-sin-saf`,
 * CASO SIMPLE — sin SAF). Un ingreso `TRANSFERENCIA_CLIENTE` puede estar
 * ligado a 1..N `pagos` via el puente `movimientos_bancarios_pagos`
 * (mismo query de `previewFacturasAfectadas`); esta funcion reversa el
 * egreso bancario contraparte Y cada pago ligado en UNA sola
 * `db.writeTransaction` (ver design.md "Order en la tx del orquestador").
 *
 * PRE-TX (lecturas puras, `db.getAll`):
 *   1. Leer el ingreso — abortar si no existe, si no es
 *      `origen='TRANSFERENCIA_CLIENTE'`, o si ya esta `reversado=1`.
 *   2. Resolver el puente (`movimientos_bancarios_pagos` JOIN `pagos`,
 *      filtro `is_reversed IS NULL OR =0`) — abortar (LEGACY, sin
 *      trazabilidad) si no hay filas.
 *   3. Por cada `pago_id` del puente: `detectarLoteSafDePago` — si
 *      CUALQUIERA devuelve `facturasAfectadas` no-vacio, abortar con el
 *      mensaje SAF-block ANTES de abrir la tx (CERO mutacion garantizada).
 *      El `generatedLote` de cada pago se guarda para pasarlo, ya
 *      resuelto, a `reversarPagoEnTx` (nunca re-detectado dentro de la
 *      tx — mismo motivo anti-deadlock que `registrarReversoAbono`).
 *
 * EN LA TX (una sola `db.writeTransaction`):
 *   (i)   Re-`SELECT movimientos_bancarios` + re-chequeo `reversado`
 *         (TOCTOU, primera statement).
 *   (ii)  Crear el egreso contraparte (mecanica de `reversarMovBancario`
 *         inline: `tipo='EGRESO'`, `origen='REVERSO'`, `monto` = el total
 *         del ingreso — nunca la suma de `montoAplicadoUsd` por pago,
 *         `deposito_directo` garantiza `ingreso.monto = Sigma pagos`),
 *         `validado=1`/`validado_por=userId`/`validado_at=now` (nace
 *         directo en Historico como Validado, nunca en Pendientes — ver
 *         `openspec/specs/tesoreria-reverso-abono-directo/spec.md`),
 *         decrementar `bancos_empresa.saldo_actual`, marcar el ingreso
 *         original `reversado=1`.
 *   (iii) Loop sobre los `pago_id` del puente delegando en
 *         `reversarPagoEnTx(tx, ...)` — NUNCA `registrarReversoAbono`
 *         standalone, que abriria una segunda `db.writeTransaction`
 *         anidada (no soportada por wa-sqlite).
 *
 * Aislamiento multi-tenant: TODAS las queries (pre-tx y dentro de la tx)
 * filtran `empresa_id` explicitamente.
 */
export async function reversarAbonoDirectoDesdeTesoreria(
  params: ReversarAbonoDirectoParams
): Promise<void> {
  const { ingresoId, motivo, userId, reversedByNombre, empresaId } = params

  // PRE-TX 1: leer el ingreso, confirmar origen y que no este ya reversado.
  const movRows = await db.getAll<MovimientoBancarioLectura>(
    `SELECT id, banco_empresa_id, tipo, origen, monto, doc_origen_id, doc_origen_tipo, reversado
     FROM movimientos_bancarios WHERE id = ? AND empresa_id = ?`,
    [ingresoId, empresaId]
  )
  const movPreTx = movRows[0]
  if (!movPreTx) {
    throw new Error('Movimiento no encontrado')
  }
  if (movPreTx.origen !== 'TRANSFERENCIA_CLIENTE') {
    throw new Error('Este movimiento no es una transferencia de cliente; use el reverso estandar de tesoreria')
  }
  if (movPreTx.reversado === 1) {
    throw new Error('Este movimiento ya fue reversado')
  }

  // PRE-TX 2: resolver el puente (mismo query de `previewFacturasAfectadas`,
  // use-preview-facturas-afectadas.ts L68-75) — filtra pagos ya reversados
  // desde CxC (convencion establecida en 8+ sitios del modulo).
  const bridgeRows = await db.getAll<BridgeRow>(
    `SELECT mbp.pago_id
     FROM movimientos_bancarios_pagos mbp
     JOIN pagos p ON p.id = mbp.pago_id
     WHERE mbp.ingreso_id = ? AND mbp.empresa_id = ? AND (p.is_reversed IS NULL OR p.is_reversed = 0)`,
    [ingresoId, empresaId]
  )
  if (bridgeRows.length === 0) {
    throw new Error('Este ingreso no tiene trazabilidad de pagos asociados; no se puede reversar desde tesoreria')
  }

  // PRE-TX 3: SAF-block — CERO mutacion si algun pago del puente genero
  // saldo a favor ya consumido en otras facturas (fuera de alcance de este
  // slice, ver design.md "Open Questions" / spec Requirement 4).
  const generatedLotePorPago = new Map<string, boolean>()
  for (const { pago_id } of bridgeRows) {
    const detalle = await detectarLoteSafDePago(empresaId, pago_id)
    if (detalle.facturasAfectadas.length > 0) {
      throw new Error(
        'Este abono genero saldo a favor consumido en otras facturas; reversar desde tesoreria no esta disponible todavia'
      )
    }
    generatedLotePorPago.set(pago_id, detalle.generatedLote)
  }

  const now = localNow()

  await db.writeTransaction(async (tx) => {
    // (i) TOCTOU: re-leer movimientos_bancarios dentro de la tx — la unica
    // guardia real, ya que esta tabla no tiene trigger Postgres anti-doble-
    // reverso (a diferencia de `pagos`/`trg_pagos_allow_reversal`).
    const movResult = await tx.execute(
      `SELECT banco_empresa_id, monto, doc_origen_id, doc_origen_tipo, reversado
       FROM movimientos_bancarios WHERE id = ? AND empresa_id = ?`,
      [ingresoId, empresaId]
    )
    if (!movResult.rows || movResult.rows.length === 0) {
      throw new Error('Movimiento no encontrado')
    }
    const mov = movResult.rows.item(0) as {
      banco_empresa_id: string
      monto: string
      doc_origen_id: string | null
      doc_origen_tipo: string | null
      reversado: number
    }
    if (mov.reversado === 1) {
      throw new Error('Este movimiento ya fue reversado')
    }

    // (ii) Crear el egreso contraparte — mecanica de `reversarMovBancario`
    // (use-conciliacion-tesoreria.ts L96-151) inline, UN solo egreso por el
    // monto TOTAL del ingreso.
    const bancoResult = await tx.execute(
      `SELECT saldo_actual FROM bancos_empresa WHERE id = ? AND empresa_id = ?`,
      [mov.banco_empresa_id, empresaId]
    )
    const saldoAnterior = new Decimal(
      (bancoResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
    )
    const montoEgreso = new Decimal(mov.monto)
    const saldoNuevo = saldoAnterior.minus(montoEgreso)

    const egresoId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_bancarios
         (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
          doc_origen_id, doc_origen_tipo, referencia, descripcion, validado, validado_por, validado_at,
          reversado, reverso_de, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'EGRESO', 'REVERSO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        egresoId,
        empresaId,
        mov.banco_empresa_id,
        mov.monto,
        toStorageString(saldoAnterior),
        toStorageString(saldoNuevo),
        mov.doc_origen_id,
        mov.doc_origen_tipo,
        null,
        motivo,
        1,
        userId,
        now,
        0,
        ingresoId,
        todayStr(),
        now,
        userId,
      ]
    )

    await tx.execute(
      `UPDATE bancos_empresa SET saldo_actual = ?, updated_at = ? WHERE id = ? AND empresa_id = ?`,
      [toStorageString(saldoNuevo), now, mov.banco_empresa_id, empresaId]
    )

    await tx.execute(
      `UPDATE movimientos_bancarios SET reversado = 1 WHERE id = ? AND empresa_id = ?`,
      [ingresoId, empresaId]
    )

    // (iii) Loop: delegar cada pago del puente a `reversarPagoEnTx` contra
    // la MISMA tx — nunca `registrarReversoAbono` standalone (abriria una
    // segunda `db.writeTransaction` anidada, no soportada por wa-sqlite).
    for (const { pago_id } of bridgeRows) {
      await reversarPagoEnTx(tx, {
        pagoId: pago_id,
        empresaId,
        reversedBy: userId,
        reversedByNombre,
        reason: motivo,
        now,
        generatedLote: generatedLotePorPago.get(pago_id) ?? false,
      })
    }
  })
}
