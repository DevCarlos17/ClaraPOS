import { useQuery } from '@powersync/react'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import type { FacturaParaAnular } from './use-notas-credito'
import {
  buildFacturasEmpresaFiltro,
  rangoMesActual,
  type EstadoFiltroFactura,
} from '../utils/notas-credito-admin-filters'

/**
 * Filtros del hook (Slice B, notas-credito-ruta-administrativa, Design
 * §Decision 3). `fechaDesde`/`fechaHasta` son OPCIONALES a este nivel — a
 * diferencia de `FiltroFacturasEmpresa` (el builder puro de Slice A, donde
 * son obligatorios): cuando el llamador los omite, el hook aplica
 * `rangoMesActual()` (Spec: "Carga por defecto limitada al mes en curso").
 * Pasar un rango explicito (por ejemplo, una fecha muy antigua) es el
 * mecanismo de escape para "ver todo el historial" — no existe un flag
 * separado, el propio rango explicito bypasea el default.
 *
 * Slice E.2/E.3 (tester QA feedback): `busqueda`/`estado` reemplazan los
 * campos separados `nroFactura`/`clienteNombre`/`clienteIdentificacion`
 * (retirados, la UI ya no los expone por separado — un solo input de
 * busqueda, patron POS).
 */
export interface FiltroFacturasEmpresaHook {
  fechaDesde?: string
  fechaHasta?: string
  busqueda?: string
  estado?: EstadoFiltroFactura
}

/**
 * Listado empresa-wide de facturas (Spec: "Pestaña Facturas — listado
 * empresa-wide"), hermano de `useFacturasSesionActiva` pero SIN filtrar por
 * `sesion_caja_id` (Design §Decision 3: "NO reutiliza
 * `useFacturasSesionActiva`"). Delega la construccion del SQL a
 * `buildFacturasEmpresaFiltro` (Slice A, funcion pura) — este hook solo
 * resuelve `empresaId` (via `useCurrentUser()`) y el default de rango de
 * fecha antes de ejecutar la query reactiva de PowerSync.
 */
export function useFacturasEmpresa(filtros?: FiltroFacturasEmpresaHook) {
  const { user } = useCurrentUser()
  const empresaId = user?.empresa_id ?? ''

  const fechaDesde = filtros?.fechaDesde ?? rangoMesActual().fechaDesde
  const fechaHasta = filtros?.fechaHasta ?? rangoMesActual().fechaHasta

  const { sql, params } = buildFacturasEmpresaFiltro({
    empresaId,
    fechaDesde,
    fechaHasta,
    busqueda: filtros?.busqueda,
    estado: filtros?.estado,
  })

  const { data, isLoading } = useQuery(sql, params)

  return {
    facturas: (data ?? []) as FacturaParaAnular[],
    isLoading,
  }
}
