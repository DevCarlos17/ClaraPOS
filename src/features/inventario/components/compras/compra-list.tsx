import { useState } from 'react'
import { Plus, Eye, Search, CalendarDays, RotateCcw } from 'lucide-react'
import { useComprasPorFecha } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { CompraForm } from './compra-form'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
import { CompraReportes } from './compra-reportes'

const MAX_RANGE_DAYS = 62 // ~2 meses

function getDaysDiff(from: string, to: string): number {
  const d1 = new Date(from)
  const d2 = new Date(to)
  return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function getDefaultDates() {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return {
    desde: inicio.toISOString().slice(0, 10),
    hasta: hoy.toISOString().slice(0, 10),
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
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Facturas de Compras</h2>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nueva Factura de Compra
        </button>
      </div>

      {/* Date range filters */}
      <div className="rounded-xl bg-card shadow-md p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span className="font-medium">Periodo:</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <label htmlFor="fecha-desde" className="text-xs text-muted-foreground whitespace-nowrap">
                Desde
              </label>
              <input
                id="fecha-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                onKeyDown={handleKeyDown}
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="fecha-hasta" className="text-xs text-muted-foreground whitespace-nowrap">
                Hasta
              </label>
              <input
                id="fecha-hasta"
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                onKeyDown={handleKeyDown}
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleConsultar}
              disabled={!!rangeError || !fechaDesde || !fechaHasta}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Search className="h-4 w-4" />
              Consultar
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
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">Seleccione un rango de fechas</p>
          <p className="text-sm mt-1">Elija las fechas de inicio y fin, luego presione "Consultar"</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      ) : compras.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Sin compras en el periodo</p>
          <p className="text-sm mt-1">No se encontraron facturas de compra entre las fechas seleccionadas</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-muted-foreground">
              {compras.length} factura{compras.length !== 1 ? 's' : ''} encontrada{compras.length !== 1 ? 's' : ''}
            </p>
            <CompraReportes
              compras={compras}
              fechaDesde={consultaActiva.desde}
              fechaHasta={consultaActiva.hasta}
            />
          </div>
          <div className="overflow-auto rounded-lg border border-border max-h-[60vh]">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50 sticky top-0 z-[1]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nro Factura</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total USD</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Bs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Tasa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Registrado por</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {compras.map((compra) => (
                  <tr key={compra.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-foreground">{compra.nro_factura}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {formatDate(compra.fecha_factura)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{compra.proveedor_nombre}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          compra.tipo === 'CREDITO'
                            ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300'
                            : 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950 dark:text-green-300'
                        }`}
                      >
                        {compra.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {compra.status === 'REVERSADA' ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-950 dark:text-purple-300">
                          <RotateCcw className="h-2.5 w-2.5" />
                          REVERSADA
                        </span>
                      ) : compra.status === 'ANULADA' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300">
                          ANULADA
                        </span>
                      ) : compra.status === 'PROCESADA' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300">
                          PROCESADA
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-muted text-muted-foreground ring-muted-foreground/20">
                          {compra.status}
                        </span>
                      )}
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
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetalleId(compra.id)}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors cursor-pointer"
                      >
                        <Eye className="h-4 w-4" />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
