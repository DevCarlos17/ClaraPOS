import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { localNow, timestampToVE } from '@/lib/dates'
import { v4 as uuidv4 } from 'uuid'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosVenta, leerMonedaContable } from '@/features/contabilidad/lib/generar-asientos'
import { connector } from '@/core/db/powersync/connector'

// ============================================================
// Validacion de stock en servidor antes de escribir localmente.
// Llama a la Edge Function validar-stock que lee el stock real
// en PostgreSQL (fuente de verdad), no el SQLite local.
// ============================================================
export interface LineaValidarStock {
  producto_id: string
  cantidad: number
  nombre: string
  tipo: string
}

export async function validarStockServidor(
  lineas: LineaValidarStock[],
  empresa_id: string,
): Promise<void> {
  const session = connector.currentSession
  if (!session?.access_token) {
    // Sin sesion activa no se puede llamar al servidor;
    // la validacion local del writeTransaction es la unica capa disponible.
    return
  }

  const supabaseUrl = connector.config.supabaseUrl
  const anonKey = connector.config.supabaseAnonKey

  let res: Response
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/validar-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ lineas, empresa_id }),
    })
  } catch {
    // Error de red (offline): no bloquear la venta.
    // El trigger en PostgreSQL es la red de seguridad final.
    return
  }

  const data = await res.json() as { ok?: boolean; error?: string }

  if (!res.ok && res.status !== 200) {
    // 409 = stock insuficiente en servidor
    throw new Error(data.error ?? 'Error al validar stock en servidor')
  }
}

export interface LineaVenta {
  producto_id: string
  cantidad: number
  precio_unitario_usd: number
  tipo_impuesto?: string
  impuesto_pct?: number
}

export interface PagoEntry {
  metodo_cobro_id: string
  moneda: 'USD' | 'BS'
  monto: number
  referencia?: string
}

export interface VueltoParam {
  metodo_cobro_id: string
  moneda: 'USD' | 'BS'
  /** Monto en la moneda nativa del metodo (no convertido a USD).
   *  Esto permite que cerrarSesionCaja sume por divisa correctamente. */
  monto: number
}

export interface VueltoEntry {
  metodoCobro_id: string
  /** Amount in Bs (native currency of the cash method). */
  montoBs: number
}

export interface DiscrepancyOptions {
  mode: 'VUELTO' | 'SAF' | 'PROPINA' | 'DIFERENCIAL_SOBRANTE'
       | 'CREDITO' | 'ABSORBER' | 'DIFERENCIAL_FALTANTE' | null
  /** Absolute discrepancy value in USD (always positive). */
  montoUsd: number
  /** Absolute discrepancy value in Bs (always positive). */
  montoBs: number
  /** SAF: client ID to receive the credit. */
  clienteId?: string
  /** Cashier user ID. */
  cajeroId?: string
  /** ABSORBER: supervisor who authorized the absorption. */
  supervisorId?: string
  /** VUELTO split: per-method change breakdown. */
  vueltoEntries?: VueltoEntry[]
}

export interface CargoEspecial {
  tipo: 'AVANCE' | 'PRESTAMO'
  descripcion: string
  montoCargoUsd: number   // lo que el cliente adeuda en USD (avance+fee o prestamo+interes)
  /** Monto exacto en Bs a cobrar. Presente cuando el cargo fue creado en moneda Bs.
   *  Si existe, se usa directamente para el total_bs de la factura evitando una
   *  reconversion USD->Bs que introduciria diferencias al cambiar la tasa. */
  totalCargoBs?: number
  movimientoIds: string[] // IDs de movimientos_metodo_cobro ya creados (legado)
  diasPlazo?: number      // solo PRESTAMO: plazo en dias para vencimiento_cobrar
  clienteId?: string      // para crear vencimiento_cobrar
  origenFondosTipo?: string  // CAJA | EFECTIVO_EMPRESA | BANCO
  // Datos raw para crear los egresos de caja al finalizar la factura
  egresosCaja?: Array<{ metodo_cobro_id: string; monto: number }>
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
  cargosEspeciales?: CargoEspecial[]
  /** Descuento comercial en USD (calculado como descuentoBs / tasa en el POS) */
  descuentoUsd?: number
  /** Motivo del descuento (cortesia, ajuste, etc.) */
  descuentoMotivo?: string
  /** Vuelto a entregar al cliente cuando el pago excede el total */
  vuelto?: VueltoParam
  /** IGTF calculado sobre pagos en divisas (USD, EUR, etc.) */
  totalIgtfUsd?: number
  /** Discrepancy resolution mode and amounts. */
  discrepancy?: DiscrepancyOptions
}

export interface CrearVentaResult {
  ventaId: string
  nroFactura: string
}

export function useBuscarProductosVenta(query: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  // Normalizar a minúsculas + NFC para que ñ/Ñ y acentos sean case-insensitive
  // (SQLite LIKE es case-insensitive solo para ASCII; toLowerCase() de JS sí maneja Ñ→ñ)
  const searchTerm = query.trim().toLowerCase().normalize('NFC')
  const shouldSearch = searchTerm.length >= 2
  const pattern = `%${searchTerm}%`

  const { data, isLoading } = useQuery(
    shouldSearch
      ? `SELECT p.id, p.codigo, p.tipo, p.nombre, p.precio_venta_usd, p.precio_mayor_usd, p.precio_especial_usd, p.stock,
                p.codigo_barras, COALESCE(u.es_decimal, 1) as es_decimal,
                p.tipo_impuesto, COALESCE(CAST(iv.porcentaje AS REAL), 0) as impuesto_pct
         FROM productos p
         LEFT JOIN unidades u ON p.unidad_base_id = u.id
         LEFT JOIN impuestos_ve iv ON p.impuesto_iva_id = iv.id
         WHERE p.empresa_id = ? AND p.is_active = 1
         AND (
           LOWER(REPLACE(REPLACE(p.nombre, 'Ñ', 'n'), 'ñ', 'n')) LIKE REPLACE(LOWER(?), 'ñ', 'n')
           OR p.codigo LIKE ?
           OR p.codigo_barras LIKE ?
         )
         AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)
         ORDER BY p.nombre ASC LIMIT 10`
      : '',
    shouldSearch ? [empresaId, pattern, pattern, pattern] : []
  )

  return { productos: (data ?? []) as ProductoVenta[], isLoading }
}

export interface ProductoVenta {
  id: string
  codigo: string
  tipo: string
  nombre: string
  precio_venta_usd: string     // nivel orden 1
  precio_mayor_usd: string     // nivel orden 2
  precio_especial_usd: string  // nivel orden 3
  stock: string
  es_decimal: number
  codigo_barras?: string | null
  tipo_impuesto?: string | null
  impuesto_pct?: number
}

export async function buscarProductoPorCodigoBarras(
  barcode: string,
  empresaId: string
): Promise<ProductoVenta | null> {
  const result = await db.execute(
    `SELECT p.id, p.codigo, p.tipo, p.nombre, p.precio_venta_usd, p.precio_mayor_usd, p.precio_especial_usd, p.stock,
            p.codigo_barras, COALESCE(u.es_decimal, 1) as es_decimal,
            p.tipo_impuesto, COALESCE(CAST(iv.porcentaje AS REAL), 0) as impuesto_pct
     FROM productos p
     LEFT JOIN unidades u ON p.unidad_base_id = u.id
     LEFT JOIN impuestos_ve iv ON p.impuesto_iva_id = iv.id
     WHERE p.empresa_id = ?
       AND p.codigo_barras = ?
       AND p.is_active = 1
       AND (p.tipo = 'S' OR CAST(p.stock AS REAL) > 0)
     LIMIT 1`,
    [empresaId, barcode]
  )
  if (!result.rows || result.rows.length === 0) return null
  return result.rows.item(0) as ProductoVenta
}

export async function crearVenta(params: CrearVentaParams): Promise<CrearVentaResult> {
  const { cliente_id, tipo, tasa, lineas, pagos, usuario_id, empresa_id, sesion_caja_id, cargosEspeciales = [], descuentoUsd = 0, vuelto, totalIgtfUsd = 0, discrepancy } = params

  if (lineas.length === 0 && cargosEspeciales.length === 0) {
    throw new Error('Debe agregar al menos una linea o cargo especial a la venta')
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
    let depositoId: string | null = null
    if (depResult.rows && depResult.rows.length > 0) {
      const row = depResult.rows.item(0) as { id: string | null } | null
      depositoId = row?.id ?? null
    }
    if (!depositoId) {
      const depFallback = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
      if (!depFallback.rows || depFallback.rows.length === 0) {
        throw new Error('No hay depositos configurados. Cree un deposito primero.')
      }
      const rowFb = depFallback.rows.item(0) as { id: string | null } | null
      depositoId = rowFb?.id ?? null
    }
    if (!depositoId) {
      throw new Error('No se pudo resolver el deposito: el ID es nulo. Verifique la sincronizacion.')
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

    // 1. Calcular totales con desglose fiscal
    let totalExentoUsd = 0
    let totalBaseUsd = 0
    let totalIvaUsd = 0
    for (const linea of lineas) {
      const subtotal = Number((linea.cantidad * linea.precio_unitario_usd).toFixed(2))
      const tipoImp = (linea.tipo_impuesto as string | undefined) ?? 'Exento'
      if (tipoImp === 'Exento') {
        totalExentoUsd += subtotal
      } else {
        totalBaseUsd += subtotal
        const pct = (linea.impuesto_pct as number | undefined) ?? 0
        totalIvaUsd += Number((subtotal * (pct / 100)).toFixed(2))
      }
    }
    totalExentoUsd = Number(totalExentoUsd.toFixed(2))
    totalBaseUsd = Number(totalBaseUsd.toFixed(2))
    totalIvaUsd = Number(totalIvaUsd.toFixed(2))
    let totalUsd = totalExentoUsd + totalBaseUsd + totalIvaUsd
    // Agregar cargos especiales (avance/prestamo) al total
    for (const cargo of cargosEspeciales) {
      totalUsd += cargo.montoCargoUsd
    }
    totalUsd = Number(totalUsd.toFixed(2))

    // Descuento comercial: se resta del total BRUTO antes de almacenar.
    // total_usd y total_bs quedan como montos NETOS (lo que el cliente paga).
    // descuento_usd y descuento_bs se guardan aparte para reportes del cuadre.
    const descuentoUsdFinal = Math.min(Number(descuentoUsd.toFixed(2)), totalUsd)
    const descuentoBsFinal = Number((descuentoUsdFinal * tasa).toFixed(2))
    totalUsd = Number((totalUsd - descuentoUsdFinal).toFixed(2))

    // total_bs: los cargos especiales con totalCargoBs se suman en su moneda nativa
    // para evitar diferencias por tasa entre el momento del avance y el de la factura.
    const totalCargosUsd = cargosEspeciales.reduce((s, c) => s + c.montoCargoUsd, 0)
    const totalCargosNativosBs = cargosEspeciales.reduce((s, c) =>
      s + (c.totalCargoBs ?? Number((c.montoCargoUsd * tasa).toFixed(2))), 0)
    const totalProductosNetUsd = Number((totalUsd - totalCargosUsd).toFixed(2))
    const totalBs = Number((totalProductosNetUsd * tasa + totalCargosNativosBs).toFixed(2))

    // 2. Generar nro_factura con prefijo por caja (C01-000001).
    //    Cada caja tiene su propio contador acumulado a traves de todas sus sesiones.
    //    Esto elimina colisiones entre cajas en escenarios multi-caja offline.
    //    Si no hay sesion activa se usa el contador global por empresa como fallback.
    if (sesion_caja_id) {
      // Obtener caja_id de la sesion actual
      const sesionRow = await tx.execute(
        'SELECT caja_id FROM sesiones_caja WHERE id = ? LIMIT 1',
        [sesion_caja_id]
      )
      const cajaId = sesionRow.rows?.length
        ? (sesionRow.rows.item(0) as { caja_id: string }).caja_id
        : null

      if (cajaId) {
        // Obtener nro_caja
        const cajaRow = await tx.execute(
          'SELECT nro_caja FROM cajas WHERE id = ? LIMIT 1',
          [cajaId]
        )
        const nroCaja = cajaRow.rows?.length
          ? (cajaRow.rows.item(0) as { nro_caja: number | null }).nro_caja
          : null

        if (nroCaja !== null) {
          // Contar facturas emitidas por TODAS las sesiones de esta caja
          const countRow = await tx.execute(
            `SELECT COUNT(*) as cnt
             FROM ventas v
             INNER JOIN sesiones_caja sc ON v.sesion_caja_id = sc.id
             WHERE v.empresa_id = ? AND sc.caja_id = ?`,
            [empresa_id, cajaId]
          )
          const cnt = Number((countRow.rows?.item(0) as { cnt: number })?.cnt ?? 0)
          const prefijo = `C${String(nroCaja).padStart(2, '0')}`
          nroFactura = `${prefijo}-${String(cnt + 1).padStart(6, '0')}`
        }
      }
    }

    // Fallback: sin sesion de caja o caja sin nro_caja — correlativo global por empresa
    if (!nroFactura) {
      const countResult = await tx.execute(
        'SELECT COUNT(*) as cnt FROM ventas WHERE empresa_id = ?',
        [empresa_id]
      )
      const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
      nroFactura = String(count + 1).padStart(6, '0')
    }

    // 3. INSERT venta
    await tx.execute(
      `INSERT INTO ventas (id, cliente_id, nro_factura, deposito_id, sesion_caja_id, tasa, total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd, total_usd, total_bs, descuento_usd, descuento_bs, saldo_pend_usd, tipo, status, usuario_id, fecha, empresa_id, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?, ?, ?, ?, ?)`,
      [
        ventaId,
        cliente_id,
        nroFactura,
        depositoId,
        sesion_caja_id ?? null,
        tasa.toFixed(4),
        totalExentoUsd.toFixed(2),
        totalBaseUsd.toFixed(2),
        totalIvaUsd.toFixed(2),
        totalIgtfUsd.toFixed(2),
        totalUsd.toFixed(2),
        totalBs.toFixed(2),
        descuentoUsdFinal.toFixed(2),
        descuentoBsFinal.toFixed(2),
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
          (linea.tipo_impuesto as string | undefined) ?? 'Exento',
          ((linea.impuesto_pct as number | undefined) ?? 0).toFixed(2),
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
        `INSERT INTO pagos (id, venta_id, cliente_id, metodo_cobro_id, moneda_id, tasa, monto, monto_usd, referencia, sesion_caja_id, fecha, empresa_id, created_at, created_by, is_reversed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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
          sesion_caja_id ?? null,
          now,
          empresa_id,
          now,
          usuario_id,
        ]
      )

      // Crear movimiento_metodo_cobro por cada pago
      if (montoUsd > 0) {
        const movMetodoId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_metodo_cobro
             (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'INGRESO', 'VENTA', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movMetodoId,
            empresa_id,
            pago.metodo_cobro_id,
            montoUsd.toFixed(2),
            ventaId,
            `VEN-${nroFactura}`,
            `Venta ${nroFactura}`,
            sesion_caja_id ?? null,
            now,
            now,
            usuario_id,
          ]
        )
      }

      totalAbonadoUsd += montoUsd
    }

    // 5b. VUELTO: registrar el cambio entregado al cliente como EGRESO inmutable.
    //     monto se guarda en moneda nativa del metodo (no USD) para que el cuadre
    //     por divisa en cerrarSesionCaja sume correctamente por codigo_iso.
    if (vuelto && vuelto.monto > 0.005 && discrepancy?.mode !== 'VUELTO') {
      const vueltoId = uuidv4()
      await tx.execute(
        `INSERT INTO movimientos_metodo_cobro
           (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
            doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
         VALUES (?, ?, ?, 'EGRESO', 'VUELTO', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vueltoId,
          empresa_id,
          vuelto.metodo_cobro_id,
          vuelto.monto.toFixed(2),
          ventaId,
          `VEN-${nroFactura}`,
          `Vuelto Venta ${nroFactura}`,
          sesion_caja_id ?? null,
          now,
          now,
          usuario_id,
        ]
      )
    }

    // 6. UPDATE venta saldo_pend_usd (ancla en Bs, consistente con el calculo del POS)
    const abonado_BsNativo = pagos.filter((p) => p.moneda === 'BS').reduce((s, p) => s + p.monto, 0)
    const abonado_UsdNativo = pagos.filter((p) => p.moneda === 'USD').reduce((s, p) => s + p.monto, 0)
    const pendienteBs4_db = Math.max(0, totalUsd * tasa - abonado_BsNativo - abonado_UsdNativo * tasa)
    // Si el residuo en Bs es <= $0.01 equivalente, es diferencial de redondeo: se absorbe (saldo = 0)
    const saldoPend = pendienteBs4_db <= tasa * 0.01 ? 0 : Number((pendienteBs4_db / tasa).toFixed(2))
    await tx.execute('UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?', [
      saldoPend.toFixed(2),
      ventaId,
    ])

    // 7. Si CREDITO y deuda > 0.01: crear movimiento de cuenta
    //    Excluir modos de absorcion: el gasto absorbe el faltante, no queda deuda en CxC.
    if (tipo === 'CREDITO' && saldoPend > 0.01
        && discrepancy?.mode !== 'ABSORBER'
        && discrepancy?.mode !== 'DIFERENCIAL_FALTANTE') {
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
        `INSERT INTO movimientos_cuenta (id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo, observacion, venta_id, fecha, empresa_id, created_at, tasa_pago)
         VALUES (?, ?, 'FAC', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          tasa.toFixed(4),
        ]
      )

      // Actualizar saldo del cliente localmente
      await tx.execute('UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?', [
        saldoNuevo.toFixed(2),
        now,
        cliente_id,
      ])
    }

    // 7c. Discrepancy resolution records
    //     Runs after steps 6+7 so saldo_pend_usd and tipo are already set.
    //     ABSORBER / DIFERENCIAL_FALTANTE also override saldo_pend_usd to 0.
    if (discrepancy && discrepancy.mode && discrepancy.montoUsd > 0.001) {
      switch (discrepancy.mode) {

        case 'SAF': {
          // Credit overpayment to client's CxC balance
          if (discrepancy.clienteId) {
            const clienteSafResult = await tx.execute(
              'SELECT saldo_actual FROM clientes WHERE id = ?',
              [discrepancy.clienteId]
            )
            const saldoAnteriorSaf = parseFloat(
              (clienteSafResult.rows?.item(0) as { saldo_actual: string } | undefined)?.saldo_actual ?? '0'
            ) || 0
            // Reduce what the client owes (negative = credit in favour of client)
            const saldoNuevoSaf = Number((saldoAnteriorSaf - discrepancy.montoUsd).toFixed(2))
            await tx.execute(
              `INSERT INTO movimientos_cuenta
                 (id, empresa_id, cliente_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
                  observacion, venta_id, fecha, created_at, created_by, tasa_pago)
               VALUES (?, ?, ?, 'SAF', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                discrepancy.clienteId,
                `SAF-VEN-${nroFactura}`,
                discrepancy.montoUsd.toFixed(2),
                saldoAnteriorSaf.toFixed(2),
                saldoNuevoSaf.toFixed(2),
                `Saldo a favor — excedente de pago en venta ${nroFactura}`,
                ventaId,
                now,
                now,
                usuario_id,
                tasa.toFixed(4),
              ]
            )
            await tx.execute(
              'UPDATE clientes SET saldo_actual = ?, updated_at = ? WHERE id = ?',
              [saldoNuevoSaf.toFixed(2), now, discrepancy.clienteId]
            )
          }
          break
        }

        case 'ABSORBER': {
          // Business absorbs shortfall — always zero out balance first, then record expense
          // saldo_pend_usd = 0 is unconditional: supervisor already authorized
          await tx.execute(
            'UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?',
            ['0.00', ventaId]
          )
          try {
            const nroGastoAbsRes = await tx.execute(
              'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?',
              [empresa_id]
            )
            const nroGastoAbsNum = Number(
              (nroGastoAbsRes.rows?.item(0) as { cnt: number })?.cnt ?? 0
            ) + 1
            const nroGastoAbs = `POS-ABSORB-${String(nroGastoAbsNum).padStart(5, '0')}`
            const cuentaAbsRes = await tx.execute(
              `SELECT cuenta_contable_id FROM cuentas_config
               WHERE empresa_id = ? AND clave = 'gastos_generales' LIMIT 1`,
              [empresa_id]
            )
            const cuentaAbsId = (
              cuentaAbsRes.rows?.item(0) as { cuenta_contable_id: string } | undefined
            )?.cuenta_contable_id ?? ''
            await tx.execute(
              `INSERT INTO gastos
                 (id, empresa_id, nro_gasto, cuenta_id, descripcion, fecha,
                  moneda_id, moneda_factura, usa_tasa_paralela, tasa, monto_factura, monto_usd,
                  tipo_impuesto, porcentaje_iva, base_imponible_usd, monto_iva_usd,
                  saldo_pendiente_usd, observaciones, status, created_at, updated_at, created_by)
               VALUES (?, ?, ?, ?, 'ABSORCION_DIFERENCIAL_POS', ?,
                       ?, 'USD', 0, ?, ?, ?,
                       'Exento', '0.00', ?, '0.00',
                       '0.00', ?, 'PAGADO', ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                nroGastoAbs,
                cuentaAbsId,
                now,
                monedaUsdId,
                tasa.toFixed(4),
                discrepancy.montoUsd.toFixed(2),
                discrepancy.montoUsd.toFixed(2),
                discrepancy.montoUsd.toFixed(2),
                `Diferencial asumido por negocio. Cajero: ${discrepancy.cajeroId ?? usuario_id}. Supervisor: ${discrepancy.supervisorId ?? ''}. Venta: ${ventaId}`,
                now,
                now,
                usuario_id,
              ]
            )
          } catch {
            // gastos insert optional — doesn't block the sale
            console.warn('⚠️ ABSORBER: fallo al registrar gasto de absorcion para venta', ventaId)
          }
          break
        }

        case 'DIFERENCIAL_FALTANTE': {
          // Auto-absorbed small denomination shortfall — always zero out balance first, then record expense
          await tx.execute(
            'UPDATE ventas SET saldo_pend_usd = ? WHERE id = ?',
            ['0.00', ventaId]
          )
          try {
            const nroGastoDiffRes = await tx.execute(
              'SELECT COUNT(*) as cnt FROM gastos WHERE empresa_id = ?',
              [empresa_id]
            )
            const nroGastoDiffNum = Number(
              (nroGastoDiffRes.rows?.item(0) as { cnt: number })?.cnt ?? 0
            ) + 1
            const nroGastoDiff = `POS-DIFF-${String(nroGastoDiffNum).padStart(5, '0')}`
            const cuentaDiffRes = await tx.execute(
              `SELECT cuenta_contable_id FROM cuentas_config
               WHERE empresa_id = ? AND clave = 'gastos_generales' LIMIT 1`,
              [empresa_id]
            )
            const cuentaDiffId = (
              cuentaDiffRes.rows?.item(0) as { cuenta_contable_id: string } | undefined
            )?.cuenta_contable_id ?? ''
            await tx.execute(
              `INSERT INTO gastos
                 (id, empresa_id, nro_gasto, cuenta_id, descripcion, fecha,
                  moneda_id, moneda_factura, usa_tasa_paralela, tasa, monto_factura, monto_usd,
                  tipo_impuesto, porcentaje_iva, base_imponible_usd, monto_iva_usd,
                  saldo_pendiente_usd, observaciones, status, created_at, updated_at, created_by)
               VALUES (?, ?, ?, ?, 'DIFERENCIAL_CAMBIARIO_FALTANTE', ?,
                       ?, 'USD', 0, ?, ?, ?,
                       'Exento', '0.00', ?, '0.00',
                       '0.00', ?, 'PAGADO', ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                nroGastoDiff,
                cuentaDiffId,
                now,
                monedaUsdId,
                tasa.toFixed(4),
                discrepancy.montoUsd.toFixed(2),
                discrepancy.montoUsd.toFixed(2),
                discrepancy.montoUsd.toFixed(2),
                `Diferencial cambiario faltante — denominacion. Cajero: ${discrepancy.cajeroId ?? usuario_id}. Venta: ${ventaId}`,
                now,
                now,
                usuario_id,
              ]
            )
          } catch {
            // gastos insert optional — doesn't block the sale
            console.warn('⚠️ DIFERENCIAL_FALTANTE: fallo al registrar gasto diferencial para venta', ventaId)
          }
          break
        }

        case 'PROPINA': {
          // Client voluntarily left surplus — record as cash income
          const metodoPropinaId =
            discrepancy.vueltoEntries?.[0]?.metodoCobro_id ??
            pagos.find((p) => p.moneda === 'BS')?.metodo_cobro_id ??
            pagos[0]?.metodo_cobro_id ??
            null
          if (metodoPropinaId) {
            await tx.execute(
              `INSERT INTO movimientos_metodo_cobro
                 (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                  doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
               VALUES (?, ?, ?, 'INGRESO', 'PROPINA', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                metodoPropinaId,
                discrepancy.montoBs.toFixed(2),
                ventaId,
                `VEN-${nroFactura}`,
                `Propina — Venta ${nroFactura}`,
                sesion_caja_id ?? null,
                now,
                now,
                usuario_id,
              ]
            )
          }
          break
        }

        case 'DIFERENCIAL_SOBRANTE': {
          // Small denomination surplus — record as cash income
          const metodoDiffSobrId =
            discrepancy.vueltoEntries?.[0]?.metodoCobro_id ??
            pagos.find((p) => p.moneda === 'BS')?.metodo_cobro_id ??
            pagos[0]?.metodo_cobro_id ??
            null
          if (metodoDiffSobrId) {
            await tx.execute(
              `INSERT INTO movimientos_metodo_cobro
                 (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                  doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
               VALUES (?, ?, ?, 'INGRESO', 'DIFERENCIAL_CAMBIARIO', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                metodoDiffSobrId,
                discrepancy.montoBs.toFixed(2),
                ventaId,
                `VEN-${nroFactura}`,
                `Diferencial cambiario sobrante — Venta ${nroFactura}`,
                sesion_caja_id ?? null,
                now,
                now,
                usuario_id,
              ]
            )
          }
          break
        }

        case 'VUELTO': {
          // Split change across methods (or fall back to single vuelto param)
          if (discrepancy.vueltoEntries && discrepancy.vueltoEntries.length > 0) {
            for (const entry of discrepancy.vueltoEntries) {
              await tx.execute(
                `INSERT INTO movimientos_metodo_cobro
                   (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                    doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
                 VALUES (?, ?, ?, 'EGRESO', 'VUELTO', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  uuidv4(),
                  empresa_id,
                  entry.metodoCobro_id,
                  entry.montoBs.toFixed(2),
                  ventaId,
                  `VEN-${nroFactura}`,
                  `Vuelto — Venta ${nroFactura}`,
                  sesion_caja_id ?? null,
                  now,
                  now,
                  usuario_id,
                ]
              )
            }
          } else if (vuelto && vuelto.monto > 0.005) {
            // Fallback: no split entries provided — use single vuelto param
            await tx.execute(
              `INSERT INTO movimientos_metodo_cobro
                 (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                  doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
               VALUES (?, ?, ?, 'EGRESO', 'VUELTO', ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)`,
              [
                uuidv4(),
                empresa_id,
                vuelto.metodo_cobro_id,
                vuelto.monto.toFixed(2),
                ventaId,
                `VEN-${nroFactura}`,
                `Vuelto Venta ${nroFactura}`,
                sesion_caja_id ?? null,
                now,
                now,
                usuario_id,
              ]
            )
          }
          break
        }

        case 'CREDITO':
        default:
          // Credit: saldo_pend_usd and movimientos_cuenta FAC already handled in steps 6+7
          break
      }
    }

    // 7b. Crear egresos de caja para cargos especiales + vencimientos prestamo
    if (cargosEspeciales.length > 0) {
      for (const cargo of cargosEspeciales) {
        // Nuevo flujo: crear movimientos_metodo_cobro al finalizar la factura
        if (cargo.egresosCaja && cargo.egresosCaja.length > 0) {
          for (const entrada of cargo.egresosCaja) {
            if (entrada.monto <= 0) continue

            // Leer saldo_actual y moneda del metodo
            const metodoResult = await tx.execute(
              `SELECT mc.saldo_actual,
                      CASE WHEN mo.codigo_iso = 'VES' THEN 'BS' ELSE COALESCE(mo.codigo_iso, 'USD') END AS moneda,
                      mo.codigo_iso AS moneda_iso
               FROM metodos_cobro mc
               LEFT JOIN monedas mo ON mc.moneda_id = mo.id
               WHERE mc.id = ? AND mc.empresa_id = ?`,
              [entrada.metodo_cobro_id, empresa_id]
            )
            if (!metodoResult.rows?.length) throw new Error('Metodo de cobro no encontrado')

            const metodoRow = metodoResult.rows.item(0) as {
              saldo_actual: string
              moneda: string
              moneda_iso: string
            }
            const monedaMetodo = metodoRow.moneda       // 'BS' | 'USD'
            const monedaIso    = metodoRow.moneda_iso   // 'VES' | 'USD'

            // Calcular saldo real de la sesion: apertura + pagos + movimientos manuales.
            // saldo_actual en metodos_cobro no incluye apertura ni ventas regulares,
            // por lo que no es fiable como fuente de verdad para este check.
            let disponible = 0
            if (sesion_caja_id) {
              const sesionBalResult = await tx.execute(
                'SELECT monto_apertura_usd, monto_apertura_bs FROM sesiones_caja WHERE id = ?',
                [sesion_caja_id]
              )
              const sesionBalRow = sesionBalResult.rows?.item(0) as
                | { monto_apertura_usd: string; monto_apertura_bs: string }
                | undefined
              const apertura = parseFloat(
                monedaMetodo === 'BS'
                  ? sesionBalRow?.monto_apertura_bs  ?? '0'
                  : sesionBalRow?.monto_apertura_usd ?? '0'
              ) || 0

              const movsBalResult = await tx.execute(
                `SELECT
                   COALESCE(SUM(CASE WHEN mmc.tipo = 'INGRESO' THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS ingresos,
                   COALESCE(SUM(CASE WHEN mmc.tipo = 'EGRESO'  THEN CAST(mmc.monto AS REAL) ELSE 0 END), 0) AS egresos
                 FROM movimientos_metodo_cobro mmc
                 JOIN metodos_cobro mc2 ON mmc.metodo_cobro_id = mc2.id
                 JOIN monedas mo2 ON mc2.moneda_id = mo2.id
                 WHERE mmc.sesion_caja_id = ? AND mc2.tipo = 'EFECTIVO' AND mo2.codigo_iso = ?`,
                [sesion_caja_id, monedaIso]
              )
              const movsBalRow = movsBalResult.rows?.item(0) as { ingresos: number; egresos: number } | undefined
              const ingresosSesion = movsBalRow?.ingresos ?? 0
              const egresosSesion  = movsBalRow?.egresos  ?? 0

              const pagosBalResult = await tx.execute(
                `SELECT COALESCE(SUM(
                   CASE WHEN mo2.codigo_iso = 'USD' THEN CAST(p.monto_usd AS REAL) ELSE CAST(p.monto AS REAL) END
                 ), 0) AS total
                 FROM pagos p
                 JOIN metodos_cobro mc2 ON p.metodo_cobro_id = mc2.id
                 JOIN monedas mo2 ON p.moneda_id = mo2.id
                 WHERE p.sesion_caja_id = ? AND mc2.tipo = 'EFECTIVO' AND mo2.codigo_iso = ?
                   AND COALESCE(p.is_reversed, 0) = 0`,
                [sesion_caja_id, monedaIso]
              )
              const pagosSesion = ((pagosBalResult.rows?.item(0) as { total: number } | undefined)?.total) ?? 0

              disponible = apertura + ingresosSesion - egresosSesion + pagosSesion
            } else {
              // Sin sesion activa: usar saldo_actual como fallback
              disponible = parseFloat(metodoRow.saldo_actual ?? '0') || 0
            }

            if (disponible < entrada.monto - 0.01) {
              const currency = monedaMetodo === 'BS' ? 'Bs' : 'USD'
              throw new Error(
                `Saldo insuficiente en ${currency} para ${cargo.tipo === 'AVANCE' ? 'avance' : 'prestamo'}. ` +
                `Disponible: ${disponible.toFixed(2)}, Solicitado: ${entrada.monto.toFixed(2)}`
              )
            }

            const saldoActual = parseFloat(metodoRow.saldo_actual ?? '0') || 0
            const saldoNuevo  = Number((saldoActual - entrada.monto).toFixed(2))
            const movId = uuidv4()
            await tx.execute(
              `INSERT INTO movimientos_metodo_cobro
                 (id, empresa_id, metodo_cobro_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                  doc_origen_id, doc_origen_ref, concepto, sesion_caja_id, fecha, created_at, created_by)
               VALUES (?, ?, ?, 'EGRESO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                movId, empresa_id, entrada.metodo_cobro_id,
                cargo.tipo,
                entrada.monto.toFixed(2), disponible.toFixed(2), (disponible - entrada.monto).toFixed(2),
                ventaId, `VEN-${nroFactura}`,
                cargo.descripcion,
                sesion_caja_id ?? null, now, now, usuario_id,
              ]
            )
            await tx.execute(
              'UPDATE metodos_cobro SET saldo_actual = ?, updated_at = ? WHERE id = ?',
              [saldoNuevo.toFixed(2), now, entrada.metodo_cobro_id]
            )
          }
        } else {
          // Flujo legado: vincular movimientos ya creados previamente
          for (const movId of cargo.movimientoIds) {
            await tx.execute(
              'UPDATE movimientos_metodo_cobro SET doc_origen_id = ?, doc_origen_ref = ? WHERE id = ?',
              [ventaId, `VEN-${nroFactura}`, movId]
            )
          }
        }

        // Para PRESTAMO: crear vencimiento_cobrar
        if (cargo.tipo === 'PRESTAMO' && cargo.diasPlazo && cargo.diasPlazo > 0) {
          const vencId = uuidv4()
          const fechaVencStr = timestampToVE(Date.now() + cargo.diasPlazo * 86_400_000).slice(0, 10)
          await tx.execute(
            `INSERT INTO vencimientos_cobrar
               (id, empresa_id, venta_id, cliente_id, nro_cuota, fecha_vencimiento,
                monto_original_usd, monto_pagado_usd, saldo_pendiente_usd, status,
                origen_fondos_tipo, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, ?, ?, '0.00', ?, 'PENDIENTE', ?, ?, ?)`,
            [
              vencId, empresa_id, ventaId, cliente_id, fechaVencStr,
              cargo.montoCargoUsd.toFixed(2), cargo.montoCargoUsd.toFixed(2),
              cargo.origenFondosTipo ?? 'CAJA', now, now,
            ]
          )
        }
      }
    }

    // 8. Generar asientos contables + movimientos bancarios
    try {
      const [cuentas, monedaContable] = await Promise.all([
        cargarMapaCuentas(tx, empresa_id),
        leerMonedaContable(tx, empresa_id),
      ])

      // Resolver banco_empresa_id por metodo de cobro para contabilidad y movimientos bancarios
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

        // Crear movimiento bancario para pagos que usan cuenta bancaria
        if (bancoId && montoUsd > 0) {
          const movBancoId = uuidv4()
          await tx.execute(
            `INSERT INTO movimientos_bancarios
               (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
                doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
             VALUES (?, ?, ?, 'INGRESO', 'TRANSFERENCIA_CLIENTE', ?, 0, 0, ?, 'VENTA', ?, 0, ?, ?, ?, ?)`,
            [
              movBancoId, empresa_id, bancoId,
              montoUsd.toFixed(2),
              ventaId,
              pago.referencia ?? null,
              `Venta ${nroFactura}`,
              now, now, usuario_id,
            ]
          )
        }
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
        monedaContable,
        tasa,
      })
    } catch {
      // Fallo en contabilidad no bloquea la venta
    }
  })

  return { ventaId, nroFactura }
}
