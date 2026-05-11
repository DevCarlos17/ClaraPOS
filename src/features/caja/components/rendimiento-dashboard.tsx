import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts'
import { ArrowSquareOut, Monitor, CurrencyDollar, Receipt, Package } from '@phosphor-icons/react'
import {
  useSesionesActivasDashboard,
  type SesionActivaDashboard,
} from '@/features/caja/hooks/use-sesiones-caja'
import { useHistorialRendimiento } from '@/features/caja/hooks/use-rendimiento-caja'
import { formatUsd } from '@/lib/currency'
import { formatDateTime } from '@/lib/format'

// ─── Constantes ──────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

// ─── Helpers ─────────────────────────────────────────────────

function formatHoras(horas: number): string {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// ─── KPI Card ────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color?: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const colorMap = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   ring: 'ring-blue-100'   },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  ring: 'ring-green-100'  },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  ring: 'ring-amber-100'  },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'ring-purple-100' },
  }
  const c = colorMap[color]

  return (
    <div className="rounded-2xl bg-card shadow-md p-5 flex items-center gap-4">
      <div className={`shrink-0 h-11 w-11 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">
          {title}
        </p>
        <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

// ─── Score Badge ─────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const isGreen  = score >= 70
  const isYellow = score >= 40 && score < 70
  const label    = isGreen ? 'Destacada' : isYellow ? 'Normal' : 'Ritmo lento'

  const barColor  = isGreen ? 'bg-green-500'  : isYellow ? 'bg-yellow-400'  : 'bg-red-400'
  const textColor = isGreen ? 'text-green-700' : isYellow ? 'text-yellow-700' : 'text-red-600'
  const badgeClass = isGreen
    ? 'bg-green-50 text-green-700 ring-green-600/20'
    : isYellow
      ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20'
      : 'bg-red-50 text-red-600 ring-red-600/20'

  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums font-semibold w-8 text-right ${textColor}`}>
        {score}%
      </span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ring-1 ring-inset font-medium whitespace-nowrap ${badgeClass}`}>
        {label}
      </span>
    </div>
  )
}

// ─── Tabla sesiones activas ───────────────────────────────────

function SeccionSesionesActivas({
  sesiones,
  isLoading,
  soloUna,
  onIrAlCuadre,
}: {
  sesiones: SesionActivaDashboard[]
  isLoading: boolean
  soloUna: boolean
  onIrAlCuadre: (s: { id: string; caja_id: string; fecha_apertura: string }) => void
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-card shadow-md p-6">
        <div className="h-5 w-48 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (sesiones.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-md p-6 text-center text-muted-foreground">
        <p className="text-sm font-medium">Sin sesiones activas ahora mismo</p>
        <p className="text-xs mt-1">
          Los datos de rendimiento del turno apareceran cuando haya cajeras trabajando
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-card shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold">Turno actual — en tiempo real</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Se actualiza automaticamente con cada venta procesada
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Caja / Cajera
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Facturado
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Fact.
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                Items
              </th>
              <th
                className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                title="Facturas procesadas por hora de sesion"
              >
                Fact/h
              </th>
              <th
                className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                title="Ticket promedio: venta promedio en USD por factura"
              >
                Ticket prom.
              </th>
              <th
                className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                title="UPT: articulos por factura (Units Per Transaction)"
              >
                UPT
              </th>
              {!soloUna && (
                <th className="px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Rendimiento
                </th>
              )}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sesiones.map((s) => (
              <tr
                key={s.id}
                className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm leading-tight">
                        {s.caja_nombre ?? 'Caja'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.cajera_nombre ?? 'Sin nombre'}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70">
                        {formatHoras(s.horasTranscurridas)} de sesion
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {formatUsd(s.totalFacturadoUsd)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.totalFacturas}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {s.totalArticulos}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span
                    className={`text-sm font-medium ${
                      s.factHora >= 5
                        ? 'text-green-700'
                        : s.factHora >= 2
                          ? 'text-foreground'
                          : 'text-red-500'
                    }`}
                  >
                    {s.factHora.toFixed(1)}/h
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="text-sm">{formatUsd(s.atv)}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className="text-sm text-muted-foreground">{s.upt.toFixed(1)}</span>
                </td>
                {!soloUna && (
                  <td className="px-4 py-3">
                    <ScoreBadge score={s.score} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <button
                    onClick={() => onIrAlCuadre(s)}
                    title="Ver cuadre en vivo"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowSquareOut size={13} />
                    Cuadre
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Graficas comparativas ────────────────────────────────────

function SeccionGraficas({ sesiones }: { sesiones: SesionActivaDashboard[] }) {
  const dataFacturado = sesiones.map((s, i) => ({
    name: s.cajera_nombre ?? s.caja_nombre ?? `Caja ${i + 1}`,
    'Facturado USD': parseFloat(s.totalFacturadoUsd.toFixed(2)),
    _color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const dataVelocidad = sesiones.map((s, i) => ({
    name: s.cajera_nombre ?? s.caja_nombre ?? `Caja ${i + 1}`,
    'Fact/hora': parseFloat(s.factHora.toFixed(2)),
    'Items/hora': parseFloat(s.itemsHora.toFixed(2)),
    _color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const chartHeight = Math.max(180, sesiones.length * 76 + 60)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Chart 1: Facturado por cajera */}
      <div className="rounded-2xl bg-card shadow-md p-5">
        <h3 className="text-sm font-semibold mb-0.5">Facturado por cajera (USD)</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Monto total acumulado en el turno actual
        </p>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={dataFacturado}
            layout="vertical"
            margin={{ top: 4, right: 40, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: unknown) => [
                `$${(value as number).toFixed(2)}`,
                'Facturado',
              ]}
            />
            <Bar dataKey="Facturado USD" radius={[0, 6, 6, 0]} maxBarSize={26}>
              {dataFacturado.map((entry, index) => (
                <Cell key={`cell-facturado-${index}`} fill={entry._color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Velocidad por cajera */}
      <div className="rounded-2xl bg-card shadow-md p-5">
        <h3 className="text-sm font-semibold mb-0.5">Velocidad por cajera</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Facturas e items procesados por hora de sesion
        </p>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={dataVelocidad}
            layout="vertical"
            margin={{ top: 4, right: 32, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="hsl(var(--border))"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(v: number) => v.toFixed(1)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--card))',
                color: 'hsl(var(--foreground))',
              }}
              formatter={(value: unknown) => [(value as number).toFixed(2), '']}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Bar
              dataKey="Fact/hora"
              fill="#2563eb"
              radius={[0, 6, 6, 0]}
              maxBarSize={18}
            />
            <Bar
              dataKey="Items/hora"
              fill="#10b981"
              radius={[0, 6, 6, 0]}
              maxBarSize={18}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Guia de indicadores ──────────────────────────────────────

function SeccionGuia() {
  const [expandida, setExpandida] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpandida((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Como leer estos indicadores
        </span>
        <span className="text-xs text-muted-foreground">
          {expandida ? '▲ Ocultar' : '▼ Ver guia'}
        </span>
      </button>

      {expandida && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">Fact/hora — Velocidad</p>
            <p className="text-xs text-muted-foreground">
              Facturas procesadas por hora. Por encima de <strong>5/h</strong> es excelente.
              Entre <strong>2-5/h</strong> es ritmo normal. Por debajo de <strong>2/h</strong>{' '}
              puede indicar poca actividad o lentitud en la atencion.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Ticket prom. (ATV) — Valor promedio por venta
            </p>
            <p className="text-xs text-muted-foreground">
              Promedio de venta en USD por factura. Un valor alto con pocas facturas indica
              servicios o productos caros. Un valor bajo con muchas facturas indica ventas
              rapidas de items economicos.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              UPT — Complejidad de la venta
            </p>
            <p className="text-xs text-muted-foreground">
              Articulos por factura (Units Per Transaction). Mas alto significa que cada
              cliente compra mas productos a la vez. Sirve para diferenciar servicios
              simples (UPT bajo) de compras combinadas (UPT alto).
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Rendimiento — Score comparativo del turno
            </p>
            <p className="text-xs text-muted-foreground">
              Score normalizado entre las cajeras activas al mismo tiempo.{' '}
              <span className="text-green-700 font-medium">Destacada</span> (≥70%): mayor
              velocidad del grupo.{' '}
              <span className="text-yellow-700 font-medium">Normal</span> (40-69%): ritmo
              esperado.{' '}
              <span className="text-red-600 font-medium">Ritmo lento</span> (&lt;40%): puede
              necesitar apoyo. Solo aparece con 2 o mas cajeras activas.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Historial de rendimiento ─────────────────────────────────

function SeccionHistorial() {
  const navigate = useNavigate()
  const [limite, setLimite] = useState(10)
  const { sesiones, isLoading } = useHistorialRendimiento(limite)

  function irAlCuadre(s: { id: string; caja_id: string; fecha_apertura: string }) {
    navigate({
      to: '/ventas/cuadre-de-caja',
      search: {
        fecha: s.fecha_apertura.substring(0, 10),
        cajaId: s.caja_id,
        sesionId: s.id,
      },
    })
  }

  return (
    <div className="rounded-2xl bg-card shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold">Historial de rendimiento</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Sesiones cerradas con KPIs calculados por sesion
        </p>
      </div>

      {isLoading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : sesiones.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground">
          <p className="text-sm font-medium">Sin historial disponible</p>
          <p className="text-xs mt-1">
            Las sesiones cerradas con sus estadisticas apareceran aqui
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Caja / Cajera
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Fecha
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Duracion
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Facturado
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Fact.
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                    Items
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                    title="Facturas por hora"
                  >
                    Fact/h
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                    title="Ticket promedio (ATV)"
                  >
                    Ticket prom.
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                    title="Items por factura (UPT)"
                  >
                    UPT
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sesiones.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-sm leading-tight">
                        {s.caja_nombre ?? 'Caja'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.cajera_nombre ?? 'Sin nombre'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <div className="text-xs">{formatDateTime(s.fecha_apertura)}</div>
                      {s.fecha_cierre && (
                        <div className="text-xs">{formatDateTime(s.fecha_cierre)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {formatHoras(s.duracionHoras)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatUsd(s.totalFacturadoUsd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {s.totalFacturas}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {s.totalArticulos}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={`text-sm font-medium ${
                          s.factHora >= 5
                            ? 'text-green-700'
                            : s.factHora >= 2
                              ? 'text-foreground'
                              : 'text-red-500'
                        }`}
                      >
                        {s.factHora.toFixed(1)}/h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm">
                      {formatUsd(s.atv)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-sm">
                      {s.upt.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => irAlCuadre(s)}
                        title="Ver resumen de sesion"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowSquareOut size={13} />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sesiones.length >= limite && (
            <div className="flex justify-center py-4 border-t border-border">
              <button
                onClick={() => setLimite((prev) => prev + 10)}
                className="text-sm text-primary hover:underline cursor-pointer"
              >
                Cargar mas sesiones
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function RendimientoDashboard() {
  const navigate = useNavigate()
  const {
    sesiones: sesionesActivas,
    isLoading: loadingActivas,
    soloUna,
  } = useSesionesActivasDashboard()

  function irAlCuadre(s: { id: string; caja_id: string; fecha_apertura: string }) {
    navigate({
      to: '/ventas/cuadre-de-caja',
      search: {
        fecha: s.fecha_apertura.substring(0, 10),
        cajaId: s.caja_id,
        sesionId: s.id,
      },
    })
  }

  const totalFacturadoTurno = sesionesActivas.reduce(
    (acc, s) => acc + s.totalFacturadoUsd,
    0
  )
  const totalFacturasTurno = sesionesActivas.reduce(
    (acc, s) => acc + s.totalFacturas,
    0
  )
  const totalArticulosTurno = sesionesActivas.reduce(
    (acc, s) => acc + s.totalArticulos,
    0
  )

  return (
    <div className="space-y-6">
      {/* KPI Cards — resumen del turno activo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Sesiones activas"
          value={loadingActivas ? '...' : String(sesionesActivas.length)}
          subtitle="Cajeras trabajando ahora"
          icon={Monitor}
          color="blue"
        />
        <KpiCard
          title="Facturado turno"
          value={loadingActivas ? '...' : formatUsd(totalFacturadoTurno)}
          subtitle="Total del turno actual"
          icon={CurrencyDollar}
          color="green"
        />
        <KpiCard
          title="Facturas procesadas"
          value={loadingActivas ? '...' : String(totalFacturasTurno)}
          subtitle="En sesiones activas"
          icon={Receipt}
          color="amber"
        />
        <KpiCard
          title="Articulos vendidos"
          value={loadingActivas ? '...' : String(totalArticulosTurno)}
          subtitle="En sesiones activas"
          icon={Package}
          color="purple"
        />
      </div>

      {/* Tabla del turno actual con KPIs completos */}
      <SeccionSesionesActivas
        sesiones={sesionesActivas}
        isLoading={loadingActivas}
        soloUna={soloUna}
        onIrAlCuadre={irAlCuadre}
      />

      {/* Graficas comparativas (solo cuando hay 2+ sesiones activas) */}
      {!loadingActivas && sesionesActivas.length >= 2 && (
        <SeccionGraficas sesiones={sesionesActivas} />
      )}

      {/* Guia de indicadores */}
      <SeccionGuia />

      {/* Historial de sesiones cerradas con KPIs */}
      <SeccionHistorial />
    </div>
  )
}
