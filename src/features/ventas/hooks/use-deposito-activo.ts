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

  // Guardia `is_active` (change `guarda-deposito-inactivo` Slice B, decision
  // de diseno #4): el deposito de la caja puede haber sido desactivado
  // despues de asignarse — este hook es SOLO lectura/validacion de stock
  // (cosmetico), asi que si `is_active=0` se trata como si la caja no tuviera
  // deposito asignado, cayendo al principal (mismo fallback ya usado para
  // "caja sin deposito"). El camino de ESCRITURA (`crearVenta`) re-valida de
  // forma independiente y bloquea (hard-block) si esto ocurre.
  const { data: cajaData, isLoading: cajaLoading } = useQuery(
    cajaId
      ? `SELECT c.deposito_id as deposito_id, d.is_active as deposito_is_active
         FROM cajas c
         LEFT JOIN depositos d ON d.id = c.deposito_id
         WHERE c.id = ? LIMIT 1`
      : '',
    cajaId ? [cajaId] : []
  )
  const cajaRow = cajaData?.[0] as
    | { deposito_id: string | null; deposito_is_active: number | null }
    | undefined
  const cajaDepositoId =
    cajaRow?.deposito_is_active === 0 ? null : (cajaRow?.deposito_id ?? null)

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
