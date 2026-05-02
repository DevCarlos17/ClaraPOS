import { useRef, useState, useEffect, useMemo } from 'react'
import { Plus, ChartBar, CaretDown, CaretUp, MagnifyingGlass, CalendarDots, BookOpen, X } from '@phosphor-icons/react'
import {
  useGastos,
  type Gasto,
} from '@/features/contabilidad/hooks/use-gastos'
import { useGruposGastoConSubcuentas } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { GastoForm } from './gasto-form'
import { GastosKpis } from './gastos-kpis'
import { GastoReportes, type TipoReporte } from './gasto-reportes'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
import { CuentaGastoModal } from './cuenta-gasto-modal'
import { formatDate } from '@/lib/format'
import { formatUsd } from '@/lib/currency'

// ─── Tipos ───────────────────────────────────────────────────

type GastoConJoins = Gasto & {
  cuenta_nombre: string
  proveedor_nombre: string | null
  created_by_nombre: string | null
}

type GastoSortKey = 'nro_gasto' | 'fecha' | 'monto_usd' | 'status'

function SortIcon({ field, current, dir }: { field: GastoSortKey; current: GastoSortKey; dir: 'asc' | 'desc' }) {
  if (field !== current) return <CaretDown className="h-3 w-3 opacity-30 inline ml-1" />
  return dir === 'asc'
    ? <CaretUp className="h-3 w-3 inline ml-1" />
    : <CaretDown className="h-3 w-3 inline ml-1" />
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
  const [detalleId, setDetalleId] = useState<string | null>(null)

  const [reporteOpen, setReporteOpen] = useState(false)
  const [reporteActivo, setReporteActivo] = useState<TipoReporte | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filtro por grupo de cuenta
  const [filtroGrupoId, setFiltroGrupoId] = useState<string | null>(null)

  // Sort de tabla
  const [sortKey, setSortKey] = useState<GastoSortKey>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: GastoSortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const hasConsulta = Boolean(consultaActiva)

  const { gastos, isLoading } = useGastos(
    consultaActiva?.desde,
    consultaActiva?.hasta
  )
  const { grupos } = useGruposGastoConSubcuentas()

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
    setFiltroGrupoId(null)
    setConsultaActiva({ desde: fechaDesde, hasta: fechaHasta })
  }

  // Resumen de gastos agrupado por grupo → subcuenta (solo REGISTRADO)
  const resumenPorGrupo = useMemo(() => {
    if (!hasConsulta || gastos.length === 0) return []
    const registrados = gastos.filter((g) => g.status === 'REGISTRADO')
    return grupos
      .map((grupo) => {
        const subcuentasConData = grupo.subcuentas
          .map((sub) => {
            const items = registrados.filter((g) => g.cuenta_id === sub.id)
            if (items.length === 0) return null
            const totalUsd = items.reduce((sum, g) => sum + (parseFloat(g.monto_usd) || 0), 0)
            return { id: sub.id, nombre: sub.nombre, codigo: sub.codigo, totalUsd, count: items.length }
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
        if (subcuentasConData.length === 0) return null
        const totalUsd = subcuentasConData.reduce((sum, s) => sum + s.totalUsd, 0)
        const count = subcuentasConData.reduce((sum, s) => sum + s.count, 0)
        return { id: grupo.id, nombre: grupo.nombre, codigo: grupo.codigo, totalUsd, count, subcuentas: subcuentasConData }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [gastos, grupos, hasConsulta])

  // Gastos filtrados por grupo seleccionado (para la tabla plana)
  const gastosFiltrados = useMemo(() => {
    if (!filtroGrupoId) return gastos
    const grupo = grupos.find((g) => g.id === filtroGrupoId)
    if (!grupo) return gastos
    const subIds = new Set(grupo.subcuentas.map((s) => s.id))
    return gastos.filter((g) => subIds.has(g.cuenta_id))
  }, [gastos, grupos, filtroGrupoId])

  const gastosSorted = useMemo(() => {
    return [...gastosFiltrados].sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'monto_usd') return (parseFloat(a.monto_usd) - parseFloat(b.monto_usd)) * mult
      return String(a[sortKey]).localeCompare(String(b[sortKey])) * mult
    })
  }, [gastosFiltrados, sortKey, sortDir])

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

  if (formOpen) {
    return <GastoForm onClose={() => setFormOpen(false)} />
  }

  return (
    <div>
      {/* Filtro de fechas + Consultar + Acciones principales */}
      <div className="rounded-xl bg-card shadow-md p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDots className="h-4 w-4" />
              <span className="font-medium">Periodo:</span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="gasto-desde" className="text-xs text-muted-foreground whitespace-nowrap">Desde</label>
              <input
                id="gasto-desde"
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                onKeyDown={handleKeyDown}
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="rounded-md border border-input px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleConsultar}
              disabled={!!rangeError || !fechaDesde || !fechaHasta}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MagnifyingGlass className="h-4 w-4" />
              Consultar
            </button>
          </div>

          {/* Acciones principales — siempre visibles */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCuentaModalOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors cursor-pointer"
            >
              <BookOpen className="h-4 w-4" />
              Crear Cuenta
            </button>
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Nuevo Gasto
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
          <CalendarDots className="h-10 w-10 mx-auto mb-3 opacity-40" />
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

          {/* Resumen por Grupo de Cuenta */}
          {resumenPorGrupo.length > 0 && !isLoading && (
            <div className="mb-4 rounded-lg border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Resumen por Grupo
                </span>
                {filtroGrupoId && (
                  <button
                    type="button"
                    onClick={() => setFiltroGrupoId(null)}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <X className="h-3 w-3" />
                    Ver todos
                  </button>
                )}
              </div>
              <div className="divide-y divide-border">
                {resumenPorGrupo.map((grupo) => (
                  <div key={grupo.id}>
                    <button
                      type="button"
                      onClick={() => setFiltroGrupoId(filtroGrupoId === grupo.id ? null : grupo.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-muted/30 ${
                        filtroGrupoId === grupo.id ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">{grupo.codigo}</span>
                        <span className="text-sm font-semibold text-foreground">{grupo.nombre}</span>
                        <span className="text-[10px] text-muted-foreground">({grupo.count})</span>
                      </div>
                      <span className="text-sm font-bold text-foreground tabular-nums shrink-0">{formatUsd(grupo.totalUsd)}</span>
                    </button>
                    {grupo.subcuentas.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between px-4 py-1.5 pl-10 bg-muted/10 border-t border-border/30">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{sub.codigo}</span>
                          <span className="text-xs text-muted-foreground">{sub.nombre}</span>
                          <span className="text-[10px] text-muted-foreground/60">({sub.count})</span>
                        </div>
                        <span className="text-xs font-medium text-foreground tabular-nums shrink-0">{formatUsd(sub.totalUsd)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {/* Total general */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground">Total periodo</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {formatUsd(resumenPorGrupo.reduce((sum, g) => sum + g.totalUsd, 0))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Barra de resultados + Reportes */}
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? 'Cargando...'
                : filtroGrupoId
                  ? `${gastosFiltrados.length} gasto${gastosFiltrados.length !== 1 ? 's' : ''} · ${grupos.find(g => g.id === filtroGrupoId)?.nombre ?? ''}`
                  : `${gastos.length} gasto${gastos.length !== 1 ? 's' : ''} encontrado${gastos.length !== 1 ? 's' : ''}`
              }
            </p>
            <div className="flex items-center gap-2">
              {/* Reportes dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setReporteOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors"
                >
                  <ChartBar className="h-4 w-4" />
                  Reportes
                  <CaretDown className="h-3.5 w-3.5" />
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
                    <th
                      className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('nro_gasto')}
                    >
                      Nro Gasto<SortIcon field="nro_gasto" current={sortKey} dir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nro Factura</th>
                    <th
                      className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('fecha')}
                    >
                      Fecha<SortIcon field="fecha" current={sortKey} dir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cuenta</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Proveedor</th>
                    <th
                      className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('monto_usd')}
                    >
                      Monto USD<SortIcon field="monto_usd" current={sortKey} dir={sortDir} />
                    </th>
                    <th
                      className="text-center px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort('status')}
                    >
                      Status<SortIcon field="status" current={sortKey} dir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Procesado por</th>
                  </tr>
                </thead>
                <tbody>
                  {gastosSorted.map((g) => {
                    const anulado = g.status === 'ANULADO'
                    return (
                      <tr
                        key={g.id}
                        onClick={() => setDetalleId(g.id)}
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
      <FacturaProveedorModal
        tipo="GASTO"
        id={detalleId ?? ''}
        isOpen={!!detalleId}
        onClose={() => setDetalleId(null)}
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
