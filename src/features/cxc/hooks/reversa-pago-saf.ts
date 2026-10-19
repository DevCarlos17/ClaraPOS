import Decimal from 'decimal.js'
import type { Transaction } from '@powersync/common'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/core/db/powersync/db'
import { toStorageString } from '@/lib/currency'
import { calcularSaldoPendienteClienteNuevo, calcularSafDisponibleNuevo } from '@/features/cxc/lib/saldo-cliente'

/**
 * Reporte de deteccion de lote SAF generado por un `pago` (slice 3b-i de
 * `cxc-ledger-saldos-redesign`). Consumida por la futura logica de reverso
 * por compensacion (slice 3b-ii, `reversarPagoSafEnTx`) y, mas adelante, por
 * el modal de confirmacion de reverso (fuera de alcance de este change — ver
 * design.md "No UI surface").
 */
export interface DetalleLoteSafDePago {
  /** `true` si el `pago` genero un lote `saf_creditos_lotes` (origen_tipo='PAGO'). */
  generatedLote: boolean
  loteId?: string
  montoOriginalUsd?: number
  saldoDisponibleUsd?: number
  /** `monto_original_usd - saldo_disponible_usd`. */
  montoConsumidoUsd?: number
  /** Filas INMUTABLES originales de `saf_creditos_aplicaciones` — nunca una tabla de detalle nueva (cero riesgo de drift). */
  facturasAfectadas: Array<{ ventaId: string; nroFactura: string; montoAplicadoUsd: number }>
}

interface LoteSafRow {
  id: string
  monto_original_usd: string
  saldo_disponible_usd: string
}

interface AplicacionSafRow {
  venta_id: string
  nro_factura: string
  monto_aplicado_usd: string
}

/**
 * Detecta si un `pago` genero un lote de credito SAF (saldo a favor) y, de
 * ser asi, cuanto fue consumido y que facturas fueron afectadas. PURA
 * LECTURA — cero mutacion, cero `db.writeTransaction` (ver design.md "Read
 * function" de cxc-ledger-saldos-redesign). Usa `db.getAll` directo, mismo
 * patron que los reportes de solo-lectura de este modulo
 * (`cxc-reportes-general.tsx`, `cxc-cliente-reporte.tsx`).
 *
 * Query 1: liga el lote con su `pago` originador via
 * `saf_creditos_lotes.origen_tipo='PAGO' AND origen_id=<pago_id>` (link
 * existente desde slice 3a). Si no hay lote, retorna de inmediato sin
 * disparar la Query 2.
 *
 * Query 2: lee las filas INMUTABLES originales de
 * `saf_creditos_aplicaciones` (join a `ventas` por `nro_factura`) — nunca
 * una tabla de detalle nueva/reconstruida, cero riesgo de drift respecto al
 * ledger real.
 *
 * Ambas queries filtran por `empresa_id` (aislamiento multi-tenant,
 * no-negociable — ver spec Requirement "Multitenant isolation").
 */
export async function detectarLoteSafDePago(
  empresaId: string,
  pagoId: string
): Promise<DetalleLoteSafDePago> {
  const lotes = await db.getAll<LoteSafRow>(
    `SELECT id, monto_original_usd, saldo_disponible_usd
     FROM saf_creditos_lotes
     WHERE origen_tipo = 'PAGO' AND origen_id = ? AND empresa_id = ?`,
    [pagoId, empresaId]
  )

  const lote = lotes[0]
  if (!lote) {
    return { generatedLote: false, facturasAfectadas: [] }
  }

  const montoOriginal = new Decimal(lote.monto_original_usd)
  const saldoDisponible = new Decimal(lote.saldo_disponible_usd)
  const montoConsumido = montoOriginal.minus(saldoDisponible)

  const aplicaciones = await db.getAll<AplicacionSafRow>(
    `SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd
     FROM saf_creditos_aplicaciones sca
     JOIN ventas v ON v.id = sca.venta_id
     WHERE sca.lote_id = ? AND sca.empresa_id = ?`,
    [lote.id, empresaId]
  )

  return {
    generatedLote: true,
    loteId: lote.id,
    montoOriginalUsd: montoOriginal.toNumber(),
    saldoDisponibleUsd: saldoDisponible.toNumber(),
    montoConsumidoUsd: montoConsumido.toNumber(),
    facturasAfectadas: aplicaciones.map((a) => ({
      ventaId: a.venta_id,
      nroFactura: a.nro_factura,
      montoAplicadoUsd: new Decimal(a.monto_aplicado_usd).toNumber(),
    })),
  }
}

// =============================================================================
// reversarPagoSafEnTx — COMPENSACION (slice 3b-ii)
// =============================================================================

export interface ReversarPagoSafEnTxParams {
  pagoId: string
  empresaId: string
  clienteId: string
  reversedBy: string
  /** Timestamp tecnico, igual al `now` del llamador (mismo patron que `consumirSafLotesEnTx`). */
  now: string
}

/**
 * Compensa un `pago` que genero un lote de credito SAF, ya parcial o
 * totalmente consumido, SIN mutar ninguna fila historica de
 * `saf_creditos_lotes`/`saf_creditos_aplicaciones` (spec
 * `cxc-reversa-pago-saf`, Requirement "Compensation without row mutation").
 *
 * Corre DENTRO de la `tx` del llamador (Step 4b de `registrarReversoAbono`,
 * slice 3b-iii) — NUNCA abre su propia `db.writeTransaction` (mismo
 * contrato que `consumirSafLotesEnTx`/`reversarDiferencialEnTx`).
 *
 * ## CONTRATO PARA EL LLAMADOR (slice 3b-iii, OBLIGATORIO)
 *
 * Esta funcion es la UNICA escritora de los efectos de saldo del reverso
 * para un `pago` que genero lote (`generatedLote=true` segun
 * `detectarLoteSafDePago`). El llamador (`registrarReversoAbono`) DEBE
 * omitir, cuando `generatedLote` es `true`:
 *   - su propio Step 4 (`UPDATE clientes SET saldo_actual=..., saldo_pendiente_usd=...`
 *     con el monto COMPLETO del pago) — esta funcion ya escribe la UNICA
 *     `UPDATE clientes` correcta, calculada con el monto REAL consumido,
 *     no el monto completo del lote.
 *   - su propio Step 5 (INSERT del `REV` con `venta_id=NULL` por el monto
 *     completo del pago) — esta funcion ya inserta un `REV` por cada
 *     factura REALMENTE afectada (y un `SAFR` para el remanente nunca
 *     consumido); un `REV` adicional por el monto completo duplicaria
 *     `saldo_pendiente_usd` (confirmado: triple-conteo $260 en vez de $60
 *     en el escenario canonico $100/$60-consumido/$40-remanente — ver
 *     `sdd/cxc-ledger-saldos-redesign/analysis-reverso-saldo-actual`).
 * Ver slice 3b-iii de tasks.md para la implementacion de esta condicional
 * en el llamador — NO se toca `use-cxc.ts` en este slice.
 *
 * Mecanismo (design.md Q4, worked example: lote $100, $60 consumido contra
 * 1 venta, $40 sin consumir):
 *
 *   1. Por cada fila INMUTABLE de `saf_creditos_aplicaciones` (factura
 *      afectada): INSERT un `REV` en `movimientos_cuenta`
 *      (`doc_origen_tipo='PAGO'`, `doc_origen_id=pagoId`, `venta_id`=esa
 *      factura, `monto=monto_aplicado_usd`) + `UPDATE ventas SET
 *      saldo_pend_usd = saldo_pend_usd + monto_aplicado_usd` (reabre la
 *      factura). `estado` NUNCA se fija a mano aqui — queda para que el
 *      trigger Postgres `prevent_venta_mutation()` lo re-derive al
 *      sincronizar (alcance deliberadamente angosto de este slice: cero
 *      SELECT adicional de `total_usd` para no ampliar la superficie de
 *      escritura/lectura de la funcion mas riesgosa de todo el change).
 *      `saldo_pendiente_usd` optimista (en memoria) se acumula por cada
 *      fila via `calcularSaldoPendienteClienteNuevo('REV', running, monto)`
 *      — SOLO el monto REAL reabierto, nunca el monto completo del pago.
 *
 *   2. Si el lote tiene remanente SIN CONSUMIR (`saldo_disponible_usd >
 *      0` al momento del reverso): INSERT `saf_creditos_reversas` (ancla
 *      `lote_id`+`pago_id`, `saldo_disponible_anulado_usd` = el remanente)
 *      + un `SAFR` pareado en `movimientos_cuenta` (`monto` = el mismo
 *      remanente). El UNICO mecanismo que fuerza
 *      `saldo_disponible_usd=0`/`status='AGOTADO'` en el lote es el
 *      trigger `anular_saf_lote_reversa()` (migrations/0113) disparado por
 *      ese INSERT — esta funcion JAMAS hace `UPDATE`/`DELETE` sobre
 *      `saf_creditos_lotes`/`saf_creditos_aplicaciones`. `saf_disponible`
 *      optimista se reduce via `calcularSafDisponibleNuevo('SAFR', running,
 *      remanente)` (misma formula de consumo que 'SAF', piso en 0).
 *
 *   3. Si el lote NUNCA se genero (este `pago` no origino ningun credito
 *      SAF): return temprano, CERO escrituras (ni siquiera la UPDATE
 *      clientes — nada que compensar).
 *
 *   4. Escritura optimista pareada FINAL (slice 1b-style, mismo patron que
 *      TODOS los demas sitios SAF/SAFC de `use-cxc.ts`): UNA sola
 *      `UPDATE clientes SET saldo_actual=?, saldo_pendiente_usd=?,
 *      saf_disponible=?, updated_at=? WHERE id=? AND empresa_id=?` con los
 *      3 valores acumulados en memoria durante los pasos 1-2. El trigger
 *      Postgres `actualizar_saldo_cliente()` (migrations/0114) sigue
 *      siendo la autoridad final al sincronizar (REV/SAFR confian en
 *      `saldo_nuevo` sin recalculo); esta UPDATE es solo el espejo local
 *      optimista para que SQLite (que no corre triggers Postgres) refleje
 *      el estado correcto ANTES del proximo sync.
 *
 * `saldo_actual`: se mantiene la cadena `saldo_anterior`/`saldo_nuevo` de
 * cada fila REV/SAFR (REV suma el monto consumido, SAFR no cambia nada) y
 * se escribe el valor final resultante en la UPDATE clientes — es un
 * mejor-esfuerzo INTERNAMENTE CONSISTENTE con esas filas, pero su
 * correccion economica COMPLETA en el escenario multi-hop (SAF consumido
 * en una transaccion separada, luego el pago original revertido) depende
 * de una convencion de signo AGUAS ARRIBA fuera de alcance de este slice
 * (el paso previo SAF de `registrarAbonoGlobal`, use-cxc.ts:976-977, usa
 * direccion "+monto" que no necesariamente netea a cero contra el FAC
 * pareado) — NO se corrige aqui, documentado para 3b-iii/futuro.
 */
export async function reversarPagoSafEnTx(tx: Transaction, params: ReversarPagoSafEnTxParams): Promise<void> {
  const { pagoId, empresaId, clienteId, reversedBy, now } = params

  // 1. Detectar el lote DENTRO de esta misma tx (no via `detectarLoteSafDePago`/
  // `db.getAll` — eso usaria una conexion de solo-lectura fuera de la tx en
  // curso, sin garantia de ver escrituras pendientes de esta transaccion).
  const lotesRes = await tx.execute(
    `SELECT id, monto_original_usd, saldo_disponible_usd
     FROM saf_creditos_lotes
     WHERE origen_tipo = 'PAGO' AND origen_id = ? AND empresa_id = ?`,
    [pagoId, empresaId]
  )
  const lote = lotesRes.rows?.length ? (lotesRes.rows.item(0) as LoteSafRow) : undefined
  if (!lote) return // Este pago no genero ningun lote SAF — nada que compensar.

  const aplicacionesRes = await tx.execute(
    `SELECT sca.venta_id, v.nro_factura, sca.monto_aplicado_usd
     FROM saf_creditos_aplicaciones sca
     JOIN ventas v ON v.id = sca.venta_id
     WHERE sca.lote_id = ? AND sca.empresa_id = ?`,
    [lote.id, empresaId]
  )
  const totalAplicaciones = aplicacionesRes.rows?.length ?? 0
  const facturasAfectadas: Array<{ ventaId: string; nroFactura: string; montoAplicadoUsd: Decimal }> = []
  for (let i = 0; i < totalAplicaciones; i++) {
    const row = aplicacionesRes.rows!.item(i) as AplicacionSafRow
    facturasAfectadas.push({
      ventaId: row.venta_id,
      nroFactura: row.nro_factura,
      montoAplicadoUsd: new Decimal(row.monto_aplicado_usd),
    })
  }

  const saldoDisponible = new Decimal(lote.saldo_disponible_usd)

  // 2. Snapshot UNICO del ledger del cliente — "saldo_anterior" de la
  // primera fila de esta cascada. Se acumula EN MEMORIA a traves del loop
  // (nunca se vuelve a leer `clientes` entre filas) y se escribe de vuelta
  // UNA sola vez al final (paso 4, escritura optimista pareada — ver
  // docstring, "CONTRATO PARA EL LLAMADOR").
  const clienteRes = await tx.execute(
    `SELECT saldo_actual, saldo_pendiente_usd, saf_disponible FROM clientes WHERE id = ? AND empresa_id = ?`,
    [clienteId, empresaId]
  )
  if (!clienteRes.rows?.length) {
    throw new Error('Cliente no encontrado para la compensacion de reverso SAF')
  }
  const clienteRow = clienteRes.rows.item(0) as {
    saldo_actual: string
    saldo_pendiente_usd: string
    saf_disponible: string
  }
  let saldoActualRunning = new Decimal(clienteRow.saldo_actual || '0')
  let saldoPendienteRunning = new Decimal(clienteRow.saldo_pendiente_usd || '0')
  let safDisponibleRunning = new Decimal(clienteRow.saf_disponible || '0')

  // 3. Por cada factura afectada: REV reabre la deuda (ledger + factura).
  for (const { ventaId, nroFactura, montoAplicadoUsd } of facturasAfectadas) {
    const saldoAnterior = saldoActualRunning
    const saldoNuevo = saldoAnterior.plus(montoAplicadoUsd)
    saldoActualRunning = saldoNuevo
    // Deuda pendiente optimista: SOLO el monto REAL reabierto para esta
    // factura (nunca el monto completo del pago — ese era el bug de
    // triple-conteo que este fix corrige).
    saldoPendienteRunning = calcularSaldoPendienteClienteNuevo('REV', saldoPendienteRunning, montoAplicadoUsd)

    await tx.execute(
      `INSERT INTO movimientos_cuenta
         (id, empresa_id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, doc_origen_id, doc_origen_tipo, venta_id, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'REV', ?, ?, ?, ?, ?, ?, 'PAGO', ?, ?, ?, ?)`,
      [
        uuidv4(),
        empresaId,
        clienteId,
        `REV-SAF-${nroFactura}`,
        toStorageString(montoAplicadoUsd),
        toStorageString(saldoAnterior),
        toStorageString(saldoNuevo),
        `Reverso de credito SAF aplicado a factura ${nroFactura} (pago ${pagoId} reversado)`,
        pagoId,
        ventaId,
        now,
        now,
        reversedBy,
      ]
    )

    await tx.execute(`UPDATE ventas SET saldo_pend_usd = saldo_pend_usd + ? WHERE id = ?`, [
      toStorageString(montoAplicadoUsd),
      ventaId,
    ])
  }

  // 4. Remanente sin consumir: anular via `saf_creditos_reversas` + `SAFR`
  // pareado. Un lote totalmente consumido (remanente ya en 0) NO genera
  // esta rama — nada que anular (design.md linea 105-106).
  if (saldoDisponible.gt(0)) {
    const safrMovId = uuidv4()
    const saldoAnteriorSafr = saldoActualRunning
    // SAFR no toca saldo_actual (mejor-esfuerzo, ver docstring "saldo_actual"):
    // anular el remanente nunca-consumido no es ni un pago ni una deuda, es
    // la destruccion de credito standing que nunca se gasto.
    const saldoNuevoSafr = saldoAnteriorSafr
    saldoActualRunning = saldoNuevoSafr
    // saf_disponible optimista: SAFR consume igual que SAF (piso en 0).
    safDisponibleRunning = calcularSafDisponibleNuevo('SAFR', safDisponibleRunning, saldoDisponible)

    await tx.execute(
      `INSERT INTO movimientos_cuenta
         (id, empresa_id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, doc_origen_id, doc_origen_tipo, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'SAFR', ?, ?, ?, ?, ?, ?, 'PAGO', ?, ?, ?)`,
      [
        safrMovId,
        empresaId,
        clienteId,
        `SAFR-${lote.id}`,
        toStorageString(saldoDisponible),
        toStorageString(saldoAnteriorSafr),
        toStorageString(saldoNuevoSafr),
        `Anulacion de remanente SAF no consumido (pago ${pagoId} reversado)`,
        pagoId,
        now,
        now,
        reversedBy,
      ]
    )

    await tx.execute(
      `INSERT INTO saf_creditos_reversas
         (id, empresa_id, cliente_id, lote_id, pago_id, movimiento_cuenta_id,
          saldo_disponible_anulado_usd, lote_saldo_antes_usd, lote_saldo_despues_usd,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        empresaId,
        clienteId,
        lote.id,
        pagoId,
        safrMovId,
        toStorageString(saldoDisponible),
        // lote_saldo_antes/despues_usd: trigger-computed en Postgres
        // (anular_saf_lote_reversa(), migrations/0113) — estos valores
        // optimistas locales se sobreescriben al sincronizar, igual que
        // el resto de los pares lote/aplicacion de este modulo.
        toStorageString(saldoDisponible),
        '0',
        now,
        now,
        reversedBy,
      ]
    )
  }

  // 4. Escritura optimista pareada FINAL — UNA sola UPDATE clientes con los
  // 3 valores acumulados (ver docstring, "CONTRATO PARA EL LLAMADOR": esta
  // funcion es la UNICA escritora de los efectos de saldo de este reverso
  // para un pago que genero lote; el llamador debe omitir sus propios
  // Steps 4/5 cuando `generatedLote` es true).
  await tx.execute(
    `UPDATE clientes SET saldo_actual = ?, saldo_pendiente_usd = ?, saf_disponible = ?, updated_at = ? WHERE id = ? AND empresa_id = ?`,
    [
      toStorageString(saldoActualRunning),
      toStorageString(saldoPendienteRunning),
      toStorageString(safDisponibleRunning),
      now,
      clienteId,
      empresaId,
    ]
  )
}
