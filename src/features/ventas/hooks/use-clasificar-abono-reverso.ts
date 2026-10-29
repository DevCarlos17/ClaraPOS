import { useEffect, useState } from 'react'
import { db } from '@/core/db/powersync/db'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { detectarLoteSafDePago } from '@/features/cxc/hooks/reversa-pago-saf'

/**
 * Adapter de clasificacion para "reverso de abono desde Consulta de
 * Factura" (Slice 1, `consulta-factura-reverso-abono-directo`). Dado un
 * `pago_id`, resuelve en CUAL de los 4 estados mutuamente excluyentes cae
 * el abono — ver spec `consulta-factura-reverso-abono`, Requirement
 * "Listado individual y clasificacion via adapter pago_id -> ingreso_id":
 *
 * - `DIRECT`: fila encontrada en el puente `movimientos_bancarios_pagos`
 *   (`pago_id -> ingreso_id`) Y ningun miembro del fan-in generó un lote
 *   SAF ya consumido en otras facturas — reversable via
 *   `reversarAbonoDirectoDesdeTesoreria({ ingresoId, ... })`.
 * - `BATCH`: sin fila en el puente, `metodos_cobro.deposito_directo = 0`
 *   (por diseño el camino batch nunca escribe el puente) — reverso por
 *   lote no disponible todavia (Slice 2).
 * - `SAF`: fila encontrada en el puente, pero el fan-in (resuelto por
 *   `ingreso_id`) incluye al menos un `pago_id` cuyo
 *   `detectarLoteSafDePago` devuelve `facturasAfectadas.length > 0` —
 *   MISMA condicion de bloqueo que `reversarAbonoDirectoDesdeTesoreria`
 *   PRE-TX 3 (use-reverso-abono-directo.ts:116), para que el boton
 *   deshabilitado en la UI nunca diverja del comportamiento real del
 *   orquestador (un lote SAF generado pero 100% intacto —
 *   `facturasAfectadas=[]`— se compensa limpio via
 *   `reversarPagoSafEnTx` y NO se bloquea).
 * - `LEGACY`: sin fila en el puente, `metodos_cobro.deposito_directo = 1`
 *   (deberia tener trazabilidad pero no la tiene — abono directo anterior
 *   al puente) — sin trazabilidad, no reversable en este slice.
 *
 * Ademas resuelve, SIEMPRE y sin bloquear nada (warn-and-allow, decision
 * owner 3A), si la sesion de caja del pago esta `CERRADA`
 * (`sesionCerrada`) — el guard duro que impida confirmar queda para
 * Slice 2; aqui solo se SURFACEA el flag para que la UI (Unit 2) muestre
 * un warning pasivo.
 *
 * PURA LECTURA — cero `db.writeTransaction`, mismo patron que
 * `detectarLoteSafDePago`/`previewFacturasAfectadas`. Todas las queries
 * filtran por `empresa_id` (aislamiento multi-tenant, no-negociable).
 */
export type EstadoClasificacionAbono = 'DIRECT' | 'BATCH' | 'SAF' | 'LEGACY'

export const REASON_BATCH_NO_DISPONIBLE = 'BATCH_NO_DISPONIBLE'
export const REASON_SAF_BLOQUEADO = 'SAF_BLOQUEADO'
export const REASON_LEGACY_SIN_TRAZABILIDAD = 'LEGACY_SIN_TRAZABILIDAD'

export interface ClasificacionAbonoReverso {
  pagoId: string
  estado: EstadoClasificacionAbono
  /** Solo presente cuando `estado` es `DIRECT` o `SAF` (ambos resolvieron el puente). */
  ingresoId?: string
  sesionCerrada: boolean
  /** Ausente cuando `estado === 'DIRECT'` (nada que explicar, es reversable). */
  reasonCode?: string
}

interface PagoRow {
  metodo_cobro_id: string
  sesion_caja_id: string | null
}

interface MetodoRow {
  deposito_directo: number | null
}

interface BridgeIngresoRow {
  ingreso_id: string
}

interface FanInRow {
  pago_id: string
}

interface SesionRow {
  status: string | null
}

/**
 * Resuelve el `ingreso_id` ligado a un `pago_id` via el puente
 * `movimientos_bancarios_pagos` (reverse-lookup). `null` si no hay fila
 * (BATCH o LEGACY, indistinguible en este punto — el llamador decide cual
 * segun `metodos_cobro.deposito_directo`).
 */
export async function resolverIngresoIdParaPago(empresaId: string, pagoId: string): Promise<string | null> {
  const rows = await db.getAll<BridgeIngresoRow>(
    `SELECT ingreso_id FROM movimientos_bancarios_pagos WHERE pago_id = ? AND empresa_id = ?`,
    [pagoId, empresaId]
  )
  return rows[0]?.ingreso_id ?? null
}

/**
 * Resuelve si la sesion de caja del pago (si tiene una) esta `CERRADA`.
 * Un pago sin `sesion_caja_id` (p.ej. abono standalone de CxC) nunca esta
 * "cerrado" en este sentido — retorna `false`.
 */
async function resolverSesionCerrada(empresaId: string, sesionCajaId: string | null): Promise<boolean> {
  if (!sesionCajaId) return false
  const rows = await db.getAll<SesionRow>(
    `SELECT status FROM sesiones_caja WHERE id = ? AND empresa_id = ?`,
    [sesionCajaId, empresaId]
  )
  return rows[0]?.status === 'CERRADA'
}

/**
 * Resuelve el fan-in group de un `ingreso_id` (todos los `pago_id` ligados
 * via el puente) y determina si ALGUNO generó un lote SAF ya consumido en
 * otras facturas (`facturasAfectadas.length > 0`) — MISMA condicion que
 * `reversarAbonoDirectoDesdeTesoreria` PRE-TX 3, para que esta
 * clasificacion nunca marque como "reversable" un abono que el
 * orquestador real rechazaria.
 */
async function resolverSafBlocked(empresaId: string, ingresoId: string): Promise<boolean> {
  const fanInRows = await db.getAll<FanInRow>(
    `SELECT pago_id FROM movimientos_bancarios_pagos WHERE ingreso_id = ? AND empresa_id = ?`,
    [ingresoId, empresaId]
  )
  for (const { pago_id } of fanInRows) {
    const detalle = await detectarLoteSafDePago(empresaId, pago_id)
    if (detalle.facturasAfectadas.length > 0) {
      return true
    }
  }
  return false
}

/**
 * Clasifica un `pago_id` en exactamente uno de los 4 estados
 * (`DIRECT`/`BATCH`/`SAF`/`LEGACY`) y resuelve el flag de sesion cerrada.
 * Funcion pura, reusable fuera de React (el hook `useClasificarAbonoParaReverso`
 * es un wrapper delgado sobre esta).
 */
export async function clasificarAbonoParaReverso(
  empresaId: string,
  pagoId: string
): Promise<ClasificacionAbonoReverso> {
  const pagoRows = await db.getAll<PagoRow>(
    `SELECT metodo_cobro_id, sesion_caja_id FROM pagos WHERE id = ? AND empresa_id = ?`,
    [pagoId, empresaId]
  )
  const pago = pagoRows[0]
  if (!pago) {
    throw new Error('Pago no encontrado')
  }

  const sesionCerrada = await resolverSesionCerrada(empresaId, pago.sesion_caja_id)
  const ingresoId = await resolverIngresoIdParaPago(empresaId, pagoId)

  if (ingresoId) {
    const safBlocked = await resolverSafBlocked(empresaId, ingresoId)
    if (safBlocked) {
      return { pagoId, estado: 'SAF', ingresoId, sesionCerrada, reasonCode: REASON_SAF_BLOQUEADO }
    }
    return { pagoId, estado: 'DIRECT', ingresoId, sesionCerrada }
  }

  const metodoRows = await db.getAll<MetodoRow>(
    `SELECT deposito_directo FROM metodos_cobro WHERE id = ? AND empresa_id = ?`,
    [pago.metodo_cobro_id, empresaId]
  )
  const depositoDirecto = metodoRows[0]?.deposito_directo === 1

  if (depositoDirecto) {
    return { pagoId, estado: 'LEGACY', sesionCerrada, reasonCode: REASON_LEGACY_SIN_TRAZABILIDAD }
  }

  return { pagoId, estado: 'BATCH', sesionCerrada, reasonCode: REASON_BATCH_NO_DISPONIBLE }
}

/**
 * Hook de React sobre `clasificarAbonoParaReverso` — snapshot bajo demanda
 * (no una suscripcion `useQuery` reactiva, mismo patron que el preview de
 * facturas afectadas en `ReversoModal`/`use-preview-facturas-afectadas.ts`:
 * la clasificacion es un estado puntual al abrir el modal de confirmacion
 * de Unit 2, no algo que deba re-evaluarse en vivo). Filtra por
 * `empresa_id` del usuario actual via `useCurrentUser()`.
 */
export function useClasificarAbonoParaReverso(pagoId: string | null): {
  clasificacion: ClasificacionAbonoReverso | null
  loading: boolean
  error: string | null
} {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''
  const [clasificacion, setClasificacion] = useState<ClasificacionAbonoReverso | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pagoId || !empresaId) {
      setClasificacion(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    clasificarAbonoParaReverso(empresaId, pagoId)
      .then((resultado) => {
        if (!cancelled) setClasificacion(resultado)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setClasificacion(null)
          setError(err instanceof Error ? err.message : 'Error al clasificar el abono')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pagoId, empresaId])

  return { clasificacion, loading, error }
}
