import { db } from '@/core/db/powersync/db'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'
import type { CxcImportRow, CxcImportRowResult, CxcImportSummary } from '../schemas/cxc-import-schema'

interface ImportarCxcParams {
  filas: CxcImportRow[]
  depositoId: string
  empresaId: string
  usuarioId: string
  onProgress: (procesadas: number, total: number) => void
}

/**
 * Importa saldos iniciales de CXC desde un array de filas validadas.
 *
 * Por cada fila:
 *  1. Busca el cliente por identificacion
 *  2. Verifica que no exista ya un nro_documento importado (num_control + cliente_id)
 *  3. Obtiene la tasa de cambio (del CSV o la ultima registrada)
 *  4. Genera nro_factura con prefijo SI- (SI-000001, SI-000002, ...)
 *  5. Inserta en ventas (tipo='SALDO_INICIAL', saldo_pend_usd = monto_usd)
 *  6. Inserta en movimientos_cuenta (tipo='SAL')
 *  7. Actualiza clientes.saldo_actual
 *
 * Cada fila es una writeTransaction independiente.
 * Si una fila falla, solo esa fila se marca como fallida; el resto continua.
 */
export async function importarSaldosInicialesCxc(
  params: ImportarCxcParams
): Promise<CxcImportSummary> {
  const { filas, depositoId, empresaId, usuarioId, onProgress } = params

  const fallidos: CxcImportRowResult[] = []
  let exitosos = 0

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]
    const numeroFila = i + 1

    // Liberar event loop cada 10 filas para no bloquear la UI
    if (i > 0 && i % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }

    try {
      const nroFactura = await importarFilaCxc(fila, depositoId, empresaId, usuarioId)
      exitosos++

      fallidos.push({
        fila: numeroFila,
        ok: true,
        nro_factura: nroFactura.nroFactura,
        cliente_nombre: nroFactura.clienteNombre,
      })
    } catch (err) {
      fallidos.push({
        fila: numeroFila,
        ok: false,
        errores: [err instanceof Error ? err.message : 'Error desconocido'],
        nro_documento: fila.nro_documento,
        identificacion: fila.identificacion,
      })
    }

    onProgress(i + 1, filas.length)
  }

  // El summary.fallidos solo contiene los realmente fallidos
  return {
    exitosos,
    fallidos: fallidos.filter((r): r is Extract<CxcImportRowResult, { ok: false }> => !r.ok),
  }
}

async function importarFilaCxc(
  fila: CxcImportRow,
  depositoId: string,
  empresaId: string,
  usuarioId: string
): Promise<{ nroFactura: string; clienteNombre: string }> {
  let resultado: { nroFactura: string; clienteNombre: string } = { nroFactura: '', clienteNombre: '' }

  await db.writeTransaction(async (tx) => {
    const now = localNow()

    // 1. Buscar cliente por identificacion
    const clienteResult = await tx.execute(
      'SELECT id, nombre, saldo_actual FROM clientes WHERE empresa_id = ? AND identificacion = ? AND is_active = 1 LIMIT 1',
      [empresaId, fila.identificacion]
    )
    if (!clienteResult.rows?.length) {
      throw new Error(`Cliente no encontrado: "${fila.identificacion}"`)
    }
    const cliente = clienteResult.rows.item(0) as {
      id: string
      nombre: string
      saldo_actual: string
    }

    // 2. Verificar duplicado: nro_documento + cliente_id + empresa_id
    //    El nro_documento original se guarda en num_control de ventas
    const dupResult = await tx.execute(
      `SELECT COUNT(*) as c FROM ventas
       WHERE empresa_id = ? AND cliente_id = ? AND num_control = ? AND tipo = 'SALDO_INICIAL'`,
      [empresaId, cliente.id, fila.nro_documento]
    )
    const dupCount = (dupResult.rows?.item(0) as { c: number })?.c ?? 0
    if (dupCount > 0) {
      throw new Error(
        `El documento "${fila.nro_documento}" ya fue importado para este cliente`
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

    // 4. Generar nro_factura: SI-XXXXXX
    const countResult = await tx.execute(
      `SELECT COUNT(*) as c FROM ventas WHERE empresa_id = ? AND nro_factura LIKE 'SI-%'`,
      [empresaId]
    )
    const count = (countResult.rows?.item(0) as { c: number })?.c ?? 0
    const nroFactura = `SI-${String(count + 1).padStart(6, '0')}`

    // 5. Calcular totales
    const montoUsd = fila.monto_usd
    const montoBs = Number((montoUsd * tasa).toFixed(2))
    const fechaDoc = `${fila.fecha}T00:00:00`

    // 6. INSERT ventas
    const ventaId = uuidv4()
    await tx.execute(
      `INSERT INTO ventas
         (id, empresa_id, cliente_id, nro_factura, num_control, deposito_id,
          sesion_caja_id, moneda_id, tasa,
          total_exento_usd, total_base_usd, total_iva_usd, total_igtf_usd,
          total_usd, total_bs, descuento_usd, descuento_bs,
          saldo_pend_usd, tipo, status,
          usuario_id, fecha, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?,
               ?, 0, 0, 0,
               ?, ?, 0, 0,
               ?, 'SALDO_INICIAL', 'ACTIVA',
               ?, ?, ?, ?)`,
      [
        ventaId,
        empresaId,
        cliente.id,
        nroFactura,
        fila.nro_documento,    // num_control = numero original del sistema anterior
        depositoId,
        tasa.toFixed(4),
        montoUsd.toFixed(2),   // total_exento_usd = monto total (todo exento)
        montoUsd.toFixed(2),   // total_usd
        montoBs.toFixed(2),    // total_bs
        montoUsd.toFixed(2),   // saldo_pend_usd = monto completo pendiente
        usuarioId,
        fechaDoc,
        now,
        usuarioId,
      ]
    )

    // 7. INSERT movimientos_cuenta (tipo='SAL')
    const saldoAnterior = parseFloat(cliente.saldo_actual)
    const saldoNuevo = Number((saldoAnterior + montoUsd).toFixed(2))

    const observacion = fila.descripcion
      ? `Saldo inicial: ${fila.descripcion}`
      : `Saldo inicial - ${fila.nro_documento}`

    await tx.execute(
      `INSERT INTO movimientos_cuenta
         (id, empresa_id, cliente_id, tipo, referencia, monto,
          saldo_anterior, saldo_nuevo, observacion,
          doc_origen_id, doc_origen_tipo, venta_id,
          fecha, created_at, created_by)
       VALUES (?, ?, ?, 'SAL', ?, ?,
               ?, ?, ?,
               ?, 'SALDO_INICIAL', ?,
               ?, ?, ?)`,
      [
        uuidv4(),
        empresaId,
        cliente.id,
        fila.nro_documento,
        montoUsd.toFixed(2),
        saldoAnterior.toFixed(2),
        saldoNuevo.toFixed(2),
        observacion,
        ventaId,
        ventaId,
        fechaDoc,
        now,
        usuarioId,
      ]
    )

    // 8. Actualizar saldo_actual del cliente
    await tx.execute(
      'UPDATE clientes SET saldo_actual = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      [saldoNuevo.toFixed(2), now, usuarioId, cliente.id]
    )

    resultado = { nroFactura, clienteNombre: cliente.nombre }
  })

  return resultado
}

/** Genera el contenido de la plantilla CSV para descarga */
export function generarPlantillaCxcCsv(): string {
  const headers = 'identificacion,nro_documento,fecha,monto_usd,tasa,descripcion'
  const ejemplo1 = 'V-12345678,FAC-001,2024-01-15,250.00,36.50,Saldo sistema anterior'
  const ejemplo2 = 'J-87654321-0,FAC-002,2024-02-01,1500.00,,Saldo pendiente cobro'
  return [headers, ejemplo1, ejemplo2].join('\n')
}
