import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { CxpImportRow, CxpImportRowResult, CxpImportSummary } from '../schemas/cxp-import-schema'

interface ImportarCxpParams {
  filas: CxpImportRow[]
  depositoId: string
  empresaId: string
  usuarioId: string
  onProgress: (procesadas: number, total: number) => void
}

/**
 * Importa saldos iniciales de CXP desde un array de filas validadas.
 *
 * Por cada fila:
 *  1. Busca el proveedor por rif
 *  2. Verifica que no exista ya un nro_documento importado (nro_control + proveedor_id)
 *  3. Obtiene la tasa de cambio (del CSV o la ultima registrada)
 *  4. Genera nro_factura con prefijo SIP- (SIP-000001, SIP-000002, ...)
 *  5. Inserta en facturas_compra (tipo='SALDO_INICIAL', saldo_pend_usd = monto_usd)
 *  6. Inserta en movimientos_cuenta_proveedor (tipo='SAL')
 *
 * NOTA: El saldo_actual del proveedor se calcula dinamicamente desde facturas_compra.saldo_pend_usd.
 * No se actualiza proveedores.saldo_actual (trigger PostgreSQL lo bloquea).
 *
 * Cada fila es una writeTransaction independiente.
 */
export async function importarSaldosInicialesCxp(
  params: ImportarCxpParams
): Promise<CxpImportSummary> {
  const { filas, depositoId, empresaId, usuarioId, onProgress } = params

  const fallidos: CxpImportRowResult[] = []
  let exitosos = 0

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const numeroFila = i + 1

    // Liberar event loop cada 10 filas para no bloquear la UI
    if (i > 0 && i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }

    try {
      const res = await importarFilaCxp(fila, depositoId, empresaId, usuarioId)
      exitosos++

      fallidos.push({
        fila: numeroFila,
        ok: true,
        nro_factura: res.nroFactura,
        proveedor_nombre: res.proveedorNombre,
      })
    } catch (err) {
      fallidos.push({
        fila: numeroFila,
        ok: false,
        errores: [err instanceof Error ? err.message : 'Error desconocido'],
        nro_documento: fila.nro_documento,
        rif: fila.rif,
      })
    }

    onProgress(i + 1, filas.length)
  }

  return {
    exitosos,
    fallidos: fallidos.filter((r): r is Extract<CxpImportRowResult, { ok: false }> => !r.ok),
  }
}

async function importarFilaCxp(
  fila: CxpImportRow,
  depositoId: string,
  empresaId: string,
  usuarioId: string
): Promise<{ nroFactura: string; proveedorNombre: string }> {
  let resultado: { nroFactura: string; proveedorNombre: string } = {
    nroFactura: '',
    proveedorNombre: '',
  }

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Buscar proveedor por rif
    const provResult = await tx.execute(
      'SELECT id, razon_social FROM proveedores WHERE empresa_id = ? AND rif = ? AND is_active = 1 LIMIT 1',
      [empresaId, fila.rif]
    )
    if (!provResult.rows?.length) {
      throw new Error(`Proveedor no encontrado: "${fila.rif}"`)
    }
    const proveedor = provResult.rows.item(0) as { id: string; razon_social: string }

    // 2. Verificar duplicado: nro_documento + proveedor_id + empresa_id
    //    El nro_documento original se guarda en nro_control de facturas_compra
    const dupResult = await tx.execute(
      `SELECT COUNT(*) as c FROM facturas_compra
       WHERE empresa_id = ? AND proveedor_id = ? AND nro_control = ? AND tipo = 'SALDO_INICIAL'`,
      [empresaId, proveedor.id, fila.nro_documento]
    )
    const dupCount = (dupResult.rows?.item(0) as { c: number })?.c ?? 0
    if (dupCount > 0) {
      throw new Error(
        `El documento "${fila.nro_documento}" ya fue importado para este proveedor`
      )
    }

    // 3. Obtener tasa de cambio
    let tasa: number
    if (fila.tasa && fila.tasa > 0) {
      tasa = fila.tasa
    } else {
      const tasaResult = await tx.execute(
        'SELECT valor FROM tasas_cambio WHERE empresa_id = ? ORDER BY fecha DESC, created_at DESC LIMIT 1',
        [empresaId]
      )
      if (!tasaResult.rows?.length) {
        throw new Error('No hay tasa de cambio registrada. Incluya la tasa en el archivo CSV.')
      }
      tasa = parseFloat((tasaResult.rows.item(0) as { valor: string }).valor)
      if (tasa <= 0) {
        throw new Error('La tasa de cambio registrada no es valida.')
      }
    }

    // 4. Generar nro_factura: SIP-XXXXXX
    const countResult = await tx.execute(
      `SELECT COUNT(*) as c FROM facturas_compra WHERE empresa_id = ? AND nro_factura LIKE 'SIP-%'`,
      [empresaId]
    )
    const count = (countResult.rows?.item(0) as { c: number })?.c ?? 0
    const nroFactura = `SIP-${String(count + 1).padStart(6, '0')}`

    // 5. Calcular totales
    const montoUsd = fila.monto_usd
    const montoBs = Number((montoUsd * tasa).toFixed(2))
    const fechaDoc = fila.fecha  // DATE format para facturas_compra

    // 6. Calcular saldo actual del proveedor antes de insertar (para movimiento_cuenta)
    const saldoProvResult = await tx.execute(
      `SELECT COALESCE(SUM(CAST(saldo_pend_usd AS REAL)), 0.0) as saldo
       FROM facturas_compra WHERE proveedor_id = ? AND empresa_id = ?`,
      [proveedor.id, empresaId]
    )
    const saldoProvAnterior =
      parseFloat((saldoProvResult.rows?.item(0) as { saldo: string })?.saldo ?? '0') || 0
    const saldoProvNuevo = Number((saldoProvAnterior + montoUsd).toFixed(2))

    // 7. INSERT facturas_compra
    const facturaId = uuidv4()
    await tx.execute(
      `INSERT INTO facturas_compra
         (id, empresa_id, proveedor_id, nro_factura, nro_control, deposito_id,
          moneda_id, tasa, tasa_costo,
          total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd,
          total_usd, total_bs,
          saldo_pend_usd, tipo, status,
          fecha_factura, fecha_recepcion,
          usuario_id, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?,
               NULL, ?, ?,
               ?, 0, 0, 0,
               ?, ?,
               ?, 'SALDO_INICIAL', 'PROCESADA',
               ?, NULL,
               ?, ?, ?, ?)`,
      [
        facturaId,
        empresaId,
        proveedor.id,
        nroFactura,
        fila.nro_documento,   // nro_control = numero original del sistema anterior
        depositoId,
        tasa.toFixed(4),
        tasa.toFixed(4),      // tasa_costo = tasa (sin diferencial en saldos iniciales)
        montoUsd.toFixed(2),  // total_exento_usd = monto total (todo exento)
        montoUsd.toFixed(2),  // total_usd
        montoBs.toFixed(2),   // total_bs
        montoUsd.toFixed(2),  // saldo_pend_usd = monto completo pendiente
        fechaDoc,
        usuarioId,
        now,
        now,
        usuarioId,
      ]
    )

    // 8. INSERT movimientos_cuenta_proveedor (tipo='SAL')
    const observacion = fila.descripcion
      ? `Saldo inicial: ${fila.descripcion}`
      : `Saldo inicial - ${fila.nro_documento}`

    await tx.execute(
      `INSERT INTO movimientos_cuenta_proveedor
         (id, empresa_id, proveedor_id, tipo, referencia, monto,
          saldo_anterior, saldo_nuevo, observacion,
          factura_compra_id,
          moneda_pago, monto_moneda, tasa_pago, monto_usd_interno,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, 'SAL', ?, ?,
               ?, ?, ?,
               ?,
               'USD', ?, ?, ?,
               ?, ?, ?)`,
      [
        uuidv4(),
        empresaId,
        proveedor.id,
        fila.nro_documento,
        montoUsd.toFixed(2),
        saldoProvAnterior.toFixed(2),
        saldoProvNuevo.toFixed(2),
        observacion,
        facturaId,
        montoUsd.toFixed(2),  // monto_moneda (en USD)
        tasa.toFixed(4),
        montoUsd.toFixed(2),  // monto_usd_interno = monto_usd (sin diferencial)
        fechaDoc,
        now,
        usuarioId,
      ]
    )

    resultado = { nroFactura, proveedorNombre: proveedor.razon_social }
  })

  return resultado
}

/** Genera el contenido de la plantilla CSV para descarga */
export function generarPlantillaCxpCsv(): string {
  const headers = 'rif,nro_documento,fecha,monto_usd,tasa,descripcion'
  const ejemplo1 = 'J-12345678-9,FAC-PROV-001,2024-01-15,500.00,36.50,Deuda proveedor'
  const ejemplo2 = 'V-87654321-0,FACT-2024-100,2024-02-01,1200.00,,Saldo sistema anterior'
  return [headers, ejemplo1, ejemplo2].join('\n')
}
