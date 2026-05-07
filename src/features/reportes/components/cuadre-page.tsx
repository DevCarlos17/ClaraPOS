import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { MagnifyingGlass, CheckSquare, Square, ShoppingCart, CreditCard, LockKey } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { todayStr } from '@/lib/dates'
import { formatTasa, formatUsd, formatBs } from '@/lib/currency'
import { useCurrentUser } from '@/core/hooks/use-current-user'
import { cerrarSesionCaja } from '@/features/caja/hooks/use-sesiones-caja'
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
  type VerifiedEntry,
} from '../hooks/use-cuadre'
import { NativeSelect } from '@/components/ui/native-select'

interface CuadrePageProps {
  initialFecha?: string
  initialCajaId?: string
  initialSesionId?: string
}

export function CuadrePage({ initialFecha, initialCajaId, initialSesionId }: CuadrePageProps = {}) {
  const { user } = useCurrentUser()

  // Funnel state
  const [fecha, setFecha] = useState(initialFecha ?? todayStr)
  const [cajaId, setCajaId] = useState<string | null>(initialCajaId ?? null)
  const [sesionCajaIds, setSesionCajaIds] = useState<string[]>(
    initialSesionId ? [initialSesionId] : []
  )

  // Consulted state
  const [consulted, setConsulted] = useState(false)
  const [activeFilters, setActiveFilters] = useState<CuadreFilters | null>(null)

  // Modal states
  const [auditOpen, setAuditOpen] = useState(false)
  const [cxcOpen, setCxcOpen] = useState(false)
  const [metodoModal, setMetodoModal] = useState<string | null>(null)

  // Verified non-cash payment amounts (keyed by metodo_cobro_id)
  const [verifiedAmountsByMetodoId, setVerifiedAmountsByMetodoId] = useState<Record<string, VerifiedEntry>>({})

  // Totals lifted from CuadreConteoFisico
  const [totalSistemaUsd, setTotalSistemaUsd] = useState(0)
  const [totalFisicoUsd, setTotalFisicoUsd] = useState(0)

  // Finalizar cuadre modal state
  const [finalizarOpen, setFinalizarOpen] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [isCerrando, setIsCerrando] = useState(false)

  const handleVerifiedChange = useCallback((amounts: Record<string, VerifiedEntry>) => {
    setVerifiedAmountsByMetodoId(amounts)
  }, [])

  const handleTotalesChange = useCallback((sistema: number, fisico: number) => {
    setTotalSistemaUsd(sistema)
    setTotalFisicoUsd(fisico)
  }, [])

  // Data
  const { cajas } = useCajasActivas()
  const { sesiones } = useSesionesPorCajaYFecha(cajaId, fecha)
  const { tasaPromedio, tasaCount } = useTasaDelDia(activeFilters?.fecha ?? null)

  // KPI data — shown after consultar
  const { totalVentasUsd, totalVentasBs, facturasCount, isLoading: loadingVentas } =
    useVentasDelDia(activeFilters)
  const { cxcTotalUsd, isLoading: loadingCxc } = useCxcDelDia(activeFilters)

  // Determine if there is exactly one ABIERTA session selected (enables finalizar cuadre)
  const sesionAbiertaId = useMemo(() => {
    if (sesionCajaIds.length !== 1) return null
    const id = sesionCajaIds[0]
    const found = sesiones.find((s) => s.id === id)
    return found?.status === 'ABIERTA' ? id : null
  }, [sesionCajaIds, sesiones])

  // Total overrides across all verified methods
  const totalOverrides = Object.values(verifiedAmountsByMetodoId).reduce(
    (sum, e) => sum + e.overrideCount,
    0
  )

  const diferencia = Number((totalFisicoUsd - totalSistemaUsd).toFixed(2))

  const handleConsultar = useCallback(() => {
    setActiveFilters({ fecha, cajaId, sesionCajaIds })
    setConsulted(true)
  }, [fecha, cajaId, sesionCajaIds])

  // Auto-consult on mount when navigated from POS with pre-loaded session
  const didAutoConsult = useRef(false)
  useEffect(() => {
    if (!didAutoConsult.current && initialFecha && initialCajaId && initialSesionId) {
      didAutoConsult.current = true
      setActiveFilters({ fecha: initialFecha, cajaId: initialCajaId, sesionCajaIds: [initialSesionId] })
      setConsulted(true)
    }
  }, [initialFecha, initialCajaId, initialSesionId])

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

  const handleCerrarSesion = async () => {
    if (!sesionAbiertaId || !user) return
    setIsCerrando(true)
    try {
      // Build observations: prepend override note if any
      const parts: string[] = []
      if (totalOverrides > 0) {
        parts.push(`${totalOverrides} transferencia(s) con monto ajustado por supervisor`)
      }
      if (observaciones.trim()) parts.push(observaciones.trim())
      const observacionesCierre = parts.join(' | ') || undefined

      await cerrarSesionCaja(sesionAbiertaId, {
        monto_fisico_usd: totalFisicoUsd,
        observaciones_cierre: observacionesCierre,
        usuario_cierre_id: user.id,
      })
      toast.success('Sesion cerrada exitosamente')
      setFinalizarOpen(false)
      setObservaciones('')
      // Refresh by re-consulting so the session now shows as CERRADA
      setActiveFilters({ fecha, cajaId, sesionCajaIds })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar la sesion')
    } finally {
      setIsCerrando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Cuadre de Caja" descripcion="Resumen de operaciones y cierre de caja" />

      {/* Filter card + KPI cards — same row */}
      <div className="flex flex-wrap gap-4 items-start">
        {/* Filter card */}
        <div className="flex-1 min-w-[280px] rounded-2xl bg-card shadow-lg p-4 space-y-3">
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

            {/* Finalizar Cuadre — only when exactly 1 ABIERTA session is selected */}
            {consulted && sesionAbiertaId && (
              <button
                onClick={() => setFinalizarOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
              >
                <LockKey className="w-4 h-4" />
                Finalizar Cuadre
              </button>
            )}
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

          {/* Tasa del dia — shown after consultar */}
          {consulted && activeFilters && tasaCount > 0 && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              Tasa del dia: <span className="font-semibold text-foreground">{formatTasa(tasaPromedio)} Bs/$</span>
              {tasaCount > 1 && <span className="ml-1">(prom. {tasaCount} registros)</span>}
            </div>
          )}
        </div>

        {/* KPI cards — shown after consultar */}
        {consulted && activeFilters && (
          <>
            {/* Total Ventas */}
            <button
              onClick={() => setAuditOpen(true)}
              className="rounded-2xl bg-card shadow-lg p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left min-w-[180px]"
            >
              <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                <ShoppingCart size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Ventas</p>
                {loadingVentas ? (
                  <div className="h-5 w-24 bg-muted rounded animate-pulse" />
                ) : (
                  <>
                    <p className="text-lg font-bold leading-none">{formatUsd(totalVentasUsd)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatBs(totalVentasBs)} · {facturasCount} fact.
                    </p>
                  </>
                )}
              </div>
            </button>

            {/* CxC Hoy */}
            <button
              onClick={() => setCxcOpen(true)}
              className="rounded-2xl bg-card shadow-lg p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left min-w-[160px]"
            >
              <div className="p-2 rounded-xl bg-red-100 text-red-600">
                <CreditCard size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">CxC Hoy</p>
                {loadingCxc ? (
                  <div className="h-5 w-20 bg-muted rounded animate-pulse" />
                ) : (
                  <p className="text-lg font-bold leading-none text-red-600">
                    {formatUsd(cxcTotalUsd)}
                  </p>
                )}
              </div>
            </button>
          </>
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
          <CuadreTotalesFiscales filters={activeFilters} />

          {/* Physical count + Payment method summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CuadreConteoFisico
              filters={activeFilters}
              tasaDelDia={tasaPromedio}
              verifiedAmountsByMetodoId={verifiedAmountsByMetodoId}
              onTotalesChange={handleTotalesChange}
            />
            <PagosResumen
              filters={activeFilters}
              tasaDelDia={tasaPromedio}
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

      {/* Finalizar Cuadre modal */}
      {finalizarOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-base font-semibold">Finalizar Cuadre de Caja</h2>

            {/* Reconciliation summary */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total sistema (USD)</span>
                <span className="font-mono font-bold tabular-nums">{formatUsd(totalSistemaUsd)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total fisico contado (USD)</span>
                <span className="font-mono font-bold tabular-nums">{formatUsd(totalFisicoUsd)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-semibold">Diferencia</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      diferencia > 0.001
                        ? 'text-green-600'
                        : diferencia < -0.001
                        ? 'text-red-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {diferencia > 0 ? '+' : ''}
                    {formatUsd(diferencia)}
                  </span>
                  {diferencia > 0.001 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      SOBRANTE
                    </span>
                  )}
                  {diferencia < -0.001 && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      FALTANTE
                    </span>
                  )}
                  {Math.abs(diferencia) <= 0.001 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      CUADRADO
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Override notice */}
            {totalOverrides > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {totalOverrides} transferencia(s) con monto ajustado por supervisor quedaran registradas en las observaciones.
              </div>
            )}

            {/* Observations */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Observaciones de cierre (opcional)
              </label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={3}
                placeholder="Observaciones adicionales..."
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setFinalizarOpen(false)}
                disabled={isCerrando}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCerrarSesion}
                disabled={isCerrando}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                <LockKey size={15} />
                {isCerrando ? 'Cerrando...' : 'Cerrar Sesion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
