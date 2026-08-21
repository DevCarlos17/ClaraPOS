import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { useSesionActiva } from '@/features/caja/hooks/use-sesiones-caja'
import { resolveDepositoEgresoVenta } from '../lib/deposito-venta'

/**
 * Deposito activo para lectura/validacion de stock en el POS (Slice 2a).
 * Resuelve `sesion_caja.caja_id` → `cajas.deposito_id`; si no hay sesion
 * activa o la caja no tiene deposito asignado, cae al deposito `es_principal`
 * de la empresa (mismo fallback documentado en `resolveDepositoEgresoVenta`,
 * spec VSD/Venta sin sesion de caja activa).
 *
 * IMPORTANTE (alcance de Slice 2a): este hook solo alimenta LECTURA/VALIDACION
 * de stock en la UI (article select, guard de cantidad). El camino de
 * ESCRITURA de la venta (`crearVenta` en `use-ventas.ts`) sigue resolviendo
 * su propio `depositoId` de forma independiente (hardcodeado al deposito
 * principal) hasta Slice 2b — ver design.md / tasks.md Slice 2b.
 */
export function useDepositoActivoVenta() {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const { sesion, isLoading: sesionLoading } = useSesionActiva()
  const cajaId = sesion?.caja_id ?? ''

  const { data: cajaData, isLoading: cajaLoading } = useQuery(
    cajaId ? 'SELECT deposito_id FROM cajas WHERE id = ? LIMIT 1' : '',
    cajaId ? [cajaId] : []
  )
  const cajaDepositoId = cajaData?.[0]
    ? ((cajaData[0] as { deposito_id: string | null }).deposito_id ?? null)
    : null

  const { data: principalData, isLoading: principalLoading } = useQuery(
    empresaId
      ? 'SELECT id FROM depositos WHERE empresa_id = ? AND es_principal = 1 AND is_active = 1 LIMIT 1'
      : '',
    empresaId ? [empresaId] : []
  )
  const principalId = principalData?.[0] ? (principalData[0] as { id: string }).id : null

  const depositoId = resolveDepositoEgresoVenta(cajaDepositoId, principalId)

  return {
    depositoId,
    isLoading: sesionLoading || cajaLoading || principalLoading,
  }
}
