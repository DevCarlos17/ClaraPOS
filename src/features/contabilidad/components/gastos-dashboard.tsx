import { useMemo, useState } from 'react'
import { Plus, BookOpen, CaretDown, CaretUp } from '@phosphor-icons/react'
import { useGastos } from '@/features/contabilidad/hooks/use-gastos'
import { useGruposGastoConSubcuentas } from '@/features/contabilidad/hooks/use-plan-cuentas'
import { todayStr, startOfMonth } from '@/lib/dates'
import { formatUsd, formatBs } from '@/lib/currency'
import { formatDate } from '@/lib/format'
import { GastoForm } from './gasto-form'
import { CuentaGastoModal } from './cuenta-gasto-modal'
import { FacturaProveedorModal } from '@/features/compras/components/factura-proveedor-modal'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ─── Tipos ───────────────────────────────────────────────────

type Criterio = 'TODAS' | 'GRUPO' | 'CUENTA'
type Intervalo = 'DIARIO' | 'ULTIMOS_7' | 'MENSUAL'

// ─── Helpers de fecha ────────────────────────────────────────

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function lastDayOfMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${yyyyMM}-${String(last).padStart(2, '0')}`
}

function dayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

function getXKey(dateStr: string, intervalo: Intervalo): string {
  if (intervalo === 'MENSUAL') return dateStr.slice(0, 7)
  return dateStr.slice(0, 10)  // DIARIO y ULTIMOS_7 → por día
}

function xKeyToLabel(key: string, intervalo: Intervalo): string {
  if (intervalo === 'MENSUAL') {
    const month = parseInt(key.slice(5, 7)) - 1
    return MESES_CORTOS[month] ?? key
  }
  return dayLabel(key)  // DIARIO y ULTIMOS_7
}

// Badge status reutilizable
function StatusBadge({ status }: { status: string }) {
  return status === 'ANULADO'
    ? <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-600/20 ring-inset">ANULADO</span>
    : <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-green-600/20 ring-inset">REGISTRADO</span>
}

// ─── Componente principal ─────────────────────────────────────

export function GastosDashboard() {
  const today = todayStr()
  const defaultMesDesde = today.slice(0, 7)

  // ── Estado de filtros
  const [criterio, setCriterio]       = useState<Criterio>('TODAS')
  const [grupoId, setGrupoId]         = useState<string>('')
  const [cuentaId, setCuentaId]       = useState<string>('')
  const [intervalo, setIntervalo]     = useState<Intervalo>('DIARIO')

  // Dates preserves per interval
  const [dailyDesde, setDailyDesde]   = useState(startOfMonth())
  const [dailyHasta, setDailyHasta]   = useState(today)
  const [mesDesde, setMesDesde]       = useState(defaultMesDesde)
  const [mesHasta, setMesHasta]       = useState(defaultMesDesde)

  // Últimos 7 días: auto-computed, no pickers
  const ultimos7Desde = useMemo(() => {
    const d = new Date(today + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 10)
  }, [today])

  // Collapsible detail groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function colapsarTodo() {
    setCollapsedGroups(new Set(grupos.map((g) => g.id)))
  }
  function expandirTodo() {
    setCollapsedGroups(new Set())
  }

  // ── Modales
  const [formOpen, setFormOpen]               = useState(false)
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false)
  const [detalleId, setDetalleId]             = useState<string | null>(null)

  // ── Datos
  const { grupos } = useGruposGastoConSubcuentas()

  // Compute actual desde/hasta for query
  const { queryDesde, queryHasta } = useMemo(() => {
    if (intervalo === 'MENSUAL') return { queryDesde: `${mesDesde}-01`, queryHasta: lastDayOfMonth(mesHasta) }
    if (intervalo === 'ULTIMOS_7') return { queryDesde: ultimos7Desde, queryHasta: today }
    return { queryDesde: dailyDesde, queryHasta: dailyHasta }
  }, [intervalo, mesDesde, mesHasta, dailyDesde, dailyHasta, ultimos7Desde, today])

  const { gastos, isLoading } = useGastos(queryDesde, queryHasta)

  // ── Filtrar por criterio
  const gastosFiltrados = useMemo(() => {
    const registrados = gastos.filter((g) => g.status === 'REGISTRADO')
    if (criterio === 'GRUPO' && grupoId) {
      const grupo = grupos.find((g) => g.id === grupoId)
      const ids = new Set(grupo?.subcuentas.map((s) => s.id) ?? [])
      return registrados.filter((g) => ids.has(g.cuenta_id))
    }
    if (criterio === 'CUENTA' && cuentaId) {
      return registrados.filter((g) => g.cuenta_id === cuentaId)
    }
    return registrados
  }, [gastos, criterio, grupoId, cuentaId, grupos])

  // ── Datos gráfica: agrupar por intervalo
  const chartData = useMemo(() => {
    const bucket: Record<string, number> = {}
    for (const g of gastosFiltrados) {
      const key = getXKey(g.fecha, intervalo)
      bucket[key] = (bucket[key] ?? 0) + (parseFloat(g.monto_usd) || 0)
    }
    return Object.entries(bucket)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, total]) => ({
        name: xKeyToLabel(key, intervalo),
        total: Number(total.toFixed(4)),
      }))
  }, [gastosFiltrados, intervalo])

  // ── Resumen por criterio (card lateral)
  const resumenItems = useMemo(() => {
    if (criterio === 'TODAS') {
      // Totals per group
      return grupos.map((grupo) => {
        const ids = new Set(grupo.subcuentas.map((s) => s.id))
        const total = gastosFiltrados
          .filter((g) => ids.has(g.cuenta_id))
          .reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0)
        return { id: grupo.id, nombre: grupo.nombre, codigo: grupo.codigo, total }
      }).filter((i) => i.total > 0).sort((a, b) => b.total - a.total)
    }
    if (criterio === 'GRUPO' && grupoId) {
      const grupo = grupos.find((g) => g.id === grupoId)
      return (grupo?.subcuentas ?? []).map((sub) => {
        const total = gastosFiltrados
          .filter((g) => g.cuenta_id === sub.id)
          .reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0)
        return { id: sub.id, nombre: sub.nombre, codigo: sub.codigo, total }
      }).filter((i) => i.total > 0).sort((a, b) => b.total - a.total)
    }
    if (criterio === 'CUENTA' && cuentaId) {
      const allSubs = grupos.flatMap((g) => g.subcuentas)
      const sub = allSubs.find((s) => s.id === cuentaId)
      if (!sub) return []
      const total = gastosFiltrados.reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0)
      return [{ id: sub.id, nombre: sub.nombre, codigo: sub.codigo, total }]
    }
    return []
  }, [criterio, gastosFiltrados, grupos, grupoId, cuentaId])

  // Flat list of all accounts for CUENTA dropdown
  const todasLasCuentas = useMemo(
    () => grupos.flatMap((g) => g.subcuentas),
    [grupos]
  )

  function handleIntervaloChange(newIntervalo: Intervalo) {
    setIntervalo(newIntervalo)
  }

  if (formOpen) {
    return <GastoForm onClose={() => setFormOpen(false)} />
  }

  return (
    <div className="space-y-4">

      {/* ── Barra de filtros ─────────────────────────────────── */}
      <div className="rounded-2xl bg-card shadow-lg p-4">
        <div className="flex flex-wrap items-end gap-3">

          {/* Criterio */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Criterio</label>
            <select
              value={criterio}
              onChange={(e) => { setCriterio(e.target.value as Criterio); setGrupoId(''); setCuentaId('') }}
              className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="TODAS">Todas las cuentas</option>
              <option value="GRUPO">Por grupo</option>
              <option value="CUENTA">Por cuenta</option>
            </select>
          </div>

          {/* Grupo selector */}
          {criterio === 'GRUPO' && (
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Grupo</label>
              <select
                value={grupoId}
                onChange={(e) => setGrupoId(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Seleccionar grupo...</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>{g.codigo} — {g.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Cuenta selector */}
          {criterio === 'CUENTA' && (
            <div className="flex-shrink-0">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Cuenta</label>
              <select
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
              >
                <option value="">Seleccionar cuenta...</option>
                {todasLasCuentas.map((s) => (
                  <option key={s.id} value={s.id}>{s.codigo} — {s.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Intervalo */}
          <div className="flex-shrink-0">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Intervalo</label>
            <div className="flex rounded-md border border-input overflow-hidden text-sm">
              {(['DIARIO', 'ULTIMOS_7', 'MENSUAL'] as Intervalo[]).map((iv) => (
                <button
                  key={iv}
                  type="button"
                  onClick={() => handleIntervaloChange(iv)}
                  className={`px-3 py-2 font-medium transition-colors ${
                    intervalo === iv
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {iv === 'DIARIO' ? 'Diario' : iv === 'ULTIMOS_7' ? 'Últ. 7 días' : 'Mensual'}
                </button>
              ))}
            </div>
          </div>

          {/* Rango de fechas — adapta al intervalo */}
          {intervalo === 'MENSUAL' ? (
            <>
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mes inicio</label>
                <input
                  type="month"
                  value={mesDesde}
                  onChange={(e) => setMesDesde(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mes fin</label>
                <input
                  type="month"
                  value={mesHasta}
                  min={mesDesde}
                  onChange={(e) => setMesHasta(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </>
          ) : intervalo === 'DIARIO' ? (
            <>
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha inicio</label>
                <input
                  type="date"
                  value={dailyDesde}
                  onChange={(e) => setDailyDesde(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha fin</label>
                <input
                  type="date"
                  value={dailyHasta}
                  min={dailyDesde}
                  onChange={(e) => setDailyHasta(e.target.value)}
                  className="rounded-md border border-input px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </>
          ) : (
            /* ULTIMOS_7: auto-computed, solo informativo */
            <div className="flex-shrink-0 self-end">
              <p className="text-xs text-muted-foreground pb-2.5">
                {ultimos7Desde} → {today}
              </p>
            </div>
          )}

          {/* Separador + acciones */}
          <div className="flex-1" />
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setCuentaModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground bg-background hover:bg-muted transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Agregar gasto
            </button>
          </div>
        </div>

      </div>

      {/* ── Resumen + Gráfica ─────────────────────────────────── */}
      {!isLoading && gastosFiltrados.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Card grupos/cuentas (scroll) */}
          <div className="lg:col-span-2 rounded-2xl bg-card shadow-lg overflow-hidden flex flex-col max-h-72">
            <div className="px-4 py-3 border-b border-border bg-muted/40 shrink-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {criterio === 'TODAS' ? 'Por grupo' : criterio === 'GRUPO' ? 'Por cuenta' : 'Cuenta seleccionada'}
              </p>
            </div>
            <div className="overflow-y-auto divide-y divide-border flex-1">
              {resumenItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Sin datos</p>
              ) : (
                resumenItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground/60 mr-1.5">{item.codigo}</span>
                      <span className="text-sm text-foreground truncate">{item.nombre}</span>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <div className="text-sm font-semibold tabular-nums text-foreground">
                        {formatUsd(item.total)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Total */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/30 shrink-0 flex justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <span className="text-sm font-bold tabular-nums">
                {formatUsd(resumenItems.reduce((s, i) => s + i.total, 0))}
              </span>
            </div>
          </div>

          {/* Gráfica de barras */}
          <div className="lg:col-span-3 rounded-2xl bg-card shadow-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Gastos por {intervalo === 'MENSUAL' ? 'mes' : 'día'} (USD)
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                  width={52}
                />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
                    return [`$${num.toFixed(4)}`, 'Total USD']
                  }}
                  cursor={{ fill: 'hsl(var(--muted))' }}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Tabla de detalle ──────────────────────────────────── */}
      {!isLoading && (
        <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Detalle de registros
            </p>
            {gastosFiltrados.length > 0 && criterio !== 'CUENTA' && (
              <div className="flex gap-2">
                <button type="button" onClick={expandirTodo}
                  className="text-xs text-primary hover:underline">Expandir todo</button>
                <span className="text-muted-foreground/40">·</span>
                <button type="button" onClick={colapsarTodo}
                  className="text-xs text-primary hover:underline">Colapsar todo</button>
              </div>
            )}
          </div>

          {gastosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-medium">Sin gastos en el periodo</p>
              <p className="text-xs mt-1">Ajusta los filtros o registra un gasto</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Nro</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Factura</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Cuenta</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Proveedor</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Monto</th>
                    <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Group by: group separator when TODAS or GRUPO */}
                  {criterio === 'TODAS' ? (
                    grupos.map((grupo) => {
                      const ids = new Set(grupo.subcuentas.map((s) => s.id))
                      const rows = gastosFiltrados.filter((g) => ids.has(g.cuenta_id))
                      if (rows.length === 0) return null
                      const subtotal = rows.reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0)
                      const collapsed = collapsedGroups.has(grupo.id)
                      return [
                        <tr key={`grp-${grupo.id}`}
                          className="bg-muted/40 border-t-2 border-border cursor-pointer select-none"
                          onClick={() => toggleGroup(grupo.id)}
                        >
                          <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-foreground uppercase tracking-wide">
                            <span className="inline-flex items-center gap-1.5">
                              {collapsed
                                ? <CaretDown className="h-3 w-3 text-muted-foreground" />
                                : <CaretUp className="h-3 w-3 text-muted-foreground" />}
                              <span className="font-mono text-muted-foreground/60 mr-1">{grupo.codigo}</span>
                              {grupo.nombre}
                              <span className="text-muted-foreground/50 font-normal ml-1">({rows.length})</span>
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums text-foreground">
                            {formatUsd(subtotal)}
                          </td>
                          <td />
                        </tr>,
                        ...(!collapsed ? rows.map((g) => <GastoRow key={g.id} g={g} onClick={() => setDetalleId(g.id)} />) : []),
                      ]
                    })
                  ) : criterio === 'GRUPO' ? (
                    grupos.map((grupo) => {
                      if (grupoId && grupo.id !== grupoId) return null
                      return grupo.subcuentas.map((sub) => {
                        const rows = gastosFiltrados.filter((g) => g.cuenta_id === sub.id)
                        if (rows.length === 0) return null
                        const subtotal = rows.reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0)
                        const collapsed = collapsedGroups.has(sub.id)
                        return [
                          <tr key={`sub-${sub.id}`}
                            className="bg-muted/20 border-t border-border cursor-pointer select-none"
                            onClick={() => toggleGroup(sub.id)}
                          >
                            <td colSpan={5} className="px-4 py-1.5 text-xs font-medium text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                {collapsed ? <CaretDown className="h-3 w-3" /> : <CaretUp className="h-3 w-3" />}
                                <span className="font-mono mr-1">{sub.codigo}</span>{sub.nombre}
                                <span className="opacity-50 font-normal">({rows.length})</span>
                              </span>
                            </td>
                            <td className="px-4 py-1.5 text-right text-xs font-medium tabular-nums">{formatUsd(subtotal)}</td>
                            <td />
                          </tr>,
                          ...(!collapsed ? rows.map((g) => <GastoRow key={g.id} g={g} onClick={() => setDetalleId(g.id)} />) : []),
                        ]
                      })
                    })
                  ) : (
                    gastosFiltrados.map((g) => (
                      <GastoRow key={g.id} g={g} onClick={() => setDetalleId(g.id)} />
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Total periodo</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold tabular-nums">
                      {formatUsd(gastosFiltrados.reduce((s, g) => s + (parseFloat(g.monto_usd) || 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modales ───────────────────────────────────────────── */}
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
    </div>
  )
}

// ─── Fila de gasto ────────────────────────────────────────────

type GastoConJoins = {
  id: string; nro_gasto: string; nro_factura: string | null; cuenta_nombre: string
  proveedor_nombre: string | null; fecha: string; monto_usd: string; tasa: string; status: string
  created_by_nombre?: string | null
}

function GastoRow({ g, onClick }: { g: GastoConJoins; onClick: () => void }) {
  const anulado = g.status === 'ANULADO'
  const montoUsd = parseFloat(g.monto_usd)
  const tasaGasto = parseFloat(g.tasa) || 1
  const montoBs = montoUsd * tasaGasto
  return (
    <tr
      onClick={onClick}
      className={`border-t border-border hover:bg-muted/30 cursor-pointer transition-colors ${anulado ? 'opacity-50' : ''}`}
    >
      <td className={`px-4 py-2.5 font-mono text-xs text-foreground ${anulado ? 'line-through' : ''}`}>
        {g.nro_gasto}
      </td>
      <td className={`px-4 py-2.5 font-mono text-xs text-muted-foreground ${anulado ? 'line-through' : ''}`}>
        {g.nro_factura ?? '—'}
      </td>
      <td className={`px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap ${anulado ? 'line-through' : ''}`}>
        {formatDate(g.fecha)}
      </td>
      <td className={`px-4 py-2.5 text-xs text-foreground max-w-[160px] truncate ${anulado ? 'line-through' : ''}`}>
        {g.cuenta_nombre}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">
        {g.proveedor_nombre ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">
        <div className={`text-sm font-semibold ${anulado ? 'line-through' : 'text-foreground'}`}>
          {formatUsd(montoUsd)}
        </div>
        <div className="text-[10px] text-muted-foreground">{formatBs(montoBs)}</div>
      </td>
      <td className="px-4 py-2.5 text-center">
        <StatusBadge status={g.status} />
      </td>
    </tr>
  )
}
