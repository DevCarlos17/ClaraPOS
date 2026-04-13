import { useState } from 'react'
import { Plus, Eye, Search, CalendarDays } from 'lucide-react'
import { useComprasPorFecha, type CompraConProveedor } from '@/features/inventario/hooks/use-compras'
import { formatUsd, formatBs } from '@/lib/currency'
import { CompraForm } from './compra-form'
import { CompraDetalleModal } from './compra-detalle-modal'

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
  const [detalleCompra, setDetalleCompra] = useState<CompraConProveedor | null>(null)

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
        <h2 className="text-lg font-semibold text-foreground">Historial de Compras</h2>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva Compra
        </button>
      </div>

      {/* Date range filters */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
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
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleConsultar}
              disabled={!!rangeError || !fechaDesde || !fechaHasta}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-sm text-muted-foreground mb-2">
            {compras.length} factura{compras.length !== 1 ? 's' : ''} encontrada{compras.length !== 1 ? 's' : ''}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nro Factura</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total USD</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Bs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Tasa</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {compras.map((compra) => (
                  <tr key={compra.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm text-foreground">{compra.nro_factura}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(compra.fecha_factura).toLocaleDateString('es-VE')}
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
                    <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                      {formatUsd(compra.total_usd)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                      {formatBs(compra.total_bs)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                      {parseFloat(compra.tasa).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDetalleCompra(compra)}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
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

      {detalleCompra && (
        <CompraDetalleModal
          compra={detalleCompra}
          isOpen={!!detalleCompra}
          onClose={() => setDetalleCompra(null)}
        />
      )}
    </div>
  )
}
