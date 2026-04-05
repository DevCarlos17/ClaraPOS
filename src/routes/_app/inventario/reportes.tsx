import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { startOfMonth, todayStr } from '@/lib/dates'
import { InventarioKpiCards } from '@/features/reportes/components/inventario-kpi-cards'
import { InventarioValorDepto } from '@/features/reportes/components/inventario-valor-depto'
import { InventarioStockCritico } from '@/features/reportes/components/inventario-stock-critico'
import { DashboardTopRotacion } from '@/features/dashboard/components/dashboard-top-rotacion'
import { InventarioMovimientos } from '@/features/reportes/components/inventario-movimientos'

export const Route = createFileRoute('/_app/inventario/reportes')({
  component: InventarioReportesPage,
})

function InventarioReportesPage() {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)

  return (
    <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Reportes de Inventario" descripcion="Valoracion, stock critico, rotacion y movimientos">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <label className="text-sm text-muted-foreground">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </PageHeader>

        <InventarioKpiCards fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InventarioValorDepto />
          <InventarioStockCritico />
        </div>

        <DashboardTopRotacion />

        <InventarioMovimientos fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
      </div>
    </RequirePermission>
  )
}
