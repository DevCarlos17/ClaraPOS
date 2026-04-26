import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosPagoCxP, leerMonedaContable } from '@/features/contabilidad/lib/generar-asientos'

// ─── Interfaces ─────────────────────────────────────────────

export interface ProveedorConDeuda {
  id: string
  rif: string
  razon_social: string
  saldo_actual: string
  facturas_pendientes: number
}

export interface FacturaCompraPendiente {
  id: string
  nro_factura: string
  fecha_factura: string
  total_usd: string
  saldo_pend_usd: string
  tipo: string
  tasa: string           // tasa de negociacion/proveedor (tasa original del documento)
  tasa_costo: string | null  // tasa BCV/interna (usada para diferencial cambiario)
}

export interface AbonoProveedor {
  id: string
  tipo: string
  referencia: string
  monto: string
  fecha: string
  observacion: string | null
  created_at: string
  moneda_pago: string | null
  monto_moneda: string | null
  tasa_pago: string | null
  monto_usd_interno: string | null
}

export interface PagoCxPParams {
  factura_compra_id: string
  proveedor_id: string
  metodo_cobro_id: string
  banco_empresa_id: string | null
  moneda: 'USD' | 'BS'
  tasa: number           // tasa pactada para este pago (tasa proveedor para BS, interna para USD)
  tasaBcvCompra?: number // tasa BCV original del documento (para diferencial)
  tasaInternaPago?: number // tasa interna a la fecha del pago (para monto_usd_interno)
  monto: number
  fechaPago: string      // fecha del abono (YYYY-MM-DD)
  referencia?: string
  empresa_id: string
  usuario_id: string
}

// ─── Hooks de lectura ────────────────────────────────────────

export function useProveedoresConDeuda() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    // Calcular saldo desde facturas_compra directamente.
    // Evita dependencia del trigger PostgreSQL que no corre en SQLite local.
    `SELECT p.id, p.rif, p.razon_social,
       SUM(CAST(fc.saldo_pend_usd AS REAL)) as saldo_actual,
       COUNT(fc.id) as facturas_pendientes
     FROM proveedores p
     INNER JOIN facturas_compra fc
       ON fc.proveedor_id = p.id
       AND CAST(fc.saldo_pend_usd AS REAL) > 0.01
       AND fc.empresa_id = ?
     WHERE p.empresa_id = ? AND p.is_active = 1
     GROUP BY p.id, p.rif, p.razon_social
     ORDER BY saldo_actual DESC`,
    [empresaId, empresaId]
  )

  return { proveedores: (data ?? []) as ProveedorConDeuda[], isLoading }
}

export function useFacturasCompraPendientes(proveedorId: string | null) {
  const { data, isLoading } = useQuery(
    proveedorId
      ? `SELECT id, nro_factura, fecha_factura, total_usd, saldo_pend_usd, tipo, tasa, tasa_costo
         FROM facturas_compra
         WHERE proveedor_id = ? AND CAST(saldo_pend_usd AS REAL) > 0.01
         ORDER BY fecha_factura ASC`
      : '',
    proveedorId ? [proveedorId] : []
  )

  return { facturas: (data ?? []) as FacturaCompraPendiente[], isLoading }
}

// ─── Funcion de escritura ────────────────────────────────────

/**
 * Registrar pago a factura de compra (CxP).
 * Reduce saldo_pend_usd de la factura y saldo_actual del proveedor.
 * Crea movimiento_cuenta_proveedor (tipo PAG) con datos de dual-rate.
 * Genera asientos contables PAGO_CXP y movimiento bancario si aplica.
 */
export async function registrarPagoCxP(params: PagoCxPParams): Promise<void> {
  const {
    factura_compra_id, proveedor_id, banco_empresa_id,
    moneda, tasa, tasaBcvCompra, tasaInternaPago, monto,
    fechaPago, referencia, empresa_id, usuario_id,
  } = params

  if (tasa <= 0) throw new Error('La tasa debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Leer factura
    const facturaResult = await tx.execute(
      'SELECT nro_factura, saldo_pend_usd, tasa, tasa_costo FROM facturas_compra WHERE id = ?',
      [factura_compra_id]
    )
    if (!facturaResult.rows?.length) throw new Error('Factura no encontrada')
    const factura = facturaResult.rows.item(0) as {
      nro_factura: string; saldo_pend_usd: string; tasa: string; tasa_costo: string | null
    }
    const saldoFactura = parseFloat(factura.saldo_pend_usd)

    // tasaCompra para diferencial: usa tasa BCV/interna del documento
    const tasaCompra = tasaBcvCompra
      ?? (factura.tasa_costo ? parseFloat(factura.tasa_costo) : null)
      ?? parseFloat(factura.tasa)

    // 2. Calcular monto en USD (a tasa del proveedor del documento o tasa pactada)
    const montoUsd = moneda === 'BS' ? Number((monto / tasa).toFixed(2)) : monto

    // 3. monto_usd_interno: USD a tasa interna del día del pago (para contabilidad)
    // Para BS: monto_bs / tasa_interna_pago
    // Para USD: el mismo monto (1 USD = 1 USD)
    let montoUsdInterno: number
    if (moneda === 'BS') {
      const tasaInt = tasaInternaPago ?? tasaCompra
      montoUsdInterno = tasaInt > 0 ? Number((monto / tasaInt).toFixed(2)) : montoUsd
    } else {
      montoUsdInterno = montoUsd
    }

    // 4. Validar monto <= saldo pendiente
    if (montoUsd > saldoFactura + 0.01) {
      throw new Error(
        `El pago ($${montoUsd.toFixed(2)}) excede el saldo pendiente ($${saldoFactura.toFixed(2)}) de la factura ${factura.nro_factura}`
      )
    }

    // 5. Leer saldo proveedor ANTES de modificar la factura (desde facturas_compra)
    const sumResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0.0) as saldo
       FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?`,
      [proveedor_id, empresa_id]
    )
    const saldoProv = parseFloat((sumResult.rows?.item(0) as { saldo: string }).saldo) || 0
    const nuevoSaldoProv = Math.max(0, Number((saldoProv - montoUsd).toFixed(2)))

    // 6. Reducir saldo de la factura
    const nuevoSaldoFactura = Math.max(0, Number((saldoFactura - montoUsd).toFixed(2)))
    await tx.execute(
      'UPDATE facturas_compra SET saldo_pend_usd = ?, updated_at = ? WHERE id = ?',
      [nuevoSaldoFactura.toFixed(2), now, factura_compra_id]
    )

    // 7. Crear movimiento_cuenta_proveedor con datos de dual-rate
    const movId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_cuenta_proveedor
         (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, factura_compra_id,
          moneda_pago, monto_moneda, tasa_pago, monto_usd_interno,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId, empresa_id, proveedor_id,
        referencia || `PAG-${factura.nro_factura}`,
        montoUsd.toFixed(2),
        saldoProv.toFixed(2),
        nuevoSaldoProv.toFixed(2),
        `Pago factura ${factura.nro_factura}`,
        factura_compra_id,
        moneda,
        monto.toFixed(2),
        tasa.toFixed(4),
        montoUsdInterno.toFixed(2),
        fechaPago,
        now, usuario_id,
      ]
    )
    // NOTA: saldo_actual de proveedores se actualiza via trigger en Supabase.
    // No hacer UPDATE directo aqui — el trigger lo bloquea (P0001).

    // 8. Movimiento bancario + asientos contables
    try {
      if (banco_empresa_id && montoUsd > 0) {
        const movBancoId = uuidv4()
        await tx.execute(
          `INSERT INTO movimientos_bancarios
             (id, empresa_id, banco_empresa_id, tipo, origen, monto, saldo_anterior, saldo_nuevo,
              doc_origen_id, doc_origen_tipo, referencia, validado, observacion, fecha, created_at, created_by)
           VALUES (?, ?, ?, 'EGRESO', 'PAGO_PROVEEDOR', ?, 0, 0, ?, 'PAGO_CXP', ?, 0, ?, ?, ?, ?)`,
          [
            movBancoId, empresa_id, banco_empresa_id,
            montoUsd.toFixed(2),
            factura_compra_id,
            referencia ?? null,
            `Pago CxP ${factura.nro_factura}`,
            fechaPago, now, usuario_id,
          ]
        )
      }

      const [cuentas, monedaContable] = await Promise.all([
        cargarMapaCuentas(tx, empresa_id),
        leerMonedaContable(tx, empresa_id),
      ])
      await generarAsientosPagoCxP(tx, {
        empresaId: empresa_id,
        pagoId: movId,
        pagoRef: referencia || `PAG-${factura.nro_factura}`,
        monto_usd: montoUsd,
        banco_empresa_id: banco_empresa_id ?? null,
        cuentas,
        usuarioId: usuario_id,
        monedaContable,
        tasaPago: tasa,
        tasaCompra,
      })
    } catch (err) {
      console.error('[CxP] Error en contabilidad al registrar pago:', err)
    }
  })
}
