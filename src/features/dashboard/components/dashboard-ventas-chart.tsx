import { useState, useMemo } from 'react'
import { formatUsd } from '@/lib/currency'
import { useVentasRango } from '@/features/dashboard/hooks/use-dashboard'
import { todayStr, daysAgo, startOfMonth } from '@/lib/dates'

type Periodo = '7d' | '15d' | 'mes'

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: '7d', label: 'Ultima semana' },
  { value: '15d', label: 'Ultimos 15 dias' },
  { value: 'mes', label: 'Mes en curso' },
]

export function DashboardVentasChart() {
  const [periodo, setPeriodo] = useState<Periodo>('7d')

  const { fechaInicio, fechaFin } = useMemo(() => {
    const hoy = todayStr()
    switch (periodo) {
      case '7d':
        return { fechaInicio: daysAgo(6), fechaFin: hoy }
      case '15d':
        return { fechaInicio: daysAgo(14), fechaFin: hoy }
      case 'mes':
        return { fechaInicio: startOfMonth(), fechaFin: hoy }
    }
  }, [periodo])

  const { ventas, isLoading } = useVentasRango(fechaInicio, fechaFin)

  // Fill in missing days with zero
  const allDays = useMemo(() => {
    const days: { dia: string; totalUsd: number }[] = []
    const ventasMap = new Map(ventas.map((v) => [v.dia, v.totalUsd]))
    const start = new Date(fechaInicio)
    const end = new Date(fechaFin)

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push({ dia: key, totalUsd: ventasMap.get(key) ?? 0 })
    }
    return days
  }, [ventas, fechaInicio, fechaFin])

  const maxValue = allDays.reduce((max, d) => Math.max(max, d.totalUsd), 0)

  function formatDayLabel(dia: string) {
    const parts = dia.split('-')
    return `${parts[2]}/${parts[1]}`
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Ventas por Dia</h3>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                periodo === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-end gap-1 h-40">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 bg-muted rounded-t animate-pulse" style={{ height: `${30 + Math.random() * 70}%` }} />
          ))}
        </div>
      ) : allDays.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Sin datos para este periodo</p>
        </div>
      ) : (
        <div className="flex items-end gap-1 h-40">
          {allDays.map((d) => {
            const heightPct = maxValue > 0 ? (d.totalUsd / maxValue) * 100 : 0
            return (
              <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full flex justify-center">
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {formatUsd(d.totalUsd)}
                  </div>
                  <div
                    className="w-full max-w-8 bg-primary/80 hover:bg-primary rounded-t transition-all duration-300"
                    style={{ height: `${Math.max(heightPct, d.totalUsd > 0 ? 4 : 1)}%`, minHeight: d.totalUsd > 0 ? '4px' : '1px' }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {formatDayLabel(d.dia)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
