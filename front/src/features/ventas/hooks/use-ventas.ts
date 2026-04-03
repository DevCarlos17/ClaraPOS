import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'

export interface LineaVenta {
  producto_id: string
  cantidad: number
  precio_unitario_usd: number
}

export interface PagoEntry {
  metodo_pago_id: string
  moneda: 'USD' | 'BS'
  monto: number
  referencia?: string
}

export interface CrearVentaParams {
  cliente_id: string
  tipo: 'CONTADO' | 'CREDITO'
  tasa: number
  lineas: LineaVenta[]
  pagos: PagoEntry[]
  usuario_id: string
}

export interface CrearVentaResult {
  ventaId: string
  nroFactura: string
}

export function useBuscarProductosVenta(query: string) {
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT * FROM productos WHERE activo = 1
         AND (nombre LIKE ? OR codigo LIKE ?)
         AND (tipo = 'S' OR CAST(stock AS REAL) > 0)
         ORDER BY nombre ASC LIMIT 10`
      : '',
    shouldSearch ? [pattern, pattern] : []
  )

  return { productos: (data ?? []) as ProductoVenta[], isLoading }
}

export interface ProductoVenta {
  id: string
  codigo: string
  tipo: string
  nombre: string
  precio_venta_usd: string
  stock: string
  medida: string
}

export async function crearVenta(params: CrearVentaParams): Promise<CrearVentaResult> {
  const { cliente_id, tipo, tasa, lineas, pagos, usuario_id } = params

  if (lineas.length === 0) {
    throw new Error('Debe agregar al menos una linea a la venta')
  }

  if (tasa <= 0) {
    throw new Error('La tasa de cambio debe ser mayor a 0')
  }

  let ventaId = ''
  let nroFactura = ''

  await db.writeTransaction(async (tx) => {
    const now = new Date().toISOString()
    ventaId = uuidv4()

    // 1. Calcular totales
    let totalUsd = 0
    for (const linea of lineas) {
      totalUsd += linea.cantidad * linea.precio_unitario_usd
    }
    totalUsd = Number(totalUsd.toFixed(2))
    const totalBs = Number((totalUsd * tasa).toFixed(2))

    // 2. Generar nro_factura
    const countResult = await tx.execute('SELECT COUNT(*) as cnt FROM ventas')
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroFactura = String(count + 1).padStart(6, '0')

    // 3. INSERT venta
    await tx.execute(
      `INSERT INTO ventas (id, cliente_id, nro_factura, tasa, total_usd, total_bs, saldo_pend_usd, tipo, usuario_id, fecha, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ventaId,
        cliente_id,
        nroFactura,
        tasa.toFixed(4),
        totalUsd.toFixed(2),
        totalBs.toFixed(2),
        totalUsd.toFixed(2),
        tipo,
        usuario_id,
        now,
        now,
      ]
    )

    // 4. Por cada linea: detalle + kardex
    for (const linea of lineas) {
      const detalleId = uuidv4()
      await tx.execute(
        `INSERT INTO detalle_venta (id, venta_id, producto_id, cantidad, precio_unitario_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          ventaId,
          linea.producto_id,
          linea.cantidad.toFixed(3),
          linea.precio_unitario_usd.toFixed(2),
          now,
        ]
      )

      // Leer producto
      const prodResult = await tx.execute(
        'SELECT tipo, stock, nombre FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      if (!prodResult.rows || prodResult.rows.length === 0) {
        throw new Error('Producto no encontrado')
      }
      const producto = prodResult.rows.item(0) as { tipo: string; stock: string; nombre: string }

      if (producto.tipo === 'P') {
        // PRODUCTO: descontar stock directo
        const stockActual = parseFloat(producto.stock)
        if (stockActual < linea.cantidad) {
          throw new Error(
            `Stock insuficiente para "${producto.nombre}". Stock: ${stockActual}, Solicitado: ${linea.cantidad}`
          )
        }
        const stockNuevo = stockActual - linea.cantidad
        const movId = uuidv4()

        await tx.execute(
          `INSERT INTO movimientos_inventario (id, producto_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, fecha, created_at)
           VALUES (?, ?, 'S', 'VEN', ?, ?, ?, ?, ?, ?, ?)`,
          [
            movId,
            linea.producto_id,
            linea.cantidad.toFixed(3),
            stockActual.toFixed(3),
            stockNuevo.toFixed(3),
            `Venta ${nroFactura}`,
            usuario_id,
            now,
            now,
          ]
        )

        await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
          stockNuevo.toFixed(3),
          now,
          linea.producto_id,
        ])
      } else if (producto.tipo === 'S') {
        // SERVICIO: explotar receta
        const recetasResult = await tx.execute(
          'SELECT r.producto_id, r.cantidad, p.stock, p.nombre FROM recetas r JOIN productos p ON r.producto_id = p.id WHERE r.servicio_id = ?',
          [linea.producto_id]
        )

        if (recetasResult.rows) {
          for (let i = 0; i < recetasResult.rows.length; i++) {
            const ingrediente = recetasResult.rows.item(i) as {
              producto_id: string
              cantidad: string
              stock: string
              nombre: string
            }

            const cantidadNecesaria = parseFloat(ingrediente.cantidad) * linea.cantidad
            const stockIngrediente = parseFloat(ingrediente.stock)

            if (stockIngrediente < cantidadNecesaria) {
              throw new Error(
                `Stock insuficiente de ingrediente "${ingrediente.nombre}" para servicio "${producto.nombre}". Stock: ${stockIngrediente}, Necesario: ${cantidadNecesaria.toFixed(3)}`
              )
            }

            const stockNuevoIng = stockIngrediente - cantidadNecesaria
            const movIngId = uuidv4()

            await tx.execute(
              `INSERT INTO movimientos_inventario (id, producto_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, fecha, created_at)
               VALUES (?, ?, 'S', 'AJU', ?, ?, ?, ?, ?, ?, ?)`,
              [
                movIngId,
                ingrediente.producto_id,
                cantidadNecesaria.toFixed(3),
                stockIngrediente.toFixed(3),
                stockNuevoIng.toFixed(3),
                `Servicio "${producto.nombre}" - Venta ${nroFactura}`,
                usuario_id,
                now,
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

    // 5. Por cada pago: calcular monto_usd e insertar
    let totalAbonadoUsd = 0
    for (const pago of pagos) {
      const pagoId = uuidv4()
      const montoUsd = pago.moneda === 'BS' ? Number((pago.monto / tasa).toFixed(2)) : pago.monto

      await tx.execute(
        `INSERT INTO pagos (id, venta_id, cliente_id, metodo_pago_id, moneda, tasa, monto, monto_usd, referencia, fecha, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoId,
          ventaId,
          cliente_id,
          pago.metodo_pago_id,
          pago.moneda,
          tasa.toFixed(4),
          pago.monto.toFixed(2),
          montoUsd.toFixed(2),
          pago.referencia ?? null,
          now,
          now,
        ]
      )

      totalAbonadoUsd += montoUsd
    }

    // 6. UPDATE venta saldo_pend_usd
    const saldoPend = Math.max(0, Number((totalUsd - totalAbonadoUsd).toFixed(2)))
    await tx.execute('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?', [
      saldoPend.toFixed(2),
      ventaId,
    ])

    // 7. Si CREDITO y deuda > 0.01: crear movimiento de cuenta
    if (tipo === 'CREDITO' && saldoPend > 0.01) {
      const clienteResult = await tx.execute('SELECT saldo_actual FROM clientes WHERE id = ?', [
        cliente_id,
      ])
      if (!clienteResult.rows || clienteResult.rows.length === 0) {
        throw new Error('Cliente no encontrado')
      }
      const saldoActual = parseFloat(
        (clienteResult.rows.item(0) as { saldo_actual: string }).saldo_actual
      )
      const saldoNuevo = Number((saldoActual + saldoPend).toFixed(2))

      const movCuentaId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, created_at)
         VALUES (?, ?, 'FAC', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movCuentaId,
          cliente_id,
          `FAC-${nroFactura}`,
          saldoPend.toFixed(2),
          saldoActual.toFixed(2),
          saldoNuevo.toFixed(2),
          `Venta a credito ${nroFactura}`,
          ventaId,
          now,
          now,
        ]
      )

      // Actualizar saldo del cliente localmente
      await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
        saldoNuevo.toFixed(2),
        now,
        cliente_id,
      ])
    }
  })

  return { ventaId, nroFactura }
}
