import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { MagnifyingGlass, CheckSquare, Square, ShoppingCart, CreditCard, LockKey, Eye, Warning, Printer } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { useCajasActivas } from '@/features/configuracion/hooks/use-cajas'
import { todayStr } from '@/lib/dates'
import { formatTasa, formatUsd, formatBs } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'
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
import { CuadreImprimir } from './cuadre-imprimir'
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
  const [resumenOpen, setResumenOpen] = useState(false)

  // Verified non-cash payment amounts (keyed by metodo_cobro_id)
  const [verifiedAmountsByMetodoId, setVerifiedAmountsByMetodoId] = useState<Record<string, VerifiedEntry>>({})

  // Totals lifted from CuadreConteoFisico
  const [totalSistemaUsd, setTotalSistemaUsd] = useState(0)
  const [totalFisicoUsd, setTotalFisicoUsd] = useState(0)

  // Conteo fisico por metodo (keyed por metodo_cobro_id, valor nativo) para cerrarSesionCaja
  const [conteoFisicoRecord, setConteoFisicoRecord] = useState<Record<string, number>>({})
  const [totalMetodosCount, setTotalMetodosCount] = useState(0)

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

  const handleConteoFisicoChange = useCallback((conteo: Record<string, number>, totalMetodos: number) => {
    setConteoFisicoRecord(conteo)
    setTotalMetodosCount(totalMetodos)
  }, [])

  // Data
  const { cajas } = useCajasActivas()
  const { sesiones } = useSesionesPorCajaYFecha(cajaId, fecha)
  const { tasaPromedio, tasaCount } = useTasaDelDia(activeFilters?.fecha ?? null)

  // KPI data — shown after consultar
  const { totalVentasUsd, totalVentasBs, facturasCount, isLoading: loadingVentas } =
    useVentasDelDia(activeFilters)
  const { cxcTotalUsd, isLoading: loadingCxc } = useCxcDelDia(activeFilters)

  // Determine if exactly one ABIERTA session is selected (enables finalizar cuadre)
  const sesionAbiertaId = useMemo(() => {
    if (sesionCajaIds.length !== 1) return null
    const found = sesiones.find((s) => s.id === sesionCajaIds[0])
    return found?.status === 'ABIERTA' ? sesionCajaIds[0] : null
  }, [sesionCajaIds, sesiones])

  // Determine if exactly one CERRADA session is selected (shows Ver resumen)
  const sesionCerradaId = useMemo(() => {
    if (sesionCajaIds.length !== 1) return null
    const found = sesiones.find((s) => s.id === sesionCajaIds[0])
    return found?.status === 'CERRADA' ? sesionCajaIds[0] : null
  }, [sesionCajaIds, sesiones])

  // Total overrides across all verified methods
  const totalOverrides = Object.values(verifiedAmountsByMetodoId).reduce(
    (sum, e) => sum + e.overrideCount,
    0
  )

  const diferencia = Number((totalFisicoUsd - totalSistemaUsd).toFixed(2))

  // Metodos sin conteo fisico ingresado
  const metodosSinConteo = totalMetodosCount - Object.keys(conteoFisicoRecord).length

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
    const nombre = s.usuario_nombre ? ` · ${s.usuario_nombre}` : ''
    return `${hora}${nombre} (${estado})`
  }

  const handleCerrarSesion = async () => {
    if (!sesionAbiertaId || !user) return
    setIsCerrando(true)
    try {
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
        conteoFisicoPorMetodo: conteoFisicoRecord,
        tasaDelDia: tasaPromedio,
      })

      // Limpiar localStorage del conteo al cerrar exitosamente
      if (activeFilters?.sesionCajaIds.length) {
        const key = `cuadre-fisico-${[...activeFilters.sesionCajaIds].sort().join(',')}`
        localStorage.removeItem(key)
      }

      toast.success('Sesion cerrada exitosamente')
      setFinalizarOpen(false)
      setObservaciones('')
      setActiveFilters({ fecha, cajaId, sesionCajaIds })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar la sesion')
    } finally {
      setIsCerrando(false)
    }
  }

  return (
    <>
    <div className="space-y-6 print:hidden">
      <PageHeader titulo="Cuadre de Caja" descripcion="Resumen de operaciones y cierre de caja" />

      {/* Filter card + KPI cards */}
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-[280px] rounded-2xl bg-card shadow-lg p-4 space-y-3">
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

            {/* Consultar */}
            <button
              onClick={handleConsultar}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <MagnifyingGlass className="w-4 h-4" />
              Consultar
            </button>

            {/* Finalizar Cuadre — solo cuando 1 sesion ABIERTA seleccionada */}
            {consulted && sesionAbiertaId && (
              <button
                onClick={() => setFinalizarOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 transition-colors"
              >
                <LockKey className="w-4 h-4" />
                Finalizar Cuadre
              </button>
            )}

            {/* Ver resumen — solo cuando 1 sesion CERRADA seleccionada */}
            {consulted && sesionCerradaId && (
              <button
                onClick={() => setResumenOpen(true)}
                className="inline-flex items-center gap-2 rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Ver Resumen
              </button>
            )}

            {/* Imprimir — visible cuando hay datos consultados */}
            {consulted && activeFilters && (
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <Printer className="w-4 h-4" />
                Imprimir
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

          {/* Tasa del dia */}
          {consulted && activeFilters && tasaCount > 0 && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              Tasa del dia: <span className="font-semibold text-foreground">{formatTasa(tasaPromedio)} Bs/$</span>
              {tasaCount > 1 && <span className="ml-1">(prom. {tasaCount} registros)</span>}
            </div>
          )}
        </div>

        {/* KPI cards */}
        {consulted && activeFilters && (
          <>
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
          <CuadreTotalesFiscales filters={activeFilters} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CuadreConteoFisico
              filters={activeFilters}
              tasaDelDia={tasaPromedio}
              verifiedAmountsByMetodoId={verifiedAmountsByMetodoId}
              onTotalesChange={handleTotalesChange}
              onConteoFisicoChange={handleConteoFisicoChange}
              readOnly={!!sesionCerradaId}
            />
            <PagosResumen
              filters={activeFilters}
              tasaDelDia={tasaPromedio}
              onMetodoClick={(nombre) => setMetodoModal(nombre)}
              onCreditoClick={() => setCxcOpen(true)}
            />
          </div>

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

      {/* Modal: Finalizar Cuadre */}
      {finalizarOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <h2 className="text-base font-semibold">Finalizar Cuadre de Caja</h2>

            {/* Advertencia si hay metodos sin conteo */}
            {metodosSinConteo > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                <Warning size={14} className="mt-0.5 shrink-0" weight="fill" />
                <span>
                  {metodosSinConteo} metodo(s) sin conteo fisico ingresado. El cierre se guardara con diferencia nula para esos metodos.
                </span>
              </div>
            )}

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

            {totalOverrides > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {totalOverrides} transferencia(s) con monto ajustado por supervisor quedaran registradas en las observaciones.
              </div>
            )}

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

      {/* Modal: Ver Resumen (sesion cerrada) */}
      {resumenOpen && sesionCerradaId && (
        <ResumenSesionCerradaModal
          sesionId={sesionCerradaId}
          onClose={() => setResumenOpen(false)}
        />
      )}
    </div>

    {/* Vista de impresion — oculta en pantalla, visible al imprimir */}
    {consulted && activeFilters && (
      <CuadreImprimir
        filters={activeFilters}
        tasaDelDia={tasaPromedio}
        totalVentasUsd={totalVentasUsd}
        totalVentasBs={totalVentasBs}
        facturasCount={facturasCount}
        cxcTotalUsd={cxcTotalUsd}
        totalSistemaUsd={totalSistemaUsd}
        totalFisicoUsd={totalFisicoUsd}
        diferencia={diferencia}
        conteoFisicoRecord={conteoFisicoRecord}
      />
    )}
    </>
  )
}

// ─── Modal resumen de sesion cerrada ─────────────────────────

function ResumenSesionCerradaModal({
  sesionId,
  onClose,
}: {
  sesionId: string
  onClose: () => void
}) {
  const { data: sesionData } = useQuery(
    `SELECT sc.*, u.nombre as usuario_cierre_nombre, c.nombre as caja_nombre
     FROM sesiones_caja sc
     LEFT JOIN usuarios u ON sc.usuario_cierre_id = u.id
     LEFT JOIN cajas c ON sc.caja_id = c.id
     WHERE sc.id = ?`,
    [sesionId]
  )

  const { data: detalleData } = useQuery(
    `SELECT scd.metodo_cobro_id, mc.nombre as metodo_nombre, mc.moneda,
            scd.total_sistema, scd.total_fisico, scd.diferencia, scd.num_transacciones
     FROM sesiones_caja_detalle scd
     JOIN metodos_cobro mc ON scd.metodo_cobro_id = mc.id
     WHERE scd.sesion_caja_id = ?
     ORDER BY mc.nombre`,
    [sesionId]
  )

  const sesion = (sesionData ?? [])[0] as {
    monto_apertura_usd: string
    monto_apertura_bs: string
    monto_sistema_usd: string | null
    monto_fisico_usd: string | null
    diferencia_usd: string | null
    observaciones_cierre: string | null
    fecha_cierre: string | null
    fecha_apertura: string
    usuario_cierre_nombre: string | null
    caja_nombre: string | null
  } | undefined

  type DetalleRow = {
    metodo_nombre: string
    moneda: string
    total_sistema: string
    total_fisico: string | null
    diferencia: string | null
    num_transacciones: number
  }
  const detalle = (detalleData ?? []) as DetalleRow[]

  const diferenciaUsd = sesion?.diferencia_usd !== null && sesion?.diferencia_usd !== undefined
    ? parseFloat(sesion.diferencia_usd)
    : null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Resumen de Sesion Cerrada</h2>
            {sesion?.caja_nombre && (
              <p className="text-xs text-muted-foreground mt-0.5">{sesion.caja_nombre}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {!sesion ? (
          <div className="h-20 bg-muted rounded animate-pulse" />
        ) : (
          <>
            {/* Info de apertura y cierre */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">Apertura</p>
                <p className="font-medium">{formatDateTime(sesion.fecha_apertura)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Fondo: USD {parseFloat(sesion.monto_apertura_usd).toFixed(2)}
                  {parseFloat(sesion.monto_apertura_bs) > 0 && (
                    <> + Bs {parseFloat(sesion.monto_apertura_bs).toFixed(2)}</>
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-1">Cierre</p>
                <p className="font-medium">
                  {sesion.fecha_cierre ? formatDateTime(sesion.fecha_cierre) : '—'}
                </p>
                {sesion.usuario_cierre_nombre && (
                  <p className="text-xs text-muted-foreground mt-1">Por: {sesion.usuario_cierre_nombre}</p>
                )}
              </div>
            </div>

            {/* Totales globales */}
            <div className="space-y-2 text-sm border rounded-lg p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total sistema</span>
                <span className="font-mono font-bold">{formatUsd(parseFloat(sesion.monto_sistema_usd ?? '0'))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total fisico</span>
                <span className="font-mono font-bold">
                  {sesion.monto_fisico_usd !== null ? formatUsd(parseFloat(sesion.monto_fisico_usd)) : '—'}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Diferencia</span>
                <div className="flex items-center gap-2">
                  {diferenciaUsd !== null ? (
                    <>
                      <span className={`font-mono font-bold ${diferenciaUsd > 0.001 ? 'text-green-600' : diferenciaUsd < -0.001 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {diferenciaUsd > 0 ? '+' : ''}{formatUsd(diferenciaUsd)}
                      </span>
                      {diferenciaUsd > 0.001 && (
                        <span className="text-xs rounded-full bg-green-100 px-2 py-0.5 text-green-700 font-medium">SOBRANTE</span>
                      )}
                      {diferenciaUsd < -0.001 && (
                        <span className="text-xs rounded-full bg-red-100 px-2 py-0.5 text-red-700 font-medium">FALTANTE</span>
                      )}
                      {Math.abs(diferenciaUsd) <= 0.001 && (
                        <span className="text-xs rounded-full bg-green-100 px-2 py-0.5 text-green-700 font-medium">CUADRADO</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            </div>

            {/* Desglose por metodo */}
            {detalle.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Detalle por metodo
                </p>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted">
                        <th className="text-left px-3 py-2 font-medium">Metodo</th>
                        <th className="text-right px-3 py-2 font-medium">Sistema</th>
                        <th className="text-right px-3 py-2 font-medium">Fisico</th>
                        <th className="text-right px-3 py-2 font-medium">Dif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.map((d) => {
                        const dif = d.diferencia !== null ? parseFloat(d.diferencia) : null
                        return (
                          <tr key={d.metodo_nombre} className="border-b last:border-0">
                            <td className="px-3 py-2">{d.metodo_nombre}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {d.moneda === 'BS'
                                ? formatBs(parseFloat(d.total_sistema))
                                : formatUsd(parseFloat(d.total_sistema))}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {d.total_fisico !== null
                                ? d.moneda === 'BS'
                                  ? formatBs(parseFloat(d.total_fisico))
                                  : formatUsd(parseFloat(d.total_fisico))
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                              dif === null ? '' : dif > 0.001 ? 'text-green-600' : dif < -0.001 ? 'text-red-600' : 'text-muted-foreground'
                            }`}>
                              {dif !== null ? `${dif > 0 ? '+' : ''}${formatUsd(dif)}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Observaciones */}
            {sesion.observaciones_cierre && (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Observaciones</p>
                <p className="text-sm">{sesion.observaciones_cierre}</p>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
