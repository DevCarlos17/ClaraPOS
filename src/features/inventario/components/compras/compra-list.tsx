import { useState } from 'react'
import { CalendarDots, ArrowCounterClockwise, CaretRight } from '@phosphor-icons/react'
import { useComprasPorFecha } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { todayStr, startOfMonth } from '@/lib/dates'
import { CompraForm } from './compra-form'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
import { CompraReportes } from './compra-reportes'

const MAX_RANGE_DAYS = 62 // ~2 meses

// ─── Badges compartidos (desktop + mobile) ─────────────────────

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        tipo === 'CREDITO'
          ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300'
          : 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950 dark:text-green-300'
      }`}
    >
      {tipo}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'REVERSADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-950 dark:text-purple-300">
        <ArrowCounterClockwise className="h-2.5 w-2.5" />
        REVERSADA
      </span>
    )
  }
  if (status === 'ANULADA') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300">
        ANULADA
      </span>
    )
  }
  if (status === 'PROCESADA') {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300">
        PROCESADA
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-muted-foreground/20">
      {status}
    </span>
  )
}

function getDaysDiff(from: string, to: string): number {
  const d1 = new Date(from)
  const d2 = new Date(to)
  return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function getDefaultDates() {
  return {
    desde: startOfMonth(),
    hasta: todayStr(),
  }
}

export function CompraList() {
  const defaults = getDefaultDates()
  const [showForm, setShowForm] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)

  // Date range filter state
  const [fechaDesde, setFechaDesde] = useState(defaults.desde)
  const [fechaHasta, setFechaHasta] = useState(defaults.hasta)
  const [consultaActiva, setConsultaActiva] = useState({ desde: '', hasta: '' })

  const { compras, isLoading } = useComprasPorFecha(consultaActiva.desde, consultaActiva.hasta)

  const rangeError = getRangeError()

  function getRangeError(): string | null {
    if (!fechaDesde || !fechaHasta) return null
    if (fechaDesde > fechaHasta) return 'La fecha inicio no puede ser mayor a la fecha fin'
    const diff = getDaysDiff(fechaDesde, fechaHasta)
    if (diff > MAX_RANGE_DAYS) return `El rango maximo es de ${MAX_RANGE_DAYS} dias (~2 meses)`
    return null
  }

  function handleConsultar() {
    if (rangeError || !fechaDesde || !fechaHasta) return
    setConsultaActiva({ desde: fechaDesde, hasta: fechaHasta })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleConsultar()
    }
  }

  const hasConsulta = Boolean(consultaActiva.desde && consultaActiva.hasta)

  if (showForm) {
    return <CompraForm onClose={() => setShowForm(false)} />
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4">
      {/* Filtros + acciones */}
      <div className="rounded-2xl bg-card shadow-lg p-4 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
          <div className="flex items-center gap-3 w-full lg:w-auto">
            {/* Label "Periodo:" solo en desktop; en mobile roba ancho a las fechas */}
            <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <CalendarDots className="h-4 w-4" />
              <span className="font-medium">Periodo:</span>
            </div>
            {/* Fechas: siempre en una sola fila (Desde + Hasta lado a lado).
                min-w-0 en el contenedor y el input permite que el date se
                encoja de verdad y no desborde el viewport en mobile. */}
            <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-none">
              <label htmlFor="fecha-desde" className="text-xs text-muted-foreground shrink-0">
                Desde
              </label>
              <input
                id="fecha-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-w-0 w-full lg:w-auto rounded-md border border-input px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 lg:flex-none">
              <label htmlFor="fecha-hasta" className="text-xs text-muted-foreground shrink-0">
                Hasta
              </label>
              <input
                id="fecha-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-w-0 w-full lg:w-auto rounded-md border border-input px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {/* Acciones: Consultar + Nueva Factura siempre en una sola fila */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <button
              onClick={handleConsultar}
              disabled={!!rangeError || !fechaDesde || !fechaHasta}
              className="inline-flex items-center justify-center px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-1 lg:flex-none"
            >
              Consultar
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer flex-1 lg:flex-none"
            >
              Nueva Factura de Compra
            </button>
          </div>
        </div>
        {rangeError && (
          <p className="text-destructive text-xs mt-2">{rangeError}</p>
        )}
      </div>

      {/* Content */}
      {!hasConsulta ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDots className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">Seleccione un rango de fechas</p>
          <p className="text-sm mt-1">Elija las fechas de inicio y fin, luego presione "Consultar"</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col rounded-2xl bg-card shadow-lg overflow-hidden">
          {/* Toolbar */}
          <div className="flex justify-between items-center px-4 py-3 bg-muted/40 border-b border-border shrink-0">
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? 'Cargando...'
                : `${compras.length} factura${compras.length !== 1 ? 's' : ''} encontrada${compras.length !== 1 ? 's' : ''}`
              }
            </p>
            <CompraReportes
              compras={compras}
              fechaDesde={consultaActiva.desde}
              fechaHasta={consultaActiva.hasta}
            />
          </div>

          {/* Contenido: contenedor con scroll interno unico (header/filtros
              quedan fijos, solo esto scrollea) */}
          <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : compras.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Sin compras en el periodo</p>
              <p className="text-sm mt-1">No se encontraron facturas de compra entre las fechas seleccionadas</p>
            </div>
          ) : (
            <>
            {/* Tabla: solo desktop (md:+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50 sticky top-0 z-[1]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nro Factura</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Exento USD</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Base USD</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">IVA USD</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total USD</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Bs</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Tasa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {compras.map((compra) => (
                    <tr
                      key={compra.id}
                      onClick={() => setDetalleId(compra.id)}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm text-foreground">{compra.nro_factura}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {formatDate(compra.fecha_factura)}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{compra.proveedor_nombre}</td>
                      <td className="px-4 py-3">
                        <TipoBadge tipo={compra.tipo} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={compra.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {formatUsd(compra.total_exento_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {formatUsd(compra.total_base_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {formatUsd(compra.total_iva_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                        {formatUsd(compra.total_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {formatBs(compra.total_bs)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                        {parseFloat(compra.tasa).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {compra.creado_por_nombre ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Lista mobile: fila compacta -> abre el mismo modal de detalle */}
            <div data-testid="facturas-compra-mobile-card-list" className="md:hidden divide-y divide-border">
              {compras.map((compra) => (
                <div
                  key={compra.id}
                  onClick={() => setDetalleId(compra.id)}
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-foreground truncate">
                        {compra.nro_factura}
                      </span>
                      <StatusBadge status={compra.status} />
                      <TipoBadge tipo={compra.tipo} />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {compra.proveedor_nombre} · {formatDate(compra.fecha_factura)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-foreground">
                        {formatUsd(compra.total_usd)}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatBs(compra.total_bs)}
                      </p>
                    </div>
                    <CaretRight className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
          </div>
        </div>
      )}

      <FacturaProveedorModal
        tipo="COMPRA"
        id={detalleId ?? ''}
        isOpen={!!detalleId}
        onClose={() => setDetalleId(null)}
      />
    </div>
  )
}
