import { useRef, useState, useEffect } from 'react'
import { Plus, BarChart3, ChevronDown, Search, CalendarDays, BookPlus } from 'lucide-react'
import {
  useGastos,
  type Gasto,
} from '@/features/contabilidad/hooks/use-gastos'
import { GastoForm } from './gasto-form'
import { GastosKpis } from './gastos-kpis'
import { GastoReportes, type TipoReporte } from './gasto-reportes'
import { GastoDetalleModal } from './gasto-detalle-modal'
import { CuentaGastoModal } from './cuenta-gasto-modal'
import { formatDate } from '@/lib/format'
import { formatUsd } from '@/lib/currency'

// ─── Tipos ───────────────────────────────────────────────────

type GastoConJoins = Gasto & {
  cuenta_nombre: string
  proveedor_nombre: string | null
  created_by_nombre: string | null
}

// ─── Helpers de fecha ────────────────────────────────────────

const MAX_RANGE_DAYS = 93 // ~3 meses

function getDefaultDates() {
  const now = new Date()
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
  const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    desde: inicio.toISOString().slice(0, 10),
    hasta: fin.toISOString().slice(0, 10),
  }
}

function getDaysDiff(from: string, to: string): number {
  return Math.ceil(
    (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)
  )
}

// ─── Badge de status ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'REGISTRADO') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">
        REGISTRADO
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">
      ANULADO
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function GastoList() {
  const defaults = getDefaultDates()
  const [fechaDesde, setFechaDesde] = useState(defaults.desde)
  const [fechaHasta, setFechaHasta] = useState(defaults.hasta)
  const [consultaActiva, setConsultaActiva] = useState<{ desde: string; hasta: string } | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false)
  const [gastoDetalle, setGastoDetalle] = useState<GastoConJoins | null>(null)

  const [reporteOpen, setReporteOpen] = useState(false)
  const [reporteActivo, setReporteActivo] = useState<TipoReporte | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const hasConsulta = Boolean(consultaActiva)

  const { gastos, isLoading } = useGastos(
    consultaActiva?.desde,
    consultaActiva?.hasta
  )

  // Validacion del rango
  const rangeError = (() => {
    if (!fechaDesde || !fechaHasta) return null
    if (fechaDesde > fechaHasta) return 'La fecha inicio no puede ser mayor a la fecha fin'
    const diff = getDaysDiff(fechaDesde, fechaHasta)
    if (diff > MAX_RANGE_DAYS) return `El rango maximo es de ${MAX_RANGE_DAYS} dias (~3 meses)`
    return null
  })()

  function handleConsultar() {
    if (rangeError || !fechaDesde || !fechaHasta) return
    setConsultaActiva({ desde: fechaDesde, hasta: fechaHasta })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleConsultar()
  }

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setReporteOpen(false)
      }
    }
    if (reporteOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [reporteOpen])

  function abrirReporte(tipo: TipoReporte) {
    setReporteOpen(false)
    setReporteActivo(tipo)
  }

  return (
    <div>
      {/* Filtro de fechas + Consultar */}
      <div className="rounded-lg border border-border bg-card p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span className="font-medium">Periodo:</span>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
            <div className="flex items-center gap-2">
              <label htmlFor="gasto-desde" className="text-xs text-muted-foreground whitespace-nowrap">Desde</label>
              <input
                id="gasto-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                onKeyDown={handleKeyDown}
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="gasto-hasta" className="text-xs text-muted-foreground whitespace-nowrap">Hasta</label>
              <input
                id="gasto-hasta"
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

      {/* Estado sin consulta activa */}
      {!hasConsulta ? (
        <div className="text-center py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-base font-medium">Seleccione un rango de fechas</p>
          <p className="text-sm mt-1">Elija las fechas de inicio y fin, luego presione "Consultar"</p>
        </div>
      ) : (
        <>
          {/* KPIs — solo cuando hay datos */}
          {gastos.length > 0 && !isLoading && (
            <div className="mb-5">
              <GastosKpis gastos={gastos} />
            </div>
          )}

          {/* Barra de acciones */}
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">
              {isLoading ? 'Cargando...' : `${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} encontrado${gastos.length !== 1 ? 's' : ''}`}
            </p>
            <div className="flex items-center gap-2">
              {/* Crear cuenta de gasto */}
              <button
                type="button"
                onClick={() => setCuentaModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors"
              >
                <BookPlus className="h-4 w-4" />
                Crear Cuenta
              </button>

              {/* Reportes dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setReporteOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  Reportes
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {reporteOpen && (
                  <div className="absolute right-0 mt-1 w-48 rounded-md border border-border bg-popover shadow-lg z-10">
                    {(['POR_CUENTA', 'DETALLADO', 'ESPECIFICO'] as TipoReporte[]).map((tipo, i) => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => abrirReporte(tipo)}
                        className={`w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors ${
                          i === 0 ? 'rounded-t-md' : 'border-t border-border'
                        } ${i === 2 ? 'rounded-b-md' : ''}`}
                      >
                        {tipo === 'POR_CUENTA' ? 'Por Cuenta' : tipo === 'DETALLADO' ? 'Detallado' : 'Registro Especifico'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Nuevo gasto */}
              <button
                onClick={() => setFormOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nuevo Gasto
              </button>
            </div>
          </div>

          {/* Tabla */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : gastos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
              <p className="text-base font-medium">Sin gastos en el periodo</p>
              <p className="text-sm mt-1">No se encontraron gastos entre las fechas seleccionadas</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border rounded-lg max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nro Gasto</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nro Factura</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cuenta</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Proveedor</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto USD</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Procesado por</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((g) => {
                    const anulado = g.status === 'ANULADO'
                    return (
                      <tr
                        key={g.id}
                        onClick={() => setGastoDetalle(g as GastoConJoins)}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className={`px-4 py-3 font-mono text-foreground ${anulado ? 'line-through opacity-50' : ''}`}>
                          {g.nro_gasto}
                        </td>
                        <td className={`px-4 py-3 font-mono text-muted-foreground text-xs ${anulado ? 'line-through opacity-50' : ''}`}>
                          {g.nro_factura ?? '—'}
                        </td>
                        <td className={`px-4 py-3 text-muted-foreground whitespace-nowrap ${anulado ? 'line-through opacity-50' : ''}`}>
                          {formatDate(g.fecha)}
                        </td>
                        <td className={`px-4 py-3 text-foreground max-w-[180px] truncate ${anulado ? 'opacity-50' : ''}`}>
                          {g.cuenta_nombre}
                        </td>
                        <td className={`px-4 py-3 text-muted-foreground ${anulado ? 'opacity-50' : ''}`}>
                          {g.proveedor_nombre ?? '—'}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${anulado ? 'line-through opacity-50' : 'text-foreground'}`}>
                          {formatUsd(parseFloat(g.monto_usd))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={g.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {(g as GastoConJoins).created_by_nombre ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modales */}
      <GastoForm isOpen={formOpen} onClose={() => setFormOpen(false)} />

      <GastoDetalleModal
        gasto={gastoDetalle}
        isOpen={!!gastoDetalle}
        onClose={() => setGastoDetalle(null)}
      />

      <CuentaGastoModal
        isOpen={cuentaModalOpen}
        onClose={() => setCuentaModalOpen(false)}
      />

      <GastoReportes
        gastos={gastos}
        reporte={reporteActivo}
        onClose={() => setReporteActivo(null)}
      />
    </div>
  )
}
