import { useState, useCallback } from 'react'
import { MagnifyingGlass, CheckSquare, Square, ShoppingCart, CreditCard } from '@phosphor-icons/react'
import { PageHeader } from '@/components/layout/page-header'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { todayStr } from '@/lib/dates'
import { formatTasa, formatUsd, formatBs } from '@/lib/currency'
import { PagosResumen } from './pagos-resumen'
import { AuditModal } from './audit-modal'
import { CxcModal } from './cxc-modal'
import { CuadreMetodoModal } from './cuadre-metodo-modal'
import { CuadreTotalesFiscales } from './cuadre-totales-fiscales'
import { CuadreConteoFisico } from './cuadre-conteo-fisico'
import { CuadreDetallePagos } from './cuadre-detalle-pagos'
import { CuadreDetalleFacturas } from './cuadre-detalle-facturas'
import {
  useSesionesPorCajaYFecha,
  useTasaDelDia,
  useVentasDelDia,
  useCxcDelDia,
  type CuadreFilters,
} from '../hooks/use-cuadre'
import { NativeSelect } from '@/components/ui/native-select'

export function CuadrePage() {
  // Funnel state
  const [fecha, setFecha] = useState(todayStr)
  const [cajaId, setCajaId] = useState<string | null>(null)
  const [sesionCajaIds, setSesionCajaIds] = useState<string[]>([])

  // Consulted state
  const [consulted, setConsulted] = useState(false)
  const [activeFilters, setActiveFilters] = useState<CuadreFilters | null>(null)

  // Modal states
  const [auditOpen, setAuditOpen] = useState(false)
  const [cxcOpen, setCxcOpen] = useState(false)
  const [metodoModal, setMetodoModal] = useState<string | null>(null)

  // Verified non-cash payment amounts shared between CuadreDetallePagos → CuadreConteoFisico
  const [verifiedAmountsByMetodoId, setVerifiedAmountsByMetodoId] = useState<Record<string, number>>({})

  const handleVerifiedChange = useCallback((amounts: Record<string, number>) => {
    setVerifiedAmountsByMetodoId(amounts)
  }, [])

  // Data
  const { cajas } = useCajasActivas()
  const { sesiones } = useSesionesPorCajaYFecha(cajaId, fecha)
  const { tasaPromedio, tasaCount } = useTasaDelDia(activeFilters?.fecha ?? null)

  // KPI data — shown in the funnel card after consultar
  const { totalVentasUsd, totalVentasBs, facturasCount, isLoading: loadingVentas } =
    useVentasDelDia(activeFilters)
  const { cxcTotalUsd, isLoading: loadingCxc } = useCxcDelDia(activeFilters)

  const handleConsultar = useCallback(() => {
    setActiveFilters({ fecha, cajaId, sesionCajaIds })
    setConsulted(true)
  }, [fecha, cajaId, sesionCajaIds])

  const handleFechaChange = useCallback((newFecha: string) => {
    setFecha(newFecha)
    setSesionCajaIds([])
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  const handleCajaChange = useCallback((newCajaId: string) => {
    const val = newCajaId === '' ? null : newCajaId
    setCajaId(val)
    setSesionCajaIds([])
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  const toggleSesion = useCallback((sesionId: string) => {
    setSesionCajaIds((prev) => {
      const set = new Set(prev)
      if (set.has(sesionId)) set.delete(sesionId)
      else set.add(sesionId)
      return Array.from(set)
    })
    setConsulted(false)
    setActiveFilters(null)
  }, [])

  const toggleAllSesiones = useCallback(() => {
    setSesionCajaIds((prev) =>
      prev.length === sesiones.length ? [] : sesiones.map((s) => s.id)
    )
    setConsulted(false)
    setActiveFilters(null)
  }, [sesiones])

  function getSesionLabel(s: { status: string; fecha_apertura: string; usuario_nombre: string | null }) {
    const hora = s.fecha_apertura.substring(11, 16)
    const estado = s.status === 'ABIERTA' ? 'Abierta' : 'Cerrada'
    const user = s.usuario_nombre ? ` · ${s.usuario_nombre}` : ''
    return `${hora}${user} (${estado})`
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Cuadre de Caja" descripcion="Resumen de operaciones y cierre de caja" />

      {/* Funnel + KPI card */}
      <div className="rounded-2xl bg-card shadow-lg p-4 space-y-3">
        {/* Filter controls row */}
        <div className="flex flex-wrap items-end gap-3">
          {/* Fecha */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => handleFechaChange(e.target.value)}
              className="rounded-md border border-input bg-white px-3 py-2 text-sm"
            />
          </div>

          {/* Caja */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Caja</label>
            <NativeSelect
              value={cajaId ?? ''}
              onChange={(e) => handleCajaChange(e.target.value)}
              className="min-w-[160px]"
            >
              <option value="">Todas las cajas</option>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </NativeSelect>
          </div>

          {/* Consultar button */}
          <button
            onClick={handleConsultar}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <MagnifyingGlass className="w-4 h-4" />
            Consultar
          </button>
        </div>

        {/* Multi-session selector */}
        {cajaId && sesiones.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Sesiones del dia ({sesiones.length})
              </p>
              <button
                type="button"
                onClick={toggleAllSesiones}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {sesionCajaIds.length === sesiones.length ? (
                  <CheckSquare size={12} />
                ) : (
                  <Square size={12} />
                )}
                {sesionCajaIds.length === sesiones.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sesiones.map((s) => {
                const checked = sesionCajaIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSesion(s.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs border transition-colors ${
                      checked
                        ? 'bg-primary/10 border-primary/50 text-primary font-medium'
                        : 'bg-background border-input text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare size={12} weight="fill" />
                    ) : (
                      <Square size={12} />
                    )}
                    {getSesionLabel(s)}
                  </button>
                )
              })}
            </div>
            {sesionCajaIds.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Sin sesion seleccionada = todas las sesiones de la caja en la fecha
              </p>
            )}
          </div>
        )}

        {/* KPI summary strip — shown after consultar */}
        {consulted && activeFilters && (
          <div className="border-t pt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* Tasa del dia */}
            {tasaCount > 0 && (
              <div className="text-xs text-muted-foreground">
                Tasa: <span className="font-semibold text-foreground">{formatTasa(tasaPromedio)} Bs/$</span>
                {tasaCount > 1 && <span className="ml-1">(prom. {tasaCount})</span>}
              </div>
            )}

            <div className="flex-1" />

            {/* Total Ventas */}
            <button
              onClick={() => setAuditOpen(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="p-1.5 rounded-md bg-blue-100 text-blue-600">
                <ShoppingCart size={14} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-none mb-0.5">Total Ventas</p>
                {loadingVentas ? (
                  <div className="h-5 w-20 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <p className="text-base font-bold leading-none">{formatUsd(totalVentasUsd)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatBs(totalVentasBs)} · {facturasCount} fact.
                    </p>
                  </>
                )}
              </div>
            </button>

            <div className="w-px h-10 bg-border hidden sm:block" />

            {/* CxC Hoy */}
            <button
              onClick={() => setCxcOpen(true)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="p-1.5 rounded-md bg-red-100 text-red-600">
                <CreditCard size={14} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-none mb-0.5">CxC Hoy</p>
                {loadingCxc ? (
                  <div className="h-5 w-20 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-base font-bold leading-none text-red-600">
                    {formatUsd(cxcTotalUsd)}
                  </p>
                )}
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {!consulted || !activeFilters ? (
        <div className="text-center py-16 text-muted-foreground">
          <MagnifyingGlass className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Seleccione los filtros y presione Consultar</p>
        </div>
      ) : (
        <>
          {/* Fiscal totals — full width */}
          <CuadreTotalesFiscales
            filters={activeFilters}
            tasaDelDia={tasaPromedio}
          />

          {/* Physical count + Payment method summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CuadreConteoFisico
              filters={activeFilters}
              tasaDelDia={tasaPromedio}
              verifiedAmountsByMetodoId={verifiedAmountsByMetodoId}
            />
            <PagosResumen
              filters={activeFilters}
              onMetodoClick={(nombre) => setMetodoModal(nombre)}
              onCreditoClick={() => setCxcOpen(true)}
            />
          </div>

          {/* Detail sections (expandable) */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Detalle del periodo
            </h2>
            <CuadreDetallePagos
              filters={activeFilters}
              onVerifiedChange={handleVerifiedChange}
            />
            <CuadreDetalleFacturas filters={activeFilters} />
          </div>

          {/* Modals */}
          <AuditModal isOpen={auditOpen} onClose={() => setAuditOpen(false)} filters={activeFilters} />
          <CxcModal isOpen={cxcOpen} onClose={() => setCxcOpen(false)} filters={activeFilters} />
          {metodoModal && (
            <CuadreMetodoModal
              isOpen={!!metodoModal}
              onClose={() => setMetodoModal(null)}
              filters={activeFilters}
              metodoNombre={metodoModal}
            />
          )}
        </>
      )}
    </div>
  )
}
