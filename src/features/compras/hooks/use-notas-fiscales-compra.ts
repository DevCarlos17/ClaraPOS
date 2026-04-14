import { useQuery } from '@powersync/react'
import { kysely } from '@/core/db/kysely/kysely'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { v4 as uuidv4 } from 'uuid'
import { localNow } from '@/lib/dates'

// ─── Interfaces ─────────────────────────────────────────────

export interface NotaFiscalCompra {
  id: string
  empresa_id: string
  proveedor_id: string
  factura_compra_id: string | null
  tipo: string
  nro_documento: string
  motivo: string
  moneda_id: string | null
  tasa: string
  total_exento_usd: string
  total_base_usd: string
  total_iva_usd: string
  total_usd: string
  total_bs: string
  afecta_inventario: number
  usuario_id: string
  fecha: string
  created_at: string
}

// ─── Hooks ──────────────────────────────────────────────────

/**
 * Notas fiscales de compra recientes (ultimas 50), ordenadas por fecha descendente.
 * Incluye el nombre del proveedor via JOIN.
 */
export function useNotasFiscalesCompra() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const { data, isLoading } = useQuery(
    `SELECT nf.*, p.razon_social as proveedor_nombre
     FROM notas_fiscales_compra nf
     LEFT JOIN proveedores p ON nf.proveedor_id = p.id
     WHERE nf.empresa_id = ?
     ORDER BY nf.fecha DESC
     LIMIT 50`,
    [empresaId]
  )

  return {
    notas: (data ?? []) as (NotaFiscalCompra & { proveedor_nombre: string })[],
    isLoading,
  }
}

// ─── Funciones de escritura ──────────────────────────────────

export async function crearNotaFiscalCompra(data: {
  proveedor_id: string
  factura_compra_id?: string
  tipo: 'NC' | 'ND'
  nro_documento: string
  motivo: string
  moneda_id?: string
  tasa: number
  total_exento_usd: number
  total_base_usd: number
  total_iva_usd: number
  total_usd: number
  total_bs: number
  afecta_inventario: boolean
  usuario_id: string
  empresa_id: string
}): Promise<string> {
  const id = uuidv4()
  const now = localNow()

  await kysely
    .insertInto('notas_fiscales_compra')
    .values({
      id,
      empresa_id: data.empresa_id,
      proveedor_id: data.proveedor_id,
      factura_compra_id: data.factura_compra_id ?? null,
      tipo: data.tipo,
      nro_documento: data.nro_documento.toUpperCase(),
      motivo: data.motivo,
      moneda_id: data.moneda_id ?? null,
      tasa: data.tasa.toFixed(4),
      total_exento_usd: data.total_exento_usd.toFixed(2),
      total_base_usd: data.total_base_usd.toFixed(2),
      total_iva_usd: data.total_iva_usd.toFixed(2),
      total_usd: data.total_usd.toFixed(2),
      total_bs: data.total_bs.toFixed(2),
      afecta_inventario: data.afecta_inventario ? 1 : 0,
      usuario_id: data.usuario_id,
      fecha: now,
      created_at: now,
    })
    .execute()

  return id
}
