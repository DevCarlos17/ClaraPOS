import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import Decimal from 'decimal.js'
import { toStorageString } from '@/lib/currency'

export interface MovimientoInventario {
  id: string
  producto_id: string
  tipo: string
  origen: string
  cantidad: string
  stock_anterior: string
  stock_nuevo: string
  motivo: string | null
  usuario_id: string
  fecha: string
  venta_id: string | null
  created_at: string
}

export interface MovimientoConProducto extends MovimientoInventario {
  prod_codigo: string
  prod_nombre: string
  departamento_id: string
}

export function useMovimientos(limit = 50) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM movimientos_inventario WHERE empresa_id = ? ORDER BY fecha DESC LIMIT ${limit}`,
    [empresaId]
  )
  return { movimientos: (data ?? []) as MovimientoInventario[], isLoading }
}

export function useMovimientosFiltrados(fechaDesde: string, fechaHasta: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  // Nota sobre fechas:
  // localNow() produce ISO 8601 con offset '-04:00' (ej. '2026-06-07T20:30:00-04:00').
  // Supabase (TIMESTAMPTZ) convierte a UTC y al sincronizar devuelve '2026-06-07 22:30:00'
  // (espacio, sin offset).  Comparar strings directamente falla porque 'T' > ' '.
  //
  // Solucion: datetime(mi.fecha) normaliza ambos formatos a UTC para la comparacion.
  // Los bounds del filtro se expresan en hora venezolana (VET = UTC-4) usando el
  // sufijo '-04:00', de modo que datetime() los convierte a UTC y la comparacion
  // es consistente tanto para registros locales (pre-sync) como para los que ya
  // sincronizaron (post-sync, almacenados en UTC).
  const { data, isLoading } = useQuery(
    `SELECT mi.*, p.codigo as prod_codigo, p.nombre as prod_nombre, p.departamento_id
     FROM movimientos_inventario mi
     LEFT JOIN productos p ON p.id = mi.producto_id
     WHERE mi.empresa_id = ?
       AND datetime(mi.fecha) >= datetime(? || 'T00:00:00-04:00')
       AND datetime(mi.fecha) <= datetime(? || 'T23:59:59-04:00')
     ORDER BY mi.fecha DESC LIMIT 500`,
    [empresaId, fechaDesde, fechaHasta]
  )
  return { movimientos: (data ?? []) as MovimientoConProducto[], isLoading }
}

export function useMovimientosPorProducto(productoId: string) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    'SELECT * FROM movimientos_inventario WHERE empresa_id = ? AND producto_id = ? ORDER BY fecha DESC',
    [empresaId, productoId]
  )
  return { movimientos: (data ?? []) as MovimientoInventario[], isLoading }
}

const TIPO_SALIDA_CLAVE: Record<string, string> = {
  MERMA: 'MERMA_INVENTARIO',
  EXTRAVIO: 'EXTRAVIO_INVENTARIO',
  CONSUMO_INTERNO: 'CONSUMO_INTERNO',
}

export async function registrarMovimiento(params: {
  producto_id: string
  tipo: 'E' | 'S'
  cantidad: number
  motivo?: string
  usuario_id: string
  empresa_id: string
  /** Si se provee, se usa en lugar del deposito principal auto-detectado */
  deposito_id?: string
  /** Lote existente a actualizar (SALIDA: descuenta; ENTRADA: incrementa) */
  lote_id?: string
  /** Nuevo lote a crear al registrar una ENTRADA */
  lote_nro?: string
  lote_fecha_fab?: string
  lote_fecha_venc?: string
  /** Tipo de salida tipificada (solo para tipo='S') */
  tipoSalida?: 'MERMA' | 'EXTRAVIO' | 'CONSUMO_INTERNO'
}): Promise<{ gastoCreado: boolean }> {
  const { producto_id, tipo, cantidad, motivo, usuario_id, empresa_id, tipoSalida } = params

  let gastoCreado = false
  await db.writeTransaction(async (tx) => {
    const now = localNow()
    const fechaHoy = now.split('T')[0] ?? now.substring(0, 10)

    // 0. Resolver deposito
    let depositoId: string
    if (params.deposito_id) {
      depositoId = params.deposito_id
    } else {
      const depResult = await tx.execute(
        'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1',
        [empresa_id]
      )
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
    }

    // 1. Leer stock, costo y nombre del producto
    const result = await tx.execute(
      'SELECT stock, costo_usd, nombre FROM productos WHERE id = ?',
      [producto_id]
    )
    if (!result.rows || result.rows.length === 0) {
      throw new Error('Producto no encontrado')
    }
    const prodRow = result.rows.item(0) as { stock: string; costo_usd: string; nombre: string }
    const stockActual = parseFloat(prodRow.stock)
    const costoUsdStr = prodRow.costo_usd ?? '0'
    const costoUsd = parseFloat(costoUsdStr)
    const productoNombre = prodRow.nombre ?? ''

    // 2. Calcular nuevo stock
    const stockNuevo = tipo === 'E' ? stockActual + cantidad : stockActual - cantidad

    // 3. Validar no negativo
    if (stockNuevo < 0) {
      throw new Error(`Stock insuficiente. Stock actual: ${stockActual}, intentando sacar: ${cantidad}`)
    }

    // 4. Datos de costo para salidas tipificadas
    let tasaCambio = 0
    let totalUsd = 0
    let totalUsdStr = '0.00000000'

    if (tipo === 'S' && tipoSalida) {
      const tasaRes = await tx.execute(
        'SELECT valor FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
        [empresa_id]
      )
      tasaCambio = parseFloat(
        (tasaRes.rows?.item(0) as { valor: string } | undefined)?.valor ?? '0'
      )
      const totalUsdDecimal = new Decimal(cantidad).times(new Decimal(costoUsdStr))
      totalUsd = totalUsdDecimal.toNumber()
      totalUsdStr = toStorageString(totalUsdDecimal)
    }

    // 5. Manejar lote (atomico dentro de la transaccion)
    let loteIdMovimiento: string | null = params.lote_id ?? null

    if (tipo === 'S' && params.lote_id) {
      // SALIDA: descontar del lote especificado
      const loteResult = await tx.execute(
        'SELECT cantidad_actual FROM lotes WHERE id = ?',
        [params.lote_id]
      )
      if (loteResult.rows && loteResult.rows.length > 0) {
        const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
        if (cantLote < cantidad) {
          throw new Error(
            `Stock insuficiente en lote. Disponible: ${cantLote.toFixed(3)}, Solicitado: ${cantidad.toFixed(3)}`
          )
        }
        const nuevaCant = cantLote - cantidad
        await tx.execute(
          'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
          [nuevaCant.toFixed(3), nuevaCant <= 0 ? 'AGOTADO' : 'ACTIVO', now, params.lote_id]
        )
      }
    } else if (tipo === 'E' && params.lote_id) {
      // ENTRADA en lote existente: incrementar cantidad_actual
      const loteResult = await tx.execute(
        'SELECT cantidad_actual FROM lotes WHERE id = ?',
        [params.lote_id]
      )
      if (loteResult.rows && loteResult.rows.length > 0) {
        const cantLote = parseFloat((loteResult.rows.item(0) as { cantidad_actual: string }).cantidad_actual)
        await tx.execute(
          'UPDATE lotes SET cantidad_actual = ?, status = ?, updated_at = ? WHERE id = ?',
          [(cantLote + cantidad).toFixed(3), 'ACTIVO', now, params.lote_id]
        )
      }
    } else if (tipo === 'E' && params.lote_nro) {
      // ENTRADA con nuevo lote: crear el lote y registrar el movimiento apuntando a el
      loteIdMovimiento = uuidv4()
      await tx.execute(
        `INSERT INTO lotes (id, empresa_id, producto_id, deposito_id, nro_lote, fecha_fabricacion,
           fecha_vencimiento, cantidad_inicial, cantidad_actual, costo_unitario, factura_compra_id,
           status, created_at, updated_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'ACTIVO', ?, ?, ?)`,
        [
          loteIdMovimiento,
          empresa_id,
          producto_id,
          depositoId,
          params.lote_nro.trim().toUpperCase(),
          params.lote_fecha_fab ?? null,
          params.lote_fecha_venc ?? null,
          cantidad.toFixed(3),
          cantidad.toFixed(3),
          now,
          now,
          usuario_id,
        ]
      )
    }

    // 6. Crear movimiento de inventario
    const id = uuidv4()
    const costoUsdParaMovimiento = tipo === 'S' && tipoSalida ? costoUsdStr : null
    const tasaCambioParaMovimiento = tipo === 'S' && tipoSalida && tasaCambio > 0
      ? tasaCambio.toFixed(4)
      : null

    await tx.execute(
      `INSERT INTO movimientos_inventario
         (id, producto_id, deposito_id, tipo, origen, cantidad, stock_anterior, stock_nuevo,
          lote_id, motivo, usuario_id, fecha, empresa_id, created_at,
          tipo_salida, costo_unitario, tasa_cambio)
       VALUES (?, ?, ?, ?, 'MAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        producto_id,
        depositoId,
        tipo,
        cantidad.toFixed(3),
        stockActual.toFixed(3),
        stockNuevo.toFixed(3),
        loteIdMovimiento,
        motivo ?? null,
        usuario_id,
        now,
        empresa_id,
        now,
        tipoSalida ?? null,
        costoUsdParaMovimiento,
        tasaCambioParaMovimiento,
      ]
    )

    // 7. Actualizar stock del producto
    await tx.execute('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [
      stockNuevo.toFixed(3),
      now,
      producto_id,
    ])

    // 8. Gasto contable automatico para salidas tipificadas
    if (tipo === 'S' && tipoSalida && totalUsd > 0) {
      try {
        const cuentasClave = TIPO_SALIDA_CLAVE[tipoSalida]

        const cuentaRes = await tx.execute(
          'SELECT cuenta_contable_id FROM cuentas_config WHERE empresa_id = ? AND clave = ? LIMIT 1',
          [empresa_id, cuentasClave]
        )
        const cuentaId = (cuentaRes.rows?.item(0) as { cuenta_contable_id: string } | undefined)
          ?.cuenta_contable_id ?? null

        const monedaRes = await tx.execute(
          "SELECT id FROM monedas WHERE codigo_iso = 'USD' LIMIT 1",
          []
        )
        const monedaUsdId = (monedaRes.rows?.item(0) as { id: string } | undefined)?.id ?? ''

        if (cuentaId && monedaUsdId) {
          const gastoId = uuidv4()
          const tasaStr = tasaCambio > 0 ? tasaCambio.toFixed(4) : '0'
          const concepto = `Salida por ${tipoSalida}: ${productoNombre}`

          await tx.execute(
            `INSERT INTO gastos
               (id, empresa_id, nro_gasto, nro_factura, cuenta_id, descripcion, fecha,
                moneda_id, moneda_factura, usa_tasa_paralela, tasa, monto_factura, monto_usd,
                tipo_impuesto, porcentaje_iva, base_imponible_usd, monto_iva_usd,
                saldo_pendiente_usd, observaciones, status, created_at, updated_at, created_by,
                doc_origen_id, doc_origen_tipo)
             VALUES (?, ?, ?, ?, ?, ?, ?,
                     ?, 'USD', 0, ?, ?, ?,
                     'Exento', '0.00', ?, '0.00',
                     '0.00', ?, 'PAGADO', ?, ?, ?,
                     ?, ?)`,
            [
              gastoId,
              empresa_id,
              `KAR-${id.substring(0, 8).toUpperCase()}`,
              id,
              cuentaId,
              concepto,
              fechaHoy,
              monedaUsdId,
              tasaStr,
              totalUsdStr,
              totalUsdStr,
              totalUsdStr,
              `Generado automaticamente por salida de inventario ${id.substring(0, 8).toUpperCase()}`,
              now,
              now,
              usuario_id,
              id,
              'MOVIMIENTO_INVENTARIO',
            ]
          )
          gastoCreado = true
        }
      } catch (err) {
        // El gasto es critico segun spec SC-07: si falla, el tx.execute lanza y
        // PowerSync revierte todo el writeTransaction automaticamente.
        throw err
      }
    }
  })
  return { gastoCreado }
}
