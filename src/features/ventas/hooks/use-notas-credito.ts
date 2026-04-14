import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

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

export interface CrearNotaCreditoParams {
  venta_id: string
  motivo: string
  usuario_id: string
  empresa_id: string
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

export function useDetalleFactura(ventaId: string | null) {
  const { data: detalles, isLoading: loadingDetalles } = useQuery(
    ventaId
      ? `SELECT p.nombre as producto_nombre, p.codigo as producto_codigo, dv.cantidad, dv.precio_unitario_usd
         FROM ventas_det dv
         JOIN productos p ON dv.producto_id = p.id
         WHERE dv.venta_id = ?`
      : '',
    ventaId ? [ventaId] : []
  )

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
    detalles: (detalles ?? []) as DetalleFacturaItem[],
    pagos: (pagos ?? []) as PagoFacturaItem[],
    isLoading: loadingDetalles || loadingPagos,
  }
}

// ─── Funcion atomica: crearNotaCredito ──────────────────────

export async function crearNotaCredito(
  params: CrearNotaCreditoParams
): Promise<CrearNotaCreditoResult> {
  const { venta_id, motivo, usuario_id, empresa_id } = params

  let ncrId = ''
  let nroNcr = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    ncrId = uuidv4()

    // 0. Obtener deposito principal de la empresa
    const depResult = await tx.execute(
      'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
      [empresa_id]
    )
    let depositoId: string
    if (depResult.rows && depResult.rows.length > 0) {
      depositoId = (depResult.rows.item(0) as { id: string }).id
    } else {
      const depFallback = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
      if (!depFallback.rows || depFallback.rows.length === 0) {
        throw new Error('No hay depositos configurados. Cree un deposito primero.')
      }
      depositoId = (depFallback.rows.item(0) as { id: string }).id
    }

    // 1. Leer factura y validar
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
    }

    if (venta.status === 'ANULADA') {
      throw new Error('Esta factura ya fue anulada')
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
      `INSERT INTO notas_credito (id, nro_ncr, venta_id, cliente_id, tipo, motivo, tasa_historica, total_usd, total_bs, afecta_inventario, usuario_id, fecha, empresa_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ncrId,
        nroNcr,
        venta_id,
        venta.cliente_id,
        'TOTAL',
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
      ]
    )

    // 4. Reversion de stock — leer ventas_det
    const detalleResult = await tx.execute(
      'SELECT producto_id, cantidad FROM ventas_det WHERE venta_id = ?',
      [venta_id]
    )

    if (detalleResult.rows) {
      for (let i = 0; i < detalleResult.rows.length; i++) {
        const linea = detalleResult.rows.item(i) as {
          producto_id: string
          cantidad: string
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
            `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
             VALUES (?, ?, ?, 'E', 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              movId,
              linea.producto_id,
              depositoId,
              cantidadVendida.toFixed(3),
              stockActual.toFixed(3),
              stockNuevo.toFixed(3),
              ncrId,
              `NCR-${nroNcr}`,
              `${nroNcr} - Reintegro ${producto.nombre}`,
              usuario_id,
              now,
              empresa_id,
              now,
            ]
          )

          await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
            stockNuevo.toFixed(3),
            now,
            linea.producto_id,
          ])
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

              await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
                stockNuevoIng.toFixed(3),
                now,
                ingrediente.producto_id,
              ])
            }
          }
        }
      }
    }

    // 5. Ajuste de saldo del cliente — solo si hay deuda pendiente
    const saldoPend = parseFloat(venta.saldo_pend_usd)
    if (saldoPend > 0.01) {
      const clienteResult = await tx.execute('SELECT saldo_actual FROM clientes WHERE id = ?', [
        venta.cliente_id,
      ])
      if (!clienteResult.rows || clienteResult.rows.length === 0) {
        throw new Error('Cliente no encontrado')
      }
      const saldoActual = parseFloat(
        (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
      )
      const saldoNuevo = Math.max(0, Number((saldoActual - saldoPend).toFixed(2)))

      const movCuentaId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
         VALUES (?, ?, 'NCR', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movCuentaId,
          venta.cliente_id,
          nroNcr,
          saldoPend.toFixed(2),
          saldoActual.toFixed(2),
          saldoNuevo.toFixed(2),
          `Anulacion de factura ${venta.nro_factura}`,
          venta_id,
          now,
          empresa_id,
          now,
        ]
      )

      await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
        saldoNuevo.toFixed(2),
        now,
        venta.cliente_id,
      ])
    }

    // 6. Marcar factura como anulada
    await tx.execute("UPDATE ventas SET status = 'ANULADA', saldo_pend_usd = ? WHERE id = ?", [
      '0.00',
      venta_id,
    ])
  })

  return { ncrId, nroNcr }
}
