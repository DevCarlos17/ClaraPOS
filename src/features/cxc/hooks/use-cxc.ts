import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'

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
  nombre_social: string
  telefono: string | null
  saldo_actual: string
  limite_credito: string
  facturas_pendientes: number
}

export interface PagoFacturaParams {
  venta_id: string
  cliente_id: string
  metodo_pago_id: string
  moneda: 'USD' | 'BS'
  tasa: number
  monto: number
  referencia?: string
  empresa_id: string
}

export interface AbonoGlobalParams {
  cliente_id: string
  metodo_pago_id: string
  moneda: 'USD' | 'BS'
  tasa: number
  monto: number
  referencia?: string
  empresa_id: string
}

/**
 * Clientes con saldo pendiente > 0
 */
export function useClientesConDeuda() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT c.id, c.identificacion, c.nombre_social, c.telefono, c.saldo_actual, c.limite_credito,
       (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.01) as facturas_pendientes
     FROM clientes c
     WHERE c.empresa_id = ? AND CAST(c.saldo_actual AS REAL) > 0.01 AND c.activo = 1
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
      ? `SELECT c.id, c.identificacion, c.nombre_social, c.telefono, c.saldo_actual, c.limite_credito,
           (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND CAST(v.saldo_pend_usd AS REAL) > 0.01) as facturas_pendientes
         FROM clientes c
         WHERE c.empresa_id = ? AND c.activo = 1 AND CAST(c.saldo_actual AS REAL) > 0.01
           AND (c.identificacion LIKE ? OR c.nombre_social LIKE ?)
         ORDER BY c.nombre_social ASC LIMIT 20`
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

/**
 * Pago a factura especifica.
 * Valida: monto <= saldo_pend_usd de la factura.
 * Crea pago, reduce saldo factura, crea movimiento_cuenta (tipo PAG), actualiza saldo cliente.
 */
export async function registrarPagoFactura(params: PagoFacturaParams): Promise<void> {
  const { venta_id, cliente_id, metodo_pago_id, moneda, tasa, monto, referencia, empresa_id } = params

  if (tasa <= 0) throw new Error('La tasa de cambio debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = new Date().toISOString()

    // 1. Leer factura
    const ventaResult = await tx.execute(
      'SELECT nro_factura, saldo_pend_usd FROM ventas WHERE id = ?',
      [venta_id]
    )
    if (!ventaResult.rows || ventaResult.rows.length === 0) {
      throw new Error('Factura no encontrada')
    }
    const venta = ventaResult.rows.item(0) as { nro_factura: string; saldo_pend_usd: string }
    const saldoFactura = parseFloat(venta.saldo_pend_usd)

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
      `INSERT INTO pagos (id, venta_id, cliente_id, metodo_pago_id, moneda, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pagoId,
        venta_id,
        cliente_id,
        metodo_pago_id,
        moneda,
        tasa.toFixed(4),
        monto.toFixed(2),
        montoUsd.toFixed(2),
        referencia ?? null,
        now,
        empresa_id,
        now,
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
      `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
       VALUES (?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    )

    await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
      saldoNuevo.toFixed(2),
      now,
      cliente_id,
    ])
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
  const { cliente_id, metodo_pago_id, moneda, tasa, monto, referencia, empresa_id } = params

  if (tasa <= 0) throw new Error('La tasa de cambio debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  let facturasAfectadas = 0
  let montoAplicado = 0

  await db.writeTransaction(async (tx) => {
    const now = new Date().toISOString()

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
          `INSERT INTO pagos (id, venta_id, cliente_id, metodo_pago_id, moneda, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            pagoId,
            factura.id,
            cliente_id,
            metodo_pago_id,
            moneda,
            tasa.toFixed(4),
            (moneda === 'BS' ? montoAplicar * tasa : montoAplicar).toFixed(2),
            montoAplicar.toFixed(2),
            referencia ?? null,
            now,
            empresa_id,
            now,
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
        `INSERT INTO pagos (id, venta_id, cliente_id, metodo_pago_id, moneda, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoAnticipoId,
          null,
          cliente_id,
          metodo_pago_id,
          moneda,
          tasa.toFixed(4),
          (moneda === 'BS' ? montoRestante * tasa : montoRestante).toFixed(2),
          montoRestante.toFixed(2),
          referencia ? `${referencia} (anticipo)` : 'Anticipo',
          now,
          empresa_id,
          now,
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
      `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
       VALUES (?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    )

    await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
      saldoNuevo.toFixed(2),
      now,
      cliente_id,
    ])
  })

  return { facturasAfectadas, montoAplicado }
}
