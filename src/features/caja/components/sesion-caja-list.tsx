import { useState } from 'react'
import { Plus, X, Eye, ArrowSquareOut } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  useSesionesActivasDashboard,
  useSesionesCaja,
  type SesionActivaDashboard,
} from '@/features/caja/hooks/use-sesiones-caja'
import { SesionCajaForm } from './sesion-caja-form'
import { formatDateTime } from '@/lib/format'
import { usePermissions, PERMISSIONS } from '@/core/hooks/use-permissions'
import { formatUsd, formatBs } from '@/lib/currency'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'

// ─── Helpers ─────────────────────────────────────────────────

function formatHoras(horas: number): string {
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// ─── Score Badge ──────────────────────────────────────────────

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

// ─── Skeleton tabla activas ───────────────────────────────────

function SesionActivaSkeletonTabla() {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            {['Caja / Cajera', 'Fondo', 'Saldo actual', 'Facturado', 'Fact.', 'Ítems', 'Fact/h', 'Ticket prom.', ''].map((col) => (
              <th key={col} className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 2 }).map((_, i) => (
            <tr key={i} className="border-b border-border">
              {Array.from({ length: 9 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className={`h-4 bg-muted rounded animate-pulse ${j === 0 ? 'w-28' : 'w-14'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Grafica de rendimiento (Recharts) ───────────────────────

function RendimientoChart({ sesiones }: { sesiones: SesionActivaDashboard[] }) {
  const data = sesiones.map(s => ({
    name: s.cajera_nombre ?? s.caja_nombre ?? 'Caja',
    'Fact/hora': parseFloat(s.factHora.toFixed(2)),
    'Ítems/hora': parseFloat(s.itemsHora.toFixed(2)),
  }))

  const chartHeight = Math.max(160, sesiones.length * 72 + 60)

  return (
    <div className="rounded-2xl bg-card shadow-lg p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Ritmo de facturacion — turno actual</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Comparativo en tiempo real. Se actualiza con cada venta procesada.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
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
          <Bar dataKey="Fact/hora"  fill="#2563eb" radius={[0, 6, 6, 0]} maxBarSize={22} />
          <Bar dataKey="Ítems/hora" fill="#10b981" radius={[0, 6, 6, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Leyenda de KPIs ─────────────────────────────────────────

function LeyendaKPIs({ soloUna }: { soloUna: boolean }) {
  const [expandida, setExpandida] = useState(false)

  return (
    <div className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
      <button
        onClick={() => setExpandida(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Guia de indicadores
        </span>
        <span className="text-xs text-muted-foreground">{expandida ? '▲ Ocultar' : '▼ Ver'}</span>
      </button>

      {expandida && (
        <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">Fact/hora — Velocidad</p>
            <p className="text-xs text-muted-foreground">
              Facturas procesadas por hora de sesion. Por encima de <strong>5/h</strong> es un
              buen ritmo para una caja activa. Por debajo de <strong>2/h</strong> puede indicar
              poca actividad o lentitud.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">Ticket prom. (ATV) — Valor promedio</p>
            <p className="text-xs text-muted-foreground">
              Promedio de venta en USD por factura. Un ATV alto con pocas facturas sugiere
              servicios o productos de alto valor. Un ATV bajo con muchas facturas indica
              ventas rapidas de items economicos.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">UPT — Complejidad de la venta</p>
            <p className="text-xs text-muted-foreground">
              Articulos por factura (Units Per Transaction). Mas alto significa que cada cliente
              lleva mas productos. Util para detectar ventas de servicios simples (UPT bajo)
              vs. compras combinadas (UPT alto).
            </p>
          </div>
          {!soloUna && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Rendimiento — Score del turno</p>
              <p className="text-xs text-muted-foreground">
                Score comparativo entre las cajeras activas en el mismo turno.
                <span className="text-green-700 font-medium"> Destacada</span> (≥70%): mejor
                velocidad y volumen del grupo.
                <span className="text-yellow-700 font-medium"> Normal</span> (40-69%): ritmo
                esperado para el turno.
                <span className="text-red-600 font-medium"> Ritmo lento</span> (&lt;40%): muy
                por debajo del grupo, puede necesitar apoyo.
                El score se recalcula automaticamente con cada venta.
              </p>
            </div>
          )}
          {soloUna && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-foreground">Rendimiento — Score del turno</p>
              <p className="text-xs text-muted-foreground">
                El score comparativo se activa cuando hay 2 o mas sesiones abiertas al mismo tiempo,
                permitiendo comparar el ritmo de cada cajera en tiempo real.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Tabla de sesiones activas ────────────────────────────────

function SesionActivaTabla({
  onCerrar,
  canClose,
  onIrAlCuadre,
}: {
  onCerrar: (id: string) => void
  canClose: boolean
  onIrAlCuadre: (s: { id: string; caja_id: string; fecha_apertura: string }) => void
}) {
  const { sesiones, isLoading, soloUna } = useSesionesActivasDashboard()

  if (isLoading) return <SesionActivaSkeletonTabla />

  if (sesiones.length === 0) {
    return (
      <div className="rounded-2xl bg-card shadow-lg p-6 text-center text-muted-foreground">
        <p className="text-sm font-medium">Sin sesiones activas</p>
        <p className="text-xs mt-1">Abre una sesion de caja para comenzar</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabla principal */}
      <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Caja / Cajera
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Fondo inicial
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Saldo actual
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">
                  Facturado
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                  title="Cantidad de facturas procesadas en la sesion"
                >
                  Fact.
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                  title="Cantidad total de articulos facturados en la sesion"
                >
                  Items
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                  title="Facturas por hora — mide la velocidad de procesamiento"
                >
                  Fact/h
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap cursor-help"
                  title="Ticket promedio (ATV): venta promedio en USD por factura"
                >
                  Ticket prom.
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
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  {/* Caja / Cajera */}
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

                  {/* Fondo inicial */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="text-sm font-medium">
                      USD {parseFloat(s.monto_apertura_usd).toFixed(2)}
                    </div>
                    {parseFloat(s.monto_apertura_bs) > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Bs {parseFloat(s.monto_apertura_bs).toFixed(2)}
                      </div>
                    )}
                  </td>

                  {/* Saldo actual */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <div className="text-sm font-semibold text-foreground">
                      {formatUsd(s.saldoUsd)}
                    </div>
                    {s.saldoBs > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {formatBs(s.saldoBs)}
                      </div>
                    )}
                  </td>

                  {/* Facturado total */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold">{formatUsd(s.totalFacturadoUsd)}</span>
                  </td>

                  {/* Cantidad facturas */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.totalFacturas}
                  </td>

                  {/* Cantidad articulos */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.totalArticulos}
                  </td>

                  {/* Fact/hora */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={`text-sm font-medium ${s.factHora >= 5 ? 'text-green-700' : s.factHora >= 2 ? 'text-foreground' : 'text-red-500'}`}>
                      {s.factHora.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground">/h</span>
                  </td>

                  {/* Ticket promedio (ATV) */}
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="text-sm">{formatUsd(s.atv)}</span>
                  </td>

                  {/* Score (solo con 2+ sesiones) */}
                  {!soloUna && (
                    <td className="px-4 py-3">
                      <ScoreBadge score={s.score} />
                    </td>
                  )}

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => onIrAlCuadre(s)}
                        title="Ver cuadre en vivo"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ArrowSquareOut size={13} />
                        Cuadre
                      </button>
                      {canClose && (
                        <button
                          onClick={() => onCerrar(s.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-500 border border-red-200 rounded-md hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                          Cerrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grafica comparativa (solo con 2+ sesiones) */}
      {!soloUna && <RendimientoChart sesiones={sesiones} />}

      {/* Leyenda de indicadores */}
      <LeyendaKPIs soloUna={soloUna} />
    </div>
  )
}

// ─── Skeleton tabla historial ─────────────────────────────────

function TablaSkeletonSesiones() {
  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted">
            {['Fecha Apertura', 'Monto Apertura', 'Fecha Cierre', 'Monto Fisico', 'Diferencia', ''].map((col) => (
              <th key={col} className="text-left px-4 py-3 font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i} className="border-b border-border">
              {Array.from({ length: 6 }).map((__, j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 bg-muted rounded animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────

export function SesionCajaList() {
  const navigate = useNavigate()
  const [limiteHistorial, setLimiteHistorial] = useState(10)
  const { sesiones, isLoading: loadingSesiones } = useSesionesCaja(limiteHistorial)
  const { hasPermission, isOwner } = usePermissions()

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

  const canClose = isOwner || hasPermission(PERMISSIONS.CAJA_CLOSE)

  const [aperturaOpen, setAperturaOpen] = useState(false)
  const [cierreOpen, setCierreOpen] = useState(false)
  const [sesionIdACerrar, setSesionIdACerrar] = useState<string | null>(null)

  function handleCerrar(sesionId: string) {
    setSesionIdACerrar(sesionId)
    setCierreOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Seccion de sesiones activas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Sesiones Activas</h2>
          <button
            onClick={() => setAperturaOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Abrir Sesion
          </button>
        </div>

        <SesionActivaTabla
          onCerrar={handleCerrar}
          canClose={canClose}
          onIrAlCuadre={irAlCuadre}
        />
      </div>

      {/* Historial de sesiones cerradas */}
      <div className="rounded-2xl bg-card shadow-lg p-5">
        <h2 className="text-lg font-semibold mb-3">Historial de Sesiones</h2>

        {loadingSesiones ? (
          <TablaSkeletonSesiones />
        ) : sesiones.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-base font-medium">No hay sesiones cerradas</p>
            <p className="text-sm mt-1">Las sesiones cerradas apareceran aqui</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Fecha Apertura
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Monto Apertura
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Fecha Cierre
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Monto Fisico
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                      Diferencia
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sesiones.map((s) => {
                    const diferencia = s.diferencia_usd !== null
                      ? parseFloat(s.diferencia_usd)
                      : null
                    const aperturaBs = parseFloat(s.monto_apertura_bs ?? '0')

                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(s.fecha_apertura)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          <div>USD {parseFloat(s.monto_apertura_usd).toFixed(2)}</div>
                          {aperturaBs > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Bs {aperturaBs.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {s.fecha_cierre ? formatDateTime(s.fecha_cierre) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.monto_fisico_usd !== null
                            ? `USD ${parseFloat(s.monto_fisico_usd).toFixed(2)}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {diferencia !== null ? (
                            <span
                              className={
                                diferencia >= 0
                                  ? 'text-green-700 font-medium'
                                  : 'text-red-600 font-medium'
                              }
                            >
                              {diferencia >= 0 ? '+' : ''}
                              {diferencia.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => irAlCuadre(s)}
                            title="Ver resumen"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Eye size={13} />
                            Resumen
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {sesiones.length >= limiteHistorial && (
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => setLimiteHistorial((prev) => prev + 10)}
                  className="text-sm text-primary hover:underline cursor-pointer"
                >
                  Cargar mas sesiones
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogo de apertura */}
      <SesionCajaForm
        mode="apertura"
        isOpen={aperturaOpen}
        onClose={() => setAperturaOpen(false)}
      />

      {/* Dialogo de cierre */}
      <SesionCajaForm
        mode="cierre"
        isOpen={cierreOpen}
        onClose={() => {
          setCierreOpen(false)
          setSesionIdACerrar(null)
        }}
        sesionId={sesionIdACerrar ?? undefined}
      />
    </div>
  )
}
