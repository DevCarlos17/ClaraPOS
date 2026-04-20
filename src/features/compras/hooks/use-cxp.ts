import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import { cargarMapaCuentas } from '@/features/contabilidad/hooks/use-cuentas-config'
import { generarAsientosPagoCxP } from '@/features/contabilidad/lib/generar-asientos'

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
}

export interface PagoCxPParams {
  factura_compra_id: string
  proveedor_id: string
  metodo_cobro_id: string
  banco_empresa_id: string | null
  moneda: 'USD' | 'BS'
  tasa: number
  monto: number
  referencia?: string
  empresa_id: string
  usuario_id: string
}

// ─── Hooks de lectura ────────────────────────────────────────

export function useProveedoresConDeuda() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT p.id, p.rif, p.razon_social, p.saldo_actual,
       (SELECT COUNT(*) FROM facturas_compra fc
        WHERE fc.proveedor_id = p.id AND CAST(fc.saldo_pend_usd AS REAL) > 0.01) as facturas_pendientes
     FROM proveedores p
     WHERE p.empresa_id = ? AND CAST(p.saldo_actual AS REAL) > 0.01 AND p.is_active = 1
     ORDER BY CAST(p.saldo_actual AS REAL) DESC`,
    [empresaId]
  )

  return { proveedores: (data ?? []) as ProveedorConDeuda[], isLoading }
}

export function useFacturasCompraPendientes(proveedorId: string | null) {
  const { data, isLoading } = useQuery(
    proveedorId
      ? `SELECT id, nro_factura, fecha_factura, total_usd, saldo_pend_usd, tipo
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
 * Crea movimiento_cuenta_proveedor (tipo PAG).
 * Genera asientos contables PAGO_CXP y movimiento bancario si aplica.
 */
export async function registrarPagoCxP(params: PagoCxPParams): Promise<void> {
  const {
    factura_compra_id, proveedor_id, metodo_cobro_id, banco_empresa_id,
    moneda, tasa, monto, referencia, empresa_id, usuario_id,
  } = params

  if (tasa <= 0) throw new Error('La tasa debe ser mayor a 0')
  if (monto <= 0) throw new Error('El monto debe ser mayor a 0')

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Leer factura
    const facturaResult = await tx.execute(
      'SELECT nro_factura, saldo_pend_usd FROM facturas_compra WHERE id = ?',
      [factura_compra_id]
    )
    if (!facturaResult.rows?.length) throw new Error('Factura no encontrada')
    const factura = facturaResult.rows.item(0) as { nro_factura: string; saldo_pend_usd: string }
    const saldoFactura = parseFloat(factura.saldo_pend_usd)

    // 2. Calcular monto en USD
    const montoUsd = moneda === 'BS' ? Number((monto / tasa).toFixed(2)) : monto

    // 3. Validar monto <= saldo pendiente
    if (montoUsd > saldoFactura + 0.01) {
      throw new Error(
        `El pago ($${montoUsd.toFixed(2)}) excede el saldo pendiente ($${saldoFactura.toFixed(2)}) de la factura ${factura.nro_factura}`
      )
    }

    // 4. Reducir saldo de la factura
    const nuevoSaldoFactura = Math.max(0, Number((saldoFactura - montoUsd).toFixed(2)))
    await tx.execute(
      'UPDATE facturas_compra SET saldo_pend_usd = ?, updated_at = ? WHERE id = ?',
      [nuevoSaldoFactura.toFixed(2), now, factura_compra_id]
    )

    // 5. Leer saldo proveedor
    const provResult = await tx.execute(
      'SELECT saldo_actual FROM proveedores WHERE id = ?',
      [proveedor_id]
    )
    if (!provResult.rows?.length) throw new Error('Proveedor no encontrado')
    const saldoProv = parseFloat((provResult.rows.item(0) as { saldo_actual: string }).saldo_actual)
    const nuevoSaldoProv = Math.max(0, Number((saldoProv - montoUsd).toFixed(2)))

    // 6. Crear movimiento_cuenta_proveedor
    const movId = uuidv4()
    await tx.execute(
      `INSERT INTO movimientos_cuenta_proveedor
         (id, empresa_id, proveedor_id, tipo, referencia, monto, saldo_anterior, saldo_nuevo,
          observacion, factura_compra_id, fecha, created_at, created_by)
       VALUES (?, ?, ?, 'PAG', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        movId, empresa_id, proveedor_id,
        `PAG-${factura.nro_factura}`,
        montoUsd.toFixed(2),
        saldoProv.toFixed(2),
        nuevoSaldoProv.toFixed(2),
        `Pago factura ${factura.nro_factura}`,
        factura_compra_id,
        now, now, usuario_id,
      ]
    )

    // 7. Actualizar saldo del proveedor
    await tx.execute(
      'UPDATE proveedores SET saldo_actual = ?, updated_at = ? WHERE id = ?',
      [nuevoSaldoProv.toFixed(2), now, proveedor_id]
    )

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
            now, now, usuario_id,
          ]
        )
      }

      const cuentas = await cargarMapaCuentas(tx, empresa_id)
      await generarAsientosPagoCxP(tx, {
        empresaId: empresa_id,
        pagoId: movId,
        pagoRef: `PAG-${factura.nro_factura}`,
        monto_usd: montoUsd,
        banco_empresa_id: banco_empresa_id ?? null,
        cuentas,
        usuarioId: usuario_id,
      })
    } catch {
      // Fallo en contabilidad/bancos no bloquea el pago
    }
  })
}
