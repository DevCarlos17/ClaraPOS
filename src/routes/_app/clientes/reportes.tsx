import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { startOfMonth, todayStr } from '@/lib/dates'
import { CxcReportesKpis } from '@/features/reportes/components/cxc-reportes-kpis'
import { CxcReportesAging } from '@/features/reportes/components/cxc-reportes-aging'
import { CxcReportesDeudores } from '@/features/reportes/components/cxc-reportes-deudores'
import { CxcReportesCredito } from '@/features/reportes/components/cxc-reportes-credito'
import { CxcReportesMovimientos } from '@/features/reportes/components/cxc-reportes-movimientos'

export const Route = createFileRoute('/_app/clientes/reportes')({
  component: ClientesReportesPage,
})

function ClientesReportesPage() {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)

  return (
    <RequirePermission permission={PERMISSIONS.CLIENTS_CREDIT} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Reportes de CxC" descripcion="Analisis de cuentas por cobrar, antiguedad de saldos y cobros">
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

        <CxcReportesKpis fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

        <CxcReportesAging />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CxcReportesDeudores />
          <CxcReportesCredito />
        </div>

        <CxcReportesMovimientos fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
      </div>
    </RequirePermission>
  )
}
