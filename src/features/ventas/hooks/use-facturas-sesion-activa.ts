import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import type { FacturaParaAnular } from './use-notas-credito'

/**
 * Facturas disponibles para emitir NC desde el POS-express (Slice 5a-2a,
 * Spec notas-credito-pos: "Alcance limitado a la sesion activa"). A
 * diferencia de `useBuscarFacturaParaAnular` (modulo Tradicional, CUALQUIER
 * factura de la empresa via busqueda libre), este hook filtra por QUERY
 * — no solo UI — a la `sesion_caja_id` de la sesion actualmente abierta del
 * cajero: una factura de una sesion ya cerrada nunca llega a la lista, sin
 * importar lo que haga el componente que lo consuma.
 *
 * Sin sesion activa (usuario aun no abrio caja), retorna lista vacia sin
 * ejecutar query — el POS ya bloquea toda operacion sin sesion via
 * `AperturaSesionPosModal`, este hook solo refleja ese mismo estado.
 */
export function useFacturasSesionActiva() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { sesion, isLoading: sesionLoading } = useSesionActiva()
  const sesionId = sesion?.id ?? ''

  const { data, isLoading } = useQuery(
    sesionId
      ? `SELECT
           v.id, v.nro_factura, v.cliente_id, v.tasa, v.total_usd, v.total_bs,
           v.saldo_pend_usd, v.tipo, v.fecha,
           c.nombre as cliente_nombre,
           c.identificacion as cliente_identificacion
         FROM ventas v
         JOIN clientes c ON v.cliente_id = c.id
         WHERE v.empresa_id = ? AND v.sesion_caja_id = ? AND v.status != 'ANULADA'
         ORDER BY v.fecha DESC`
      : '',
    sesionId ? [empresaId, sesionId] : []
  )

  return {
    facturas: (data ?? []) as FacturaParaAnular[],
    isLoading: sesionLoading || isLoading,
  }
}
