import { useMemo, useState } from 'react'
import { useGastos } from '@/features/contabilidad/hooks/use-gastos'
import { GastosKpis } from './gastos-kpis'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// ─── Constantes ──────────────────────────────────────────────

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const COLORES_PIE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
]

// ─── Helpers ─────────────────────────────────────────────────

function padMes(n: number) {
  return String(n).padStart(2, '0')
}

// ─── Componente ──────────────────────────────────────────────

export function GastosDashboard() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())

  const fechaDesde = `${anio}-${padMes(mes)}-01`
  const ultimoDia = new Date(anio, mes, 0).getDate()
  const fechaHasta = `${anio}-${padMes(mes)}-${ultimoDia}`

  const { gastos, isLoading } = useGastos(fechaDesde, fechaHasta)

  const gastosFiltrados = useMemo(
    () => gastos.filter((g) => g.status === 'REGISTRADO'),
    [gastos]
  )

  // Datos para grafico de barras: agrupados por semana del mes
  const datosBarras = useMemo(() => {
    const semanas: Record<string, number> = {
      'Sem 1': 0, 'Sem 2': 0, 'Sem 3': 0, 'Sem 4': 0,
    }
    for (const g of gastosFiltrados) {
      const dia = new Date(g.fecha).getUTCDate()
      let semana: string
      if (dia <= 7) semana = 'Sem 1'
      else if (dia <= 14) semana = 'Sem 2'
      else if (dia <= 21) semana = 'Sem 3'
      else semana = 'Sem 4'
      semanas[semana] += parseFloat(g.monto_usd) || 0
    }
    return Object.entries(semanas).map(([name, total]) => ({
      name,
      total: Number(total.toFixed(2)),
    }))
  }, [gastosFiltrados])

  // Datos para grafico de torta: por cuenta contable
  const datosPie = useMemo(() => {
    const porCuenta: Record<string, number> = {}
    for (const g of gastosFiltrados) {
      const nombre = g.cuenta_nombre ?? 'Sin cuenta'
      porCuenta[nombre] = (porCuenta[nombre] ?? 0) + (parseFloat(g.monto_usd) || 0)
    }
    return Object.entries(porCuenta)
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [gastosFiltrados])

  return (
    <div className="space-y-6">
      {/* Selector de periodo */}
      <div className="rounded-xl bg-card shadow-md p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Mes</label>
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="rounded-md border border-input px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {MESES.map((nombre, i) => (
              <option key={i + 1} value={i + 1}>{nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Ano</label>
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            min={2020}
            max={2099}
            className="w-24 rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {isLoading ? 'Cargando...' : `${gastosFiltrados.length} gastos registrados`}
        </p>
      </div>
      </div>

      {/* KPIs */}
      <GastosKpis gastos={gastos} />

      {/* Graficas */}
      {gastosFiltrados.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grafico de barras: total por semana */}
          <div className="bg-card border border-border rounded-xl shadow-md p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Gastos por Semana (USD)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={datosBarras} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
                    return [`$${num.toFixed(2)}`, 'Total USD']
                  }}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Grafico de torta: por cuenta contable */}
          <div className="bg-card border border-border rounded-xl shadow-md p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Distribucion por Cuenta</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={datosPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {datosPie.map((_entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORES_PIE[index % COLORES_PIE.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => {
                    const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0))
                    return [`$${num.toFixed(2)}`, 'USD']
                  }}
                />
                <Legend
                  formatter={(value) =>
                    value.length > 20 ? `${value.slice(0, 18)}...` : value
                  }
                  wrapperStyle={{ fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        !isLoading && (
          <div className="text-center py-12 border border-dashed border-border rounded-lg text-muted-foreground">
            <p className="text-base font-medium">Sin datos para el periodo seleccionado</p>
            <p className="text-sm mt-1">Registra gastos para ver las graficas</p>
          </div>
        )
      )}
    </div>
  )
}
