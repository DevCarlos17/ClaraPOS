import { DashboardWelcome } from './dashboard-welcome'
import { DashboardKpiCards } from './dashboard-kpi-cards'
import { DashboardInventarioChart } from './dashboard-inventario-chart'
import { DashboardVentasChart } from './dashboard-ventas-chart'
import { DashboardTopRotacion } from './dashboard-top-rotacion'
import { useDebugVentas } from '../hooks/use-dashboard'

export function DashboardPage() {
  // TODO: Remover debug hook cuando se resuelva el problema
  useDebugVentas()

  return (
    <div className="space-y-6">
      <DashboardWelcome />
      <DashboardKpiCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardInventarioChart />
        <DashboardVentasChart />
      </div>
      <DashboardTopRotacion />
    </div>
  )
}
