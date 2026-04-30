import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosPagoCxC, reversarAsientos, leerMonedaContable } from '@/features/contabilidad/lib/generar-asientos'

export interface VentaPendiente {
  id: string
  nro_factura: string
  fecha: string
  total_usd: string
  total_bs: string
  saldo_pend_usd: string
  tasa: string
  tipo: string
  cliente_id: string
}

export interface ClienteConDeuda {
  id: string
  identificacion: string
  nombre: string
  telefono: string | null
  saldo_actual: string
  limite_credito_usd: string
  facturas_pendientes: number
}

export interface PagoFacturaParams {
  venta_id: string
  cliente_id: string
  metodo_cobro_id: string
  moneda: 'USD' | 'BS'
  tasa: number
  monto: number
  referencia?: string
  empresa_id: string
  procesado_por: string
  procesado_por_nombre: string
}

export interface AbonoGlobalParams {
  cliente_id: string
  metodo_cobro_id: string
  moneda: 'USD' | 'BS'
  tasa: number
  monto: number
  referencia?: string
  empresa_id: string
  procesado_por: string
  procesado_por_nombre: string
}

/**
 * Clientes con saldo pendiente > 0
 */
export function useClientesConDeuda() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT c.id, c.identificacion, c.nombre, c.telefono, c.saldo_actual, c.limite_credito_usd,
       (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.01) as facturas_pendientes
     FROM clientes c
     WHERE c.empresa_id = ? AND CAST(c.saldo_actual AS REAL) > 0.01 AND c.is_active = 1
     ORDER BY CAST(c.saldo_actual AS REAL) DESC`,
    [empresaId]
  )
  return { clientes: (data ?? []) as ClienteConDeuda[], isLoading }
}

/**
 * Buscar clientes con deuda por nombre/identificacion
 */
export function useBuscarClientesDeuda(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT c.id, c.identificacion, c.nombre, c.telefono, c.saldo_actual, c.limite_credito_usd,
           (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.01) as facturas_pendientes
         FROM clientes c
         WHERE c.empresa_id = ? AND c.is_active = 1 AND CAST(c.saldo_actual AS REAL) > 0.01
           AND (c.identificacion LIKE ? OR c.nombre LIKE ?)
         ORDER BY c.nombre ASC LIMIT 20`
      : '',
    shouldSearch ? [empresaId, pattern, pattern] : []
  )
  return { clientes: (data ?? []) as ClienteConDeuda[], isLoading }
}

/**
 * Facturas pendientes de un cliente (saldo_pend_usd > 0), ordenadas por fecha ASC (FIFO)
 */
export function useFacturasPendientes(clienteId: string | null) {
  const { data, isLoading } = useQuery(
    clienteId
      ? `SELECT * FROM ventas
         WHERE cliente_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01
         ORDER BY fecha ASC`
      : '',
    clienteId ? [clienteId] : []
  )
  return { facturas: (data ?? []) as VentaPendiente[], isLoading }
}

export interface DetalleFacturaCxc {
  id: string
  venta_id: string
  producto_id: string
  cantidad: string
  precio_unitario_usd: string
  subtotal_usd: string
  subtotal_bs: string
  producto_nombre: string
  producto_codigo: string
}

export interface PagoFacturaCxc {
  id: string
  venta_id: string
  metodo_cobro_id: string
  moneda_id: string
  tasa: string
  monto: string
  monto_usd: string
  referencia: string | null
  fecha: string
  metodo_nombre: string
  moneda_label: string
  is_reversed: number
  reversed_at: string | null
  reversed_by: string | null
  reversed_reason: string | null
  procesado_por_nombre: string | null
  created_by: string | null
}

export interface PagoClienteCxc extends PagoFacturaCxc {
  nro_factura: string | null
}

/**
 * Todos los pagos de un cliente (para vista de estado de cuenta del cliente)
 */
export function usePagosCliente(clienteId: string | null) {
  const { data, isLoading } = useQuery(
    clienteId
      ? `SELECT pg.id, pg.venta_id, pg.metodo_cobro_id, pg.moneda_id, pg.tasa, pg.monto, pg.monto_usd,
           pg.referencia, pg.fecha, pg.created_by,
           pg.is_reversed, pg.reversed_at, pg.reversed_by, pg.reversed_reason, pg.procesado_por_nombre,
           v.nro_factura,
           mc.nombre as metodo_nombre,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE 'USD' END as moneda_label
         FROM pagos pg
         LEFT JOIN ventas v ON pg.venta_id = v.id
         JOIN metodos_cobro mc ON pg.metodo_cobro_id = mc.id
         LEFT JOIN monedas mon ON pg.moneda_id = mon.id
         WHERE pg.cliente_id = ?
         ORDER BY pg.fecha DESC`
      : '',
    clienteId ? [clienteId] : []
  )
  return { pagos: (data ?? []) as PagoClienteCxc[], isLoading }
}

/**
 * Detalle de articulos de una venta
 */
export function useDetalleFactura(ventaId: string | null) {
  const { data, isLoading } = useQuery(
    ventaId
      ? `SELECT vd.id, vd.venta_id, vd.producto_id, vd.cantidad, vd.precio_unitario_usd, vd.subtotal_usd, vd.subtotal_bs,
           p.nombre as producto_nombre, p.codigo as producto_codigo
         FROM ventas_det vd
         JOIN productos p ON vd.producto_id = p.id
         WHERE vd.venta_id = ?`
      : '',
    ventaId ? [ventaId] : []
  )
  return { detalle: (data ?? []) as DetalleFacturaCxc[], isLoading }
}

/**
 * Pagos realizados a una factura
 */
export function usePagosFactura(ventaId: string | null) {
  const { data, isLoading } = useQuery(
    ventaId
      ? `SELECT pg.id, pg.venta_id, pg.metodo_cobro_id, pg.moneda_id, pg.tasa, pg.monto, pg.monto_usd,
           pg.referencia, pg.fecha, pg.created_by,
           pg.is_reversed, pg.reversed_at, pg.reversed_by, pg.reversed_reason, pg.procesado_por_nombre,
           mc.nombre as metodo_nombre,
           CASE WHEN mon.codigo_iso = 'VES' THEN 'BS' ELSE 'USD' END as moneda_label
         FROM pagos pg
         JOIN metodos_cobro mc ON pg.metodo_cobro_id = mc.id
         LEFT JOIN monedas mon ON pg.moneda_id = mon.id
         WHERE pg.venta_id = ?
         ORDER BY pg.fecha ASC`
      : '',
    ventaId ? [ventaId] : []
  )
  return { pagos: (data ?? []) as PagoFacturaCxc[], isLoading }
}

/**
 * Pago a factura especifica.
 * Valida: monto <= saldo_pend_usd de la factura.
 * Crea pago, reduce saldo factura, crea movimiento_cuenta (tipo PAG), actualiza saldo cliente.
 */
export async function registrarPagoFactura(params: PagoFacturaParams): Promise<void> {
  const { venta_id, cliente_id, metodo_cobro_id, moneda, tasa, monto, referencia, empresa_id, procesado_por, procesado_por_nombre } = params

  if (tasa <= 0) throw new Error('La tasa de cambio debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 0. Obtener UUID de moneda
    const monedaCode = moneda === 'BS' ? 'VES' : 'USD'
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [monedaCode]
    )
    if (!monedaResult.rows?.length) {
      throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    // 1. Leer factura
    const ventaResult = await tx.execute(
      'SELECT nro_factura, saldo_pend_usd, tasa FROM ventas WHERE id = ?',
      [venta_id]
    )
    if (!ventaResult.rows || ventaResult.rows.length === 0) {
      throw new Error('Factura no encontrada')
    }
    const venta = ventaResult.rows.item(0) as { nro_factura: string; saldo_pend_usd: string; tasa: string }
    const saldoFactura = parseFloat(venta.saldo_pend_usd)
    const tasaVenta = parseFloat(venta.tasa)

    // 2. Calcular monto en USD
    const montoUsd = moneda === 'BS' ? Number((monto / tasa).toFixed(2)) : monto

    // 3. Validar que no exceda saldo pendiente
    if (montoUsd > saldoFactura + 0.01) {
      throw new Error(
        `El pago ($${montoUsd.toFixed(2)}) excede el saldo pendiente ($${saldoFactura.toFixed(2)}) de la factura ${venta.nro_factura}`
      )
    }

    // 4. INSERT pago
    const pagoId = uuidv4()
    await tx.execute(
      `INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at, created_by, procesado_por_nombre)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pagoId,
        venta_id,
        cliente_id,
        metodo_cobro_id,
        monedaId,
        tasa.toFixed(4),
        monto.toFixed(2),
        montoUsd.toFixed(2),
        referencia ?? null,
        now,
        empresa_id,
        now,
        procesado_por,
        procesado_por_nombre,
      ]
    )

    // 5. Reducir saldo pendiente de factura
    const nuevoSaldoFactura = Math.max(0, Number((saldoFactura - montoUsd).toFixed(2)))
    await tx.execute('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?', [
      nuevoSaldoFactura.toFixed(2),
      venta_id,
    ])

    // 6. Crear movimiento de cuenta (tipo PAG) y actualizar saldo cliente
    const clienteResult = await tx.execute('SELECT saldo_actual FROM clientes WHERE id = ?', [
      cliente_id,
    ])
    if (!clienteResult.rows || clienteResult.rows.length === 0) {
      throw new Error('Cliente no encontrado')
    }
    const saldoActual = parseFloat(
      (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
    )
    const saldoNuevo = Math.max(0, Number((saldoActual - montoUsd).toFixed(2)))

    const movId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, created_by, moneda_pago, monto_moneda, tasa_pago)
       VALUES (?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        cliente_id,
        `PAG-${venta.nro_factura}`,
        montoUsd.toFixed(2),
        saldoActual.toFixed(2),
        saldoNuevo.toFixed(2),
        `Pago factura ${venta.nro_factura}`,
        venta_id,
        now,
        empresa_id,
        now,
        procesado_por,
        moneda,
        monto.toFixed(2),
        tasa.toFixed(4),
      ]
    )

    await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
      saldoNuevo.toFixed(2),
      now,
      cliente_id,
    ])

    // 7. Resolver banco + movimiento bancario + asientos contables
    try {
      const metodoCxCResult = await tx.execute(
        'SELECT banco_empresa_id FROM metodos_cobro WHERE id = ? LIMIT 1',
        [metodo_cobro_id]
      )
      const bancoCxCId =
        (metodoCxCResult.rows?.item(0) as { banco_empresa_id: string | null } | undefined)
          ?.banco_empresa_id ?? null

      if (bancoCxCId && montoUsd > 0) {
        const movBancoCxCId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_bancarios
             (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'INGRESO', 'TRANSFERENCIA_CLIENTE', ?, 0, 0, ?, 'PAGO_CXC', ?, 0, ?, ?, ?, ?)`,
          [
            movBancoCxCId, empresa_id, bancoCxCId,
            montoUsd.toFixed(2),
            venta_id,
            referencia ?? null,
            `Cobro CxC fac.${venta.nro_factura}`,
            now, now, procesado_por,
          ]
        )
      }

      const [cuentas, monedaContable] = await Promise.all([
        cargarMapaCuentas(tx, empresa_id),
        leerMonedaContable(tx, empresa_id),
      ])
      await generarAsientosPagoCxC(tx, {
        empresaId: empresa_id,
        pagoId,
        pagoRef: `PAG-${venta.nro_factura}`,
        monto_usd: montoUsd,
        banco_empresa_id: bancoCxCId,
        cuentas,
        usuarioId: procesado_por,
        monedaContable,
        tasaPago: tasa,
        tasaVenta,
      })
    } catch {
      // Fallo en contabilidad/bancos no bloquea el pago
    }
  })
}

/**
 * Abono global FIFO.
 * Distribuye el monto entre facturas pendientes (ORDER BY fecha ASC).
 * Si sobra, crea un pago sin factura (anticipo).
 * Crea UN SOLO movimiento_cuenta (tipo PAG) por el total.
 */
export async function registrarAbonoGlobal(params: AbonoGlobalParams): Promise<{
  facturasAfectadas: number
  montoAplicado: number
}> {
  const { cliente_id, metodo_cobro_id, moneda, tasa, monto, referencia, empresa_id, procesado_por, procesado_por_nombre } = params

  if (tasa <= 0) throw new Error('La tasa de cambio debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  let facturasAfectadas = 0
  let montoAplicado = 0

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 0. Obtener UUID de moneda
    const monedaCode = moneda === 'BS' ? 'VES' : 'USD'
    const monedaResult = await tx.execute(
      'SELECT id FROM monedas WHERE codigo_iso = ? LIMIT 1',
      [monedaCode]
    )
    if (!monedaResult.rows?.length) {
      throw new Error(`No se encontro la moneda ${monedaCode} en el catalogo`)
    }
    const monedaId = (monedaResult.rows.item(0) as { id: string }).id

    // 1. Calcular monto total en USD
    const montoTotalUsd = moneda === 'BS' ? Number((monto / tasa).toFixed(2)) : monto
    let montoRestante = montoTotalUsd

    // 2. Obtener facturas pendientes FIFO (ORDER BY fecha ASC)
    const facturasResult = await tx.execute(
      `SELECT id, nro_factura, saldo_pend_usd FROM ventas
       WHERE cliente_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01
       ORDER BY fecha ASC`,
      [cliente_id]
    )

    // 3. Cascada FIFO
    if (facturasResult.rows) {
      for (let i = 0; i < facturasResult.rows.length && montoRestante > 0.01; i++) {
        const factura = facturasResult.rows.item(i) as {
          id: string
          nro_factura: string
          saldo_pend_usd: string
        }
        const saldoFactura = parseFloat(factura.saldo_pend_usd)
        const montoAplicar = Math.min(saldoFactura, montoRestante)

        // INSERT pago vinculado a esta factura
        const pagoId = uuidv4()
        await tx.execute(
          `INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at, created_by, procesado_por_nombre)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pagoId,
            factura.id,
            cliente_id,
            metodo_cobro_id,
            monedaId,
            tasa.toFixed(4),
            (moneda === 'BS' ? montoAplicar * tasa : montoAplicar).toFixed(2),
            montoAplicar.toFixed(2),
            referencia ?? null,
            now,
            empresa_id,
            now,
            procesado_por,
            procesado_por_nombre,
          ]
        )

        // Reducir saldo de esta factura
        const nuevoSaldo = Math.max(0, Number((saldoFactura - montoAplicar).toFixed(2)))
        await tx.execute('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?', [
          nuevoSaldo.toFixed(2),
          factura.id,
        ])

        montoRestante = Number((montoRestante - montoAplicar).toFixed(2))
        facturasAfectadas++
      }
    }

    // 4. Si sobra monto, crear pago sin factura (anticipo)
    if (montoRestante > 0.01) {
      const pagoAnticipoId = uuidv4()
      await tx.execute(
        `INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at, created_by, procesado_por_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoAnticipoId,
          null,
          cliente_id,
          metodo_cobro_id,
          monedaId,
          tasa.toFixed(4),
          (moneda === 'BS' ? montoRestante * tasa : montoRestante).toFixed(2),
          montoRestante.toFixed(2),
          referencia ? `${referencia} (anticipo)` : 'Anticipo',
          now,
          empresa_id,
          now,
          procesado_por,
          procesado_por_nombre,
        ]
      )
    }

    montoAplicado = montoTotalUsd

    // 5. Crear UN SOLO movimiento_cuenta (tipo PAG) por el total
    const clienteResult = await tx.execute('SELECT saldo_actual FROM clientes WHERE id = ?', [
      cliente_id,
    ])
    if (!clienteResult.rows || clienteResult.rows.length === 0) {
      throw new Error('Cliente no encontrado')
    }
    const saldoActual = parseFloat(
      (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
    )
    const saldoNuevo = Math.max(0, Number((saldoActual - montoTotalUsd).toFixed(2)))

    const movId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, created_by, moneda_pago, monto_moneda, tasa_pago)
       VALUES (?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        cliente_id,
        `ABONO-GLOBAL`,
        montoTotalUsd.toFixed(2),
        saldoActual.toFixed(2),
        saldoNuevo.toFixed(2),
        `Abono global: ${facturasAfectadas} factura(s) afectada(s)${montoRestante > 0.01 ? `, anticipo $${montoRestante.toFixed(2)}` : ''}`,
        null,
        now,
        empresa_id,
        now,
        procesado_por,
        moneda,
        monto.toFixed(2),
        tasa.toFixed(4),
      ]
    )

    await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
      saldoNuevo.toFixed(2),
      now,
      cliente_id,
    ])

    // 6. Resolver banco + movimiento bancario + asientos contables (abono global CxC)
    try {
      const metodoAbonoResult = await tx.execute(
        'SELECT banco_empresa_id FROM metodos_cobro WHERE id = ? LIMIT 1',
        [metodo_cobro_id]
      )
      const bancoAbonoId =
        (metodoAbonoResult.rows?.item(0) as { banco_empresa_id: string | null } | undefined)
          ?.banco_empresa_id ?? null

      if (bancoAbonoId && montoTotalUsd > 0) {
        const movBancoAbonoId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_bancarios
             (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'INGRESO', 'TRANSFERENCIA_CLIENTE', ?, 0, 0, ?, 'PAGO_CXC', ?, 0, ?, ?, ?, ?)`,
          [
            movBancoAbonoId, empresa_id, bancoAbonoId,
            montoTotalUsd.toFixed(2),
            movId,
            referencia ?? null,
            `Abono global cliente`,
            now, now, procesado_por,
          ]
        )
      }

      const [cuentas, monedaContable] = await Promise.all([
        cargarMapaCuentas(tx, empresa_id),
        leerMonedaContable(tx, empresa_id),
      ])
      await generarAsientosPagoCxC(tx, {
        empresaId: empresa_id,
        pagoId: movId,
        pagoRef: 'ABONO-GLOBAL',
        monto_usd: montoTotalUsd,
        banco_empresa_id: bancoAbonoId,
        cuentas,
        usuarioId: procesado_por,
        monedaContable,
        tasaPago: tasa,
        // Sin tasaVenta en abono global FIFO: sin diferencial cambiario por simplificacion
      })
    } catch {
      // Fallo en contabilidad/bancos no bloquea el abono
    }
  })

  return { facturasAfectadas, montoAplicado }
}

/**
 * Reverso de un abono/pago.
 * Marca el pago como reversado, restaura el saldo de la factura
 * y del cliente, e inserta un movimiento_cuenta tipo REV.
 */
export async function registrarReversoAbono(params: {
  pago_id: string
  reason: string
  reversed_by: string
  reversed_by_nombre: string
  empresa_id: string
}): Promise<void> {
  const { pago_id, reason, reversed_by, reversed_by_nombre, empresa_id } = params

  if (!reason.trim()) throw new Error('Debe ingresar una razon para el reverso')

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Leer el pago original
    const pagoResult = await tx.execute(
      `SELECT id, venta_id, cliente_id, monto_usd, is_reversed, tasa, monto, moneda_id FROM pagos WHERE id = ? AND empresa_id = ?`,
      [pago_id, empresa_id]
    )
    if (!pagoResult.rows || pagoResult.rows.length === 0) {
      throw new Error('Pago no encontrado')
    }
    const pago = pagoResult.rows.item(0) as {
      id: string
      venta_id: string | null
      cliente_id: string
      monto_usd: string
      is_reversed: number
      tasa: string | null
      monto: string | null
      moneda_id: string | null
    }

    if (pago.is_reversed === 1) {
      throw new Error('Este pago ya fue reversado anteriormente')
    }

    const montoUsd = parseFloat(pago.monto_usd)

    // 2. Marcar el pago como reversado
    await tx.execute(
      `UPDATE pagos SET is_reversed = 1, reversed_at = ?, reversed_by = ?, reversed_reason = ? WHERE id = ?`,
      [now, reversed_by, reason.trim(), pago_id]
    )

    // 3. Si tiene factura: restaurar saldo_pend_usd
    let nroFactura = ''
    if (pago.venta_id) {
      const ventaResult = await tx.execute(
        `SELECT nro_factura, saldo_pend_usd, total_usd FROM ventas WHERE id = ?`,
        [pago.venta_id]
      )
      if (ventaResult.rows && ventaResult.rows.length > 0) {
        const venta = ventaResult.rows.item(0) as {
          nro_factura: string
          saldo_pend_usd: string
          total_usd: string
        }
        nroFactura = venta.nro_factura
        const saldoPendActual = parseFloat(venta.saldo_pend_usd)
        const totalFactura = parseFloat(venta.total_usd)
        const nuevoSaldoFactura = Math.min(totalFactura, Number((saldoPendActual + montoUsd).toFixed(2)))
        await tx.execute(`UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?`, [
          nuevoSaldoFactura.toFixed(2),
          pago.venta_id,
        ])
      }
    }

    // 4. Restaurar saldo del cliente
    const clienteResult = await tx.execute(
      `SELECT saldo_actual FROM clientes WHERE id = ?`,
      [pago.cliente_id]
    )
    if (!clienteResult.rows || clienteResult.rows.length === 0) {
      throw new Error('Cliente no encontrado')
    }
    const saldoActual = parseFloat(
      (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
    )
    const saldoNuevo = Number((saldoActual + montoUsd).toFixed(2))

    await tx.execute(`UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?`, [
      saldoNuevo.toFixed(2),
      now,
      pago.cliente_id,
    ])

    // 5. Insertar movimiento_cuenta tipo REV
    // Resolver moneda label desde moneda_id del pago original
    let monedaPagoLabel: string | null = null
    if (pago.moneda_id) {
      const monedaResult = await tx.execute(
        `SELECT codigo FROM monedas WHERE id = ? LIMIT 1`,
        [pago.moneda_id]
      )
      const codigoMoneda = (monedaResult.rows?.item(0) as { codigo: string } | undefined)?.codigo
      if (codigoMoneda === 'VES') {
        monedaPagoLabel = 'BS'
      } else if (codigoMoneda) {
        monedaPagoLabel = codigoMoneda
      }
    }

    const movId = uuidv4()
    const referencia = nroFactura ? `REV-${nroFactura}` : 'REV-ABONO'
    await tx.execute(
      `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, created_by, moneda_pago, monto_moneda, tasa_pago)
       VALUES (?, ?, 'REV', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId,
        pago.cliente_id,
        referencia,
        montoUsd.toFixed(2),
        saldoActual.toFixed(2),
        saldoNuevo.toFixed(2),
        `Reverso de abono${nroFactura ? ` factura ${nroFactura}` : ''}: ${reason.trim()} (por ${reversed_by_nombre})`,
        pago.venta_id ?? null,
        now,
        empresa_id,
        now,
        reversed_by,
        monedaPagoLabel,
        pago.monto != null ? parseFloat(pago.monto).toFixed(2) : null,
        pago.tasa != null ? parseFloat(pago.tasa).toFixed(4) : null,
      ]
    )

    // 6. Reversar asientos contables del pago original (crea contra-asientos)
    try {
      const asientosResult = await tx.execute(
        `SELECT id FROM libro_contable WHERE empresa_id = ? AND doc_origen_id = ? AND modulo_origen = 'PAGO_CXC' AND estado = 'PENDIENTE'`,
        [empresa_id, pago_id]
      )
      const asientosIds: string[] = []
      if (asientosResult.rows) {
        for (let i = 0; i < asientosResult.rows.length; i++) {
          asientosIds.push((asientosResult.rows.item(i) as { id: string }).id)
        }
      }
      if (asientosIds.length > 0) {
        await reversarAsientos(tx, {
          empresaId: empresa_id,
          asientosIds,
          usuarioId: reversed_by,
        })
      }
    } catch {
      // Fallo en contabilidad no bloquea el reverso
    }
  })
}
