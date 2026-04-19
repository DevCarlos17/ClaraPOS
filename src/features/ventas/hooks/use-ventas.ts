import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow } from '@/lib/dates'
import { v4 as uuidv4 } from 'uuid'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosVenta } from '@/features/contabilidad/lib/generar-asientos'

export interface LineaVenta {
  producto_id: string
  cantidad: number
  precio_unitario_usd: number
}

export interface PagoEntry {
  metodo_cobro_id: string
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
  empresa_id: string
  sesion_caja_id: string | null
}

export interface CrearVentaResult {
  ventaId: string
  nroFactura: string
}

export function useBuscarProductosVenta(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const searchTerm = query.trim()
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT p.id, p.codigo, p.tipo, p.nombre, p.precio_venta_usd, p.stock,
                COALESCE(u.es_decimal, 1) as es_decimal
         FROM productos p
         LEFT JOIN unidades u ON p.unidad_base_id = u.id
         WHERE p.empresa_id = ? AND p.is_active = 1
         AND (p.nombre LIKE ? OR p.codigo LIKE ?)
         AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)
         ORDER BY p.nombre ASC LIMIT 10`
      : '',
    shouldSearch ? [empresaId, pattern, pattern] : []
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
  es_decimal: number
}

export async function crearVenta(params: CrearVentaParams): Promise<CrearVentaResult> {
  const { cliente_id, tipo, tasa, lineas, pagos, usuario_id, empresa_id, sesion_caja_id } = params

  if (lineas.length === 0) {
    throw new Error('Debe agregar al menos una linea a la venta')
  }

  if (tasa <= 0) {
    throw new Error('La tasa de cambio debe ser mayor a 0')
  }

  let ventaId = ''
  let nroFactura = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    ventaId = uuidv4()
    console.log('🛒 CREAR VENTA - inicio writeTransaction', { ventaId, empresa_id, now })

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

    // 0b. Obtener UUIDs de monedas
    const monedaUsdResult = await tx.execute(
      "SELECT id FROM monedas WHERE codigo_iso = 'USD' LIMIT 1",
      []
    )
    const monedaBsResult = await tx.execute(
      "SELECT id FROM monedas WHERE codigo_iso = 'VES' LIMIT 1",
      []
    )
    if (!monedaUsdResult.rows?.length || !monedaBsResult.rows?.length) {
      throw new Error('No se encontraron las monedas USD/VES en el catalogo')
    }
    const monedaUsdId = (monedaUsdResult.rows.item(0) as { id: string }).id
    const monedaBsId = (monedaBsResult.rows.item(0) as { id: string }).id

    // 1. Calcular totales
    let totalUsd = 0
    for (const linea of lineas) {
      totalUsd += linea.cantidad * linea.precio_unitario_usd
    }
    totalUsd = Number(totalUsd.toFixed(2))
    const totalBs = Number((totalUsd * tasa).toFixed(2))

    // 2. Generar nro_factura (por empresa)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM ventas WHERE empresa_id = ?',
      [empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroFactura = String(count + 1).padStart(6, '0')

    // 3. INSERT venta
    await tx.execute(
      `INSERT INTO ventas (id, cliente_id, nro_factura, deposito_id, sesion_caja_id, tasa, total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd, total_usd, total_bs, saldo_pend_usd, tipo, status, usuario_id, fecha, empresa_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?, ?, ?, ?, ?)`,
      [
        ventaId,
        cliente_id,
        nroFactura,
        depositoId,
        sesion_caja_id ?? null,
        tasa.toFixed(4),
        '0.00',
        totalUsd.toFixed(2),
        '0.00',
        '0.00',
        totalUsd.toFixed(2),
        totalBs.toFixed(2),
        totalUsd.toFixed(2),
        tipo,
        usuario_id,
        now,
        empresa_id,
        now,
        usuario_id,
      ]
    )

    // 4. Por cada linea: detalle + kardex
    let montoProductos = 0
    let montoServicios = 0
    for (const linea of lineas) {
      const detalleId = uuidv4()
      const subtotalUsd = Number((linea.cantidad * linea.precio_unitario_usd).toFixed(2))
      const subtotalBs = Number((subtotalUsd * tasa).toFixed(2))

      await tx.execute(
        `INSERT INTO ventas_det (id, venta_id, producto_id, deposito_id, cantidad, precio_unitario_usd, tipo_impuesto, impuesto_pct, subtotal_usd, subtotal_bs, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          ventaId,
          linea.producto_id,
          depositoId,
          linea.cantidad.toFixed(3),
          linea.precio_unitario_usd.toFixed(2),
          'Exento',
          '0.00',
          subtotalUsd.toFixed(2),
          subtotalBs.toFixed(2),
          empresa_id,
          now,
        ]
      )

      // Leer producto
      const prodResult = await tx.execute(
        'SELECT tipo, stock, nombre, maneja_lotes FROM productos WHERE id = ?',
        [linea.producto_id]
      )
      if (!prodResult.rows || prodResult.rows.length === 0) {
        throw new Error('Producto no encontrado')
      }
      const producto = prodResult.rows.item(0) as {
        tipo: string
        stock: string
        nombre: string
        maneja_lotes: number
      }

      // Acumular subtotales por tipo para contabilidad
      if (producto.tipo === 'P') montoProductos = Number((montoProductos + subtotalUsd).toFixed(2))
      else if (producto.tipo === 'S') montoServicios = Number((montoServicios + subtotalUsd).toFixed(2))

      if (producto.tipo === 'P') {
        const stockActual = parseFloat(producto.stock)
        if (stockActual < linea.cantidad) {
          throw new Error(
            `Stock insuficiente para "${producto.nombre}". Stock: ${stockActual}, Solicitado: ${linea.cantidad}`
          )
        }
        const stockNuevo = stockActual - linea.cantidad

        if (Number(producto.maneja_lotes) === 1) {
          // FEFO: descontar desde lotes activos ordenados por fecha_vencimiento
          const lotesResult = await tx.execute(
            `SELECT id, cantidad_actual, fecha_vencimiento FROM lotes
             WHERE empresa_id = ? AND producto_id = ? AND deposito_id = ? AND status = 'ACTIVO'
             ORDER BY CASE WHEN fecha_vencimiento IS NULL THEN 1 ELSE 0 END,
                      fecha_vencimiento ASC, created_at ASC`,
            [empresa_id, linea.producto_id, depositoId]
          )

          let pendiente = linea.cantidad
          let firstLoteId: string | null = null

          if (lotesResult.rows) {
            let stockCursor = stockActual
            for (let li = 0; li < lotesResult.rows.length; li++) {
              if (pendiente <= 0) break
              const lote = lotesResult.rows.item(li) as {
                id: string
                cantidad_actual: string
              }
              const disponible = parseFloat(lote.cantidad_actual)
              if (disponible <= 0) continue

              const aDescontar = Math.min(disponible, pendiente)
              const nuevaCantLote = disponible - aDescontar
              const stockLoteNuevo = stockCursor - aDescontar

              if (firstLoteId === null) firstLoteId = lote.id

              await tx.execute(
                'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
                [
                  nuevaCantLote.toFixed(3),
                  nuevaCantLote <= 0 ? 'AGOTADO' : 'ACTIVO',
                  now,
                  lote.id,
                ]
              )

              const movLoteId = uuidv4()
              await tx.execute(
                `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, lote_id, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
                 VALUES (?, ?, ?, 'S', 'VEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  movLoteId,
                  linea.producto_id,
                  depositoId,
                  aDescontar.toFixed(3),
                  stockCursor.toFixed(3),
                  stockLoteNuevo.toFixed(3),
                  linea.precio_unitario_usd.toFixed(4),
                  lote.id,
                  ventaId,
                  `VEN-${nroFactura}`,
                  `Venta ${nroFactura}`,
                  usuario_id,
                  now,
                  empresa_id,
                  now,
                ]
              )

              stockCursor = stockLoteNuevo
              pendiente -= aDescontar
            }
          }

          if (pendiente > 0.0005) {
            throw new Error(
              `Stock en lotes insuficiente para "${producto.nombre}". Faltan ${pendiente.toFixed(3)} en lotes activos.`
            )
          }

          // Actualizar ventas_det con el lote principal
          await tx.execute('UPDATE ventas_det SET lote_id = ? WHERE id = ?', [
            firstLoteId,
            detalleId,
          ])
        } else {
          // PRODUCTO SIN LOTES: movimiento directo
          const movId = uuidv4()
          await tx.execute(
            `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
             VALUES (?, ?, ?, 'S', 'VEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              movId,
              linea.producto_id,
              depositoId,
              linea.cantidad.toFixed(3),
              stockActual.toFixed(3),
              stockNuevo.toFixed(3),
              linea.precio_unitario_usd.toFixed(4),
              ventaId,
              `VEN-${nroFactura}`,
              `Venta ${nroFactura}`,
              usuario_id,
              now,
              empresa_id,
              now,
            ]
          )
        }

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
              `INSERT INTO movimientos_inventario (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo, costo_unitario, doc_origen_id, doc_origen_ref, motivo, usuario_id, fecha, empresa_id, created_at)
               VALUES (?, ?, ?, 'S', 'VEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                movIngId,
                ingrediente.producto_id,
                depositoId,
                cantidadNecesaria.toFixed(3),
                stockIngrediente.toFixed(3),
                stockNuevoIng.toFixed(3),
                '0.0000',
                ventaId,
                `VEN-${nroFactura}`,
                `Servicio "${producto.nombre}" - Venta ${nroFactura}`,
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

    // 5. Por cada pago: calcular monto_usd e insertar
    let totalAbonadoUsd = 0
    for (const pago of pagos) {
      const pagoId = uuidv4()
      const montoUsd = pago.moneda === 'BS' ? Number((pago.monto / tasa).toFixed(2)) : pago.monto
      const pagoMonedaId = pago.moneda === 'BS' ? monedaBsId : monedaUsdId

      await tx.execute(
        `INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, fecha, empresa_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pagoId,
          ventaId,
          cliente_id,
          pago.metodo_cobro_id,
          pagoMonedaId,
          tasa.toFixed(4),
          pago.monto.toFixed(2),
          montoUsd.toFixed(2),
          pago.referencia ?? null,
          now,
          empresa_id,
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
        `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at)
         VALUES (?, ?, 'FAC', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          empresa_id,
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

    // 8. Generar asientos contables
    try {
      const cuentas = await cargarMapaCuentas(tx, empresa_id)

      // Resolver banco_empresa_id por metodo de cobro para que el libro contable
      // use la cuenta contable del banco correspondiente (partida doble correcta)
      const pagosContadoContab: Array<{ monto_usd: number; banco_empresa_id: string | null }> = []
      for (const pago of pagos) {
        const montoUsd = pago.moneda === 'BS' ? Number((pago.monto / tasa).toFixed(2)) : pago.monto
        const metodoResult = await tx.execute(
          'SELECT banco_empresa_id FROM metodos_cobro WHERE id = ? LIMIT 1',
          [pago.metodo_cobro_id]
        )
        const bancoId =
          (metodoResult.rows?.item(0) as { banco_empresa_id: string | null } | undefined)
            ?.banco_empresa_id ?? null
        pagosContadoContab.push({ monto_usd: montoUsd, banco_empresa_id: bancoId })
      }

      await generarAsientosVenta(tx, {
        empresaId: empresa_id,
        ventaId,
        nroFactura,
        pagosContado: pagosContadoContab,
        montoCredito: saldoPend,
        montoProductos,
        montoServicios,
        cuentas,
        usuarioId: usuario_id,
      })
    } catch {
      // Fallo en contabilidad no bloquea la venta
    }
  })

  // Debug: verificar que la venta se guardo en SQLite local
  try {
    const check = await db.execute('SELECT id, fecha, total_usd, empresa_id FROM ventas WHERE id = ?', [ventaId])
    console.log('🛒 CREAR VENTA - verificacion post-write:', check.rows?._array ?? check.rows)
    const countCheck = await db.execute('SELECT COUNT(*) as cnt FROM ventas')
    console.log('🛒 CREAR VENTA - total ventas en SQLite:', (countCheck.rows?.item(0) as Record<string, unknown>)?.cnt)
  } catch (e) {
    console.error('🛒 CREAR VENTA - error en verificacion:', e)
  }

  return { ventaId, nroFactura }
}
