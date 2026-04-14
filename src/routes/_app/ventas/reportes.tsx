import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/layout/page-header'
import { RequirePermission } from '@/components/shared/require-permission'
import { AccessDeniedPage } from '@/components/shared/access-denied-page'
import { PERMISSIONS } from '@/core/hooks/use-permissions'
import { startOfMonth, todayStr } from '@/lib/dates'
import { VentasReportesKpis } from '@/features/reportes/components/ventas-reportes-kpis'
import { VentasReportesTrend } from '@/features/reportes/components/ventas-reportes-trend'
import { VentasReportesDepto } from '@/features/reportes/components/ventas-reportes-depto'
import { VentasReportesPagos } from '@/features/reportes/components/ventas-reportes-pagos'
import { VentasReportesRankings } from '@/features/reportes/components/ventas-reportes-rankings'
import { VentasReportesPdfButton } from '@/features/reportes/components/ventas-reportes-pdf'
import { VentasConsultasModal } from '@/features/reportes/components/ventas-consultas-modal'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'

export const Route = createFileRoute('/_app/ventas/reportes')({
  component: VentasReportesPage,
})

function VentasReportesPage() {
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(todayStr)
  const [consultasOpen, setConsultasOpen] = useState(false)

  return (
    <RequirePermission permission={PERMISSIONS.REPORTS_VIEW} fallback={<AccessDeniedPage />}>
      <div className="space-y-6">
        <PageHeader titulo="Dashboard de Ventas" descripcion="Analisis de ventas por periodo">
          <div className="flex items-center gap-2 flex-wrap">
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
            <VentasReportesPdfButton fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
            <Button variant="outline" size="sm" onClick={() => setConsultasOpen(true)}>
              <Search className="size-4" />
              Consultas
            </Button>
          </div>
        </PageHeader>

        <VentasReportesKpis fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

        <VentasReportesTrend fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VentasReportesDepto fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
          <VentasReportesPagos fechaDesde={fechaDesde} fechaHasta={fechaHasta} />
        </div>

        <VentasReportesRankings fechaDesde={fechaDesde} fechaHasta={fechaHasta} />

        <VentasConsultasModal open={consultasOpen} onOpenChange={setConsultasOpen} />
      </div>
    </RequirePermission>
  )
}
