import { useQuery } from '@powersync/react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import Decimal from 'decimal.js'
import { usdToBs, toStorageString } from '@/lib/currency'
import { localNow } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface NotaDebito {
  id: string
  empresa_id: string
  nro_ndb: string
  venta_id: string | null
  cliente_id: string
  motivo: string
  moneda_id: string | null
  tasa: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_usd: string
  total_bs: string
  usuario_id: string
  fecha: string
  created_at: string
}

export interface NotaDebitoDet {
  id: string
  empresa_id: string
  nota_debito_id: string
  descripcion: string
  cantidad: string
  precio_unitario_usd: string
  tipo_impuesto: string | null
  impuesto_pct: string | null
  subtotal_usd: string
  created_at: string
}

export interface LineaNotaDebito {
  descripcion: string
  cantidad: number
  precio_unitario_usd: number
  tipo_impuesto?: 'Gravable' | 'Exento' | 'Exonerado'
  impuesto_pct?: number
}

export interface CrearNotaDebitoParams {
  cliente_id: string
  venta_id?: string
  motivo: string
  moneda_id?: string
  tasa: number
  usuario_id: string
  empresa_id: string
  lineas: LineaNotaDebito[]
}

export interface CrearNotaDebitoResult {
  notaDebitoId: string
  nroNdb: string
}

// ─── Hooks de lectura ────────────────────────────────────────

/**
 * Retorna las 50 notas de debito mas recientes de la empresa actual.
 */
export function useNotasDebito() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT * FROM notas_debito
     WHERE empresa_id = ?
     ORDER BY fecha DESC
     LIMIT 50`,
    [empresaId]
  )

  return { notas: (data ?? []) as NotaDebito[], isLoading }
}

/**
 * Retorna el detalle de lineas de una nota de debito especifica.
 */
export function useDetalleNotaDebito(notaDebitoId: string | null) {
  const { data, isLoading } = useQuery(
    notaDebitoId
      ? `SELECT * FROM notas_debito_det
         WHERE nota_debito_id = ?
         ORDER BY created_at ASC`
      : '',
    notaDebitoId ? [notaDebitoId] : []
  )

  return { detalle: (data ?? []) as NotaDebitoDet[], isLoading }
}

// ─── Funcion: crearNotaDebito ────────────────────────────────

/**
 * Crea una nota de debito con sus lineas de detalle en una transaccion atomica.
 * El numero correlativo NDB-XXXX se genera por empresa usando COUNT(*) en notas_debito.
 */
export async function crearNotaDebito(
  params: CrearNotaDebitoParams
): Promise<CrearNotaDebitoResult> {
  const { cliente_id, venta_id, motivo, moneda_id, tasa, usuario_id, empresa_id, lineas } = params

  if (lineas.length === 0) {
    throw new Error('Debe agregar al menos una linea a la nota de debito')
  }

  if (tasa <= 0) {
    throw new Error('La tasa de cambio debe ser mayor a 0')
  }

  let notaDebitoId = ''
  let nroNdb = ''

  await db.writeTransaction(async (tx) => {
    const now = localNow()
    notaDebitoId = uuidv4()

    // 1. Generar nro_ndb (consecutivo por empresa, formato NDB-XXXX)
    const countResult = await tx.execute(
      'SELECT COUNT(*) as cnt FROM notas_debito WHERE empresa_id = ?',
      [empresa_id]
    )
    const count = Number((countResult.rows?.item(0) as { cnt: number })?.cnt ?? 0)
    nroNdb = `NDB-${String(count + 1).padStart(4, '0')}`

    // 2. Calcular totales por tipo de impuesto
    let totalExentoUsd = new Decimal(0)
    let totalBaseUsd = new Decimal(0)
    let totalIvaUsd = new Decimal(0)

    for (const linea of lineas) {
      const subtotal = new Decimal(linea.cantidad).times(linea.precio_unitario_usd)

      if (!linea.tipo_impuesto || linea.tipo_impuesto === 'Exento' || linea.tipo_impuesto === 'Exonerado') {
        totalExentoUsd = totalExentoUsd.plus(subtotal)
      } else {
        // Gravable: calcular IVA sobre el subtotal
        totalBaseUsd = totalBaseUsd.plus(subtotal)
        const pct = new Decimal(linea.impuesto_pct ?? 0)
        totalIvaUsd = totalIvaUsd.plus(subtotal.times(pct).dividedBy(100))
      }
    }

    const totalUsd = totalExentoUsd.plus(totalBaseUsd).plus(totalIvaUsd)
    const totalBs = usdToBs(totalUsd, tasa)

    // 3. INSERT nota_debito cabecera
    await tx.execute(
      `INSERT INTO notas_debito (
         id, empresa_id, nro_ndb, venta_id, cliente_id, motivo, moneda_id, tasa,
         total_exento_usd, total_base_usd, total_iva_usd, total_usd, total_bs,
         usuario_id, fecha, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notaDebitoId,
        empresa_id,
        nroNdb,
        venta_id ?? null,
        cliente_id,
        motivo,
        moneda_id ?? null,
        toStorageString(tasa),
        toStorageString(totalExentoUsd),
        toStorageString(totalBaseUsd),
        toStorageString(totalIvaUsd),
        toStorageString(totalUsd),
        toStorageString(totalBs),
        usuario_id,
        now,
        now,
      ]
    )

    // 4. INSERT lineas de detalle
    for (const linea of lineas) {
      const detalleId = uuidv4()
      const subtotalUsd = new Decimal(linea.cantidad).times(linea.precio_unitario_usd)

      await tx.execute(
        `INSERT INTO notas_debito_det (
           id, empresa_id, nota_debito_id, descripcion, cantidad,
           precio_unitario_usd, tipo_impuesto, impuesto_pct, subtotal_usd, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          detalleId,
          empresa_id,
          notaDebitoId,
          linea.descripcion,
          linea.cantidad.toFixed(3),
          toStorageString(linea.precio_unitario_usd),
          linea.tipo_impuesto ?? null,
          linea.impuesto_pct !== undefined ? toStorageString(linea.impuesto_pct) : null,
          toStorageString(subtotalUsd),
          now,
        ]
      )
    }
  })

  return { notaDebitoId, nroNdb }
}
