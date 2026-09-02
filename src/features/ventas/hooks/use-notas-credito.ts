import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import Decimal from 'decimal.js'
import { toStorageString } from '@/lib/currency'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosNCR } from '@/features/contabilidad/lib/generar-asientos'
import { reversarDiferencialEnTx, useDetalleFactura as useDetalleFacturaCanonica } from '@/features/cxc/hooks/use-cxc'
import { upsertStockDeposito } from '@/features/inventario/lib/stock-deposito'
import { resolveDepositoReingresoNcr } from '@/features/inventario/lib/deposito-inactivo'

// ─── Interfaces ─────────────────────────────────────────────

export interface NotaCreditoRow {
  id: string
  nro_ncr: string
  venta_id: string
  cliente_id: string
  tipo: string
  motivo: string
  tasa_historica: string
  total_usd: string
  total_bs: string
  fecha: string
  nro_factura: string
  cliente_nombre: string
}

export interface FacturaParaAnular {
  id: string
  nro_factura: string
  cliente_id: string
  cliente_nombre: string
  cliente_identificacion: string
  tasa: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tipo: string
  fecha: string
}

export interface DetalleFacturaItem {
  producto_nombre: string
  producto_codigo: string
  cantidad: string
  precio_unitario_usd: string
}

export interface PagoFacturaItem {
  metodo_nombre: string
  moneda: string
  monto: string
  monto_usd: string
}

/**
 * Modalidad de liquidacion (Slice 3, Design §Decision 4, Spec
 * notas-credito-liquidacion). `EFECTIVO_REAL` es la condicion — no una
 * "modalidad" del selector de UI en el sentido estricto de la spec — que
 * dispara la Regla de Oro (egreso real del cajon POS activo); se incluye
 * aqui porque el mismo campo `liquidacion_modalidad` la persiste (CHECK de
 * `migrations/0091_notas_credito_schema.sql` y Design §5 tabla de schema
 * listan 5 valores, no 4 — obs #2812, reconciliado en este slice).
 * `REFUND_TESORERIA` esta validado por el tipo pero NO implementado hasta
 * Slice 6 (throw explicito, ver `crearNotaCredito`).
 */
export type LiquidacionModalidad =
  | 'EFECTIVO_REAL'
  | 'SALDO_FAVOR'
  | 'COMPENSACION_VENTA'
  | 'AJUSTE_CXC'
  | 'REFUND_TESORERIA'

/** Modalidades que MUST NOT generar ninguna salida de efectivo/tarjeta (Spec notas-credito-liquidacion, Gate anti-fraude). */
const MODALIDADES_NO_DESEMBOLSO: readonly LiquidacionModalidad[] = [
  'SALDO_FAVOR',
  'COMPENSACION_VENTA',
  'AJUSTE_CXC',
]

export function esModalidadNoDesembolso(modalidad: LiquidacionModalidad): boolean {
  return (MODALIDADES_NO_DESEMBOLSO as readonly string[]).includes(modalidad)
}

/** Parametro que representaria un intento explicito de forzar una salida de caja. Solo lo consume el gate — nunca dispara el egreso real de la Regla de Oro (ese se calcula internamente, ver `aplicaReglaDeOro`). */
export interface EgresoCajaParams {
  metodoCobroId: string
  monto: number
}

/**
 * Gate anti-fraude de "comprobante de no-desembolso" (Design §3 paso 0b,
 * Spec notas-credito-liquidacion req. Gate anti-fraude). Bloquea A NIVEL DE
 * FUNCION — no depende de que la UI lo impida — cualquier intento de
 * combinar una modalidad no-efectivo con un pedido explicito de salida de
 * caja. Se evalua ANTES de abrir la transaccion (ni siquiera toca la DB):
 * una llamada directa a `crearNotaCredito` que bypasee la UI cae en el
 * mismo chequeo.
 */
export function assertGateAntiFraudeNoDesembolso(
  modalidad: LiquidacionModalidad,
  egresoParams: EgresoCajaParams | undefined
): void {
  if (egresoParams && esModalidadNoDesembolso(modalidad)) {
    throw new Error(
      `Comprobante de no-desembolso violado: la modalidad '${modalidad}' no admite una salida de efectivo/tarjeta. El bloqueo se aplica a nivel de funcion, no de UI.`
    )
  }
}

export interface CrearNotaCreditoParams {
  venta_id: string
  motivo: string
  usuario_id: string
  empresa_id: string
  /**
   * Ambito de emision (Regla de Oro, obs #2804): 'POS' = cajero dentro de su
   * sesion de caja activa (solo facturas de esa sesion). 'TRADICIONAL' =
   * modulo dedicado de NC, cualquier factura de la empresa, NUNCA toca el
   * cajon fisico de una sesion activa sin egreso explicito (fuera de scope
   * de este slice — ver REFUND_TESORERIA, Slice 6).
   */
  entryPoint: 'POS' | 'TRADICIONAL'
  /** Id de la sesion de caja activa del cajero — solo relevante cuando `entryPoint === 'POS'`. */
  sesionCajaActivaId?: string
  /** Modalidad de liquidacion elegida (Slice 3, obligatoria). */
  modalidad: LiquidacionModalidad
  /**
   * Defensa en profundidad / prueba directa del gate anti-fraude: NUNCA se
   * envia en el flujo normal junto a una modalidad no-efectivo. El egreso
   * real de la Regla de Oro (EFECTIVO_REAL) se calcula internamente a partir
   * de `entryPoint`/`sesionCajaActivaId`/`venta.sesion_caja_id` — este
   * parametro NO lo dispara, solo existe para que el gate tenga algo
   * explicito que rechazar.
   */
  egresoParams?: EgresoCajaParams
}

export interface CrearNotaCreditoResult {
  ncrId: string
  nroNcr: string
}

// ─── Listado de NCR ─────────────────────────────────────────

export function useNotasCredito() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT
       nc.id, nc.nro_ncr, nc.venta_id, nc.cliente_id, nc.tipo, nc.motivo,
       nc.tasa_historica, nc.total_usd, nc.total_bs, nc.fecha,
       v.nro_factura,
       c.nombre as cliente_nombre
     FROM notas_credito nc
     JOIN ventas v ON nc.venta_id = v.id
     JOIN clientes c ON nc.cliente_id = c.id
     WHERE nc.empresa_id = ?
     ORDER BY nc.fecha DESC`,
    [empresaId]
  )

  return { notas: (data ?? []) as NotaCreditoRow[], isLoading }
}

// ─── Buscar factura para anular ─────────────────────────────

export function useBuscarFacturaParaAnular(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 1

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT
           v.id, v.nro_factura, v.cliente_id, v.tasa, v.total_usd, v.total_bs,
           v.saldo_pend_usd, v.tipo, v.fecha,
           c.nombre as cliente_nombre,
           c.identificacion as cliente_identificacion
         FROM ventas v
         JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND v.status != 'ANULADA'
           AND v.nro_factura LIKE ?
         ORDER BY v.fecha DESC
         LIMIT 10`
      : '',
    shouldSearch ? [empresaId, `%${searchTerm}%`] : []
  )

  return { facturas: (data ?? []) as FacturaParaAnular[], isLoading }
}

// ─── Detalle de factura (articulos + pagos) ─────────────────
// La consulta de lineas (ventas_det + productos) vive en el hook canonico
// de `use-cxc.ts` — aca solo se agrega la consulta de pagos, propia de este
// flujo de anulacion/reimpresion.

export function useDetalleFactura(ventaId: string | null) {
  const { detalle, isLoading: loadingDetalles } = useDetalleFacturaCanonica(ventaId)

  const { data: pagos, isLoading: loadingPagos } = useQuery(
    ventaId
      ? `SELECT mp.nombre as metodo_nombre, CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mon.codigo_iso, 'USD') END as moneda, pg.monto, pg.monto_usd
         FROM pagos pg
         JOIN metodos_cobro mp ON pg.metodo_cobro_id = mp.id
         LEFT JOIN monedas mon ON pg.moneda_id = mon.id
         WHERE pg.venta_id = ?`
      : '',
    ventaId ? [ventaId] : []
  )

  return {
    detalles: detalle,
    pagos: (pagos ?? []) as PagoFacturaItem[],
    isLoading: loadingDetalles || loadingPagos,
  }
}

// ─── Funcion atomica: crearNotaCredito ──────────────────────

export async function crearNotaCredito(
  params: CrearNotaCreditoParams
): Promise<CrearNotaCreditoResult> {
  const { venta_id, motivo, usuario_id, empresa_id, entryPoint, sesionCajaActivaId, modalidad, egresoParams } =
    params

  // 0b. Gate anti-fraude (Design §3 paso 0b): se evalua ANTES de abrir la
  // transaccion — sin tocar la DB. Ver `assertGateAntiFraudeNoDesembolso`.
  assertGateAntiFraudeNoDesembolso(modalidad, egresoParams)

  // REFUND_TESORERIA esta validado por el tipo pero se implementa recien en
  // Slice 6 (Design §5, "no requiere schema nuevo" pero SI logica nueva que
  // aun no existe en este slice).
  if (modalidad === 'REFUND_TESORERIA') {
    throw new Error('REFUND_TESORERIA aun no esta implementado (ver Slice 6)')
  }

  let ncrId = ''
  let nroNcr = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    ncrId = uuidv4()

    // 1. Leer factura y validar. El reingreso de stock vuelve al deposito
    //    de ORIGEN de la venta (`venta.deposito_id`, NOT NULL desde
    //    0006_ventas.sql) — NUNCA se re-deriva el deposito principal de la
    //    empresa (spec NCD/Reingreso al Deposito de Origen).
    const ventaResult = await tx.execute('SELECT * FROM ventas WHERE id = ?', [venta_id])
    if (!ventaResult.rows || ventaResult.rows.length === 0) {
      throw new Error('Factura no encontrada')
    }
    const venta = ventaResult.rows.item(0) as {
      id: string
      cliente_id: string
      nro_factura: string
      tasa: string
      total_usd: string
      total_bs: string
      saldo_pend_usd: string
      tipo: string
      status: string
      deposito_id: string
      sesion_caja_id: string | null
    }
    const depositoOrigenId = venta.deposito_id

    // Slice 2 (Regla de Oro, obs #2804/#2807 Design §4): la NC solo queda
    // vinculada a la sesion de caja ACTIVA cuando se emite desde el POS
    // express — el modulo Tradicional NUNCA la vincula (factura potencialmente
    // historica, ni idea de que sesion este abierta en este momento).
    const sesionCajaIdParaNc = entryPoint === 'POS' ? sesionCajaActivaId ?? null : null

    // Tipo TOTAL es el unico soportado hasta Slice 4b (NC parcial). Se deja
    // como variable explicita porque la reversa de pagos (paso 5c) solo debe
    // aplicar para tipo='TOTAL' (Design §3) — Slice 4b la extendera.
    const tipoNc = 'TOTAL'

    // Condicion completa del diseño (Design §Decision 4, obs #2814 — fix
    // mandatorio de slice 3): entryPoint==='POS' && modalidad==='EFECTIVO_REAL'
    // && venta.sesion_caja_id===sesionCajaActivaId. Slice 2 dejaba el chequeo
    // de modalidad afuera (el parametro no existia todavia) — trampa latente
    // detectada en verify: una NC-POS liquidada como SALDO_FAVOR/AJUSTE_CXC/
    // COMPENSACION_VENTA hubiera escrito igual el egreso de caja. Ahora la
    // modalidad es el termino decisivo: solo EFECTIVO_REAL mueve el cajon.
    const aplicaReglaDeOro =
      entryPoint === 'POS' &&
      modalidad === 'EFECTIVO_REAL' &&
      !!sesionCajaActivaId &&
      venta.sesion_caja_id === sesionCajaActivaId

    // Persistido en `notas_credito.no_desembolso` (Design §5, Spec gate
    // anti-fraude) — TRUE para las 3 modalidades sin efectivo, FALSE para
    // EFECTIVO_REAL/REFUND_TESORERIA (estas SI mueven dinero, aunque por
    // rieles distintos: cajon POS vs tesoreria).
    const noDesembolso = esModalidadNoDesembolso(modalidad)

    if (venta.status === 'ANULADA') {
      throw new Error('Esta factura ya fue anulada')
    }

    // Reingreso automatico (change `guarda-deposito-inactivo` Slice B,
    // decision de producto #3, obs #2228): si el deposito de ORIGEN de la
    // venta sigue activo, el stock reingresa ahi (comportamiento pre-existente,
    // sin cambios). Si fue desactivado desde la venta, cae AUTOMATICAMENTE al
    // deposito principal ACTUAL de la empresa — el cajero NUNCA elige (flujo
    // POS-express, "reversar factura del dia"). Resuelto ANTES de construir
    // cualquier INSERT de `movimientos_inventario`, para que el trigger DB de
    // defensa en profundidad (migracion 0087) nunca vea un fallback en
    // transito — siempre recibe un deposito YA activo.
    //
    // La consulta al principal SOLO ocurre cuando el origen esta inactivo
    // (lazy) — preserva el comportamiento pre-existente de NUNCA tocar
    // `es_principal` cuando el origen sigue activo (test "NO al deposito
    // principal de la empresa").
    const depositoOrigenResult = await tx.execute(
      'SELECT is_active FROM depositos WHERE id = ?',
      [depositoOrigenId]
    )
    const depositoOrigenIsActive =
      !!depositoOrigenResult.rows &&
      depositoOrigenResult.rows.length > 0 &&
      (depositoOrigenResult.rows.item(0) as { is_active: number }).is_active === 1

    let principalDepositoId: string | null = null
    if (!depositoOrigenIsActive) {
      const principalResult = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
      principalDepositoId =
        principalResult.rows && principalResult.rows.length > 0
          ? (principalResult.rows.item(0) as { id: string }).id
          : null
    }

    const depositoId = resolveDepositoReingresoNcr(
      depositoOrigenId,
      depositoOrigenIsActive,
      principalDepositoId
    )
    if (!depositoId) {
      throw new Error(
        'No se pudo reintegrar el stock: no hay un deposito activo disponible en la empresa. Configure un deposito principal.'
      )
    }

    // 2. Generar nro_ncr (por empresa)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM notas_credito WHERE empresa_id = ?',
      [empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroNcr = `NCR-${String(count + 1).padStart(6, '0')}`

    // 3. INSERT notas_credito (snapshot de la factura)
    await tx.execute(
      `INSERT INTO notas_credito (id, nro_ncr, venta_id, cliente_id, tipo, motivo, tasa_historica, total_usd, total_bs, afecta_inventario, usuario_id, fecha, empresa_id, created_at, created_by, sesion_caja_id, liquidacion_modalidad, no_desembolso)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ncrId,
        nroNcr,
        venta_id,
        venta.cliente_id,
        tipoNc,
        motivo,
        venta.tasa,
        venta.total_usd,
        venta.total_bs,
        1,
        usuario_id,
        now,
        empresa_id,
        now,
        usuario_id,
        sesionCajaIdParaNc,
        modalidad,
        noDesembolso ? 1 : 0,
      ]
    )

    // 4. Reversion de stock — leer ventas_det
    const detalleResult = await tx.execute(
      'SELECT producto_id, cantidad, lote_id FROM ventas_det WHERE venta_id = ?',
      [venta_id]
    )

    if (detalleResult.rows) {
      for (let i = 0; i < detalleResult.rows.length; i++) {
        const linea = detalleResult.rows.item(i) as {
          producto_id: string
          cantidad: string
          lote_id: string | null
        }
        const cantidadVendida = parseFloat(linea.cantidad)

        // Leer producto
        const prodResult = await tx.execute(
          'SELECT tipo, stock, nombre FROM productos WHERE id = ?',
          [linea.producto_id]
        )
        if (!prodResult.rows || prodResult.rows.length === 0) {
          throw new Error('Producto no encontrado al revertir stock')
        }
        const producto = prodResult.rows.item(0) as {
          tipo: string
          stock: string
          nombre: string
        }

        if (producto.tipo === 'P') {
          // PRODUCTO: reintegrar stock directo
          const stockActual = parseFloat(producto.stock)
          const stockNuevo = stockActual + cantidadVendida
          const movId = uuidv4()

          await tx.execute(
            `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
             VALUES (?, ?, ?, 'E', 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              movId,
              linea.producto_id,
              depositoId,
              cantidadVendida.toFixed(3),
              stockActual.toFixed(3),
              stockNuevo.toFixed(3),
              linea.lote_id ?? null,
              ncrId,
              `NCR-${nroNcr}`,
              `${nroNcr} - Reintegro ${producto.nombre}`,
              usuario_id,
              now,
              empresa_id,
              now,
            ]
          )

          await upsertStockDeposito(tx, {
            empresa_id,
            producto_id: linea.producto_id,
            deposito_id: depositoId,
            delta: new Decimal(cantidadVendida),
            usuario_id,
            now,
            movimientoInventarioId: movId,
          })

          // Si la linea tenia lote, restaurar cantidad en el lote
          if (linea.lote_id) {
            const loteResult = await tx.execute(
              'SELECT cantidad_actual, status FROM lotes WHERE id = ?',
              [linea.lote_id]
            )
            if (loteResult.rows && loteResult.rows.length > 0) {
              const loteRow = loteResult.rows.item(0) as { cantidad_actual: string; status: string }
              const nuevaCantLote = parseFloat(loteRow.cantidad_actual) + cantidadVendida
              await tx.execute(
                'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
                [
                  nuevaCantLote.toFixed(3),
                  'ACTIVO',
                  now,
                  linea.lote_id,
                ]
              )
            }
          }
        } else if (producto.tipo === 'S') {
          // SERVICIO: reintegrar ingredientes via recetas
          const recetasResult = await tx.execute(
            'SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas r JOIN productos p ON r.producto_id = p.id WHERE r.servicio_id = ?',
            [linea.producto_id]
          )

          if (recetasResult.rows) {
            for (let j = 0; j < recetasResult.rows.length; j++) {
              const ingrediente = recetasResult.rows.item(j) as {
                producto_id: string
                cantidad: string
                stock: string
                nombre: string
              }

              const cantidadConsumida = parseFloat(ingrediente.cantidad) * cantidadVendida
              const stockIngrediente = parseFloat(ingrediente.stock)
              const stockNuevoIng = stockIngrediente + cantidadConsumida
              const movIngId = uuidv4()

              await tx.execute(
                `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
                 VALUES (?, ?, ?, 'E', 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  movIngId,
                  ingrediente.producto_id,
                  depositoId,
                  cantidadConsumida.toFixed(3),
                  stockIngrediente.toFixed(3),
                  stockNuevoIng.toFixed(3),
                  ncrId,
                  `NCR-${nroNcr}`,
                  `${nroNcr} - Reintegro ingrediente "${ingrediente.nombre}" (servicio "${producto.nombre}")`,
                  usuario_id,
                  now,
                  empresa_id,
                  now,
                ]
              )

              await upsertStockDeposito(tx, {
                empresa_id,
                producto_id: ingrediente.producto_id,
                deposito_id: depositoId,
                delta: new Decimal(cantidadConsumida),
                usuario_id,
                now,
                movimientoInventarioId: movIngId,
              })
            }
          }
        }
      }
    }

    // 5. Ajuste de saldo del cliente — solo si hay deuda pendiente
    const saldoPend = new Decimal(venta.saldo_pend_usd)
    if (saldoPend.gt('0.01')) {
      const clienteResult = await tx.execute('SELECT saldo_actual FROM clientes WHERE id = ?', [
        venta.cliente_id,
      ])
      if (!clienteResult.rows || clienteResult.rows.length === 0) {
        throw new Error('Cliente no encontrado')
      }
      const saldoActual = new Decimal(
        (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
      )
      const saldoNuevo = Decimal.max(new Decimal(0), saldoActual.minus(saldoPend))

      const movCuentaId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
         VALUES (?, ?, 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movCuentaId,
          venta.cliente_id,
          nroNcr,
          toStorageString(saldoPend),
          toStorageString(saldoActual),
          toStorageString(saldoNuevo),
          `Anulacion de factura ${venta.nro_factura}`,
          venta_id,
          now,
          empresa_id,
          now,
        ]
      )

      await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
        toStorageString(saldoNuevo),
        now,
        venta.cliente_id,
      ])
    }

    // 5b. Si la factura tenía un diferencial cambiario aplicado, reversarlo también
    try {
      await reversarDiferencialEnTx(tx, {
        ventaId: venta_id,
        clienteId: venta.cliente_id,
        nroFactura: venta.nro_factura,
        empresaId: empresa_id,
        procesadoPor: usuario_id,
      }, now)
    } catch {
      // DIFE reversal opcional — no bloquea la anulación
    }

    // 5c. Regla de Oro (Design §4, obs #2804): reversar los pagos originales
    //     de la venta y, SOLO si aplica la condicion de ambito+sesion, dejar
    //     un egreso por metodo en `movimientos_metodo_cobro` (origen 'NCR')
    //     para que el cuadre de la sesion activa refleje la salida real de
    //     efectivo/tarjeta — sin tocar `use-cuadre.ts`, que ya suma cualquier
    //     EGRESO no excluido (aditivo, cero cambios de formula).
    if (tipoNc === 'TOTAL') {
      const pagosResult = await tx.execute(
        'SELECT id, metodo_cobro_id, monto FROM pagos WHERE venta_id = ? AND is_reversed = 0',
        [venta_id]
      )

      if (aplicaReglaDeOro && pagosResult.rows) {
        for (let i = 0; i < pagosResult.rows.length; i++) {
          const pago = pagosResult.rows.item(i) as {
            id: string
            metodo_cobro_id: string
            monto: string
          }

          await tx.execute(
            `INSERT INTO movimientos_metodo_cobro
               (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
             VALUES (?, ?, ?, 'EGRESO', 'NCR', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuidv4(),
              empresa_id,
              pago.metodo_cobro_id,
              pago.monto,
              ncrId,
              `NCR-${nroNcr}`,
              `Devolucion NCR ${nroNcr} - Venta ${venta.nro_factura}`,
              sesionCajaActivaId ?? null,
              now,
              now,
              usuario_id,
            ]
          )
        }
      }

      // Reversa de pagos: siempre que la NC sea TOTAL, sin importar el ambito
      // (POS o Tradicional) — evita que el pago original siga contando como
      // ingreso valido en los totales por metodo (gap #3 en obs #2803).
      await tx.execute(
        `UPDATE pagos SET is_reversed = 1, reversed_at = ?, reversed_by = ?, reversed_reason = ?
         WHERE venta_id = ? AND is_reversed = 0`,
        [now, usuario_id, motivo, venta_id]
      )
    }

    // 5d. Step B (Design §3 paso 9): liquidar el REMANENTE ya cobrado —
    //     total_usd menos lo que Step A (paso 5) ya condono de la deuda
    //     pendiente — segun la modalidad elegida. Solo aplica si de verdad
    //     hay algo que devolver (remanente > 0); si la factura nunca se
    //     cobro (saldoPend == total_usd), Step A ya cubrio el 100% como
    //     condonacion de deuda y no hay nada que liquidar aqui.
    //     EFECTIVO_REAL no entra a este switch: su liquidacion ES el egreso
    //     condicional de la Regla de Oro (paso 5c/10), no un movimiento de
    //     cuenta adicional.
    const remanenteALiquidar = Decimal.max(
      new Decimal(0),
      new Decimal(venta.total_usd).minus(saldoPend)
    )

    if (remanenteALiquidar.gt('0.01')) {
      if (modalidad === 'SALDO_FAVOR' || modalidad === 'COMPENSACION_VENTA') {
        // SALDO_FAVOR y COMPENSACION_VENTA dejan el MISMO SAFC trazable
        // (Design §3: "COMPENSACION_VENTA compone con una venta nueva
        // simultanea... dos transacciones secuenciales"). La diferencia
        // vive en el LLAMADOR (Slice 5 UI hara un crearVenta() separado que
        // consume este SAFC via `safEntry`) — crearNotaCredito nunca invoca
        // crearVenta() internamente (tradeoff aceptado, obs task 3.1).
        //
        // Reusa el PATRON de `registrarSafExcedente`
        // (src/features/cxc/hooks/use-cxc.ts:1934) pero INLINE dentro de
        // esta misma transaccion — NO se invoca esa funcion standalone
        // porque abre su propia `db.writeTransaction` y anidar
        // transacciones rompe la atomicidad unica exigida por el diseño
        // (Design §Technical Approach: "un unico db.writeTransaction()").
        // `doc_origen_id`/`doc_origen_tipo` dejan el SAFC trazable hasta
        // `nota_credito_id` (Spec notas-credito-liquidacion, scenario
        // "SAFC generado referencia el nota_credito_id de origen").
        const clienteSafcResult = await tx.execute(
          'SELECT saldo_actual FROM clientes WHERE id = ?',
          [venta.cliente_id]
        )
        if (!clienteSafcResult.rows || clienteSafcResult.rows.length === 0) {
          throw new Error('Cliente no encontrado')
        }
        const saldoActualSafc = new Decimal(
          (clienteSafcResult.rows.item(0) as { saldo_actual: string }).saldo_actual || '0'
        )
        const saldoNuevoSafc = saldoActualSafc.minus(remanenteALiquidar)

        await tx.execute(
          `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, created_by, doc_origen_id, doc_origen_tipo)
           VALUES (?, ?, 'SAFC', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            venta.cliente_id,
            `SAF-NCR-${nroNcr}`,
            toStorageString(remanenteALiquidar),
            toStorageString(saldoActualSafc),
            toStorageString(saldoNuevoSafc),
            `Saldo a favor generado por ${nroNcr} (${modalidad}) - Factura ${venta.nro_factura}`,
            venta_id,
            now,
            empresa_id,
            now,
            usuario_id,
            ncrId,
            'NOTA_CREDITO',
          ]
        )

        await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
          toStorageString(saldoNuevoSafc),
          now,
          venta.cliente_id,
        ])
      } else if (modalidad === 'AJUSTE_CXC') {
        // Reusa el MISMO patron de reduccion de saldo que Step A (paso 5,
        // lineas ~440-478) — nunca crea credito, solo cancela deuda
        // EXISTENTE del cliente (tope en 0). Task 3.4.
        const clienteAjusteResult = await tx.execute(
          'SELECT saldo_actual FROM clientes WHERE id = ?',
          [venta.cliente_id]
        )
        if (!clienteAjusteResult.rows || clienteAjusteResult.rows.length === 0) {
          throw new Error('Cliente no encontrado')
        }
        const saldoActualAjuste = new Decimal(
          (clienteAjusteResult.rows.item(0) as { saldo_actual: string }).saldo_actual || '0'
        )
        const saldoNuevoAjuste = Decimal.max(new Decimal(0), saldoActualAjuste.minus(remanenteALiquidar))

        await tx.execute(
          `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
           VALUES (?, ?, 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            venta.cliente_id,
            `${nroNcr}-AJUSTE`,
            toStorageString(remanenteALiquidar),
            toStorageString(saldoActualAjuste),
            toStorageString(saldoNuevoAjuste),
            `Ajuste CxC por ${nroNcr} - Factura ${venta.nro_factura}`,
            venta_id,
            now,
            empresa_id,
            now,
          ]
        )

        await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
          toStorageString(saldoNuevoAjuste),
          now,
          venta.cliente_id,
        ])
      }
    }

    // 6. Marcar factura como anulada
    await tx.execute("UPDATE ventas SET status = 'ANULADA', saldo_pend_usd = ? WHERE id = ?", [
      '0.00',
      venta_id,
    ])

    // 7. Generar asientos contables NCR
    try {
      const cuentas = await cargarMapaCuentas(tx, empresa_id)
      await generarAsientosNCR(tx, {
        empresaId: empresa_id,
        ncrId,
        nroNcr,
        ventaId: venta_id,
        totalUsd: new Decimal(venta.total_usd).toNumber(),
        afectaCxC: saldoPend.gt('0.01'),
        banco_empresa_id: null,
        cuentas,
        usuarioId: usuario_id,
      })
    } catch {
      // Fallo en contabilidad no bloquea la NCR
    }
  })

  return { ncrId, nroNcr }
}
